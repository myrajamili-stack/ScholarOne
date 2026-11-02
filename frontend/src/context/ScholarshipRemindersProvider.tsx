import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import api from '../api/axios'
import { getAccessToken } from '../utils/authStorage'
import { getApiErrorMessage } from '../utils/apiError'
import { ScholarshipRemindersContext, type ScholarshipReminder } from './ScholarshipRemindersContext'

export default function ScholarshipRemindersProvider({ children }: { children: ReactNode }) {
  const [reminders, setReminders] = useState<ScholarshipReminder[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const request = useRef<AbortController | null>(null)

  const refresh = useCallback(async () => {
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    try {
      if (!getAccessToken()) throw new Error('Sign in again to use scholarship reminders.')
      const response = await api.get<ScholarshipReminder[]>('/scholarship-reminders', { signal: controller.signal, timeout: 15000 })
      if (!controller.signal.aborted) { setReminders(response.data); setError('') }
    } catch (error) {
      if (!controller.signal.aborted) setError(getApiErrorMessage(error,
        !getAccessToken() ? 'Sign in again to use scholarship reminders.' : 'Unable to load scholarship reminders.'))
    } finally {
      if (!controller.signal.aborted) setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    const initialLoad = window.setTimeout(() => { void refresh() }, 0)
    const timer = window.setInterval(() => { if (!document.hidden) void refresh() }, 60000)
    const onFocus = () => { void refresh() }
    const onVisible = () => { if (!document.hidden) void refresh() }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearTimeout(initialLoad)
      window.clearInterval(timer)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisible)
      request.current?.abort()
    }
  }, [refresh])

  const toggleReminder = useCallback(async (scholarshipId: number, enabled: boolean) => {
    if (enabled) {
      const response = await api.put<{ reminder: ScholarshipReminder }>(`/scholarship-reminders/${scholarshipId}`, undefined, { timeout: 15000 })
      request.current?.abort()
      setReminders((current) => [...current.filter((reminder) => reminder.scholarship_id !== scholarshipId), response.data.reminder]
        .sort((a, b) => a.deadline.localeCompare(b.deadline)))
    } else {
      await api.delete(`/scholarship-reminders/${scholarshipId}`, { timeout: 15000 })
      request.current?.abort()
      setReminders((current) => current.filter((reminder) => reminder.scholarship_id !== scholarshipId))
    }
    setIsLoading(false)
    setError('')
  }, [])

  return <ScholarshipRemindersContext.Provider value={{ reminders, dueReminders: reminders.filter((reminder) => reminder.is_due), isLoading, error, refresh, toggleReminder }}>
    {children}
  </ScholarshipRemindersContext.Provider>
}
