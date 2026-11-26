"""Explicit --run: verify admin APIs with temporary accounts and invoice fixtures.

Invoice fixtures test report calculations only; they are not Stripe payments.
Existing users, plans, payments and pathways are never edited.
"""
from pathlib import Path
from contextlib import closing
from uuid import uuid4
from datetime import datetime,timezone
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from werkzeug.security import generate_password_hash
from app import create_app
from db import get_db_connection
from pathway_seed import starter_pathways


def verify():
    nonce=uuid4().hex; password=uuid4().hex; fixtures=[]; plan_id=None; pathway_id=None
    client=create_app().test_client()
    def expect(response,code=200):
        assert response.status_code==code,f'Expected {code}, got {response.status_code}: {response.get_json()}'
        return response.get_json()
    def report(headers,day): return expect(client.get(f'/api/admin/reports?start={day}&end={day}',headers=headers))['payments']
    def revenue(data,currency): return sum(float(row['amount']) for row in data['revenue_by_currency'] if row['currency']==currency)
    try:
        with closing(get_db_connection()) as connection,connection:
            with connection.cursor() as cursor:
                for i,role in enumerate(['admin','student','advisor','sponsor']):
                    email=f'admin-check-{nonce}-{i}@example.invalid'
                    cursor.execute("insert into app_user(full_name,email,password,role,status) values (%s,%s,%s,%s,'active') returning user_id",
                        ('Verification Account',email,generate_password_hash(password,method='pbkdf2:sha256'),role))
                    uid=cursor.fetchone()['user_id'];fixtures.append((uid,email))
                    if role=='admin': cursor.execute('insert into admin(admin_id) values (%s)',(uid,))
                    if role=='student': cursor.execute('insert into student(student_id) values (%s)',(uid,))
                    if role=='advisor': cursor.execute('insert into advisor(advisor_id) values (%s)',(uid,))
                    if role=='sponsor': cursor.execute('insert into sponsor(sponsor_id,organization_name) values (%s,%s)',(uid,'Verification Provider'))
        headers=[]
        for _,email in fixtures:
            token=expect(client.post('/api/auth/login',json={'email':email,'password':password}))['access_token']
            headers.append({'Authorization':'Bearer '+token})
        admin,student,advisor,sponsor=headers
        for actor in [student,advisor,sponsor]:
            for path in ['/api/admin/users','/api/admin/pathways','/api/admin/subscriptions','/api/admin/reports','/api/admin/audit-logs']:
                expect(client.get(path,headers=actor),403)
        expect(client.patch(f'/api/admin/users/{fixtures[0][0]}/status',headers=admin,json={'status':'disabled'}),403)
        student_data={'full_name':'Updated Verification Student','date_of_birth':'2000-01-01','gender':'Female','nationality':'Malaysian','cgpa':3.65,'university':'Verification University'}
        advisor_data={'experience_years':7,'institution':'Verification University','professional_title':'Academic Advisor','bio':'Temporary guidance profile.'}
        expect(client.patch(f'/api/admin/users/{fixtures[1][0]}',headers=admin,json=student_data))
        expect(client.patch(f'/api/admin/users/{fixtures[2][0]}',headers=admin,json=advisor_data))
        expect(client.patch(f'/api/admin/users/{fixtures[1][0]}',headers=admin,json={'email':fixtures[0][1]}),409)
        expect(client.patch(f'/api/admin/users/{fixtures[1][0]}',headers=admin,json={'role':'admin'}),400)
        rows=expect(client.get('/api/admin/users',headers=admin))['users']
        saved_student=next(row for row in rows if row['user_id']==fixtures[1][0])
        saved_advisor=next(row for row in rows if row['user_id']==fixtures[2][0])
        assert float(saved_student['cgpa'])==3.65 and saved_student['date_of_birth']=='2000-01-01'
        assert saved_advisor['experience_years']==7 and saved_advisor['institution']=='Verification University'
        print('Admin-only access, self-lockout protection and extended profile save/reload passed.',flush=True)
        pathway={**starter_pathways()[0],'title':f'Admin Verification {nonce}'}
        pathway_id=expect(client.post('/api/admin/pathways',headers=admin,json=pathway),201)['pathway']['pathway_id']
        pathway['description']='Updated temporary pathway.'
        expect(client.put(f'/api/admin/pathways/{pathway_id}',headers=admin,json=pathway))
        assert expect(client.get(f'/api/admin/pathways/{pathway_id}',headers=admin))['pathway']['description']==pathway['description']
        expect(client.delete(f'/api/admin/pathways/{pathway_id}',headers=admin,json={'confirm_pathway_id':pathway_id}))
        expect(client.get(f'/api/admin/pathways/{pathway_id}',headers=admin),404)
        print('Academic pathway create/edit/reload/delete passed.',flush=True)
        plan=dict(plan_name=f'Verification Plan {nonce}',price='19.00',scholarship_limit=5,duration_month=1,benefits=['Verification benefit'])
        plan_id=expect(client.post('/api/admin/subscription-plans',headers=admin,json=plan),201)['plan']['plan_id']
        expect(client.post('/api/admin/subscription-plans',headers=admin,json=plan),409)
        expect(client.patch(f'/api/admin/subscription-plans/{plan_id}',headers=admin,json={**plan,'price':'29.00'}))
        expect(client.patch(f'/api/admin/subscription-plans/{plan_id}/availability',headers=admin,json={'is_active':False}))
        choices=expect(client.get(f'/api/sponsors/{fixtures[3][0]}/subscriptions',headers=sponsor))['plans']
        assert all(row['plan_id']!=plan_id for row in choices)
        expect(client.patch(f'/api/admin/subscription-plans/{plan_id}/availability',headers=admin,json={'is_active':True}))
        choices=expect(client.get(f'/api/sponsors/{fixtures[3][0]}/subscriptions',headers=sponsor))['plans']
        assert any(row['plan_id']==plan_id for row in choices)
        print('Plan creation, edit, duplicate handling, archive/restore and provider catalogue passed.',flush=True)
        before=report(admin,'2026-11-20');previous=report(admin,'2026-11-19')
        with closing(get_db_connection()) as connection,connection:
            with connection.cursor() as cursor:
                # 16:30 UTC on Nov 19 is 00:30 Malaysia time on Nov 20.
                at=datetime(2026,11,19,16,30,tzinfo=timezone.utc)
                for i,(amount,currency,status) in enumerate([(49,'myr','paid'),(100,'myr','open'),(5,'eur','paid')]):
                    cursor.execute('''insert into subscription_payment(sponsor_id,stripe_invoice_id,plan_name,amount,currency,payment_status,created_at,paid_at)
                        values (%s,%s,%s,%s,%s,%s,%s,%s)''',
                        (fixtures[3][0],f'admin_report_fixture_{nonce}_{i}',plan['plan_name'],amount,currency,status,at,at if status=='paid' else None))
        after=report(admin,'2026-11-20')
        assert revenue(after,'myr')==revenue(before,'myr')+49
        assert revenue(after,'eur')==revenue(before,'eur')+5
        assert revenue(report(admin,'2026-11-19'),'myr')==revenue(previous,'myr')
        assert any(row['label']=='open' and row['count']>=1 for row in after['payment_statuses'])
        print('Payment report currency separation, unpaid exclusion and Malaysia date boundaries passed using temporary invoice fixtures.',flush=True)
    finally:
        if fixtures:
            with closing(get_db_connection()) as connection,connection:
                with connection.cursor() as cursor:
                    ids=[row[0] for row in fixtures];expected=dict(fixtures)
                    cursor.execute('select user_id,email from app_user where user_id=any(%s)',(ids,))
                    assert all(expected[row['user_id']]==row['email'] for row in cursor.fetchall())
                    cursor.execute('delete from subscription_payment where sponsor_id=any(%s)',(ids,))
                    if pathway_id is not None: cursor.execute('delete from academic_pathway where pathway_id=%s and title=%s',(pathway_id,f'Admin Verification {nonce}'))
                    if plan_id is not None: cursor.execute('delete from subscription_plan where plan_id=%s and plan_name=%s',(plan_id,f'Verification Plan {nonce}'))
                    cursor.execute('delete from audit_log where user_id=any(%s)',(ids,))
                    cursor.execute('delete from notification where user_id=any(%s)',(ids,))
                    cursor.execute('delete from sponsor where sponsor_id=any(%s)',(ids,))
                    cursor.execute('delete from student where student_id=any(%s)',(ids,))
                    cursor.execute('delete from advisor where advisor_id=any(%s)',(ids,))
                    cursor.execute('delete from admin where admin_id=any(%s)',(ids,))
                    cursor.execute('delete from app_user where user_id=any(%s)',(ids,))
            print('Temporary admin verification accounts, plans, pathways and invoice fixtures removed; existing records preserved.',flush=True)


if __name__=='__main__':
    if sys.argv[1:]!=['--run']:raise SystemExit('Use --run to allow temporary fixtures and cleanup.')
    verify()
