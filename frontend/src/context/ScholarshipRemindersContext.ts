import { createContext, useContext } from 'react'

export type ScholarshipReminder = {
  scholarship_id: number
  title: string
  organization_name?: string | null
  deadline: string
  remind_on: string
  days_until: number
  is_due: boolean
}

export type ScholarshipRemindersState = {
  reminders: ScholarshipReminder[]
  dueReminders: ScholarshipReminder[]
  isLoading: boolean
  error: string
  refresh: () => Promise<void>
  toggleReminder: (scholarshipId: number, enabled: boolean) => Promise<void>
}

export const ScholarshipRemindersContext = createContext<ScholarshipRemindersState | null>(null)

export function useScholarshipReminders() {
  const value = useContext(ScholarshipRemindersContext)
  if (!value) throw new Error('Scholarship reminders require the student layout.')
  return value
}
