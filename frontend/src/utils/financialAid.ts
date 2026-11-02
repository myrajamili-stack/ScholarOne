export const financialAidTypes = [
  { id: 'scholarship', value: 'Scholarship', english: 'SCHOLARSHIP', malay: 'BIASISWA' },
  { id: 'education-loan', value: 'Education Loan', english: 'EDUCATION LOAN', malay: 'PINJAMAN PENDIDIKAN' },
  { id: 'financial-assistance', value: 'Financial Assistance', english: 'FINANCIAL ASSISTANCE', malay: 'BANTUAN KEWANGAN' },
  { id: 'special-assistance', value: 'Special Assistance', english: 'SPECIAL ASSISTANCE', malay: 'BANTUAN KHAS' },
  { id: 'one-off-assistance', value: 'One-off Assistance', english: 'ONE-OFF ASSISTANCE', malay: 'BANTUAN ONE-OFF' },
] as const

export type FinancialAidType = typeof financialAidTypes[number]['id']
export type FinancialAidFilter = 'all' | FinancialAidType

export const studyLevels = ['Matriculation', 'Foundation', 'Certificate', 'Diploma', 'Advanced Diploma', 'Undergraduate', "Master's", 'PhD', 'TVET', 'Postgraduate', 'Professional Certification', 'Secondary School'] as const
export const eligibilityStates = ['Johor', 'Melaka', 'Negeri Sembilan', 'Pahang', 'Selangor', 'Kuala Lumpur', 'Terengganu', 'Kelantan', 'Perak', 'Kedah', 'Pulau Pinang', 'Perlis', 'Sabah', 'Sarawak'] as const

type FilterableAid = {
  title: string
  funding_type?: string | null
  study_level?: string | null
  category?: string | null
  eligible_state?: string | null
  study_levels?: string[] | null
  eligible_states?: string[] | null
}

function normalizeLevel(value: string) {
  const key = value.trim().toLowerCase().replace(/[’']/g, '')
  const aliases: Record<string, string> = {
    master: 'masters', 'master degree': 'masters', 'masters degree': 'masters', sarjana: 'masters',
    doctorate: 'phd', 'ph.d.': 'phd', 'bachelors degree': 'undergraduate', bachelor: 'undergraduate',
    'technical and vocational': 'tvet', matrikulasi: 'matriculation',
  }
  return aliases[key] ?? key
}

function normalizeState(value: string) {
  const key = value.trim().toLowerCase()
  return ({ penang: 'pulau pinang', malacca: 'melaka', 'wp kuala lumpur': 'kuala lumpur', nationwide: 'all states' } as Record<string, string>)[key] ?? key
}

function identify(value: string): FinancialAidType | null {
  const text = value.toLowerCase().replace(/[–—_]/g, '-').replace(/\s+/g, ' ').trim()
  if (/\b(one[ -]?off assistance|bantuan one[ -]?off)\b/.test(text)) return 'one-off-assistance'
  if (/\b(special assistance|bantuan khas)\b/.test(text)) return 'special-assistance'
  if (/\b(education(?:al)? loan|pinjaman pendidikan)\b/.test(text)) return 'education-loan'
  if (/\b(financial assistance|bantuan kewangan)\b/.test(text)) return 'financial-assistance'
  if (/\b(scholarships?|biasiswa)\b/.test(text)) return 'scholarship'
  return null
}

export function getFinancialAidType(listing: { funding_type?: string | null; title: string }): FinancialAidType | null {
  // Explicit funding metadata takes priority. Do not guess from broad descriptions.
  return identify(listing.funding_type ?? '') ?? identify(listing.title)
}

export function matchesFinancialAid(listing: FilterableAid, filter: FinancialAidFilter, search: string, level = 'all', state = 'all') {
  const listingLevels = (listing.study_levels?.length ? listing.study_levels : [listing.study_level || listing.category || '']).map(normalizeLevel)
  const listingStates = (listing.eligible_states?.length ? listing.eligible_states : [listing.eligible_state || '']).map(normalizeState)
  return listing.title.toLowerCase().includes(search.trim().toLowerCase())
    && (filter === 'all' || getFinancialAidType(listing) === filter)
    && (level === 'all' || listingLevels.includes('all study levels') || listingLevels.includes(normalizeLevel(level)))
    && (state === 'all' || listingStates.includes('all states') || listingStates.includes(normalizeState(state)))
}
