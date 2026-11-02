import { test } from 'node:test'
import assert from 'node:assert/strict'
import { financialAidTypes, getFinancialAidType, matchesFinancialAid } from '../src/utils/financialAid.ts'

test('all five aid types match their English and Malay funding labels', () => {
  for (const type of financialAidTypes) {
    for (const funding_type of [type.value, type.english, type.malay, `${type.english} / ${type.malay}`]) {
      assert.equal(getFinancialAidType({ title: 'Sample programme', funding_type }), type.id)
    }
  }
})

test('legacy scholarship labels and clear titles remain filterable', () => {
  assert.equal(getFinancialAidType({ title: 'Test', funding_type: 'Full Scholarship' }), 'scholarship')
  assert.equal(getFinancialAidType({ title: 'APU Scholarships & Merit Awards', funding_type: 'Partial Funding' }), 'scholarship')
  assert.equal(getFinancialAidType({ title: 'Bantuan Khas Pelajar' }), 'special-assistance')
  assert.equal(getFinancialAidType({ title: 'BANTUAN ONE–OFF' }), 'one-off-assistance')
})

test('stored funding type takes precedence over title and ambiguous aid is not guessed', () => {
  assert.equal(getFinancialAidType({ title: 'Scholarship Office Programme', funding_type: 'Education Loan' }), 'education-loan')
  assert.equal(getFinancialAidType({ title: 'General support', funding_type: 'Partial Funding' }), null)
  assert.equal(getFinancialAidType({ title: 'General support', funding_type: null }), null)
})

test('type filtering combines with case-insensitive name search and All restores unknown types', () => {
  const loan = { title: 'UniKL Education Loan', funding_type: 'Education Loan' }
  assert.equal(matchesFinancialAid(loan, 'education-loan', '  UNIKL '), true)
  assert.equal(matchesFinancialAid(loan, 'scholarship', ''), false)
  assert.equal(matchesFinancialAid(loan, 'education-loan', 'missing'), false)
  assert.equal(matchesFinancialAid({ title: 'General support' }, 'all', ''), true)
})

test('aid type, study level, state, and search are combined', () => {
  const listing = { title: 'Johor Education Loan', funding_type: 'Education Loan', study_level: 'Diploma', eligible_state: 'Johor' }
  assert.equal(matchesFinancialAid(listing, 'education-loan', 'JOHOR', 'Diploma', 'Johor'), true)
  assert.equal(matchesFinancialAid(listing, 'scholarship', '', 'Diploma', 'Johor'), false)
  assert.equal(matchesFinancialAid(listing, 'education-loan', '', 'Undergraduate', 'Johor'), false)
  assert.equal(matchesFinancialAid(listing, 'education-loan', '', 'Diploma', 'Selangor'), false)
})

test('national aid matches each state; unknown eligibility is included only under All State', () => {
  const listing = { title: 'Award', eligible_state: 'All States' }
  assert.equal(matchesFinancialAid(listing, 'all', '', 'all', 'Sabah'), true)
  assert.equal(matchesFinancialAid({ title: 'Johor sponsor award' }, 'all', '', 'all', 'Johor'), false)
  assert.equal(matchesFinancialAid({ title: 'Award' }, 'all', '', 'all', 'all'), true)
})

test('legacy study categories and aliases match without treating all postgraduate aid as Master or PhD', () => {
  assert.equal(matchesFinancialAid({ title: 'Award', category: 'Undergraduate' }, 'all', '', 'Undergraduate'), true)
  assert.equal(matchesFinancialAid({ title: 'Award', study_level: 'Master' }, 'all', '', "Master's"), true)
  assert.equal(matchesFinancialAid({ title: 'Award', category: 'Postgraduate' }, 'all', '', "Master's"), false)
  assert.equal(matchesFinancialAid({ title: 'Award', category: 'Postgraduate' }, 'all', '', 'PhD'), false)
  assert.equal(matchesFinancialAid({ title: 'Award', category: 'Engineering' }, 'all', '', 'Undergraduate'), false)
  assert.equal(matchesFinancialAid({ title: 'Award', category: 'Technical and Vocational' }, 'all', '', 'TVET'), true)
})

test('PDF listings preserve multiple eligible levels and federal territories', () => {
  const listing = { title: 'Programme', category: 'General', study_levels: ['Undergraduate', "Master's", 'PhD'], eligible_states: ['Kuala Lumpur', 'Putrajaya', 'Labuan'] }
  assert.equal(matchesFinancialAid(listing, 'all', '', "Master's", 'Kuala Lumpur'), true)
  assert.equal(matchesFinancialAid(listing, 'all', '', 'PhD', 'Kuala Lumpur'), true)
  assert.equal(matchesFinancialAid(listing, 'all', '', 'Diploma', 'Kuala Lumpur'), false)
  assert.equal(matchesFinancialAid(listing, 'all', '', 'PhD', 'Johor'), false)
})
