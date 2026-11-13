from datetime import datetime
from unittest.mock import MagicMock, patch
import unittest
from app import create_app
from advisor_scheduling import empty_schedule
from security import issue_access_token

class AdvisorStudentsTests(unittest.TestCase):
    def setUp(self):
        self.client=create_app().test_client();self.root='/api/advisors/7/students'
        self.headers={'Authorization':'Bearer '+issue_access_token({'user_id':7,'role':'advisor'})}
        self.connection=MagicMock();self.cursor=self.connection.cursor.return_value.__enter__.return_value
        self.now=datetime(2026,11,8,8)
    @patch('routes.advisor_students.get_db_connection')
    def test_owner_access_is_required(self,db):
        for path in [self.root,self.root+'/11/consultations?date=2026-11-09']:
            self.assertEqual(self.client.get(path).status_code,401)
            for uid,role in [(8,'advisor'),(7,'student')]:
                headers={'Authorization':'Bearer '+issue_access_token({'user_id':uid,'role':role})}
                self.assertEqual(self.client.get(path,headers=headers).status_code,403)
        db.assert_not_called()
    @patch('routes.advisor_students.get_db_connection')
    def test_student_list_returns_actual_counts_and_iso_dates(self,db):
        db.return_value=self.connection
        self.cursor.fetchone.side_effect=[{'user_id':7},{'average_rating':4.5,'review_count':2}]
        self.cursor.fetchall.return_value=[{'student_id':11,'full_name':'Student One','email':'one@example.com','account_status':'active','cgpa':0,'appointment_count':3,'active_count':2,'completed_count':1,'latest_appointment':datetime(2026,11,9,9),'latest_datetime':datetime(2026,11,9,9),'latest_id':20,'latest_status':'confirmed','latest_duration':45,'latest_topic':'Course Selection'}]
        response=self.client.get(self.root,headers=self.headers)
        self.assertEqual(response.status_code,200,response.json)
        self.assertEqual(response.json['summary']['active_consultations'],2)
        self.assertEqual(response.json['summary']['completed_consultations'],1)
        self.assertEqual(response.json['summary']['total_guided'],1)
        self.assertEqual(response.json['students'][0]['cgpa'],0)
        self.assertEqual(response.json['students'][0]['latest_consultation']['appointment_datetime'],'2026-11-09T09:00:00+08:00')
    @patch('routes.advisor_students.get_db_connection')
    @patch('routes.advisor_students.malaysia_now')
    def test_invalid_booking_input_never_reaches_database(self,now,db):
        now.return_value=self.now
        for body in [None,{},[],{'appointment_datetime':'2026-11-09T09:00+08:00'},{'appointment_datetime':'2025-11-09T09:00'},{'appointment_datetime':'2026-11-09T09:00','consultation_topic':'x'*101}]:
            response=self.client.post(self.root+'/11/consultations',headers=self.headers,json=body)
            self.assertEqual(response.status_code,400,response.json)
        db.assert_not_called()
    def database_rows(self,student=None):
        schedule=empty_schedule();schedule['availability'][0]['enabled']=True
        self.cursor.fetchone.side_effect=[{'user_id':7},student or {'student_id':11,'status':'active'},{'availability':schedule['availability'],'blocked_dates':[],'daily_breaks':[],'slot_minutes':30},{'appointment_id':22}]
        self.cursor.fetchall.return_value=[]
    @patch('routes.advisor_students.get_db_connection')
    @patch('routes.advisor_students.malaysia_now')
    @patch('advisor_scheduling.malaysia_now')
    def test_owner_can_schedule_confirmed_session_for_guided_student(self,shared_now,now,db):
        shared_now.return_value=now.return_value=self.now;db.return_value=self.connection;self.database_rows()
        response=self.client.post(self.root+'/11/consultations',headers=self.headers,json={'appointment_datetime':'2026-11-09T09:00','slot_minutes':30,'consultation_topic':'Course Selection'})
        self.assertEqual(response.status_code,201,response.json)
        self.assertEqual(response.json['appointment_status'],'confirmed')
        self.assertEqual(self.cursor.execute.call_args.args[1],(11,7,datetime(2026,11,9,9),30,'Course Selection'))
    @patch('routes.advisor_students.get_db_connection')
    @patch('routes.advisor_students.malaysia_now')
    def test_unrelated_student_is_rejected(self,now,db):
        now.return_value=self.now;db.return_value=self.connection;self.cursor.fetchone.side_effect=[{'user_id':7},None]
        self.assertEqual(self.client.get(self.root+'/11/consultations?date=2026-11-09',headers=self.headers).status_code,404)
        self.assertFalse(any('INSERT INTO appointment' in c.args[0] for c in self.cursor.execute.call_args_list))
    @patch('routes.advisor_students.get_db_connection')
    @patch('routes.advisor_students.malaysia_now')
    def test_inactive_student_cannot_be_booked(self,now,db):
        now.return_value=self.now;db.return_value=self.connection;self.database_rows({'student_id':11,'status':'inactive'})
        self.assertEqual(self.client.get(self.root+'/11/consultations?date=2026-11-09',headers=self.headers).status_code,409)
    @patch('routes.advisor_students.get_db_connection')
    @patch('routes.advisor_students.malaysia_now')
    @patch('advisor_scheduling.malaysia_now')
    def test_existing_appointment_conflicts_are_rejected(self,shared_now,now,db):
        shared_now.return_value=now.return_value=self.now;db.return_value=self.connection;self.database_rows()
        self.cursor.fetchall.return_value=[{'appointment_datetime':datetime(2026,11,9,9),'appointment_status':'confirmed','duration_minutes':30}]
        response=self.client.post(self.root+'/11/consultations',headers=self.headers,json={'appointment_datetime':'2026-11-09T09:00','slot_minutes':30})
        self.assertEqual(response.status_code,409,response.json)
        self.assertFalse(any('INSERT INTO appointment' in c.args[0] for c in self.cursor.execute.call_args_list))
