import { Link } from 'react-router-dom'
import { useScholarshipReminders } from '../context/ScholarshipRemindersContext'
import ReminderBell from './ReminderBell'

export default function ScholarshipReminderAlert() {
  const { dueReminders } = useScholarshipReminders()
  if (!dueReminders.length) return null
  return <aside className="scholarship-deadline-alert" role="status">
    <ReminderBell /><div><strong>{dueReminders.length === 1 ? 'A scholarship deadline is approaching' : `${dueReminders.length} scholarship deadlines are approaching`}</strong>
      <span>{dueReminders.slice(0, 2).map((reminder) => `${reminder.title} — ${reminder.days_until === 0 ? 'due today' : `${reminder.days_until} day${reminder.days_until === 1 ? '' : 's'} left`}`).join('; ')}{dueReminders.length > 2 ? `; and ${dueReminders.length - 2} more` : ''}</span></div>
    <Link to="/calendar?section=reminders">View reminders</Link>
  </aside>
}
