from pathlib import Path
import sys
import copy
import unittest
from unittest.mock import patch, MagicMock
from psycopg2.errors import UniqueViolation, UndefinedColumn

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from academic_pathways import validate_pathway, recommend_pathways
from pathway_seed import starter_pathways
from app import create_app
from scripts.enable_academic_pathways import setup
from security import issue_access_token


def catalogue():
    return [{**validate_pathway(row), 'pathway_id': i + 1} for i, row in enumerate(starter_pathways())]


class PathwayLogicTests(unittest.TestCase):
    @patch('scripts.enable_academic_pathways.get_db_connection')
    @patch('builtins.print')
    def test_setup_preserves_existing_records_instead_of_reimporting(self, output, connect):
        cursor = connect.return_value.cursor.return_value.__enter__.return_value
        cursor.fetchone.return_value = {'pathway_id': 1}
        setup()
        queries = [call.args[0].lower() for call in cursor.execute.call_args_list]
        self.assertFalse(any(query.startswith('insert into academic_pathway') for query in queries))
        self.assertFalse(any(query.startswith('update ') or query.startswith('delete ') for query in queries))
        self.assertIn('0 new routes', output.call_args.args[0])

    @patch('scripts.enable_academic_pathways.get_db_connection')
    @patch('builtins.print')
    def test_setup_inserts_missing_validated_routes_only(self, output, connect):
        cursor = connect.return_value.cursor.return_value.__enter__.return_value
        cursor.fetchone.return_value = None
        cursor.rowcount = 1
        setup()
        inserts = [call for call in cursor.execute.call_args_list if call.args[0].startswith('insert into academic_pathway')]
        self.assertEqual(len(inserts), 7)
        self.assertIn('7 new routes', output.call_args.args[0])

    def test_all_seven_source_linked_routes_have_real_progression(self):
        rows = catalogue()
        self.assertEqual(len(rows), 7)
        self.assertEqual(len({row['title'] for row in rows}), 7)
        self.assertTrue(all(len(row['guidance']['stages']) >= 2 for row in rows))
        self.assertTrue(all(row['guidance']['sources'][0]['url'].startswith('https://') for row in rows))

    def test_invalid_content_and_unsafe_links_are_rejected(self):
        for mutate in (lambda r: r.update(title=' '), lambda r: r.update(role='admin'),
                       lambda r: r['guidance'].update(stages=[]), lambda r: r['guidance'].update(riasec_codes=['Z']),
                       lambda r: r['guidance'].update(next_steps=[]), lambda r: r['guidance'].update(starting_qualifications=[]),
                       lambda r: r['guidance'].update(sources=[{'label': 'bad', 'url': 'javascript:alert(1)'}]),
                       lambda r: r['guidance'].update(sources=[{'label': 'bad', 'url': 'https://['}])):
            row = copy.deepcopy(starter_pathways()[0]); mutate(row)
            with self.assertRaises(ValueError): validate_pathway(row)

    def test_computing_and_business_profiles_get_different_rankings(self):
        rows = catalogue()
        technical = {'riasec': [{'code': c, 'score': score} for c, score in zip('RIASEC', [9, 10, 2, 3, 4, 8])]}
        business = {'riasec': [{'code': c, 'score': score} for c, score in zip('RIASEC', [2, 3, 4, 8, 10, 9])]}
        a = recommend_pathways(rows, {'education_level': 'Diploma', 'field_of_study': 'Software'}, technical)
        b = recommend_pathways(rows, {'education_level': 'Diploma', 'field_of_study': 'Business'}, business)
        self.assertIn('UTM', a[0]['title'])
        self.assertIn('UiTM', b[0]['title'])
        self.assertTrue(any('saved assessment' in reason for reason in a[0]['reasons']))

    def test_missing_profile_is_general_guidance_not_confirmed_eligibility(self):
        rows = recommend_pathways(catalogue(), {})
        self.assertTrue(rows)
        self.assertTrue(all(any('general exploration' in reason for reason in row['reasons']) for row in rows))

    def test_saved_qualification_is_a_fallback_without_overriding_current_level(self):
        profile = {'academic_qualifications': {'diploma': {'cgpa': 3.4}}}
        rows = recommend_pathways(catalogue(), profile)
        self.assertTrue(any('saved academic history' in reason for reason in rows[0]['reasons']))
        self.assertEqual(recommend_pathways(catalogue(), {**profile, 'education_level': 'PhD'}), [])

    def test_unmatched_qualification_and_drafts_are_not_recommended(self):
        rows = catalogue()
        self.assertEqual(recommend_pathways(rows, {'education_level': 'PhD'}), [])
        for row in rows: row['status'] = 'draft'
        self.assertEqual(recommend_pathways(rows, {}), [])

    def test_equal_interest_scores_do_not_produce_arbitrary_bonus(self):
        assessment = {'riasec': [{'code': c, 'score': 6} for c in 'RIASEC']}
        results = recommend_pathways(catalogue(), {'education_level': 'Diploma'}, assessment)
        self.assertTrue(all(row['ranking_points'] == 4 for row in results))


class PathwayApiTests(unittest.TestCase):
    def setUp(self):
        self.enterContext(patch('security.verify_active_account', return_value=None))
        self.connect = self.enterContext(patch('routes.pathways.get_db_connection'))
        self.connection = self.connect.return_value
        self.cursor = self.connection.cursor.return_value
        self.read_cursor = self.connection.cursor.return_value.__enter__.return_value
        self.client = create_app().test_client()
        self.admin = {'Authorization': 'Bearer ' + issue_access_token({'user_id': 1, 'role': 'admin'})}
        self.student = {'Authorization': 'Bearer ' + issue_access_token({'user_id': 11, 'role': 'student'})}

    def test_catalogue_search_and_filters_return_only_published_routes(self):
        rows = catalogue(); rows[0]['status'] = 'draft'
        self.read_cursor.fetchall.return_value = [{'record': row} for row in rows]
        response = self.client.get('/api/pathways?q=software&field=Computing&level=Undergraduate', headers=self.student)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json['pathways']), 1)
        self.assertIn('UTM', response.json['pathways'][0]['title'])
        self.assertEqual(self.client.get('/api/pathways?q=missing', headers=self.student).json['pathways'], [])

    def test_recommendations_read_own_profile_and_latest_saved_assessment(self):
        self.read_cursor.fetchall.return_value = [{'record': row} for row in catalogue()]
        self.read_cursor.fetchone.side_effect = [{'education_level': 'Diploma', 'field_of_study': 'Software'}, None]
        response = self.client.get('/api/pathways/recommendations', headers=self.student)
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json['has_assessment'])
        self.assertIn('UTM', response.json['pathways'][0]['title'])
        self.assertEqual(self.read_cursor.execute.call_args_list[1].args[1], (11,))
        self.assertEqual(self.read_cursor.execute.call_args_list[2].args[1], (11,))
        self.connection.commit.assert_not_called()

    def test_removed_or_draft_pathway_detail_is_unavailable(self):
        for row in (None, {'record': {**catalogue()[0], 'status': 'draft'}}):
            self.read_cursor.fetchone.return_value = row
            self.assertEqual(self.client.get('/api/pathways/1', headers=self.student).status_code, 404)

    def test_admin_create_and_update_are_parameterized_and_audited(self):
        record = starter_pathways()[0]
        self.cursor.fetchone.side_effect = [None, {'pathway_id': 1, **record}]
        response = self.client.post('/api/admin/pathways', json=record, headers=self.admin)
        self.assertEqual(response.status_code, 201, response.json)
        self.assertIn('audit_log', self.cursor.execute.call_args.args[0])
        self.connection.commit.assert_called_once()
        self.connection.reset_mock()
        self.cursor.fetchone.side_effect = [{'record': {'pathway_id': 1, **record}}, None, {'pathway_id': 1, **record}]
        self.assertEqual(self.client.put('/api/admin/pathways/1', json=record, headers=self.admin).status_code, 200)
        self.connection.commit.assert_called_once()

    def test_duplicate_or_invalid_records_are_not_committed(self):
        self.cursor.fetchone.return_value = {'pathway_id': 2}
        self.assertEqual(self.client.post('/api/admin/pathways', json=starter_pathways()[0], headers=self.admin).status_code, 409)
        self.assertEqual(self.client.post('/api/admin/pathways', json={}, headers=self.admin).status_code, 400)
        self.connection.commit.assert_not_called()

    def test_delete_requires_confirmation_and_rejects_linked_records(self):
        self.cursor.fetchone.return_value = {'record': catalogue()[0]}
        self.assertEqual(self.client.delete('/api/admin/pathways/1', json={}, headers=self.admin).status_code, 400)
        with patch('routes.pathways.has_linked_records', return_value=True):
            self.assertEqual(self.client.delete('/api/admin/pathways/1', json={'confirm_pathway_id': 1}, headers=self.admin).status_code, 409)
        self.connection.commit.assert_not_called()

    def test_unlinked_pathway_can_be_deleted(self):
        self.cursor.fetchone.return_value = {'record': catalogue()[0]}
        with patch('routes.pathways.has_linked_records', return_value=False):
            self.assertEqual(self.client.delete('/api/admin/pathways/1', json={'confirm_pathway_id': 1}, headers=self.admin).status_code, 200)
        self.connection.commit.assert_called_once()

    def test_missing_migration_has_actionable_safe_error(self):
        self.cursor.fetchone.return_value = None
        self.cursor.execute.side_effect = [None, UndefinedColumn()]
        response = self.client.post('/api/admin/pathways', json=starter_pathways()[0], headers=self.admin)
        self.assertEqual(response.status_code, 503)
        self.assertIn('enable_academic_pathways.py', response.json['error'])


if __name__ == '__main__':
    unittest.main()
