from unittest import TestCase

from likert_assessments import CIA, TEMPLATES, calculate_likert_result, validate_definition


class LikertScoringTests(TestCase):
    def test_career_template_uses_supplied_five_dimensions(self):
        _, categories, order = TEMPLATES['CIA-001']
        self.assertEqual(categories, CIA)
        self.assertEqual([i for i, code in enumerate(order, 1) if code == 'R'], [1, 6, 11, 16, 21, 26])
        self.assertEqual([i for i, code in enumerate(order, 1) if code == 'I'], [4, 9, 14, 19, 24, 29])
        self.assertEqual([i for i, code in enumerate(order, 1) if code == 'A'], [3, 8, 13, 18, 23, 28])
        self.assertEqual([i for i, code in enumerate(order, 1) if code == 'S'], [2, 7, 12, 17, 22, 27])
        self.assertEqual([i for i, code in enumerate(order, 1) if code == 'E'], [5, 10, 15, 20, 25, 30])

    def test_weighted_scores_have_deterministic_ties_and_saved_guidance(self):
        definition = {
            'template': '', 'language': 'both', 'scale': 'agreement',
            'categories': [{'code': 'B', 'label': 'Second'}, {'code': 'A', 'label': 'First'}],
            'questions': [
                {'id': 'Q2', 'category': 'B', 'en': 'Second test question', 'ms': 'Soalan dua', 'order': 2, 'weight': 2},
                {'id': 'Q1', 'category': 'A', 'en': 'First test question', 'ms': 'Soalan satu', 'order': 1, 'weight': 3},
            ],
        }
        clean, errors = validate_definition(definition, True)
        self.assertEqual(errors, {})
        self.assertEqual((clean['code'], clean['target_group']), ('', ''))
        quiz = {'assessment': clean, 'quiz_id': 1, 'title': 'Fixture', 'revision': 2}
        result = calculate_likert_result(quiz, {'Q1': 2, 'Q2': 3})
        self.assertTrue(result['has_tie'])
        self.assertEqual([(row['code'], row['score'], row['minimum'], row['maximum']) for row in result['category_scores']],
                         [('A', 6, 3, 15), ('B', 6, 2, 10)])
        self.assertEqual(result['answers'][0]['question_ms'], 'Soalan satu')
        self.assertIn('Disagree / Tidak Setuju', result['answers'][0]['answer'])
        self.assertEqual(result['pathway_terms'], [])
