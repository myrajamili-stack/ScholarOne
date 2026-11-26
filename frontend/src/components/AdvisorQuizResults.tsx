import { Link } from "react-router-dom";
import type { SavedAdvisorQuiz } from "../types/advisorQuiz";
import { PATHWAY_PREFERENCE_CODE } from "../utils/pathwayPreference";

export default function AdvisorQuizResults({ attempt }: { attempt: SavedAdvisorQuiz }) {
  const result = attempt.result;
  const isPreference = result.assessment_type !== "likert" && result.assessment_code === PATHWAY_PREFERENCE_CODE;
  return <div className="advisor-quiz-result"><h3>{result.quiz_title} — Saved Results</h3>
    <p>Quiz version {result.quiz_revision} · {result.question_count} questions answered</p>
    <h4>{isPreference ? (result.has_tie ? "Joint Primary Pathway Preferences" : "Primary Pathway Preference")
      : result.template === "FSI-001" ? "Top three preferred study fields" : result.assessment_type === "likert" ? "Strongest interest categories" : result.has_tie ? "Joint leading outcomes" : "Leading outcome"}</h4>
    <p><strong>{result.leading_outcomes.join(" · ")}</strong></p>
    {isPreference ? <><h4>Preference Breakdown</h4><ul>{result.outcomes.map(outcome => <li key={outcome.label}>{outcome.label}: {outcome.selections}</li>)}</ul></>
      : result.category_scores
      ? <ul>{result.category_scores.map(category => <li key={category.code}>{category.code} — {category.label}: {category.score} / {category.maximum} (minimum {category.minimum})</li>)}</ul>
      : <ul>{result.outcomes.map(outcome => <li key={outcome.label}>{outcome.label}: {outcome.selections} selection{outcome.selections === 1 ? "" : "s"}</li>)}</ul>}
    <p>{result.note}</p>
    {!isPreference && !!result.linked_pathways?.length && <><h4>Related Academic Pathways</h4><ul>{result.linked_pathways.map(pathway => <li key={pathway.pathway_id}><Link to={`/academic-pathways?q=${encodeURIComponent(pathway.title)}`}>{pathway.title} →</Link></li>)}</ul></>}
    <Link to="/academic-pathways">{isPreference ? "Browse academic pathways" : "Explore current pathway recommendations and next steps"} →</Link>
    <details><summary>Review your saved answers</summary><ol>{result.answers.map(answer => <li key={answer.question_id}><strong>{answer.question}</strong>
      {answer.question_ms && answer.question_ms !== answer.question && <p lang="ms">{answer.question_ms}</p>}
      <p>{answer.answer}{answer.answer_ms && <> / <span lang="ms">{answer.answer_ms}</span></>}</p><small>{answer.score == null ? "Outcome" : "Category"}: {answer.outcome}{answer.score != null && ` · ${answer.score} points`}</small></li>)}</ol></details>
  </div>;
}
