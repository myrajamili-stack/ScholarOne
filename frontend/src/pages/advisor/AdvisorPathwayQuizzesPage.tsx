import { useEffect, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import axios from "axios";
import api from "../../api/axios";
import { getApiErrorMessage } from "../../utils/apiError";
import { getStoredUser } from "../../utils/authStorage";
import AdvisorPageHeader, { ManagementStats } from "../../components/advisor/AdvisorPageHeader";
import AdvisorIcon from "../../components/advisor/AdvisorIcon";
import "../../styles/advisor-quizzes.css";

type QuizStatus = "draft" | "published";
type Option = { id: string; option_text: string; pathway_result: string };
type Question = { id: string; question_text: string; options: Option[] };
type Editor = { title: string; description: string; questions: Question[] };
type Quiz = {
  quiz_id: number;
  title: string;
  description: string | null;
  status: QuizStatus;
  revision: number;
  created_at: string | null;
  question_count: number;
  attempt_count: number;
  average_score: number | string;
  managed_assessment: boolean;
};
type QuizDetail = Quiz & {
  questions: Array<{ question_id: number; question_text: string; question_type: string; options: Array<{ option_id: number; option_text: string; pathway_result: string }> }>;
};
type QuizData = {
  quizzes: Quiz[];
  summary: { total_quizzes: number; published_count: number; total_attempts: number; average_score: number | string; students_completed: number };
};
type FieldErrors = Record<string, string>;
const emptyEditor: Editor = { title: "", description: "", questions: [] };

function blankOption(): Option {
  return { id: crypto.randomUUID(), option_text: "", pathway_result: "" };
}
function blankQuestion(): Question {
  return { id: crypto.randomUUID(), question_text: "", options: [blankOption(), blankOption()] };
}
function editorFromQuiz(quiz: QuizDetail): Editor {
  return {
    title: quiz.title || "",
    description: quiz.description || "",
    questions: quiz.questions.map(question => ({
      id: String(question.question_id),
      question_text: question.question_text,
      options: question.options.map(option => ({ id: String(option.option_id), option_text: option.option_text, pathway_result: option.pathway_result })),
    })),
  };
}
function validateEditor(editor: Editor, status: QuizStatus): FieldErrors {
  const errors: FieldErrors = {};
  if (!editor.title.trim()) errors.title = "Enter a quiz title.";
  if (editor.title.trim().length > 100) errors.title = "Use at most 100 characters.";
  if (status === "published" && !editor.description.trim()) errors.description = "Add a description before publishing.";
  if (editor.description.trim().length > 5000) errors.description = "Use at most 5000 characters.";
  if (status === "published" && !editor.questions.length) errors.questions = "Add at least one question before publishing.";
  editor.questions.forEach((question, index) => {
    const key = `questions.${index}`;
    if (status === "published" && !question.question_text.trim()) errors[`${key}.question_text`] = "Enter this question before publishing.";
    if (question.question_text.length > 2000) errors[`${key}.question_text`] = "Use at most 2000 characters.";
    if (status === "published" && question.options.length < 2) errors[`${key}.options`] = "Add at least two answers.";
    question.options.forEach((option, optionIndex) => {
      const optionKey = `${key}.options.${optionIndex}`;
      if (status === "published" && !option.option_text.trim()) errors[`${optionKey}.option_text`] = "Enter this answer before publishing.";
      if (option.option_text.length > 255) errors[`${optionKey}.option_text`] = "Use at most 255 characters.";
      if (option.pathway_result.length > 100) errors[`${optionKey}.pathway_result`] = "Use at most 100 characters.";
    });
  });
  return errors;
}
function formatDate(value: string | null) {
  return value ? new Intl.DateTimeFormat("en-MY", { timeZone: "Asia/Kuala_Lumpur", day: "numeric", month: "short", year: "numeric" }).format(new Date(value)) : "Date unavailable";
}
function QuizEmptyIllustration() {
  return <img className="aq-empty-art" src="/images/pathway-quizzes-empty.png" alt="" />;
}

export default function AdvisorPathwayQuizzesPage() {
  const advisorId = getStoredUser()?.user_id;
  const [params] = useSearchParams();
  const focusedId = Number(params.get("quiz")) || null;
  const [data, setData] = useState<QuizData | null>(null);
  const [loading, setLoading] = useState(true);
  const [libraryError, setLibraryError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [editor, setEditor] = useState<Editor>(emptyEditor);
  const [baseline, setBaseline] = useState(JSON.stringify(emptyEditor));
  const [editing, setEditing] = useState<QuizDetail | null>(null);
  const [creationId, setCreationId] = useState(() => crypto.randomUUID());
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState<QuizStatus | null>(null);
  const [loadingQuizId, setLoadingQuizId] = useState<number | null>(null);
  const [previewQuiz, setPreviewQuiz] = useState<QuizDetail | null>(null);
  const previewDialog = useRef<HTMLDialogElement>(null);
  const titleInput = useRef<HTMLInputElement>(null);
  const questionCounter = useRef<HTMLDivElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const dirty = JSON.stringify(editor) !== baseline;
  const questionsLocked = !!editing?.attempt_count;

  useEffect(() => {
    const controller = new AbortController();
    if (!advisorId) return;
    api.get<QuizData>(`/quizzes/advisor/${advisorId}`, { signal: controller.signal }).then(({ data }) => {
      if (!controller.signal.aborted) {
        setData(data);
        setLibraryError("");
      }
    }).catch(error => {
      if (!controller.signal.aborted) setLibraryError(getApiErrorMessage(error, "Unable to load your pathway quizzes."));
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [advisorId, refresh]);

  useEffect(() => {
    if (loading) return;
    const target = params.get("create") === "1" ? titleInput.current : document.getElementById(`quiz-${focusedId}`);
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
    target?.focus({ preventScroll: true });
  }, [loading, focusedId, params]);

  useEffect(() => {
    if (previewQuiz && !previewDialog.current?.open) previewDialog.current?.showModal();
  }, [previewQuiz]);

  function clearForm() {
    setEditor(emptyEditor);
    setBaseline(JSON.stringify(emptyEditor));
    setEditing(null);
    setCreationId(crypto.randomUUID());
    setErrors({});
    setFormError("");
  }
  function focusBuilder() {
    form.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    titleInput.current?.focus({ preventScroll: true });
  }
  function addQuestion() {
    setEditor(current => ({ ...current, questions: [...current.questions, blankQuestion()] }));
    setErrors(current => { const next = { ...current }; delete next.questions; return next; });
    requestAnimationFrame(() => {
      const inputs = form.current?.querySelectorAll<HTMLTextAreaElement>(".aq-question-text");
      inputs?.[inputs.length - 1]?.focus();
    });
  }
  function updateQuestion(questionId: string, update: Partial<Question>) {
    setEditor(current => ({ ...current, questions: current.questions.map(question => question.id === questionId ? { ...question, ...update } : question) }));
  }
  function updateOption(question: Question, optionId: string, update: Partial<Option>) {
    updateQuestion(question.id, { options: question.options.map(option => option.id === optionId ? { ...option, ...update } : option) });
  }
  function showError(key: string) {
    return errors[key] ? <small className="aq-field-error" id={`aq-error-${key}`}>{errors[key]}</small> : null;
  }
  function fieldAttributes(key: string) {
    return { id: `aq-${key}`, "aria-invalid": !!errors[key], "aria-describedby": errors[key] ? `aq-error-${key}` : undefined };
  }
  function focusFirstError(found: FieldErrors) {
    const first = Object.keys(found)[0];
    requestAnimationFrame(() => {
      if (first === "questions") questionCounter.current?.focus();
      else document.getElementById(`aq-${first}`)?.focus();
    });
  }
  async function saveQuiz(status: QuizStatus) {
    if (!advisorId || saving) return;
    setSuccess("");
    setFormError("");
    const found = validateEditor(editor, status);
    setErrors(found);
    if (Object.keys(found).length) {
      setFormError(status === "published" ? "Complete the highlighted fields before publishing." : "Please correct the highlighted fields.");
      focusFirstError(found);
      return;
    }
    setSaving(status);
    const payload = {
      title: editor.title.trim(), description: editor.description.trim(), status,
      questions: editor.questions.map(question => ({ question_text: question.question_text.trim(), question_type: "multiple_choice", options: question.options.map(option => ({ option_text: option.option_text.trim(), pathway_result: option.pathway_result.trim() })) })),
    };
    try {
      const url = `/quizzes/advisor/${advisorId}`;
      const response = editing
        ? await api.put<{ quiz: QuizDetail }>(`${url}/${editing.quiz_id}`, { ...payload, revision: editing.revision })
        : await api.post<{ quiz: QuizDetail }>(url, { ...payload, creation_id: creationId });
      const saved = response.data.quiz;
      setData(current => {
        if (!current) return current;
        const quizzes = [saved, ...current.quizzes.filter(quiz => quiz.quiz_id !== saved.quiz_id)];
        return { ...current, quizzes, summary: { ...current.summary, total_quizzes: quizzes.length, published_count: quizzes.filter(quiz => quiz.status === "published").length } };
      });
      if (status === "draft") {
        const nextEditor = editorFromQuiz(saved);
        setEditing(saved);
        setEditor(nextEditor);
        setBaseline(JSON.stringify(nextEditor));
        setErrors({});
      } else clearForm();
      setSuccess(status === "draft" ? "Draft saved. Open it from your quiz list to continue editing." : "Quiz published and available in the student quiz list.");
      setRefresh(current => current + 1);
    } catch (error) {
      setFormError(getApiErrorMessage(error, "Unable to save this quiz. Your edits are still here."));
      if (axios.isAxiosError(error) && error.response?.data.fields) {
        setErrors(error.response.data.fields);
        focusFirstError(error.response.data.fields);
      }
    } finally { setSaving(null); }
  }
  async function openQuiz(quiz: Quiz, mode: "edit" | "preview") {
    if (loadingQuizId || saving) return;
    if (mode === "edit" && dirty && !window.confirm("Discard your unsaved quiz changes and open this quiz?")) return;
    setLoadingQuizId(quiz.quiz_id);
    setLibraryError("");
    try {
      const { data } = await api.get<{ quiz: QuizDetail }>(`/quizzes/advisor/${advisorId}/${quiz.quiz_id}`);
      if (mode === "preview") setPreviewQuiz(data.quiz);
      else {
        const nextEditor = editorFromQuiz(data.quiz);
        setEditor(nextEditor);
        setBaseline(JSON.stringify(nextEditor));
        setEditing(data.quiz);
        setErrors({});
        setFormError("");
        setSuccess("");
        requestAnimationFrame(focusBuilder);
      }
    } catch (error) { setLibraryError(getApiErrorMessage(error, "Unable to open this quiz.")); }
    finally { setLoadingQuizId(null); }
  }
  function submit(event: FormEvent) { event.preventDefault(); void saveQuiz("published"); }
  const quizzes = data?.quizzes || [];
  const visible = quizzes.filter(quiz => (statusFilter === "all" || quiz.status === statusFilter) && (quiz.title || "").toLowerCase().includes(search.trim().toLowerCase()));
  const summary = data?.summary;

  return <div className="am-page aq-page">
    <AdvisorPageHeader title="Pathway Quizzes" description="Create advisor-prepared quizzes that help students discover suitable academic paths." />
    <ManagementStats items={[
      { label: "Published Quizzes", value: summary?.published_count || 0, icon: "quiz", tone: "purple" },
      { label: "Total Attempts", value: summary?.total_attempts || 0, icon: "users", tone: "blue" },
      { label: "Average Score", value: `${Number(summary?.average_score || 0).toFixed(0)}%`, icon: "chart", tone: "green" },
      { label: "Students Completed", value: summary?.students_completed || 0, icon: "trophy", tone: "amber" },
    ]} />
    {success && <p className="am-feedback success" role="status">{success}</p>}
    <div className="aq-columns">
      <form id="create-quiz" ref={form} tabIndex={-1} className="am-card aq-builder" onSubmit={submit} noValidate>
        <div className="aq-section-heading"><AdvisorIcon name="quiz" /><div><h2>{editing ? `Edit ${editing.status === "draft" ? "Draft" : "Quiz"}` : "Create New Quiz"}</h2><p>Design a quiz to guide students toward suitable academic paths.</p></div></div>
        {editing && <div className="aq-editing"><span>Editing {editing.title}</span><button type="button" disabled={!!saving} onClick={() => { if (!dirty || window.confirm("Discard your unsaved changes?")) clearForm(); }}>New Quiz</button></div>}
        <label className="am-label aq-label" htmlFor="aq-title"><span>Quiz Title <b>*</b></span><input {...fieldAttributes("title")} ref={titleInput} maxLength={100} value={editor.title} disabled={!!saving} placeholder="e.g., Computer Science Pathway Readiness" onChange={event => setEditor(current => ({ ...current, title: event.target.value }))} />{showError("title")}</label>
        <label className="am-label aq-label" htmlFor="aq-description"><span>Description <b>*</b></span><textarea {...fieldAttributes("description")} rows={4} maxLength={5000} value={editor.description} disabled={!!saving} placeholder="Briefly describe the purpose of this quiz and what it helps students discover." onChange={event => setEditor(current => ({ ...current, description: event.target.value }))} />{showError("description")}</label>
        <div className="aq-question-heading" ref={questionCounter} tabIndex={-1}><h3>Quiz Questions{editor.questions.length > 0 && <span>{editor.questions.length}</span>}</h3>{editor.questions.length > 0 && <button className="am-outline" type="button" disabled={!!saving || questionsLocked || editor.questions.length >= 50} onClick={addQuestion}>+ Add Question</button>}</div>
        {questionsLocked && <p className="aq-lock-note">Questions are locked after student submissions. You can edit the title, description, and publication status.</p>}
        {!editor.questions.length && <div className="aq-question-empty"><AdvisorIcon name="quiz" /><h3>Add questions to your quiz</h3><p>You can add multiple-choice questions related to interests, skills, and career goals.</p><button type="button" className="am-outline" disabled={!!saving} onClick={addQuestion}>+ Add Question</button></div>}
        {showError("questions")}
        <div className="aq-questions">{editor.questions.map((question, index) => {
          const key = `questions.${index}`;
          return <fieldset className="aq-question" key={question.id} disabled={!!saving || questionsLocked}><legend>Question {index + 1}</legend><div className="aq-question-tools"><span>Multiple choice</span><button type="button" aria-label={`Remove question ${index + 1}`} onClick={() => setEditor(current => ({ ...current, questions: current.questions.filter(item => item.id !== question.id) }))}>Remove</button></div><label className="am-label" htmlFor={`aq-${key}.question_text`}>Question text<textarea {...fieldAttributes(`${key}.question_text`)} className="aq-question-text" maxLength={2000} rows={2} value={question.question_text} placeholder="Which subject area interests you most?" onChange={event => updateQuestion(question.id, { question_text: event.target.value })} />{showError(`${key}.question_text`)}</label><div className="aq-options">{question.options.map((option, optionIndex) => {
            const optionKey = `${key}.options.${optionIndex}`;
            return <div className="aq-option" key={option.id}><label className="am-label" htmlFor={`aq-${optionKey}.option_text`}>Answer {optionIndex + 1}<input {...fieldAttributes(`${optionKey}.option_text`)} maxLength={255} value={option.option_text} placeholder="e.g., Software Engineering" onChange={event => updateOption(question, option.id, { option_text: event.target.value })} />{showError(`${optionKey}.option_text`)}</label><label className="am-label" htmlFor={`aq-${optionKey}.pathway_result`}>Pathway result (optional)<input {...fieldAttributes(`${optionKey}.pathway_result`)} maxLength={100} value={option.pathway_result} placeholder="Recommended pathway" onChange={event => updateOption(question, option.id, { pathway_result: event.target.value })} />{showError(`${optionKey}.pathway_result`)}</label><button type="button" className="aq-remove-option" aria-label={`Remove answer ${optionIndex + 1} from question ${index + 1}`} disabled={question.options.length <= 2} onClick={() => updateQuestion(question.id, { options: question.options.filter(item => item.id !== option.id) })}><AdvisorIcon name="close" /></button></div>;
          })}</div>{showError(`${key}.options`)}<small className="aq-answer-help">An empty pathway uses the first 100 characters of the answer text.</small><button type="button" className="aq-add-option" disabled={question.options.length >= 10} onClick={() => updateQuestion(question.id, { options: [...question.options, blankOption()] })}>+ Add Answer</button></fieldset>;
        })}</div>
        {formError && <p className="am-feedback error" role="alert">{formError}</p>}
        {dirty && <p className="aq-unsaved">You have unsaved quiz changes.</p>}
        <p className="aq-draft-help">A draft only needs a title. Complete the questions and description to publish.</p><footer className="aq-builder-actions"><button type="button" className="am-outline" disabled={!!saving} onClick={() => void saveQuiz("draft")}>{saving === "draft" ? "Saving Draft…" : "Save as Draft"}</button><button className="am-primary" type="submit" disabled={!!saving}><AdvisorIcon name="send" />{saving === "published" ? "Publishing…" : "Publish Quiz"}</button></footer>
      </form>
      <section className="am-card aq-library"><div className="aq-section-heading"><AdvisorIcon name="layers" /><div><h2>Your Pathway Quizzes</h2><p>Manage, edit, and track the performance of your quizzes.</p></div></div><div className="aq-library-controls"><label className="am-search"><AdvisorIcon name="search" /><input aria-label="Search quizzes" value={search} placeholder="Search quiz by title…" onChange={event => setSearch(event.target.value)} /></label><label className="aq-status-filter"><AdvisorIcon name="filter" /><select aria-label="Filter quiz status" value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option value="all">All Status</option><option value="draft">Draft</option><option value="published">Published</option></select></label></div>
        {libraryError && <p className="am-feedback error" role="alert">{libraryError} <button type="button" onClick={() => setRefresh(value => value + 1)}>Retry</button></p>}
        {loading ? <p className="am-empty" role="status">Loading your quizzes…</p> : !visible.length ? <div className="aq-library-empty"><QuizEmptyIllustration /><h3>{quizzes.length ? "No matching quizzes" : "No pathway quizzes yet"}</h3><p>{quizzes.length ? "Try another title or change the status filter." : "Create your first quiz to help students explore academic paths that match their interests and goals."}</p><button type="button" className="am-primary" onClick={() => { if (quizzes.length) { setSearch(""); setStatusFilter("all"); } else focusBuilder(); }}>{quizzes.length ? "Clear Filters" : "+ Create Quiz"}</button></div> : <div className="aq-quiz-list">{visible.map(quiz => <article id={`quiz-${quiz.quiz_id}`} tabIndex={-1} className={`aq-quiz-card ${focusedId === quiz.quiz_id ? "focused" : ""}`} key={quiz.quiz_id}><header><h3>{quiz.title || "Untitled Quiz"}</h3><span className={`aq-status ${quiz.status}`}>{quiz.status === "draft" ? "Draft" : "Published"}</span></header><p>{quiz.description || "No description yet."}</p><div className="aq-card-metrics"><span><strong>{quiz.question_count}</strong>Questions</span><span><strong>{quiz.attempt_count}</strong>Attempts</span><span><strong>{Number(quiz.average_score || 0).toFixed(0)}%</strong>Average Score</span></div><footer><small>Created {formatDate(quiz.created_at)}</small><div><button type="button" disabled={loadingQuizId !== null || !!saving} onClick={() => void openQuiz(quiz, "preview")}>Preview</button><button type="button" disabled={loadingQuizId !== null || !!saving || quiz.managed_assessment} onClick={() => void openQuiz(quiz, "edit")}>{loadingQuizId === quiz.quiz_id ? "Opening…" : "Edit Quiz"}</button></div></footer>{quiz.managed_assessment && <small className="aq-answer-help">Managed assessment</small>}</article>)}</div>}
      </section>
    </div>
    <dialog className="aq-preview" ref={previewDialog} aria-labelledby="aq-preview-title" onClose={() => setPreviewQuiz(null)} onClick={event => { if (event.target === event.currentTarget) previewDialog.current?.close(); }}>{previewQuiz && <div><header><div><p>Quiz Preview</p><h2 id="aq-preview-title">{previewQuiz.title}</h2></div><button type="button" aria-label="Close quiz preview" onClick={() => previewDialog.current?.close()}><AdvisorIcon name="close" /></button></header><p>{previewQuiz.description || "No description yet."}</p>{previewQuiz.questions.length ? <ol>{previewQuiz.questions.map(question => <li key={question.question_id}><h3>{question.question_text || "Untitled question"}</h3><ul>{question.options.map(option => <li key={option.option_id}>{option.option_text || "Empty answer"}{option.pathway_result && <small>Pathway · {option.pathway_result}</small>}</li>)}</ul></li>)}</ol> : <p className="am-muted">This draft has no questions yet.</p>}</div>}</dialog>
  </div>;
}
