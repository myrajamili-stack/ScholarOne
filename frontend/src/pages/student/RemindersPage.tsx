import { useState } from "react";
import { Link } from "react-router-dom";
import { useScholarshipReminders } from "../../context/ScholarshipRemindersContext";
import { getApiErrorMessage } from "../../utils/apiError";

const dateFormatter = new Intl.DateTimeFormat("en-MY", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

function RemindersPage() {
  const { reminders, dueReminders, isLoading, error, toggleReminder, refresh } = useScholarshipReminders();
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [actionError, setActionError] = useState("");
  const upcomingReminders = reminders.filter((reminder) => reminder.days_until >= 0);

  async function removeReminder(scholarshipId: number) {
    setRemovingId(scholarshipId);
    setActionError("");
    try { await toggleReminder(scholarshipId, false); }
    catch (error) { setActionError(getApiErrorMessage(error, "Unable to remove reminder.")); }
    finally { setRemovingId(null); }
  }

  const nextReminder = upcomingReminders[0];

  return (
    <section className="reminders-page">
      <header className="reminders-hero">
        <div>
          <p className="module-eyebrow">Notifications</p>
          <h1>Reminders</h1>
          <span>Your selected scholarship deadlines, synced with the calendar.</span>
        </div>
        <Link to="/calendar">Open Calendar</Link>
      </header>

      <section className="reminder-summary-grid">
        <article>
          <span>Active reminders</span>
          <strong>{upcomingReminders.length}</strong>
        </article>
        <article>
          <span>Next reminder</span>
          <strong>{nextReminder ? `${nextReminder.days_until} days` : "None"}</strong>
        </article>
        <article>
          <span>Due within 3 days</span>
          <strong>{dueReminders.length}</strong>
        </article>
      </section>

      <section className="reminder-layout">
        <article className="reminder-list-card">
          <div className="reminder-section-heading">
            <div>
              <h2>Upcoming Reminders</h2>
              <p>Click the bell beside a scholarship to add a reminder. Alerts begin 3 days before its deadline.</p>
            </div>
          </div>

          {isLoading && <p className="dashboard-message">Loading reminders...</p>}
          {error && <p className="dashboard-message error">{error} <button type="button" onClick={() => void refresh()}>Try again</button></p>}
          {actionError && <p className="dashboard-message error" role="alert">{actionError}</p>}
          {!isLoading && !error && upcomingReminders.length === 0 && (
            <div className="reminder-empty-state">
              <div aria-hidden="true">⌁</div>
              <h3>No reminders yet</h3>
              <p>
                Click the bell beside a scholarship to add it here and schedule a calendar reminder.
              </p>
              <Link to="/scholarships">View Scholarships</Link>
            </div>
          )}

          <div className="reminder-list">
            {upcomingReminders.map((reminder) => (
              <article className="reminder-item" key={reminder.scholarship_id}>
                <div className="reminder-date">
                  <strong>{new Date(reminder.deadline).getDate()}</strong>
                  <span>{new Intl.DateTimeFormat("en-MY", { month: "short" }).format(new Date(reminder.deadline))}</span>
                </div>
                <div>
                  <h3>{reminder.title}</h3>
                  <p>{reminder.organization_name || "ScholarOne Provider"}</p>
                  <small>Deadline: {dateFormatter.format(new Date(reminder.deadline))}</small>
                  <small>Reminder date: {dateFormatter.format(new Date(reminder.remind_on))}</small>
                  <button className="reminder-remove-button" type="button" disabled={removingId !== null} onClick={() => void removeReminder(reminder.scholarship_id)}>{removingId === reminder.scholarship_id ? "Removing..." : "Turn off reminder"}</button>
                </div>
                <span className={reminder.days_until <= 3 ? "reminder-priority urgent" : "reminder-priority"}>
                  {reminder.days_until === 0 ? "Today" : `${reminder.days_until} days left`}
                </span>
              </article>
            ))}
          </div>
        </article>

        <aside className="reminder-settings-card">
          <h2>How Reminders Work</h2>
          <p>Use the bell beside a scholarship to turn its reminder on or off. Favourites are managed separately with the heart.</p>
          <p>Reminders appear in your calendar 3 days before the deadline. Alerts stay active through deadline day.</p>
          <p>Dates use Malaysia time. If the provider changes a deadline, your reminder updates with it.</p>
          <div className="reminder-note">
            Alerts are shown inside the dashboard for now. Email or push notifications can be added later.
          </div>
        </aside>
      </section>
    </section>
  );
}

export default RemindersPage;
