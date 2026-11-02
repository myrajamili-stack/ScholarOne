import { test } from 'node:test'
import assert from 'node:assert/strict'
import assessment from '../src/data/career-assessment.ts'
import { scoreCareerAssessment } from '../src/utils/careerAssessment.ts'
import { buildCareerGuidance, describePersonality } from '../src/utils/careerGuidance.ts'

function resultFor(interests) {
  const answers = Object.fromEntries([
    ...assessment.aptitude.map((q) => [q.id, q.correct]),
    ...assessment.riasec.map((q) => [q.id, interests[q.group]]),
    ...assessment.ocean.map((q) => [q.id, 3]),
  ])
  return scoreCareerAssessment(answers, ['value-1', 'value-5', 'value-6'])
}

test('I-R-C profile uses analytical interpretation and relevant technical careers', () => {
  const result = resultFor({ R: 4, I: 5, A: 1, S: 1, E: 1, C: 3 })
  const guidance = buildCareerGuidance(result)
  assert.equal(guidance.title, 'The Analytical Problem-Solver')
  assert.deepEqual(guidance.top.map((s) => s.code), ['I', 'R', 'C'])
  assert.ok(guidance.suggestions.some((job) => job.code === '19-4031.00'))
  assert.equal(guidance.suggestions.length, 5)
  assert.equal(new Set(guidance.suggestions.map((job) => job.code)).size, 5)
  assert.ok(guidance.suggestions.every((job) => job.reason && job.source.startsWith('https://www.onetonline.org/')))
})

test('suggestions change for social and artistic profiles', () => {
  const social = buildCareerGuidance(resultFor({ R: 1, I: 1, A: 2, S: 5, E: 2, C: 2 }))
  const artistic = buildCareerGuidance(resultFor({ R: 1, I: 2, A: 5, S: 1, E: 1, C: 3 }))
  assert.equal(social.suggestions[0].title, 'Tutor')
  assert.equal(artistic.suggestions[0].title, 'Graphic Designer')
  assert.notEqual(social.title, artistic.title)
})

test('equal and low interests are not presented as strong matches', () => {
  const equal = buildCareerGuidance(resultFor({ R: 3, I: 3, A: 3, S: 3, E: 3, C: 3 }))
  assert.equal(equal.sameInterests, true)
  assert.equal(equal.title, 'The Broad Explorer')
  const low = buildCareerGuidance(resultFor({ R: 1, I: 2, A: 1, S: 1, E: 1, C: 1 }))
  assert.equal(low.lowInterests, true)
  assert.match(low.introductions[0], /did not report strong liking/)
})

test('personality interpretations vary with scores and handle reverse-scored neuroticism cautiously', () => {
  assert.match(describePersonality('Openness', 90), /new ideas/)
  assert.match(describePersonality('Openness', 20), /familiar approaches/)
  assert.match(describePersonality('Extraversion', 60), /balance/)
  assert.match(describePersonality('Neuroticism', 90), /sensitive/)
  assert.match(describePersonality('Neuroticism', 20), /staying calm/)
})

test('personality differences do not exclude occupations or alter interest-only recommendations', () => {
  const result = resultFor({ R: 3, I: 5, A: 2, S: 1, E: 2, C: 4 })
  const changed = { ...result, ocean: result.ocean.map((trait) => ({ ...trait, percentage: 100 })) }
  assert.deepEqual(buildCareerGuidance(result).suggestions, buildCareerGuidance(changed).suggestions)
})
