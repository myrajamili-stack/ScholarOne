"""Run --run: verify rejection, resubmission, approval and views with temporary accounts."""
from pathlib import Path
from contextlib import closing
from uuid import uuid4
from datetime import timedelta
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from werkzeug.security import generate_password_hash
from app import create_app
from db import get_db_connection
from security import issue_access_token
from advisor_scheduling import malaysia_now


def verify():
    nonce=uuid4().hex; password=uuid4().hex; fixtures=[]; listing_ids=[]; title=f'Provider Verification {nonce}'
    client=create_app().test_client()
    def expect(response,code=200):
        assert response.status_code==code,f'Expected {code}, got {response.status_code}: {response.get_json()}'
        return response.get_json()
    def login(i):
        return {'Authorization':'Bearer '+expect(client.post('/api/auth/login',json={'email':fixtures[i][1],'password':password}))['access_token']}
    try:
        with closing(get_db_connection()) as connection,connection:
            with connection.cursor() as cursor:
                for i,role in enumerate(['sponsor','admin','student','sponsor']):
                    email=f'provider-check-{nonce}-{i}@example.invalid'
                    cursor.execute('insert into app_user(full_name,email,password,role,status) values (%s,%s,%s,%s,%s) returning user_id',
                        ('Verification Account',email,generate_password_hash(password,method='pbkdf2:sha256'),role,'pending' if i==0 else 'active'))
                    uid=cursor.fetchone()['user_id']; fixtures.append((uid,email))
                    if role=='sponsor': cursor.execute('insert into sponsor(sponsor_id,organization_name) values (%s,%s)',(uid,title))
                    if role=='student': cursor.execute('insert into student(student_id) values (%s)',(uid,))
        admin,student,other=login(1),login(2),login(3); uid=fixtures[0][0]
        status_path=f'/api/admin/users/{uid}/status'
        expect(client.patch(status_path,headers=admin,json={'status':'rejected'}),400)
        expect(client.patch(status_path,headers=admin,json={'status':'rejected','rejection_reason':'Please complete the organisation information.'}))
        rejected=expect(client.post('/api/auth/login',json={'email':fixtures[0][1],'password':password}),403)
        assert 'Please complete' in rejected['error']
        forged={'Authorization':'Bearer '+issue_access_token({'user_id':uid,'role':'sponsor'})}
        expect(client.get(f'/api/sponsors/{uid}/settings',headers=forged),403)
        registration=dict(role='sponsor',full_name='Verification Account',email=fixtures[0][1],password=password,confirm_password=password,
            phone_number='+60123456789',organization_name=title,organization_type='Foundation',website='https://example.invalid')
        expect(client.post('/api/auth/provider-resubmission',json={**registration,'password':'Incorrect123','confirm_password':'Incorrect123'}),401)
        result=expect(client.post('/api/auth/provider-resubmission',json=registration))
        assert result['user']['status']=='pending' and 'access_token' not in result
        expect(client.post('/api/auth/provider-resubmission',json=registration),409)
        expect(client.get(f'/api/sponsors/{uid}/settings',headers=forged),403)
        expect(client.patch(status_path,headers=admin,json={'status':'active'}))
        provider=login(0)
        print('Provider rejection reason, password-verified resubmission, pending restriction and approval passed.',flush=True)
        payload=dict(title=title,description='Temporary provider verification.',amount=1000,category='General',eligibility_criteria='Verify student qualification.',
            deadline=(malaysia_now().date()+timedelta(days=7)).isoformat(),funding_type='Scholarship',study_level='Diploma',eligible_state='All States',source_url='https://example.invalid/programme')
        def create():
            listing=expect(client.post(f'/api/sponsors/{uid}/scholarships',headers=provider,json=payload),201)['scholarship']['scholarship_id']
            listing_ids.append(listing); return listing
        listing=create(); decision=f'/api/admin/scholarships/{listing}/status'; own=f'/api/sponsors/{uid}/scholarships/{listing}'
        expect(client.patch(decision,headers=admin,json={'status':'rejected'}),400)
        expect(client.patch(decision,headers=admin,json={'status':'rejected','rejection_reason':'Please clarify the funding details.'}))
        assert expect(client.get(own,headers=provider))['scholarship']['rejection_reason']=='Please clarify the funding details.'
        assert expect(client.get(f'/api/sponsors/{uid}/appeals',headers=provider))['scholarships'][0]['rejection_reason']=='Please clarify the funding details.'
        expect(client.put(own,headers=other,json=payload),403)
        expect(client.put(own,headers=provider,json={**payload,'description':'Corrected funding details.'}))
        assert expect(client.get(own,headers=provider))['scholarship']['status']=='pending'
        assert expect(client.get(own,headers=provider))['scholarship']['rejection_reason'] is None
        expect(client.get(f'/api/scholarships/{listing}'),404)
        expect(client.patch(decision,headers=admin,json={'status':'approved'}))
        expect(client.get(f'/api/scholarships/{listing}'))
        expect(client.post(f'/api/scholarships/{listing}/view',headers=provider),403)
        for _ in range(3): expect(client.post(f'/api/scholarships/{listing}/view',headers=student,json={'student_id':999}))
        statistics=expect(client.get(f'/api/sponsors/{uid}/statistics',headers=provider))
        assert statistics['summary']['total_views']==1 and statistics['summary']['unique_viewers']==1
        assert statistics['scholarship_breakdown'][0]['total_views']==1
        assert expect(client.get(f'/api/sponsors/{uid}/dashboard',headers=provider))['summary']['total_views']==1
        expect(client.get(f'/api/sponsors/{uid}/statistics',headers=other),403)
        assert expect(client.get(f'/api/sponsors/{fixtures[3][0]}/statistics',headers=other))['summary']['total_views']==0
        unviewed=create()
        expect(client.delete(f'/api/sponsors/{uid}/scholarships/{unviewed}',headers=provider,json={'confirm_scholarship_id':unviewed}))
        expect(client.delete(own,headers=provider,json={'confirm_scholarship_id':listing}),409)
        print('Listing rejection/revision/reapproval, owner restrictions, unique daily views, dashboard/statistics and safe deletion passed.',flush=True)
    finally:
        if fixtures:
            with closing(get_db_connection()) as connection,connection:
                with connection.cursor() as cursor:
                    ids=[row[0] for row in fixtures]; expected=dict(fixtures)
                    cursor.execute('select user_id,email from app_user where user_id=any(%s)',(ids,))
                    assert all(expected[row['user_id']]==row['email'] for row in cursor.fetchall())
                    cursor.execute('delete from notification where user_id=any(%s) or position(%s in message)>0',(ids,title))
                    cursor.execute('delete from audit_log where user_id=any(%s)',(ids,))
                    cursor.execute('delete from scholarship_view where student_id=any(%s)',(ids,))
                    cursor.execute('delete from scholarship where sponsor_id=any(%s)',(ids,))
                    cursor.execute('delete from sponsor where sponsor_id=any(%s)',(ids,))
                    cursor.execute('delete from student where student_id=any(%s)',(ids,))
                    cursor.execute('delete from app_user where user_id=any(%s)',(ids,))
            print('Temporary accounts, listings, views and review records removed; existing records preserved.',flush=True)


if __name__=='__main__':
    if sys.argv[1:]!=['--run']: raise SystemExit('Use --run to allow temporary fixtures and cleanup.')
    verify()
