from datetime import date, datetime
from unittest.mock import MagicMock, patch
import unittest
from app import create_app
from advisor_scheduling import empty_schedule, validate_schedule, available_slots
from security import issue_access_token

class BreakTests(unittest.TestCase):
    def setUp(self):
        self.schedule=empty_schedule();self.schedule['published']=True
        self.schedule['availability'][0].update(enabled=True,start_time='09:00',end_time='12:00')
        self.day=date(2026,11,9);self.now=datetime(2026,11,8)
    def test_breaks_block_overlapping_slots(self):
        self.schedule['daily_breaks']=[dict(start_time='09:15',end_time='09:45')]
        slots=available_slots(self.schedule,self.day,[],self.now)
        self.assertNotIn('2026-11-09T09:00',slots);self.assertNotIn('2026-11-09T09:30',slots)
        self.assertIn('2026-11-09T10:00',slots)
    def test_break_boundaries_are_bookable(self):
        self.schedule['daily_breaks']=[dict(start_time='09:30',end_time='10:00')]
        slots=available_slots(self.schedule,self.day,[],self.now)
        self.assertIn('2026-11-09T09:00',slots);self.assertNotIn('2026-11-09T09:30',slots);self.assertIn('2026-11-09T10:00',slots)
    def test_break_validation(self):
        invalid=[None,{},[{}],[dict(start_time='13:00',end_time='12:00')],[dict(start_time='25:00',end_time='26:00')],[dict(start_time='12:00',end_time='13:00'),dict(start_time='12:30',end_time='14:00')]]
        for breaks in invalid:
            with self.subTest(breaks=breaks),self.assertRaises(ValueError):validate_schedule({**self.schedule,'daily_breaks':breaks})
    def test_sorted_breaks_and_empty_defaults(self):
        data={**self.schedule,'daily_breaks':[dict(start_time='15:00',end_time='16:00'),dict(start_time='12:00',end_time='13:00')]}
        self.assertEqual(validate_schedule(data)['daily_breaks'][0]['start_time'],'12:00')
        self.assertEqual(validate_schedule(self.schedule)['daily_breaks'],[])

class RescheduleTests(unittest.TestCase):
    def setUp(self):
        self.client=create_app().test_client();self.url='/api/advisors/7/appointments/20/reschedule'
        self.headers={'Authorization':'Bearer '+issue_access_token({'user_id':7,'role':'advisor'})}
        self.connection=MagicMock();self.cursor=self.connection.cursor.return_value.__enter__.return_value
        self.cursor.fetchone.side_effect=[{'user_id':7},{'appointment_id':20,'student_id':11,'duration_minutes':45,'appointment_status':'confirmed'}]
        self.now=datetime(2026,11,8,8)
    def test_authentication_and_ownership(self):
        self.assertEqual(self.client.get(self.url+'?date=2026-11-09').status_code,401)
        headers={'Authorization':'Bearer '+issue_access_token({'user_id':8,'role':'advisor'})}
        self.assertEqual(self.client.get(self.url+'?date=2026-11-09',headers=headers).status_code,403)
    @patch('routes.advisor_scheduling.malaysia_now')
    def test_invalid_dates_and_timestamps(self,now):
        now.return_value=self.now
        for value in [None,'invalid','2026-02-31T09:00','2026-11-09T09:00+08:00','2026-11-09T09:00:01','2027-11-09T09:00']:
            self.assertEqual(self.client.patch(self.url,headers=self.headers,json={'appointment_datetime':value}).status_code,400)
    @patch('routes.advisor_scheduling.reschedule_slots')
    @patch('routes.advisor_scheduling.get_db_connection')
    @patch('routes.advisor_scheduling.malaysia_now')
    def test_reschedule_keeps_duration_and_status(self,now,db,slots):
        now.return_value=self.now;db.return_value=self.connection;slots.return_value=['2026-11-09T09:00']
        response=self.client.patch(self.url,headers=self.headers,json={'appointment_datetime':'2026-11-09T09:00'})
        self.assertEqual(response.status_code,200,response.json)
        self.assertEqual(self.cursor.execute.call_args.args[1],(datetime(2026,11,9,9),20,7))
        self.assertNotIn('appointment_status=',self.cursor.execute.call_args.args[0])
    @patch('routes.advisor_scheduling.reschedule_slots',return_value=[])
    @patch('routes.advisor_scheduling.get_db_connection')
    @patch('routes.advisor_scheduling.malaysia_now')
    def test_rejects_unavailable_slot(self,now,db,slots):
        now.return_value=self.now;db.return_value=self.connection
        self.assertEqual(self.client.patch(self.url,headers=self.headers,json={'appointment_datetime':'2026-11-09T09:00'}).status_code,409)
        self.assertFalse(any('UPDATE appointment' in call.args[0] for call in self.cursor.execute.call_args_list))
    @patch('routes.advisor_scheduling.get_db_connection')
    @patch('routes.advisor_scheduling.malaysia_now')
    def test_completed_cannot_reschedule(self,now,db):
        now.return_value=self.now;db.return_value=self.connection
        self.cursor.fetchone.side_effect=[{'user_id':7},{'appointment_id':20,'student_id':11,'duration_minutes':30,'appointment_status':'completed'}]
        self.assertEqual(self.client.get(self.url+'?date=2026-11-09',headers=self.headers).status_code,409)

class BookingContextTests(unittest.TestCase):
    @patch('routes.advisor_scheduling.get_db_connection')
    @patch('routes.advisor_scheduling.malaysia_now', return_value=datetime(2026,11,8,8))
    def test_invalid_topic_and_message_do_not_write(self,now,db):
        client=create_app().test_client()
        headers={'Authorization':'Bearer '+issue_access_token({'user_id':11,'role':'student'})}
        for fields in [{'consultation_topic':'x'*101},{'student_message':'x'*1001},{'consultation_topic':[]},{'student_message':4}]:
            response=client.post('/api/advisors/7/appointments',headers=headers,json={'appointment_datetime':'2026-11-09T09:00',**fields})
            self.assertEqual(response.status_code,400,response.json)
        db.assert_not_called()
