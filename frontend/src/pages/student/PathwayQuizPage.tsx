import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import api from "../../api/axios";
import CareerAssessment from "../../components/CareerAssessment";
import CareerAssessmentResults from "../../components/CareerAssessmentResults";
import type { SavedCareerAssessmentAttempt } from "../../types/careerAssessment";
import { getApiErrorMessage } from "../../utils/apiError";
import { getAccessToken } from "../../utils/authStorage";
import "../../styles/career-assessment.css";

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
  // CAREER ASSESSMENT already has its own interactive card above the advisor list.
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
    <section className="pathway-page">
      <header className="pathway-hero">
        <div>
          <p className="module-eyebrow">Academic Pathway</p>
          <h1>Pathway Quiz</h1>
          <span>Explore your strengths, interests, and academic potential through a variety of career and academic pathway assessments.</span>
        </div>
      </header>

      <section className="pathway-preview" aria-labelledby="pathway-preview-title">
        <div className="pathway-preview-heading">
          <h2 id="pathway-preview-title">Dashboard Preview</h2>
          <p>Your next step starts with understanding yourself.</p>
        </div>
        <dl className="pathway-preview-grid">
          <div className="pathway-preview-item">
            <dt><span className="pathway-preview-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="4" width="14" height="17" rx="3" /><path d="M9 4V2h6v2M9 10h6M9 14h6M9 18h3" /></svg></span>Available Quizzes</dt>
            <dd><strong className="pathway-preview-count">{advisorQuizzes.length + 1}</strong><span>Discover where your strengths can take you.</span></dd>
          </div>
          <div className="pathway-preview-item pathway-preview-focus">
            <dt><span className="pathway-preview-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></svg></span>Assessment Focus</dt>
            <dd><strong>Interests &amp; Abilities</strong><span>Explore what you enjoy and how you work.</span></dd>
          </div>
          <div className="pathway-preview-item pathway-preview-results">
            <dt><span className="pathway-preview-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M4 3h16v18H4zM8 15v2M12 11v6M16 7v10" /></svg></span>Your Results</dt>
            <dd>
              {isLoadingResults ? <strong role="status">Loading results...</strong>
                : resultsError ? <><span role="alert">{resultsError}</span><button className="pathway-results-link" type="button" onClick={() => {
                  setIsLoadingResults(true); setResultsRequest((current) => current + 1);
                }}>Try again</button> <Link to="/login">Sign in again</Link></>
                  : latestAttempt ? <>
                    <strong><button className="pathway-results-link" type="button" aria-haspopup="dialog" onClick={() => resultsDialog.current?.showModal()}>View Results <span aria-hidden="true">↗</span></button></strong>
                    <span>Career Assessment · {latestAttempt.result.hollandCode}</span>
                  </> : <><strong>Explore the quiz first!</strong><span>Your completed assessment results will appear here.</span></>}
            </dd>
          </div>
          <div className="pathway-preview-item pathway-preview-guidance">
            <dt><span className="pathway-preview-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11a8 8 0 0 1-8 8H7l-5 3 2-6a8 8 0 1 1 17-5Z" /><path d="M8 10h8M8 14h5" /></svg></span>Further Guidance</dt>
            <dd><strong><Link to="/appointments">Advisor Consultation <span aria-hidden="true">↗</span></Link></strong><span>Talk through your options with an advisor.</span></dd>
          </div>
        </dl>
      </section>

      {isAssessmentOpen && <CareerAssessment onSaved={handleAssessmentSaved} />}

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

      <section className="pathway-layout">
        <article className="quiz-list-card">
          <div className="pathway-section-heading">
            <div>
              <h2>Available Pathway Quizzes</h2>
              <p>Start career assessment test or explore additional advisor-created quizzes.</p>
            </div>
          </div>

          <article className="pathway-quiz-card">
            <div>
              <span className="quiz-chip">4 sections · 32 questions + 3 ranked choices</span>
              <h3>CAREER ASSESSMENT</h3>
              <p>A bilingual assessment covering cognitive aptitude, RIASEC interests, Big Five personality traits, and ranked work values.</p>
            </div>
            <footer><span>Explore your interests, strengths, and academic potential through our career assessments</span>
              <button type="button" onClick={() => setIsAssessmentOpen(true)}>Take Assessment</button>
            </footer>
          </article>

          {isLoading && <p className="dashboard-message">Loading pathway quizzes...</p>}
          {error && <p className="dashboard-message error">{error}</p>}
          {!isLoading && !error && advisorQuizzes.length === 0 && (
            <div className="pathway-empty-state">
              <div aria-hidden="true">▱</div>
              <h3>No additional advisor quizzes available yet</h3>
              <p>
                Additional quizzes will appear here when academic advisors create them.
              </p>
            </div>
          )}

          <div className="pathway-quiz-grid">
            {advisorQuizzes.map((quiz) => (
              <article className="pathway-quiz-card" key={quiz.quiz_id}>
                <div>
                  <span className="quiz-chip">{quiz.question_count || 0} questions</span>
                  <h3>{quiz.title}</h3>
                  <p>{quiz.description || "No description provided."}</p>
                </div>
                <footer>
                  <span>{quiz.advisor_name || "Academic Advisor"}</span>
                  <button type="button" disabled>
                    Take Quiz
                  </button>
                </footer>
              </article>
            ))}
          </div>
        </article>

        <aside className="pathway-info-card">
          <h2>How It Works</h2>
          <ol>
            <li>Select an available assessment or quiz.</li>
            <li>Read the instructions and complete all required questions.</li>
            <li>Review your results to understand your interests, strengths, and academic preferences.</li>
            <li> Book an 
              <Link to="/appointments"> academic advisor consultation</Link> for further guidance.
            </li>
          </ol>
          <div className="pathway-note">
            Explore your academic potential through assessments designed to help you understand your abilities, interests, and future study options.
          </div>
        </aside>
      </section>
    </section>
  );
}

export default PathwayQuizPage;
