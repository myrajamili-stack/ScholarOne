import { useEffect, useState, type FormEvent } from "react";
import api from "../../api/axios";
import { getApiErrorMessage } from "../../utils/apiError";
import { getStoredUser } from "../../utils/authStorage";

type QuizOptionForm = {
  id: number;
  optionText: string;
  pathwayResult: string;
};

type QuizQuestionForm = {
  id: number;
  questionText: string;
  options: QuizOptionForm[];
};

type AdvisorQuiz = {
  quiz_id: number;
  title: string;
  description?: string | null;
  created_at?: string | null;
  question_count: number;
  attempt_count: number;
  average_score: number | string;
};

type AdvisorQuizData = {
  summary: {
    total_quizzes: number;
    total_attempts: number;
    average_score: number | string;
  };
  quizzes: AdvisorQuiz[];
};

function formatDate(value?: string | null) {
  if (!value) {
    return "Date not set";
  }

  return new Intl.DateTimeFormat("en-MY", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function AdvisorPathwayQuizzesPage() {
  const user = getStoredUser();
  const [data, setData] = useState<AdvisorQuizData | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [questions, setQuestions] = useState<QuizQuestionForm[]>([
    {
      id: Date.now(),
      questionText: "",
      options: [
        { id: Date.now() + 1, optionText: "", pathwayResult: "" },
        { id: Date.now() + 2, optionText: "", pathwayResult: "" },
        { id: Date.now() + 3, optionText: "", pathwayResult: "" },
      ],
    },
  ]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  function createBlankQuestion(): QuizQuestionForm {
    const timestamp = Date.now();

    return {
      id: timestamp,
      questionText: "",
      options: [
        { id: timestamp + 1, optionText: "", pathwayResult: "" },
        { id: timestamp + 2, optionText: "", pathwayResult: "" },
        { id: timestamp + 3, optionText: "", pathwayResult: "" },
      ],
    };
  }

  function resetQuizForm() {
    setTitle("");
    setDescription("");
    setQuestions([createBlankQuestion()]);
  }

  function addQuestion() {
    setQuestions((currentQuestions) => [...currentQuestions, createBlankQuestion()]);
  }

  function removeQuestion(questionId: number) {
    setQuestions((currentQuestions) =>
      currentQuestions.length === 1 ? currentQuestions : currentQuestions.filter((question) => question.id !== questionId),
    );
  }

  function updateQuestion(questionId: number, questionText: string) {
    setQuestions((currentQuestions) =>
      currentQuestions.map((question) => (question.id === questionId ? { ...question, questionText } : question)),
    );
  }

  function addOption(questionId: number) {
    setQuestions((currentQuestions) =>
      currentQuestions.map((question) =>
        question.id === questionId
          ? {
              ...question,
              options: [...question.options, { id: Date.now(), optionText: "", pathwayResult: "" }],
            }
          : question,
      ),
    );
  }

  function removeOption(questionId: number, optionId: number) {
    setQuestions((currentQuestions) =>
      currentQuestions.map((question) =>
        question.id === questionId && question.options.length > 2
          ? { ...question, options: question.options.filter((option) => option.id !== optionId) }
          : question,
      ),
    );
  }

  function updateOption(questionId: number, optionId: number, field: "optionText" | "pathwayResult", value: string) {
    setQuestions((currentQuestions) =>
      currentQuestions.map((question) =>
        question.id === questionId
          ? {
              ...question,
              options: question.options.map((option) => (option.id === optionId ? { ...option, [field]: value } : option)),
            }
          : question,
      ),
    );
  }

  async function loadQuizzes() {
    if (!user?.user_id) {
      setIsLoading(false);
      return;
    }

    try {
      const response = await api.get<AdvisorQuizData>(`/quizzes/advisor/${user.user_id}`);
      setData(response.data);
    } catch (error) {
      setError(getApiErrorMessage(error, "Unable to load pathway quizzes."));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadQuizzes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.user_id]);

  async function handleCreateQuiz(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!user?.user_id) {
      return;
    }

    const cleanedQuestions = questions
      .map((question) => ({
        question_text: question.questionText.trim(),
        question_type: "multiple_choice",
        options: question.options
          .map((option) => ({
            option_text: option.optionText.trim(),
            pathway_result: option.pathwayResult.trim() || option.optionText.trim(),
          }))
          .filter((option) => option.option_text),
      }))
      .filter((question) => question.question_text);

    setError("");
    setSuccess("");

    if (cleanedQuestions.length === 0) {
      setError("Add at least one quiz question before creating the quiz.");
      return;
    }

    const questionWithoutEnoughOptions = cleanedQuestions.find((question) => question.options.length < 2);
    if (questionWithoutEnoughOptions) {
      setError("Each question needs at least two answer options.");
      return;
    }

    setIsSaving(true);

    try {
      await api.post(`/quizzes/advisor/${user.user_id}`, {
        title: title.trim(),
        description: description.trim(),
        questions: cleanedQuestions,
      });

      resetQuizForm();
      setSuccess("Pathway quiz created successfully.");
      await loadQuizzes();
    } catch (error) {
      setError(getApiErrorMessage(error, "Unable to create pathway quiz."));
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <div className="advisor-page">
        <section className="advisor-empty-state">Loading pathway quizzes...</section>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="advisor-page">
        <section className="advisor-empty-state">{error}</section>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="advisor-page">
        <section className="advisor-empty-state">Pathway quiz data is not available.</section>
      </div>
    );
  }

  return (
    <div className="advisor-page">
      <section className="advisor-quiz-hero">
        <div>
          <p className="advisor-kicker">Academic Pathway</p>
          <h2>Pathway Quiz Builder</h2>
          <span>Create advisor-prepared quizzes that help students discover suitable academic paths.</span>
        </div>
      </section>

      <section className="advisor-quiz-stats">
        <article className="advisor-panel">
          <p className="advisor-kicker">Published Quizzes</p>
          <h2>{data.summary.total_quizzes}</h2>
          <span className="advisor-muted">Quizzes created by this advisor</span>
        </article>
        <article className="advisor-panel">
          <p className="advisor-kicker">Total Attempts</p>
          <h2>{data.summary.total_attempts}</h2>
          <span className="advisor-muted">Student quiz submissions</span>
        </article>
        <article className="advisor-panel">
          <p className="advisor-kicker">Average Score</p>
          <h2>{Number(data.summary.average_score).toFixed(0)}%</h2>
          <span className="advisor-muted">Average quiz result score</span>
        </article>
      </section>

      <section className="advisor-quiz-layout">
        <form className="advisor-panel advisor-quiz-form" onSubmit={handleCreateQuiz}>
          <div className="advisor-profile-section-heading">
            <div>
              <p className="advisor-kicker">Create New Quiz</p>
              <h2>Quiz Details</h2>
            </div>
            <button className="advisor-primary-button" type="submit" disabled={isSaving}>
              {isSaving ? "Creating..." : "Create Quiz"}
            </button>
          </div>

          <label>
            Quiz title
            <input
              name="title"
              type="text"
              placeholder="Computer Science Pathway Readiness"
              required
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>

          <label>
            Description
            <textarea
              name="description"
              placeholder="Help students understand whether this academic path fits their interests and goals."
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>

          <div className="advisor-quiz-builder-header">
            <div>
              <p className="advisor-kicker">Question Builder</p>
              <h3>{questions.length} {questions.length === 1 ? "Question" : "Questions"}</h3>
              <span>Build enough questions to make the pathway recommendation meaningful.</span>
            </div>
            <button className="advisor-secondary-button" type="button" onClick={addQuestion}>
              Add Question
            </button>
          </div>

          <div className="advisor-quiz-question-list">
            {questions.map((question, questionIndex) => (
              <div className="advisor-quiz-question-box" key={question.id}>
                <div className="advisor-question-title-row">
                  <div>
                    <p className="advisor-kicker">Question {questionIndex + 1}</p>
                    <h3>Pathway question</h3>
                  </div>
                  <button
                    className="advisor-text-button danger"
                    type="button"
                    onClick={() => removeQuestion(question.id)}
                    disabled={questions.length === 1}
                  >
                    Remove
                  </button>
                </div>

                <label>
                  Question
                  <input
                    type="text"
                    placeholder="Which subject area interests you most?"
                    value={question.questionText}
                    onChange={(event) => updateQuestion(question.id, event.target.value)}
                  />
                </label>

                <div className="advisor-option-list">
                  {question.options.map((option, optionIndex) => (
                    <div className="advisor-option-row" key={option.id}>
                      <label>
                        Option {optionIndex + 1}
                        <input
                          type="text"
                          placeholder={optionIndex === 0 ? "Software Engineering" : optionIndex === 1 ? "Data Science" : "Cybersecurity"}
                          value={option.optionText}
                          onChange={(event) => updateOption(question.id, option.id, "optionText", event.target.value)}
                        />
                      </label>
                      <label>
                        Pathway result
                        <input
                          type="text"
                          placeholder="Recommended pathway if selected"
                          value={option.pathwayResult}
                          onChange={(event) => updateOption(question.id, option.id, "pathwayResult", event.target.value)}
                        />
                      </label>
                      <button
                        className="advisor-icon-button danger"
                        type="button"
                        aria-label={`Remove option ${optionIndex + 1}`}
                        onClick={() => removeOption(question.id, option.id)}
                        disabled={question.options.length <= 2}
                      >
                        x
                      </button>
                    </div>
                  ))}
                </div>

                <button className="advisor-add-option-button" type="button" onClick={() => addOption(question.id)}>
                  Add Option
                </button>
              </div>
            ))}
          </div>

          {(error || success) && <p className={error ? "advisor-form-error" : "advisor-form-success"}>{error || success}</p>}
        </form>

        <article className="advisor-panel advisor-quiz-list-panel">
          <div className="advisor-panel-header">
            <div>
              <p className="advisor-kicker">Quiz Library</p>
              <h2>Your Pathway Quizzes</h2>
            </div>
          </div>

          {data.quizzes.length > 0 ? (
            <div className="advisor-quiz-list">
              {data.quizzes.map((quiz) => (
                <article className="advisor-quiz-card" key={quiz.quiz_id}>
                  <div>
                    <h3>{quiz.title}</h3>
                    <p>{quiz.description || "No description provided."}</p>
                    <span>Created {formatDate(quiz.created_at)}</span>
                  </div>
                  <div className="advisor-quiz-card-stats">
                    <strong>{quiz.question_count}</strong>
                    <span>Questions</span>
                  </div>
                  <div className="advisor-quiz-card-stats">
                    <strong>{quiz.attempt_count}</strong>
                    <span>Attempts</span>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="advisor-empty-state small">No pathway quizzes have been created yet. Use the form to publish the first quiz.</div>
          )}
        </article>
      </section>
    </div>
  );
}

export default AdvisorPathwayQuizzesPage;
