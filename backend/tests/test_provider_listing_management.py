from pathlib import Path
import sys
import json
import unittest
from unittest.mock import MagicMock, patch
from psycopg2.errors import ForeignKeyViolation

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import create_app
from security import issue_access_token
from routes.sponsor_listings import editable_listing
from listing_information import validate_listing_submission


def payload():
    return dict(title='Updated Award', description='Updated programme.', amount='800', category='General',
                funding_type='Scholarship', eligibility_criteria='- Malaysian citizen.', deadline='2099-12-31',
                deadline_status='dated', study_level='Diploma', eligible_state='Johor', source_url='https://example.com/programme')


class ProviderListingTests(unittest.TestCase):
    def setUp(self):
        self.client = create_app().test_client()
        self.headers = {'Authorization': 'Bearer ' + issue_access_token({'user_id': 7, 'role': 'sponsor'})}
        self.account = self.enterContext(patch('db.get_db_connection'))
        self.account.return_value.cursor.return_value.__enter__.return_value.fetchone.return_value = {'status': 'active'}
        self.connect = self.enterContext(patch('routes.sponsor_listings.get_db_connection'))
        self.connection = self.connect.return_value
        self.cursor = self.connection.cursor.return_value
        self.original = dict(scholarship_id=99, sponsor_id=7, status='approved', **payload(),
                             import_metadata={'external_listing': False, 'source_url': payload()['source_url']})
        self.cursor.fetchone.return_value = self.original
        self.url = '/api/sponsors/7/scholarships/99'

    def test_owner_scoped_lookup_and_pending_after_edit(self):
        response = self.client.put(self.url, headers=self.headers, json=payload())
        self.assertEqual(response.status_code, 200)
        calls = self.cursor.execute.call_args_list
        self.assertEqual(calls[0].args[1], (99, 7))
        self.assertIn("status='pending'", calls[1].args[0])
        self.assertEqual(calls[1].args[1][-2:], (99, 7))
        self.assertIn('notification', calls[2].args[0])
        self.connection.commit.assert_called_once()

    def test_unknown_or_other_providers_listing_is_not_accessible(self):
        self.cursor.fetchone.return_value = None
        for method in ('GET', 'PUT', 'DELETE'):
            self.assertEqual(self.client.open(self.url, method=method, headers=self.headers, json=payload()).status_code, 404)
        self.connection.commit.assert_not_called()

    def test_wrong_provider_id_rejected_before_listing_database(self):
        self.assertEqual(self.client.put('/api/sponsors/8/scholarships/99', headers=self.headers, json=payload()).status_code, 403)
        self.connect.assert_not_called()

    def test_invalid_edits_do_not_write(self):
        for changes in ({'title': ''}, {'amount': 'NaN'}, {'deadline': '2000-01-01'}, {'source_url': 'javascript:bad'}, {'source_url': ''}, {'minimum_cgpa': 5}):
            with self.subTest(changes=changes):
                self.assertEqual(self.client.put(self.url, headers=self.headers, json={**payload(), **changes}).status_code, 400)
        self.connection.commit.assert_not_called()
        self.assertFalse(any('update scholarship' in c.args[0] for c in self.cursor.execute.call_args_list))

    def test_deletion_requires_confirmation_and_preserves_linked_records(self):
        self.assertEqual(self.client.delete(self.url, headers=self.headers, json={}).status_code, 400)
        with patch('routes.sponsor_listings.has_linked_records', return_value=True):
            response = self.client.delete(self.url, headers=self.headers, json={'confirm_scholarship_id': 99})
        self.assertEqual(response.status_code, 409)
        self.assertFalse(any('delete from scholarship' in c.args[0] for c in self.cursor.execute.call_args_list))

    def test_unlinked_listing_can_be_deleted_by_owner(self):
        with patch('routes.sponsor_listings.has_linked_records', return_value=False):
            response = self.client.delete(self.url, headers=self.headers, json={'confirm_scholarship_id': 99})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.cursor.execute.call_args_list[1].args[1], (99, 7))
        self.connection.commit.assert_called_once()

    def test_delete_foreign_key_failure_rolls_back(self):
        self.cursor.execute.side_effect = [None, ForeignKeyViolation()]
        with patch('routes.sponsor_listings.has_linked_records', return_value=False):
            response = self.client.delete(self.url, headers=self.headers, json={'confirm_scholarship_id': 99})
        self.assertEqual(response.status_code, 409)
        self.connection.rollback.assert_called_once()

    def test_imported_provenance_and_external_application_flow_survive_edit(self):
        self.original['import_metadata'] = {'source_document': 'Original.pdf', 'source_sponsor': 'Original Foundation', 'custom_note': 'Keep this'}
        self.assertEqual(self.client.put(self.url, headers=self.headers, json=payload()).status_code, 200)
        metadata = json.loads(self.cursor.execute.call_args_list[1].args[1][-3])
        self.assertEqual(metadata['custom_note'], 'Keep this')
        self.assertTrue(metadata['external_listing'])

    def test_edit_load_preserves_long_text_and_separates_literal_links(self):
        row = editable_listing({**self.original, 'description': 'Original details.\nRepayment Conditions:\nKeep these terms.\nOfficial Source: https://example.com/programme'})
        self.assertIn('Keep these terms.', row['description'])
        self.assertEqual(row['source_url'], 'https://example.com/programme')
        self.assertNotIn('https://example.com/programme', row['description'])

    def test_title_edit_preserves_legacy_description_eligibility_and_metadata(self):
        description = ('  Original terms.\n\nRepayment Conditions:\nRepay after graduation.\n'
                       'Official Source: https://example.com/old-source\n'
                       'Application Portal: https://example.com/legacy-portal\n')
        criteria = '  Minimum CGPA: 3.20 unless specified otherwise.\n'
        metadata = {
            'source_url': 'https://example.com/primary-source',
            'amount_note': 'RM800 annually for eligible students.',
            'deadline_note': 'Check with the institution.',
            'eligibility_rules': {'academic_requirements': [], 'future_rule': {'keep': True}},
            'raw_source': {'original': True},
        }
        self.original.update(description=description, eligibility_criteria=criteria, amount=None, import_metadata=metadata)
        current = editable_listing(self.original)
        response = self.client.put(self.url, headers=self.headers, json={**current, 'title': 'New title'})
        self.assertEqual(response.status_code, 200)
        parameters = self.cursor.execute.call_args_list[1].args[1]
        self.assertEqual(parameters[1:3], (description, None))
        self.assertEqual(parameters[4], criteria)
        saved = json.loads(parameters[9])
        for field in ('raw_source', 'eligibility_rules', 'amount_note', 'deadline_note'):
            self.assertEqual(saved[field], metadata[field])
        self.assertEqual(saved['application_url'], 'https://example.com/legacy-portal')


class ListingWorkflowTests(unittest.TestCase):
    def test_provider_submission_admin_review_application_and_unpublished_history(self):
        """Real Flask routes share an in-memory database double; no external writes."""
        state = {}
        applications = []
        connection = MagicMock()
        cursor = connection.cursor.return_value
        notifications = []
        def execute(query, values=()):
            sql = ' '.join(str(query).lower().split())
            row = None
            if sql.startswith('select s.sponsor_id from sponsor s'):
                row = {'sponsor_id': 7}
            elif sql.startswith('select coalesce( (select sp.scholarship_limit'):
                row = None
            elif sql.startswith('select count(*) as total from scholarship'):
                row = {'total': len(state) > 0}
            elif sql.startswith('insert into scholarship ('):
                keys = ('sponsor_id', 'title', 'description', 'amount', 'category', 'eligibility_criteria', 'deadline',
                        'funding_type', 'study_level', 'eligible_state')
                state.update(dict(zip(keys, values)), scholarship_id=99, status='pending',
                             import_metadata=json.loads(values[10]))
                row = dict(state)
            elif sql.startswith('select * from scholarship'):
                row = dict(state) if state and values == (99, 7) else None
            elif sql.startswith('update scholarship set title='):
                for key, value in zip(('title', 'description', 'amount', 'category', 'eligibility_criteria', 'deadline', 'funding_type', 'study_level', 'eligible_state'), values):
                    state[key] = value
                state['import_metadata'] = json.loads(values[9]); state['status'] = 'pending'
            elif sql.startswith('select status from scholarship'):
                row = {'status': state['status']} if state else None
            elif sql.startswith('update scholarship set status ='):
                state['status'] = values[0]; state['rejection_reason']=values[1]; row = dict(state)
            elif sql.startswith('select user_id from app_user'):
                row = {'user_id': 11}
            elif sql.startswith('select scholarship_id,sponsor_id,title,deadline,import_metadata'):
                row = dict(state) if state['status'] == 'approved' else None
            elif sql.startswith('insert into application ('):
                row = {'application_id': 23, 'student_id': values[0], 'scholarship_id': values[1],
                       'application_status': values[2]}
                applications.append(row)
            elif 'from application left join scholarship' in sql:
                self.assertNotIn('and scholarship.status', sql)
                row = next(({**item, 'scholarship_title': state['title'], 'listing_published': state['status'] == 'approved'}
                            for item in applications if item['student_id'] == values[0]), None)
            elif sql.startswith('select') and 'from scholarship s' in sql:
                row = dict(state) if state and state['status'] in ('approved', 'active') else None
            elif sql.startswith('delete from scholarship'):
                state.clear()
            elif 'insert into notification' in sql:
                notifications.append(values)
            cursor.fetchone.return_value = row
            cursor.fetchall.return_value = [row] if row else []
        cursor.execute.side_effect = execute
        account = MagicMock()
        account.cursor.return_value.__enter__.return_value.fetchone.return_value = {'status': 'active'}
        with patch('db.get_db_connection', return_value=account), patch('security.verify_active_account', return_value=None), \
             patch('routes.sponsor_listings.get_db_connection', return_value=connection), \
             patch('routes.sponsors.get_db_connection', return_value=connection), \
             patch('routes.applications.get_db_connection', return_value=connection), \
             patch('routes.admin.get_db_connection', return_value=connection), \
             patch('routes.scholarships.get_db_connection', return_value=connection), \
             patch('routes.sponsor_listings.has_linked_records', return_value=False):
            client = create_app().test_client()
            provider = {'Authorization': 'Bearer ' + issue_access_token({'user_id': 7, 'role': 'sponsor'})}
            admin = {'Authorization': 'Bearer ' + issue_access_token({'user_id': 1, 'role': 'admin'})}
            student = {'Authorization': 'Bearer ' + issue_access_token({'user_id': 11, 'role': 'student'})}
            public = '/api/scholarships/99'
            listing = {**payload(), 'deadline_time': '11:30'}
            self.assertEqual(client.post('/api/sponsors/7/scholarships', json=listing, headers=provider).status_code, 201)
            self.assertEqual(client.get(public).status_code, 404)
            self.assertEqual(client.get('/api/scholarships').json, [])
            self.assertEqual(client.patch('/api/admin/scholarships/99/status', json={'status': 'rejected','rejection_reason':'Please clarify the eligibility criteria.'}, headers=admin).status_code, 200)
            self.assertEqual(client.get(public).status_code, 404)
            self.assertEqual(client.patch('/api/admin/scholarships/99/status', json={'status': 'approved'}, headers=admin).status_code, 200)
            self.assertEqual(client.get(public).json['title'], 'Updated Award')
            self.assertEqual(client.get(public).json['deadline_at'], '2099-12-31T11:30:00+08:00')
            self.assertEqual(client.post('/api/applications', json={'scholarship_id': 99}, headers=student).status_code, 201)
            self.assertEqual(client.put('/api/sponsors/7/scholarships/99', json=listing, headers=provider).status_code, 200)
            self.assertEqual(client.get(public).status_code, 404)
            self.assertEqual(client.get('/api/scholarships').json, [])
            history = client.get('/api/applications/student/11', headers=student)
            self.assertEqual(history.status_code, 200)
            self.assertEqual(history.json[0]['application_id'], 23)
            self.assertFalse(history.json[0]['listing_published'])
            self.assertEqual(client.get('/api/applications/student/7', headers=student).status_code, 403)
            self.assertEqual(len(notifications), 6)


if __name__ == '__main__':
    unittest.main()
