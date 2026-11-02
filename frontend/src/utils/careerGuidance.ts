import type { CareerAssessmentResult } from './careerAssessment.ts'

export const interestDescriptions: Record<string, { name: string; role: string; title: string; activity: string; tasks: string }> = {
  R: { name: 'Realistic', role: 'The Doer', title: 'The Practical Problem-Solver', activity: 'working with practical tools and real-world systems', tasks: 'building, repairing, or testing how things work' },
  I: { name: 'Investigative', role: 'The Thinker', title: 'The Analytical Explorer', activity: 'understanding ideas and solving problems through investigation', tasks: 'researching questions, examining evidence, and analyzing information' },
  A: { name: 'Artistic', role: 'The Creator', title: 'The Creative Thinker', activity: 'expressing ideas and exploring original approaches', tasks: 'designing, writing, and creating visual or imaginative work' },
  S: { name: 'Social', role: 'The Helper', title: 'The People-Focused Supporter', activity: 'helping others learn, grow, and solve problems', tasks: 'teaching, listening, and supporting people' },
  E: { name: 'Enterprising', role: 'The Persuader', title: 'The Initiative-Taker', activity: 'leading projects and communicating ideas to others', tasks: 'persuading, negotiating, and coordinating a team' },
  C: { name: 'Conventional', role: 'The Organizer', title: 'The Structured Planner', activity: 'organizing information and working through clear processes', tasks: 'checking details, managing records, and keeping work organized' },
}

// Interest codes checked against O*NET OnLine, 2026-10-29.
// Short descriptions and aptitude connections are ScholarOne exploration guidance,
// not validated career matching weights. Neither personality nor work values filters jobs.
export const careerExamples = [
  { title: 'Mechanical Engineer', code: '17-2141.00', interests: 'RIC', domain: 'Spatial, Abstract & Data Accuracy', activity: 'Explore designing and testing mechanical systems.' },
  { title: 'Robotics Engineer', code: '17-2199.08', interests: 'RIC', domain: 'Spatial, Abstract & Data Accuracy', activity: 'Explore developing and testing robotic systems.' },
  { title: 'Data Scientist', code: '15-2051.00', interests: 'IC', domain: 'Numerical & Quantitative Reasoning', activity: 'Explore using data to investigate questions and identify patterns.' },
  { title: 'Chemical Technician', code: '19-4031.00', interests: 'IRC', domain: 'Numerical & Quantitative Reasoning', activity: 'Explore laboratory testing and recording experimental results.' },
  { title: 'Graphic Designer', code: '27-1024.00', interests: 'AC', domain: 'Spatial, Abstract & Data Accuracy', activity: 'Explore communicating ideas through visual design.' },
  { title: 'Web and Digital Interface Designer', code: '15-1255.00', interests: 'IAC', domain: 'Spatial, Abstract & Data Accuracy', activity: 'Explore designing and improving digital interfaces.' },
  { title: 'Tutor', code: '25-3041.00', interests: 'S', domain: 'Verbal & Logical Reasoning', activity: 'Explore helping learners understand a subject and build their skills.' },
  { title: 'Educational, Guidance, and Career Counselor or Advisor', code: '21-1012.00', interests: 'SCE', domain: 'Verbal & Logical Reasoning', activity: 'Explore supporting people with educational and career decisions.' },
  { title: 'Marketing Manager', code: '11-2021.00', interests: 'EC', domain: 'Verbal & Logical Reasoning', activity: 'Explore planning how organizations communicate and promote their products.' },
  { title: 'Project Management Specialist', code: '13-1082.00', interests: 'EC', domain: 'Verbal & Logical Reasoning', activity: 'Explore coordinating project activities, schedules, and resources.' },
  { title: 'Accountant or Auditor', code: '13-2011.00', interests: 'CEI', domain: 'Numerical & Quantitative Reasoning', activity: 'Explore checking financial information and maintaining accurate records.' },
  { title: 'Administrative Assistant', code: '43-6014.00', interests: 'CES', domain: 'Verbal & Logical Reasoning', activity: 'Explore organizing information, schedules, and office communication.' },
]

const personalityCopy: Record<string, [string, string, string]> = {
  Openness: [
    'You report enjoying new ideas, learning, and exploring different possibilities.',
    'Your responses suggest a mix of curiosity about new ideas and appreciation for familiar approaches.',
    'Your responses suggest you may prefer familiar approaches and practical, clearly defined tasks.',
  ],
  Conscientiousness: [
    'You report valuing planning, organization, and completing tasks carefully.',
    'Your responses suggest you balance planning with flexibility in how you work.',
    'Your responses suggest you may prefer flexible routines; checklists and short milestones could help with structured tasks.',
  ],
  Extraversion: [
    'You report gaining energy from interacting with others and working in social settings.',
    'Your responses suggest you may enjoy a balance of independent work and interaction with others.',
    'Your responses suggest you may prefer quieter settings and time to work independently.',
  ],
  Agreeableness: [
    'You report valuing cooperation, helping others, and understanding different viewpoints.',
    'Your responses suggest you balance cooperation with expressing your own views.',
    'Your responses suggest you may prioritize direct discussion and independent judgment when working with others.',
  ],
  Neuroticism: [
    'You report being more sensitive to unexpected changes and pressure. Clear expectations and supportive work settings may be helpful.',
    'Your responses suggest your reaction to pressure may vary with the situation and available support.',
    'You report generally staying calm when facing challenges or unexpected changes.',
  ],
}

export function describePersonality(label: string, percentage: number) {
  return personalityCopy[label]?.[percentage >= 70 ? 0 : percentage >= 50 ? 1 : 2]
    ?? 'Review this score alongside your experiences and preferences.'
}

export function buildCareerGuidance(result: CareerAssessmentResult) {
  const sorted = [...result.riasec].sort((a, b) => b.score - a.score)
  const top = sorted.slice(0, 3).map((interest) => ({ ...interest, ...interestDescriptions[interest.code] }))
  const sameInterests = sorted.every((item) => item.score === sorted[0].score)
  const lowInterests = sorted[0].percentage <= 40
  const title = sameInterests ? 'The Broad Explorer'
    : result.hollandCode === 'I-R-C' ? 'The Analytical Problem-Solver'
      : top[0].title
  const introductions = sameInterests
    ? ['You rated all six interest areas equally, so this assessment does not identify a clear leading interest. Try activities from different areas to learn what engages you.', 'The three letters are displayed in a consistent order, but the other interests are equally important in your results.']
    : [
      `${lowInterests ? 'Although you did not report strong liking for these activities, your relatively highest interests involve' : 'Your responses suggest you may enjoy'} ${top[0].activity}, ${top[1].activity}, and ${top[2].activity}.`,
      `You may want to explore tasks such as ${top[0].tasks}, ${top[1].tasks}, and ${top[2].tasks}. Notice which of these you enjoy in projects, classes, or work experience.`,
    ]
  const suggestions = careerExamples.map((career) => {
    const codes = [...career.interests]
    // Rank by the student's RIASEC responses using occupation-code order (3/2/1).
    // This internal ordering is not a probability or a validated match percentage.
    const totalWeight = codes.reduce((sum, _, index) => sum + 3 - index, 0)
    const priority = codes.reduce((sum, code, index) => sum + (result.riasec.find((item) => item.code === code)?.score ?? 0) * (3 - index), 0) / totalWeight
    const shared = sorted.filter((interest, index) => codes.includes(interest.code)
      && (interest.score === sorted[0].score || index < 3))
    const domainScore = result.aptitude.find((domain) => domain.label === career.domain)
    return {
      ...career, priority,
      source: `https://www.onetonline.org/link/summary/${career.code}`,
      reason: `This occupation involves ${codes.map((code) => interestDescriptions[code].name.toLowerCase()).join(', ')} interests. ${shared.length ? `Your profile includes ${shared.map((interest) => interest.label).join(', ')} among your leading interests.` : 'Consider it as an additional area to explore.'}`,
      aptitudeNote: domainScore ? `Your ${career.domain.toLowerCase()} result is ${Math.round(domainScore.percentage)}%. This is a brief practice score; use relevant coursework or projects to explore this type of work further.` : '',
    }
  }).sort((a, b) => b.priority - a.priority || a.title.localeCompare(b.title)).slice(0, 5)
  return { top, title, introductions, sameInterests, lowInterests, suggestions }
}
