import { useState } from "react";
import { Link } from "react-router-dom";
import Icon from "../advisor/AdvisorIcon";
import { useScholarshipReminders } from "../../context/ScholarshipRemindersContext";
import { getApiErrorMessage } from "../../utils/apiError";

const dateFormatter = new Intl.DateTimeFormat("en-MY", {
  timeZone: "UTC", day: "numeric", month: "short", year: "numeric",
});

function formatDate(value: string) {
  return dateFormatter.format(new Date(`${value.slice(0, 10)}T12:00:00Z`));
}

export default function StudentRemindersPanel() {
  const { reminders, dueReminders, isLoading, error, toggleReminder, refresh } = useScholarshipReminders();
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const activeReminders = reminders
    .filter((reminder) => reminder.days_until >= 0)
    .sort((a, b) => a.deadline.localeCompare(b.deadline));

  async function removeReminder(scholarshipId: number) {
    setRemovingId(scholarshipId);
    setActionError("");
    setNotice("");
    try {
      await toggleReminder(scholarshipId, false);
      setNotice("Reminder turned off and removed from your calendar.");
    } catch (error) {
      setActionError(getApiErrorMessage(error, "Unable to remove reminder. Please try again."));
    } finally {
      setRemovingId(null);
    }
  }

  return <>
    <div className="sc-reminders-heading">
      <div className="sc-section-heading"><Icon name="bell" /><div><h2 id="sc-reminders-title">My Reminders</h2><p>Manage your selected scholarship deadline reminders here.</p></div></div>
      <Link className="ss-button" to="/scholarships">Add Reminder <Icon name="chevron" /></Link>
    </div>
    {!isLoading && !error && <div className="sc-reminder-counts" aria-label="Reminder summary"><span>{activeReminders.length} active</span><span>{dueReminders.length} due within 3 days</span></div>}
    {isLoading && <p role="status" className="sc-loading">Loading reminders…</p>}
    {error && <div className="sc-notice" role="alert"><p>{error}</p><button type="button" onClick={() => void refresh()}>Try again</button></div>}
    {actionError && <p className="sc-notice" role="alert">{actionError}</p>}
    {notice && <p className="sc-reminder-success" role="status">{notice}</p>}
    {!isLoading && !error && activeReminders.length === 0 && <div className="sc-empty"><Icon name="bell" /><p>No active reminders. Use the bell beside a scholarship to track its deadline.</p><Link to="/scholarships">Browse Scholarships ›</Link></div>}
    <div className="sc-reminder-list">
      {activeReminders.map((reminder) => <article className="sc-reminder-card" key={reminder.scholarship_id}>
        <span className="sc-reminder-icon"><Icon name="bell" /></span>
        <div className="sc-reminder-copy">
          <h3>{reminder.title}</h3>
          <p>{reminder.organization_name || "ScholarOne Provider"}</p>
          <dl><div><dt>Deadline</dt><dd>{formatDate(reminder.deadline)}</dd></div><div><dt>Reminder date</dt><dd>{formatDate(reminder.remind_on)}</dd></div></dl>
        </div>
        <div className="sc-reminder-actions">
          <span className={`sc-reminder-priority${reminder.days_until <= 3 ? " urgent" : ""}`}>{reminder.days_until === 0 ? "Due today" : `${reminder.days_until} days left`}</span>
          <button type="button" disabled={removingId !== null} aria-label={`Turn off reminder for ${reminder.title}`} onClick={() => void removeReminder(reminder.scholarship_id)}>{removingId === reminder.scholarship_id ? "Removing…" : "Turn off reminder"}</button>
        </div>
      </article>)}
    </div>
    <p className="sc-reminder-help">Reminder dates appear on the calendar 3 days before the deadline. In-app alerts remain active through deadline day and follow provider date changes. All dates use Malaysia time.</p>
  </>;
}
