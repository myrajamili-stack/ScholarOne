import type { CareerAssessmentResult } from '../utils/careerAssessment'

export type SavedCareerAssessmentAttempt = {
  attempt_id: number
  submitted_at: string
  result: CareerAssessmentResult
}
