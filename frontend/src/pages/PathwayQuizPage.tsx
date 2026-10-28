import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/axios";

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

  return (
    <section className="pathway-page">
      <header className="pathway-hero">
        <div>
          <p className="module-eyebrow">Academic Pathway</p>
          <h1>Pathway Quiz</h1>
          <span>Take advisor-created quizzes to discover suitable academic pathways and next steps.</span>
        </div>
        <button type="button" disabled>
          Start Quiz
        </button>
      </header>

      <section className="pathway-summary-grid">
        <article>
          <span>Available quizzes</span>
          <strong>{quizzes.length}</strong>
        </article>
        <article>
          <span>Latest result</span>
          <strong>Not taken</strong>
        </article>
        <article>
          <span>Recommended next step</span>
          <strong>Take a quiz</strong>
        </article>
      </section>

      <section className="pathway-layout">
        <article className="quiz-list-card">
          <div className="pathway-section-heading">
            <div>
              <h2>Available Pathway Quizzes</h2>
              <p>Quizzes shown here are created by academic advisors.</p>
            </div>
          </div>

          {isLoading && <p className="dashboard-message">Loading pathway quizzes...</p>}
          {error && <p className="dashboard-message error">{error}</p>}
          {!isLoading && !error && quizzes.length === 0 && (
            <div className="pathway-empty-state">
              <div aria-hidden="true">▱</div>
              <h3>No pathway quizzes available yet</h3>
              <p>
                Once the Academic Advisor module is built, advisors can create pathway quizzes and students will be able
                to take them here.
              </p>
            </div>
          )}

          <div className="pathway-quiz-grid">
            {quizzes.map((quiz) => (
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
            <li>Select a quiz created by an academic advisor.</li>
            <li>Answer questions about your interests and goals.</li>
            <li>Receive a suggested pathway result.</li>
            <li>
              <Link to="/appointments">Book advisor consultation</Link> for deeper guidance.
            </li>
          </ol>
          <div className="pathway-note">
            Quiz-taking is prepared in the interface, but full quiz attempts will be enabled after advisor quiz
            management is completed.
          </div>
        </aside>
      </section>
    </section>
  );
}

export default PathwayQuizPage;
