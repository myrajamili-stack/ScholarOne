import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import Icon from "../../components/advisor/AdvisorIcon";
import PathwayArtwork from "../../components/student/PathwayArtwork";
import api from "../../api/axios";
import CareerAssessment from "../../components/CareerAssessment";
import CareerAssessmentResults from "../../components/CareerAssessmentResults";
import type { SavedCareerAssessmentAttempt } from "../../types/careerAssessment";
import { getApiErrorMessage } from "../../utils/apiError";
import { getAccessToken } from "../../utils/authStorage";
import "../../styles/career-assessment.css";
import "../../styles/student-pathway.css";

type PathwayQuiz = {
  quiz_id: number;
  title: string;
  description?: string | null;
  advisor_name?: string | null;
  advisor_specialization?: string | null;
  question_count?: number | string | null;
};

function PathwayQuizPage() {
  const [quizzes, setQuizzes] = useState<PathwayQuiz[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [isAssessmentOpen, setIsAssessmentOpen] = useState(false);
  const [latestAttempt, setLatestAttempt] = useState<SavedCareerAssessmentAttempt | null>(null);
  const [isLoadingResults, setIsLoadingResults] = useState(true);
  const [resultsError, setResultsError] = useState("");
  const [resultsRequest, setResultsRequest] = useState(0);
  const resultsDialog = useRef<HTMLDialogElement>(null);
  const resultsController = useRef<AbortController | null>(null);
  const assessmentPanel = useRef<HTMLElement>(null);
  const quizList = useRef<HTMLElement>(null);
  function startAssessment() {
    setIsAssessmentOpen(true);
    if (isAssessmentOpen) { assessmentPanel.current?.scrollIntoView({ behavior: "smooth", block: "start" }); assessmentPanel.current?.focus({ preventScroll: true }); }
  }
  useEffect(() => {
    if (isAssessmentOpen) { assessmentPanel.current?.scrollIntoView({ behavior: "smooth", block: "start" }); assessmentPanel.current?.focus({ preventScroll: true }); }
  }, [isAssessmentOpen]);
  const advisorQuizzes = quizzes.filter((quiz) => quiz.title.trim().toUpperCase() !== "CAREER ASSESSMENT");

  useEffect(() => {
    async function loadQuizzes() {
      try {
        const response = await api.get<PathwayQuiz[]>("/quizzes");
        setQuizzes(response.data);
      } catch {
        setError("Unable to load pathway quizzes right now.");
      } finally {
        setIsLoading(false);
      }
    }

    loadQuizzes();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    resultsController.current = controller;
    async function loadResults() {
      try {
        if (!getAccessToken()) throw new Error("Sign in again to view your saved results.");
        const response = await api.get<{ attempt: SavedCareerAssessmentAttempt | null }>("/quizzes/career-assessment/attempts/latest", {
          signal: controller.signal, timeout: 15000,
        });
        if (!controller.signal.aborted) {
          setLatestAttempt(response.data.attempt);
          setResultsError("");
        }
      } catch (error) {
        if (!controller.signal.aborted) setResultsError(getApiErrorMessage(error,
          !getAccessToken() ? "Sign in again to view your saved results." : "Unable to load saved results. Please try again."));
      } finally {
        if (!controller.signal.aborted) setIsLoadingResults(false);
      }
    }
    loadResults();
    return () => controller.abort();
  }, [resultsRequest]);

  function handleAssessmentSaved(attempt: SavedCareerAssessmentAttempt) {
    resultsController.current?.abort();
    setLatestAttempt(attempt);
    setResultsError("");
    setIsLoadingResults(false);
  }

  return (
    <section className="student-pathway-page">
      <header className="spq-hero">
        <div className="spq-hero-copy">
          <p className="spq-eyebrow"><Icon name="graduation" />Academic Pathway</p>
          <h1>Pathway Quiz <span aria-hidden="true">✦</span></h1>
          <p>Explore your strengths, interests, and academic potential through a variety of career and academic pathway assessments.</p>
          <button className="ss-button spq-start" type="button" onClick={startAssessment}>{isAssessmentOpen ? "Continue Your Quiz" : "Start a Quiz Now"} <Icon name="chevron" /></button>
        </div>
        <PathwayArtwork name="hero" className="spq-hero-art" />
      </header>
      <div className="spq-benefits">
        <article className="spq-benefit purple"><PathwayArtwork name="target" /><div><h2>Discover Interests</h2><p>Learn what you enjoy and are good at.</p></div></article>
        <article className="spq-benefit blue"><PathwayArtwork name="strengths" /><div><h2>Assess Your Strengths</h2><p>Understand your skills and potential.</p></div></article>
        <article className="spq-benefit gold"><PathwayArtwork name="pathways" /><div><h2>Explore Pathways</h2><p>Find suitable academic and career options.</p></div></article>
        <article className="spq-benefit green"><PathwayArtwork name="guidance" /><div><h2>Get Guidance</h2><p>Use your results to plan with an advisor.</p></div></article>
      </div>
      <dialog ref={resultsDialog} className="pathway-results-dialog" aria-labelledby="saved-results-title" onClick={(event) => {
        if (event.target === event.currentTarget) resultsDialog.current?.close();
      }}>
        <div className="pathway-results-dialog-content">
          <header className="pathway-results-dialog-header">
            <div><p>YOUR SAVED ASSESSMENT</p><h2 id="saved-results-title">Career Assessment Results</h2></div>
            <button type="button" aria-label="Close results" onClick={() => resultsDialog.current?.close()}>×</button>
          </header>
          {latestAttempt && <CareerAssessmentResults result={latestAttempt.result} />}
          <button className="pathway-results-done" type="button" onClick={() => resultsDialog.current?.close()}>Done</button>
        </div>
      </dialog>

      <div className="spq-layout">
        <section className="spq-card spq-available" ref={quizList} aria-labelledby="spq-list-title">
          <div className="spq-section-heading"><Icon name="layers" /><div><h2 id="spq-list-title">Available Pathway Quizzes</h2><p>Take an assessment to explore your academic and career path.</p></div><span className="spq-count">{isLoading ? "Loading…" : `${advisorQuizzes.length + 1} listed`}</span></div>
          <article className="spq-quiz-row">
            <PathwayArtwork name="career" className="spq-quiz-art" />
            <div className="spq-quiz-copy"><h3>Career Assessment</h3><p>A bilingual assessment covering interests, personality, aptitude, and work values.</p></div>
            <div className="spq-meta"><span><Icon name="chart" />4 Sections</span><span><Icon name="quiz" />32 Questions</span><span><Icon name="star" />+ 3 Ranked Choices</span></div>
            <button className="ss-button" type="button" onClick={startAssessment}>{isAssessmentOpen ? "Continue" : "Start Quiz"} <Icon name="chevron" /></button>
          </article>
          {isLoading && <p className="spq-message" role="status">Loading advisor quizzes…</p>}
          {error && <p className="spq-message spq-error" role="alert">{error}</p>}
          {!isLoading && !error && advisorQuizzes.length === 0 && <div className="spq-empty"><PathwayArtwork name="academic" className="spq-empty-art" /><div><strong>More pathways to explore soon</strong><p>Advisor-created quizzes will appear here when published. You can start the Career Assessment now.</p></div></div>}
          {advisorQuizzes.map((quiz, index) => <article className="spq-quiz-row" key={quiz.quiz_id}>
            <PathwayArtwork name={index % 2 === 0 ? "academic" : "interest"} className="spq-quiz-art" />
            <div className="spq-quiz-copy"><h3>{quiz.title}</h3><p>{quiz.description || "Explore academic pathways with guidance from your advisor."}</p><small>By {quiz.advisor_name || "Academic Advisor"}</small></div>
            <div className="spq-meta"><span><Icon name="quiz" />{quiz.question_count || 0} Questions</span><span><Icon name="graduation" />Advisor Prepared</span></div>
            <span className="spq-unavailable">Preview only</span>
          </article>)}
          {advisorQuizzes.length > 0 && <p className="spq-helper">Advisor quizzes are available to preview. Online submissions for these quizzes are not supported yet.</p>}
          <section className="spq-results" aria-labelledby="spq-results-title"><PathwayArtwork name="strengths" className="spq-results-art" /><div className="spq-results-copy"><h3 id="spq-results-title">Your Assessment Results</h3>
            {isLoadingResults ? <p role="status">Loading saved results…</p> : resultsError ? <div role="alert"><p>{resultsError}</p><button type="button" onClick={() => { setIsLoadingResults(true); setResultsRequest((current) => current + 1); }}>Try again</button></div> : latestAttempt ? <><p>Career Assessment · {latestAttempt.result.hollandCode}</p><button className="ss-button" type="button" aria-haspopup="dialog" onClick={() => resultsDialog.current?.showModal()}>View Results <Icon name="chevron" /></button></> : <p>Your completed Career Assessment results will appear here.</p>}
          </div></section>
        </section>
        <aside className="spq-card spq-how"><h2><Icon name="bolt" />How It Works <span aria-hidden="true">✦</span></h2>
          <ol><li><strong>Choose a quiz</strong><p>Select an available assessment that fits your goal.</p></li><li><strong>Complete the questions</strong><p>Answer every question honestly and at your own pace.</p></li><li><strong>Review your results</strong><p>Get insights on your interests, strengths, and suitable pathways.</p></li></ol>
          <Link className="spq-guidance" to="/appointments">Discuss your results with an advisor <Icon name="chevron" /></Link>
          <PathwayArtwork name="books" className="spq-books" />
        </aside>
      </div>
      {isAssessmentOpen && <section className="spq-assessment" ref={assessmentPanel} tabIndex={-1} aria-label="Career Assessment"><div className="spq-assessment-toolbar"><strong>Your Career Assessment</strong><button type="button" onClick={() => quizList.current?.scrollIntoView({ behavior: "smooth" })}>Back to quiz list ↑</button></div><CareerAssessment onSaved={handleAssessmentSaved} /></section>}
    </section>
  );
}

export default PathwayQuizPage;
