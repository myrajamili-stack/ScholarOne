import assert from 'node:assert/strict';
import { test } from 'node:test';
import { restoreLikertNumbering } from '../src/utils/likertNumbering.ts';

test('older drafts get display numbers without changing internal IDs or question data', () => {
  const questions = [{ id: 'QFEA5656A', en: 'First prompt', category: 'R' }, { id: 'CIA002', ms: 'Soalan kedua', category: 'S' }];
  assert.deepEqual(restoreLikertNumbering({ questions }), {
    next_question_number: 3,
    questions: questions.map((question, index) => ({ ...question, display_number: index + 1 })),
  });
});

test('existing display numbers and the deleted-number boundary remain stable', () => {
  const questions = [{ id: 'Q2', display_number: 4, order: 1 }, { id: 'Q1', display_number: 2, order: 2 }];
  assert.deepEqual(restoreLikertNumbering({ questions, next_question_number: 8 }), { questions, next_question_number: 8 });
  const restored = restoreLikertNumbering({ questions: [{ id: 'Q3' }, ...questions] });
  assert.deepEqual(restored.questions.map(question => question.display_number), [5, 4, 2]);
  assert.equal(restored.next_question_number, 6);
});
