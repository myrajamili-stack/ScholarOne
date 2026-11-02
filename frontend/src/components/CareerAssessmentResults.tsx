import { useId } from 'react'
import type { CareerAssessmentResult, ProfileScore } from '../utils/careerAssessment'
import { buildCareerGuidance, describePersonality } from '../utils/careerGuidance'

function ScoreList({ title, scores }: { title: string; scores: ProfileScore[] }) {
  return <section className="assessment-score-section">
    <h3>{title}</h3>
    {scores.map((item) => <div className="assessment-score" key={item.label}>
      <div><span>{item.label}</span><strong>{Math.round(item.percentage)}% <small>({item.score}/{item.maximum})</small></strong></div>
      <progress max="100" value={item.percentage} aria-label={`${item.label}: ${Math.round(item.percentage)}%`} />
    </div>)}
  </section>
}

export default function CareerAssessmentResults({ result }: { result: CareerAssessmentResult }) {
  const resultId = useId()
  const guidance = buildCareerGuidance(result)
  const workValues = [...result.workValues].filter((value) => value.rank !== null).sort((a, b) => b.score - a.score)
  return <div className="assessment-written-results">
    <section aria-labelledby={`${resultId}-holland`}>
      <h3 id={`${resultId}-holland`}>1. Your Holland Code: {result.hollandCode.replaceAll('-', '–')}</h3>
      <div className="assessment-profile-card">
        <p className="assessment-result-eyebrow">Your career interest profile</p>
        <h4 className="assessment-profile-title">{guidance.title}</h4>
        <div className="assessment-interest-cards">{guidance.top.map((interest) => <article key={interest.code}>
          <span className="assessment-interest-letter">{interest.code}</span>
          <h5>{interest.name}</h5><p>{interest.role}</p>
        </article>)}</div>
        <h5 className="assessment-meaning-title">What does this mean?</h5>
        {guidance.introductions.map((text) => <p className="assessment-interpretation" key={text}>{text}</p>)}
        {result.hasHollandTie && <p className="assessment-notice">Some interests have equal scores. Ties use R–I–A–S–E–C order; all tied areas are equally relevant.</p>}
        <p className="assessment-notice">An interpretation of your reported interests, rather than a fixed personality label.</p>
      </div>
    </section>

    <section className="assessment-profile-card" aria-labelledby={`${resultId}-personality`}>
      <h3 id={`${resultId}-personality`}>2. Your Personality &amp; Work Style</h3>
      <p className="assessment-result-subtitle">Based on your Big Five assessment</p>
      {result.ocean.map((trait) => <article className="assessment-trait" key={trait.label}>
        <div><h4>{trait.label}</h4><span>{Math.round(trait.percentage)}%</span></div>
        <progress max="100" value={trait.percentage} aria-label={`${trait.label}: ${Math.round(trait.percentage)}%`} />
        <p>{describePersonality(trait.label, trait.percentage)}</p>
      </article>)}
      <p className="assessment-notice">These percentages summarize your responses; they are not population percentiles or measures of job suitability. Different work styles can succeed in the same career.</p>
    </section>

    <section className="assessment-profile-card" aria-labelledby={`${resultId}-values`}>
      <h3 id={`${resultId}-values`}>3. What Matters to You at Work</h3>
      <p className="assessment-result-subtitle">Your three priorities, in the order you chose them</p>
      <ol className="assessment-priority-list">{workValues.map((value) => <li key={value.id}>
        <div><strong>{value.label}</strong><span>{value.score} points</span></div>
        <p>{value.description.split('\n').at(-1)}</p>
      </li>)}</ol>
      <p>When exploring jobs, ask about these priorities. Pay, flexibility, stability, and team culture can vary between employers within the same occupation.</p>
    </section>

    <section className="assessment-profile-card" aria-labelledby={`${resultId}-jobs`}>
      <h3 id={`${resultId}-jobs`}>4. Job Recommendations to Explore</h3>
      <p className="assessment-result-subtitle">Suggestions based on your reported career interests</p>
      {(guidance.sameInterests || guidance.lowInterests) && <p className="assessment-notice">{guidance.sameInterests ? 'Your interests are evenly rated, so these are examples to explore, not clear best matches.' : 'Your interest ratings are relatively low across the assessment. Treat these as starting points and try a wider range of activities.'}</p>}
      <div className="assessment-job-grid">{guidance.suggestions.map((job) => <article className="assessment-job-card" key={job.code}>
        <h4>{job.title}</h4><p>{job.activity}</p>
        <h5>Why explore this?</h5><p>{job.reason}</p>
        <p className="assessment-notice">{job.aptitudeNote}</p>
        <a href={job.source} target="_blank" rel="noreferrer">Explore occupation and preparation requirements ↗</a>
      </article>)}</div>
      <p className="assessment-notice">Suggestions use a small, curated set of O*NET occupation interest codes, not all possible careers. They are not vacancies, eligibility decisions, or guaranteed matches. O*NET describes US occupations; check local qualification and licensing requirements with your advisor. Personality and work values are discussion points, not job exclusion rules.</p>
    </section>

    <section aria-labelledby={`${resultId}-details`}><h3 id={`${resultId}-details`}>5. Your Detailed Scores</h3>
      <div className="assessment-results-grid">
        <ScoreList title="Cognitive Aptitude" scores={result.aptitude} />
        <ScoreList title="All Six Career Interests" scores={result.riasec} />
      </div>
      <p className="assessment-notice">Aptitude is scored by the three domains in the question set. RIASEC and Big Five use two items per area, each out of 10. Big Five items 6 and 10 are reverse-scored. Work values use 3, 2, and 1 points. No overall score is calculated.</p>
    </section>
  </div>
}
