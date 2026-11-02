import { test } from 'node:test'
import assert from 'node:assert/strict'
import assessment from '../src/data/career-assessment.ts'
import { isSectionComplete, scoreCareerAssessment } from '../src/utils/careerAssessment.ts'

function completeAnswers() {
  return Object.fromEntries([
    ...assessment.aptitude.map((q) => [q.id, q.correct]),
    ...assessment.riasec.map((q) => [q.id, 3]),
    ...assessment.ocean.map((q) => [q.id, 3]),
  ])
}
const ranks = ['value-1', 'value-5', 'value-6']

test('document contains all questions, domains, and reverse-scored items', () => {
  assert.equal(assessment.aptitude.length, 10)
  assert.equal(assessment.riasec.length, 12)
  assert.equal(assessment.ocean.length, 10)
  assert.equal(assessment.values.length, 6)
  assert.deepEqual(assessment.aptitude.map((q) => q.correct), [1, 1, 2, 2, 2, 1, 3, 3, 2, 1])
  assert.deepEqual(assessment.ocean.filter((q) => q.reverse).map((q) => q.id), ['ocean-6', 'ocean-10'])
})

test('aptitude reports domain scores with actual question counts', () => {
  const answers = completeAnswers()
  let result = scoreCareerAssessment(answers, ranks)
  assert.deepEqual(result.aptitude.map((s) => [s.score, s.maximum, s.percentage]), [[3, 3, 100], [3, 3, 100], [4, 4, 100]])
  for (const q of assessment.aptitude) answers[q.id] = (q.correct + 1) % 4
  result = scoreCareerAssessment(answers, ranks)
  assert.ok(result.aptitude.every((s) => s.percentage === 0))
  answers['aptitude-1'] = assessment.aptitude[0].correct
  assert.ok(Math.abs(scoreCareerAssessment(answers, ranks).aptitude[0].percentage - 100 / 3) < 1e-10)
})

test('RIASEC uses document pairs and returns top three with deterministic ties', () => {
  const answers = completeAnswers()
  for (const q of assessment.riasec) answers[q.id] = ({ R: 4, I: 5, A: 1, S: 3, E: 2, C: 5 })[q.group]
  const result = scoreCareerAssessment(answers, ranks)
  assert.deepEqual(result.riasec.map((s) => s.percentage), [80, 100, 20, 60, 40, 100])
  assert.equal(result.hollandCode, 'I-C-R')
  assert.equal(result.hasHollandTie, true)
  assert.equal(scoreCareerAssessment(completeAnswers(), ranks).hollandCode, 'R-I-A')
})

test('OCEAN reverses questions 6 and 10 using 6 minus answer', () => {
  const answers = completeAnswers()
  for (const q of assessment.ocean) answers[q.id] = 5
  let result = scoreCareerAssessment(answers, ranks)
  assert.deepEqual(result.ocean.map((s) => s.percentage), [100, 100, 60, 100, 60])
  answers['ocean-6'] = 1
  answers['ocean-10'] = 1
  result = scoreCareerAssessment(answers, ranks)
  assert.ok(result.ocean.every((s) => s.percentage === 100))
})

test('ranked work values receive 3, 2, 1; unselected values receive 0', () => {
  const result = scoreCareerAssessment(completeAnswers(), ranks)
  assert.deepEqual(result.workValues.map((s) => s.score), [3, 0, 0, 0, 2, 1])
  assert.equal(result.workValues.reduce((sum, s) => sum + s.score, 0), 6)
})

test('incomplete, duplicate, and invalid responses cannot be scored', () => {
  const answers = completeAnswers()
  assert.equal(isSectionComplete(0, {}, ranks), false)
  assert.throws(() => scoreCareerAssessment({}, ranks))
  for (const invalid of [['value-1', 'value-1', 'value-2'], ['', '', ''], ['unknown', 'value-1', 'value-2'], ['value-1']]) {
    assert.throws(() => scoreCareerAssessment(answers, invalid))
  }
  for (const invalid of [0, 6, 2.5, NaN]) {
    assert.throws(() => scoreCareerAssessment({ ...answers, 'riasec-1': invalid }, ranks))
  }
  assert.throws(() => scoreCareerAssessment({ ...answers, 'aptitude-1': 4 }, ranks))
})
