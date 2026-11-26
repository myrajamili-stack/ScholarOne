import { useEffect, useRef, useState, type FormEvent } from "react";
import api from "../api/axios";
import { getApiErrorMessage } from "../utils/apiError";
import AdvisorQuizResults from "./AdvisorQuizResults";
import type { SavedAdvisorQuiz } from "../types/advisorQuiz";
import type { LikertLanguage, PublicLikert } from "../types/likertAssessment";
import { PATHWAY_PREFERENCE_CODE } from "../utils/pathwayPreference";

type Quiz = { quiz_id: number; title: string; description: string; revision: number; advisor_name: string; assessment?: PublicLikert; assessment_code?: string; language?: LikertLanguage;
  questions: { question_id: number; question_text: string; question_text_ms?: string; options: { option_id: number; option_text: string; option_text_ms?: string }[] }[] };

export default function StudentAdvisorQuiz({ quizId, onSaved }: { quizId: number; onSaved: () => void }) {
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [attempt, setAttempt] = useState<SavedAdvisorQuiz | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [retaking, setRetaking] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [selectedLanguage, setSelectedLanguage] = useState<"en" | "ms">("en");
  const submission = useRef<{ id: string; content: string } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    Promise.allSettled([api.get<{ quiz: Quiz }>(`/quizzes/${quizId}/take`, { signal: controller.signal }),
      api.get<{ attempt: SavedAdvisorQuiz | null }>(`/quizzes/${quizId}/attempts/latest`, { signal: controller.signal })]).then(([current, saved]) => {
      if (controller.signal.aborted) return;
      const failures: string[] = [];
      if (current.status === "fulfilled") setQuiz(current.value.data.quiz);
      else { setQuiz(null); failures.push(getApiErrorMessage(current.reason, "This quiz is unavailable.")); }
      if (saved.status === "fulfilled") setAttempt(saved.value.data.attempt);
      else failures.push("Saved results could not be loaded. Please retry.");
      setError(failures.join(" ")); setLoading(false);
    });
    return () => controller.abort();
  }, [quizId, reload]);
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!quiz || saving) return;
    const questionIds = quiz.assessment ? quiz.assessment.questions.map(question => question.id) : quiz.questions.map(question => String(question.question_id));
    if (questionIds.some(id => !answers[id])) { setError("Answer every question before submitting."); return; }
    const content = JSON.stringify({ answers, revision: quiz.revision });
    if (submission.current?.content !== content) submission.current = { id: crypto.randomUUID(), content };
    setSaving(true); setError("");
    try {
      const response = await api.post<{ attempt: SavedAdvisorQuiz }>(`/quizzes/${quizId}/attempts`, { answers, revision: quiz.revision, submission_id: submission.current.id });
      setAttempt(response.data.attempt); setRetaking(false); onSaved();
    } catch (err) { setError(getApiErrorMessage(err, "Unable to save. Your answers are still here; please retry.")); }
    finally { setSaving(false); }
  }
  const assessment = quiz?.assessment;
  const activeQuestion = assessment?.questions[questionIndex];
  const quizLanguage = assessment?.language ?? quiz?.language ?? "en";
  const language = quizLanguage === "both" ? selectedLanguage : quizLanguage;
  function resetAnswers() {
    setAnswers({}); setQuestionIndex(0); submission.current = null;
  }
  return <section className="spq-card advisor-student-quiz" aria-label="Advisor quiz participation">
    {loading ? <p role="status">Loading quiz and saved results…</p> : <>
      {error && <div role="alert"><p>{error}</p><button type="button" disabled={saving} onClick={() => { setLoading(true); resetAnswers(); setRetaking(false); setReload(value => value + 1); }}>Reload Quiz and Results</button></div>}
      {attempt && !retaking ? <><AdvisorQuizResults attempt={attempt} /><button type="button" className="ss-button" disabled={!quiz} onClick={() => { setRetaking(true); resetAnswers(); }}>Retake Quiz</button></> : quiz && <form onSubmit={submit}>
        <h2>{quiz.title}</h2><p>By {quiz.advisor_name}{(assessment?.code || quiz.assessment_code) && ` · ${assessment?.code || quiz.assessment_code}`}</p><p>{quiz.description}</p>
        {quizLanguage === "both" && <label>Question language <select value={selectedLanguage} onChange={event => setSelectedLanguage(event.target.value === "ms" ? "ms" : "en")}>
          <option value="en">English</option><option value="ms">Malay</option>
        </select></label>}
        {assessment && activeQuestion ? <>
          <p>Choose one response per question. The advisor can review your submitted answers and category scores.</p>
          <p role="status">Question {questionIndex + 1} of {assessment.questions.length}</p>
          <fieldset disabled={saving} className="advisor-quiz-questions">
            <fieldset key={activeQuestion.id} lang={language}>
              <legend>{activeQuestion[language]}</legend>
              {assessment.scale.map(choice => <label key={choice.value}>
                <input type="radio" name={`question-${activeQuestion.id}`} checked={answers[activeQuestion.id] === choice.value}
                  onChange={() => setAnswers(current => ({ ...current, [activeQuestion.id]: choice.value }))} />
                {choice.value} — {choice[language]}
              </label>)}
            </fieldset>
            <div className="advisor-likert-navigation">
              <button className="ss-button" type="button" disabled={questionIndex === 0} onClick={() => setQuestionIndex(index => index - 1)}>Previous question</button>
              {questionIndex + 1 === assessment.questions.length
                ? <button className="ss-button" type="submit" disabled={!assessment.questions.every(question => answers[question.id])}>{saving ? "Saving Results…" : "Submit Assessment and Save Results"}</button>
                : <button className="ss-button" type="button" disabled={!answers[activeQuestion.id]} onClick={() => setQuestionIndex(index => index + 1)}>Next question</button>}
            </div>
          </fieldset>
        </> : <>
        <p>{quiz.assessment_code === PATHWAY_PREFERENCE_CODE
          ? "Choose the answer that best matches your preferences for each question. Your advisor can review your submitted answers and outcome categories."
          : "Select one answer for each question. Results are based on your choices, not a pass/fail grade. The quiz's advisor can view your submitted answers and outcomes."}</p>
        <fieldset disabled={saving} className="advisor-quiz-questions">{quiz.questions.map((question, index) => <fieldset key={question.question_id} lang={language}>
          <legend>{index + 1}. {language === "ms" ? question.question_text_ms || question.question_text : question.question_text}</legend>
          {question.options.map(option => <label key={option.option_id}><input type="radio" required name={`question-${question.question_id}`} checked={answers[String(question.question_id)] === option.option_id} onChange={() => setAnswers(current => ({ ...current, [question.question_id]: option.option_id }))} />{language === "ms" ? option.option_text_ms || option.option_text : option.option_text}</label>)}
        </fieldset>)}<button className="ss-button" type="submit">{saving ? "Saving Results…" : "Submit Quiz and Save Results"}</button></fieldset>
        </>}
      </form>}
    </>}
  </section>;
}
