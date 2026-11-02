import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import assessment from '../data/career-assessment'
import { isSectionComplete, type AssessmentAnswers, type CareerAssessmentResult } from '../utils/careerAssessment'
import api from '../api/axios'
import { getAccessToken } from '../utils/authStorage'
import { getApiErrorMessage } from '../utils/apiError'
import CareerAssessmentResults from './CareerAssessmentResults'
import type { SavedCareerAssessmentAttempt } from '../types/careerAssessment'
import '../styles/career-assessment.css'

const sections = ['SECTION A: Cognitive Aptitude', 'SECTION B: Vocational Interests', 'SECTION C: Personality & Work Style', 'SECTION D: Work Values & Motivation']
const interestScale = ['Strongly Dislike / Sangat Tidak Suka', 'Dislike / Tidak Suka', 'Neutral', 'Like / Suka', 'Strongly Like / Sangat Suka']
const agreementScale = ['Strongly Disagree / Sangat Tidak Setuju', 'Disagree / Tidak Setuju', 'Neutral', 'Agree / Setuju', 'Strongly Agree / Sangat Setuju']

export default function CareerAssessment({ onSaved }: { onSaved?: (attempt: SavedCareerAssessmentAttempt) => void } = {}) {
  const [section, setSection] = useState(0)
  const [answers, setAnswers] = useState<AssessmentAnswers>({})
  const [rankings, setRankings] = useState<string[]>([])
  const [error, setError] = useState('')
  const [result, setResult] = useState<CareerAssessmentResult | null>(null)
  const [savedAttempt, setSavedAttempt] = useState<SavedCareerAssessmentAttempt | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isRestoring, setIsRestoring] = useState(true)
  const [restoreError, setRestoreError] = useState('')
  const [restoreRequest, setRestoreRequest] = useState(0)
  const submissionId = useRef<string | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    const controller = new AbortController()
    async function restoreLatest() {
      try {
        if (!getAccessToken()) throw new Error('Please sign in again to save and load your assessment results.')
        const response = await api.get<{ attempt: SavedCareerAssessmentAttempt | null }>('/quizzes/career-assessment/attempts/latest', {
          signal: controller.signal, timeout: 15000,
        })
        if (!controller.signal.aborted) {
          setSavedAttempt(response.data.attempt)
          setResult(response.data.attempt?.result ?? null)
          setRestoreError('')
        }
      } catch (error) {
        if (!controller.signal.aborted) setRestoreError(getApiErrorMessage(error,
          !getAccessToken() ? 'Please sign in again to save and load your assessment results.' : 'Unable to load your saved assessment. Please try again.'))
      } finally {
        if (!controller.signal.aborted) setIsRestoring(false)
      }
    }
    restoreLatest()
    return () => controller.abort()
  }, [restoreRequest])

  function focusHeading() {
    requestAnimationFrame(() => {
      heading.current?.focus()
      heading.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  async function submitSection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSaving) return
    if (!isSectionComplete(section, answers, rankings)) {
      setError(section === 3 ? 'Choose three different work values in order of importance.' : 'Please answer every question in this section.')
      return
    }
    setError('')
    if (section < 3) setSection(section + 1)
    else {
      if (!getAccessToken()) {
        setError('Please sign in again before saving your assessment.')
        return
      }
      setIsSaving(true)
      submissionId.current ??= crypto.randomUUID()
      try {
        const response = await api.post<{ attempt: SavedCareerAssessmentAttempt }>('/quizzes/career-assessment/attempts', {
          answers, rankings, assessment_version: 1, submission_id: submissionId.current,
        }, { timeout: 30000 })
        setSavedAttempt(response.data.attempt)
        setResult(response.data.attempt.result)
        onSaved?.(response.data.attempt)
      } catch (error) {
        setError(getApiErrorMessage(error, 'Unable to save your assessment. Your answers are still here; please try again.'))
        return
      } finally {
        setIsSaving(false)
      }
    }
    focusHeading()
  }

  const answeredCount = Object.keys(answers).length + rankings.filter(Boolean).length
  const questions = section === 0 ? assessment.aptitude : section === 1 ? assessment.riasec : assessment.ocean

  if (isRestoring) return <article className="career-assessment"><p role="status">Loading your saved assessment...</p></article>
  if (restoreError) return <article className="career-assessment">
    <h2>CAREER ASSESSMENT</h2><p className="assessment-error" role="alert">{restoreError}</p>
    <div className="assessment-actions"><button type="button" onClick={() => {
      setIsRestoring(true); setRestoreRequest((current) => current + 1)
    }}>Try again</button><Link to="/login">Sign in again</Link></div>
  </article>

  return <article className="career-assessment">
    <h2 ref={heading} tabIndex={-1}>CAREER ASSESSMENT{result ? ' — Your Results' : ''}</h2>
    {result ? <>
      {savedAttempt && <p className="assessment-saved-status" role="status">Saved to your account · Attempt #{savedAttempt.attempt_id}</p>}
      <CareerAssessmentResults result={result} />
      <div className="assessment-actions"><button type="button" onClick={() => {
        setAnswers({}); setRankings([]); setSection(0); setResult(null); setSavedAttempt(null); setError(''); submissionId.current = null; focusHeading()
      }}>Retake assessment</button><Link to="/appointments">Discuss with an advisor</Link></div>
    </> : <>
      <p className="assessment-step">Section {section + 1} of 4 · {answeredCount}/35 responses completed</p>
      <progress className="assessment-progress" max="35" value={answeredCount} aria-label="Assessment completion" />
      <ol className="assessment-steps">{sections.map((title, index) => <li key={title} aria-current={index === section ? 'step' : undefined}>{title}</li>)}</ol>
      <h3>{sections[section]}</h3>
      {section === 1 ? <div className="assessment-instructions">
        <p><strong>Arahan:</strong> Pilih <strong>SATU</strong> jawapan yang menunjukkan sejauh mana anda suka atau tidak suka melakukan aktiviti berikut.</p>
        <p><em><strong>Instruction:</strong> Select <strong>ONE</strong> answer that shows how much you like or dislike doing the following activity.</em></p>
        <p><em>(Skala / Scale: 1 = Sangat Tidak Suka / Strongly Dislike; 2 = Tidak Suka / Dislike; 3 = Neutral / Neutral; 4 = Suka / Like; 5 = Sangat Suka / Strongly Like)</em></p>
      
      </div> : section === 3 ? <div className="assessment-instructions">
        <p><strong>Arahan:</strong> Pilih tiga faktor yang <strong>PALING PENTING</strong> bagi anda dalam kerjaya masa depan dan <strong>SUSUN MENGIKUT KEUTAMAAN.</strong></p>
        <p><em><strong>Instruction:</strong> Select the three factors that are <strong>MOST IMPORTANT</strong> to you in your future career and <strong>RANK THEM IN ORDER OF IMPORTANCE.</strong></em></p>

      </div> : section === 2 ? <div className="assessment-instructions">
        <p><strong>Arahan:</strong> Nyatakan sejauh mana anda bersetuju atau tidak bersetuju dengan setiap pernyataan tentang diri anda.</p>
        <p><em><strong>Instruction:</strong> Indicate how much you agree or disagree with each statement about yourself.</em></p>
      
      </div> : <div className="assessment-instructions">
        <p><strong>Arahan:</strong> Pilih hanya <strong>SATU</strong> jawapan yang betul bagi setiap soalan.</p>
        <p><em><strong>Instructions:</strong> Select <strong>ONLY ONE</strong> correct answer for each question.</em></p>
      </div>}
      <form onSubmit={submitSection} noValidate aria-busy={isSaving}>
        {section < 3 ? questions.map((question, index) => {
          const options = 'options' in question ? question.options : section === 1 ? interestScale : agreementScale
          return <fieldset className="assessment-question" key={question.id} disabled={isSaving}>
            <legend>{index + 1}. {question.text}</legend>
            {'expression' in question && question.expression && <p className="assessment-expression">{question.expression}</p>}
            {'domain' in question && <p className="assessment-domain">{question.domain}</p>}
            <div className={section === 0 ? 'assessment-options' : 'assessment-options assessment-scale'}>
              {options.map((option, optionIndex) => {
                const value = section === 0 ? optionIndex : optionIndex + 1
                return <label key={optionIndex} className={answers[question.id] === value ? 'selected' : ''}>
                  <input type="radio" name={question.id} value={value} checked={answers[question.id] === value}
                    onChange={() => { submissionId.current = null; setAnswers((current) => ({ ...current, [question.id]: value })); setError('') }} />
                  <span>{section === 0 ? `${String.fromCharCode(65 + optionIndex)}. ` : `${value}. `}{option}</span>
                </label>
              })}
            </div>
          </fieldset>
        }) : <>
          <p className="assessment-ranking-status" role="status">
            {rankings.length}/3 selected. {rankings.length === 3 ? 'Click a numbered card to remove it before choosing another.' : 'Choose your next priority.'}
          </p>
          <div className="assessment-value-definitions">{assessment.values.map((value) => {
            const rank = rankings.indexOf(value.id) + 1
            return <button type="button" className={`assessment-value-card${rank ? ' selected' : ''}`} key={value.id}
              aria-pressed={rank > 0}
              aria-label={`${value.label}${rank ? `, priority ${rank}. Click to remove.` : '. Click to select.'}`}
              disabled={isSaving || (!rank && rankings.length === 3)}
              onClick={() => {
                submissionId.current = null
                setRankings((current) => current.includes(value.id)
                  ? current.filter((id) => id !== value.id)
                  : current.length < 3 ? [...current, value.id] : current)
                setError('')
              }}>
              <span className="assessment-value-heading"><strong>{value.label}</strong>
                {rank > 0 && <span className="assessment-rank-badge" aria-hidden="true">{rank}</span>}
              </span>
              <span className="assessment-value-description">{value.description}</span>
            </button>
          })}</div>
        </>}
        {error && <p className="assessment-error" role="alert">{error}</p>}
        <div className="assessment-actions">
          {section > 0 && <button type="button" className="assessment-back" disabled={isSaving} onClick={() => { setSection(section - 1); setError(''); focusHeading() }}>Previous section</button>}
          <button type="submit" disabled={isSaving}>{isSaving ? 'Saving your results...' : section === 3 ? 'Save & view my results' : 'Next section'}</button>
        </div>
      </form>
      <p className="assessment-notice">Your completed assessment is saved when you select “Save &amp; view my results”. Unsubmitted answers are cleared if you leave or refresh this page.</p>
    </>}
  </article>
}
