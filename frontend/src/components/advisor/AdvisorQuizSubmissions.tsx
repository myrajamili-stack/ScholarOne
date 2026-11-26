import { useEffect, useRef, useState } from "react";
import api from "../../api/axios";
import { getApiErrorMessage } from "../../utils/apiError";
import type { SavedAdvisorQuiz } from "../../types/advisorQuiz";

export default function AdvisorQuizSubmissions({ advisorId, quizId, onClose }: { advisorId: number; quizId: number; onClose: () => void }) {
  const [attempts, setAttempts] = useState<SavedAdvisorQuiz[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
    const controller = new AbortController();
    api.get<{ attempts: SavedAdvisorQuiz[] }>(`/quizzes/advisor/${advisorId}/${quizId}/attempts`, { signal: controller.signal }).then(({ data }) => {
      if (!controller.signal.aborted) setAttempts(data.attempts);
    }).catch(err => { if (!controller.signal.aborted) setError(getApiErrorMessage(err, "Unable to load submissions.")); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [advisorId, quizId]);
  return <dialog ref={dialog} className="aq-preview" aria-labelledby="advisor-submissions-title" onCancel={onClose}><header><h2 id="advisor-submissions-title">Student Quiz Submissions</h2><button aria-label="Close submissions" onClick={onClose}>×</button></header>
    <p>Outcomes summarize selected answers; they are not exam grades. Showing up to 200 recent submissions.</p>
    {loading && <p role="status">Loading submissions…</p>}{error && <p role="alert">{error}</p>}
    {!loading && !error && !attempts.length && <p>No student submissions yet.</p>}
    {attempts.map(attempt => <article key={attempt.attempt_id}><h3>{attempt.student_name}</h3><p>{new Date(attempt.submitted_at).toLocaleString("en-MY")} · Version {attempt.result.quiz_revision}</p><strong>{attempt.result.leading_outcomes.join(" · ")}</strong><details><summary>View submitted answers</summary><ol>{attempt.result.answers.map(answer => <li key={answer.question_id}><strong>{answer.question}</strong><p>{answer.answer} — {answer.outcome}</p></li>)}</ol></details></article>)}
  </dialog>;
}
