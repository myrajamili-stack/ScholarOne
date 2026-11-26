export type AdvisorQuizResult = {
  kind: "advisor_quiz"; quiz_id: number; quiz_title: string; quiz_revision: number; question_count: number;
  leading_outcomes: string[]; has_tie: boolean; note: string;
  assessment_type?: "likert"; assessment_code?: string; template?: string;
  category_scores?: { code: string; label: string; score: number; minimum: number; maximum: number }[];
  outcomes: { label: string; selections: number }[];
  answers: { question_id: number | string; question: string; question_ms?: string; selected_option_id?: number; answer: string; answer_ms?: string; outcome: string; score?: number; weight?: number }[];
  linked_pathways?: { pathway_id: number; title: string }[];
};
export type SavedAdvisorQuiz = { attempt_id: number; quiz_id: number; submitted_at: string; result: AdvisorQuizResult; student_name?: string };
