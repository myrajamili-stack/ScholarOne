import assessment from '../data/career-assessment.ts'

export type AssessmentAnswers = Record<string, number>
export type ProfileScore = { label: string; score: number; maximum: number; percentage: number }

export const riasecLabels: Record<string, string> = {
  R: 'Realistic', I: 'Investigative', A: 'Artistic', S: 'Social', E: 'Enterprising', C: 'Conventional',
}

export function isSectionComplete(section: number, answers: AssessmentAnswers, rankings: string[]) {
  if (section === 3) {
    return rankings.length === 3 && new Set(rankings).size === 3
      && rankings.every((id) => assessment.values.some((value) => value.id === id))
  }
  const questions = section === 0 ? assessment.aptitude : section === 1 ? assessment.riasec : assessment.ocean
  return questions.every((question) => {
    const value = answers[question.id]
    return Number.isInteger(value) && (section === 0
      ? value >= 0 && value < 4
      : value >= 1 && value <= 5)
  })
}

export function scoreCareerAssessment(answers: AssessmentAnswers, rankings: string[]) {
  if (![0, 1, 2, 3].every((section) => isSectionComplete(section, answers, rankings))) {
    throw new Error('Answer every question and rank three different work values.')
  }

  const aptitude = [...new Set(assessment.aptitude.map((question) => question.domain))].map((domain) => {
    const questions = assessment.aptitude.filter((question) => question.domain === domain)
    const score = questions.filter((question) => answers[question.id] === question.correct).length
    return { label: domain, score, maximum: questions.length, percentage: score / questions.length * 100 }
  })
  const riasec = Object.entries(riasecLabels).map(([code, label]) => {
    const score = assessment.riasec.filter((question) => question.group === code)
      .reduce((total, question) => total + answers[question.id], 0)
    return { code, label, score, maximum: 10, percentage: score / 10 * 100 }
  })
  const ocean = [...new Set(assessment.ocean.map((question) => question.group))].map((trait) => {
    const score = assessment.ocean.filter((question) => question.group === trait)
      .reduce((total, question) => total + (question.reverse ? 6 - answers[question.id] : answers[question.id]), 0)
    return { label: trait, score, maximum: 10, percentage: score / 10 * 100 }
  })
  const sorted = [...riasec].sort((a, b) => b.score - a.score)
  const hollandCode = sorted.slice(0, 3).map((group) => group.code).join('-')
  const workValues = assessment.values.map((value) => {
    const index = rankings.indexOf(value.id)
    return { ...value, rank: index === -1 ? null : index + 1, score: index === -1 ? 0 : 3 - index }
  })
  return { aptitude, riasec, ocean, hollandCode, hasHollandTie: sorted.some((group, index) => index > 0 && group.score === sorted[index - 1].score), workValues }
}

export type CareerAssessmentResult = ReturnType<typeof scoreCareerAssessment>
