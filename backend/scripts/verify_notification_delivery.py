"""Explicit --run: real cross-role API checks with temporary fixtures and cleanup."""
from pathlib import Path
import sys
from uuid import uuid4
from contextlib import closing
from datetime import timedelta
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from werkzeug.security import generate_password_hash
from app import create_app
from db import get_db_connection
from advisor_scheduling import malaysia_now
from notification_delivery import deliver_due_reminders


def verify():
    nonce=uuid4().hex; password=uuid4().hex; fixtures=[]; scholarship_id=None
    title=f'Notification Verification {nonce}'
    client=create_app().test_client()
    def expect(response,code=200):
        assert response.status_code==code,f'Expected {code}, got {response.status_code}: {response.get_json()}'
        return response.get_json()
    def notices(headers): return expect(client.get('/api/notifications',headers=headers))['notifications']
    try:
        with closing(get_db_connection()) as connection,connection:
            with connection.cursor() as cursor:
                for i,role in enumerate(['student','student','sponsor','admin','advisor']):
                    email=f'notice-check-{nonce}-{i}@example.invalid'
                    cursor.execute("insert into app_user (full_name,email,password,role,status) values (%s,%s,%s,%s,'active') returning user_id",
                        ('ScholarOne Verification Account',email,generate_password_hash(password,method='pbkdf2:sha256'),role))
                    uid=cursor.fetchone()['user_id']; fixtures.append((uid,email,role))
                    if role=='student': cursor.execute('insert into student(student_id) values (%s)',(uid,))
                    if role=='sponsor': cursor.execute('insert into sponsor(sponsor_id,organization_name) values (%s,%s)',(uid,title))
                    if role=='advisor': cursor.execute('insert into advisor(advisor_id) values (%s)',(uid,))
        headers=[]
        for _,email,_ in fixtures:
            token=expect(client.post('/api/auth/login',json={'email':email,'password':password}))['access_token']
            headers.append({'Authorization':'Bearer '+token})
        first,second,provider,admin,advisor=headers; provider_id=fixtures[2][0]
        deadline=(malaysia_now().date()+timedelta(days=2)).isoformat()
        payload={'title':title,'description':'Temporary notification delivery verification.','amount':1000,'category':'General',
                 'eligibility_criteria':'Temporary verification criteria.','deadline':deadline,'funding_type':'Scholarship',
                 'study_level':'Diploma','eligible_state':'All States','study_levels':['Diploma'],'eligible_states':['All States'],'source_url':'https://example.invalid/verification'}
        scholarship_id=expect(client.post(f'/api/sponsors/{provider_id}/scholarships',headers=provider,json=payload),201)['scholarship']['scholarship_id']
        assert any(title in row['message'] for row in notices(admin))
        expect(client.patch(f'/api/admin/scholarships/{scholarship_id}/status',headers=admin,json={'status':'approved'}))
        assert any(title in row['message'] and 'approved' in row['message'] for row in notices(provider))
        provider_count=len(notices(provider))
        expect(client.patch(f'/api/admin/scholarships/{scholarship_id}/status',headers=admin,json={'status':'approved'}))
        assert len(notices(provider))==provider_count
        submitted=expect(client.post('/api/applications',headers=first,json={'scholarship_id':scholarship_id}),201)['application']
        application_id=submitted['application_id']
        assert any('was submitted' in row['message'] for row in notices(first))
        assert any('was submitted' in row['message'] for row in notices(provider))
        expect(client.post('/api/applications',headers=first,json={'scholarship_id':scholarship_id}),409)
        expect(client.patch(f'/api/sponsors/{provider_id}/applications/{application_id}',headers=provider,json={'status':'approved','remarks':'Verified test decision.'}))
        assert any('now approved' in row['message'] for row in notices(first))
        before=len(notices(first))
        expect(client.patch(f'/api/sponsors/{provider_id}/applications/{application_id}',headers=provider,json={'status':'approved'}))
        assert len(notices(first))==before
        expect(client.patch(f'/api/admin/applications/{application_id}/status',headers=admin,json={'status':'rejected','rejection_reason':'Temporary review decision.'}))
        assert any('now rejected' in row['message'] for row in notices(first))
        assert not notices(second) and not notices(advisor)
        own=notices(first)[0]['notification_id']
        for other in [second,provider,admin,advisor]:
            expect(client.patch(f'/api/notifications/{own}',headers=other,json={'is_read':True}),404)
        expect(client.patch(f'/api/notifications/{own}',headers=first,json={'is_read':True}))
        assert next(row for row in notices(first) if row['notification_id']==own)['is_read']
        print('Provider-to-admin, admin-to-provider, student application and approval/rejection notifications passed; retries did not duplicate.',flush=True)
        expect(client.put(f'/api/scholarship-reminders/{scholarship_id}',headers=first))
        reminder_notices=[row for row in notices(first) if row['notification_type']=='scholarship_deadline']
        assert len(reminder_notices)==1
        assert len([row for row in notices(first) if row['notification_type']=='scholarship_deadline'])==1
        with closing(get_db_connection()) as connection,connection:
            with connection.cursor() as cursor:
                # Same worker SQL, explicitly scoped to the temporary student: no real reminders are generated.
                assert deliver_due_reminders(cursor,fixtures[0][0])==0
        assert not notices(second)
        print('Three-day reminder delivery, fresh reload, duplicate suppression and all-role notification isolation passed.',flush=True)
    finally:
        if fixtures:
            with closing(get_db_connection()) as connection,connection:
                with connection.cursor() as cursor:
                    ids=[row[0] for row in fixtures]; expected={row[0]:row[1] for row in fixtures}
                    cursor.execute('select user_id,email from app_user where user_id=any(%s)',(ids,))
                    assert all(expected[row['user_id']]==row['email'] for row in cursor.fetchall())
                    # Includes only this test's broadcast review notices, identified by its unique title.
                    cursor.execute('delete from notification where user_id=any(%s) or position(%s in message)>0',(ids,title))
                    cursor.execute('delete from audit_log where user_id=any(%s)',(ids,))
                    cursor.execute('delete from scholarship_reminder where student_id=any(%s)',(ids,))
                    cursor.execute('delete from application where student_id=any(%s)',(ids,))
                    if scholarship_id is not None: cursor.execute('delete from scholarship where scholarship_id=%s and sponsor_id=%s',(scholarship_id,fixtures[2][0]))
                    cursor.execute('delete from student where student_id=any(%s)',(ids,))
                    cursor.execute('delete from advisor where advisor_id=any(%s)',(ids,))
                    cursor.execute('delete from sponsor where sponsor_id=any(%s)',(ids,))
                    cursor.execute('delete from app_user where user_id=any(%s)',(ids,))
            print('Temporary accounts, listing, applications, reminders and notifications removed; existing records preserved.',flush=True)


if __name__=='__main__':
    if sys.argv[1:]!=['--run']: raise SystemExit('Use --run to allow temporary fixtures and their cleanup.')
    verify()
