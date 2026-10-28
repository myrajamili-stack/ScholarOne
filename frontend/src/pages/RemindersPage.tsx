import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/axios";

type DeadlineReminder = {
  scholarship_id: number;
  title: string;
  organization_name?: string | null;
  deadline: string;
};

const dateFormatter = new Intl.DateTimeFormat("en-MY", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

function getDaysUntil(date: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const targetDate = new Date(date);
  targetDate.setHours(0, 0, 0, 0);

  return Math.ceil((targetDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function RemindersPage() {
  const [deadlines, setDeadlines] = useState<DeadlineReminder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadReminders() {
      try {
        const response = await api.get<DeadlineReminder[]>("/calendar/deadlines");
        setDeadlines(response.data);
      } catch {
        setError("Unable to load reminders right now.");
      } finally {
        setIsLoading(false);
      }
    }

    loadReminders();
  }, []);

  const upcomingReminders = useMemo(() => {
    return deadlines
      .map((deadline) => ({ ...deadline, daysUntil: getDaysUntil(deadline.deadline) }))
      .filter((deadline) => deadline.daysUntil >= 0)
      .sort((a, b) => a.daysUntil - b.daysUntil);
  }, [deadlines]);

  const nextReminder = upcomingReminders[0];

  return (
    <section className="reminders-page">
      <header className="reminders-hero">
        <div>
          <p className="module-eyebrow">Notifications</p>
          <h1>Reminders</h1>
          <span>Track scholarship deadlines, consultation tasks, and important academic dates.</span>
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
          <strong>{nextReminder ? `${nextReminder.daysUntil} days` : "None"}</strong>
        </article>
        <article>
          <span>Notification type</span>
          <strong>Dashboard alert</strong>
        </article>
      </section>

      <section className="reminder-layout">
        <article className="reminder-list-card">
          <div className="reminder-section-heading">
            <div>
              <h2>Upcoming Reminders</h2>
              <p>Deadline reminders are created automatically from approved scholarship listings.</p>
            </div>
          </div>

          {isLoading && <p className="dashboard-message">Loading reminders...</p>}
          {error && <p className="dashboard-message error">{error}</p>}
          {!isLoading && !error && upcomingReminders.length === 0 && (
            <div className="reminder-empty-state">
              <div aria-hidden="true">⌁</div>
              <h3>No reminders yet</h3>
              <p>
                When a sponsorship provider adds approved scholarships with deadlines, reminder alerts will appear here.
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
                </div>
                <span className={reminder.daysUntil <= 7 ? "reminder-priority urgent" : "reminder-priority"}>
                  {reminder.daysUntil === 0 ? "Today" : `${reminder.daysUntil} days left`}
                </span>
              </article>
            ))}
          </div>
        </article>

        <aside className="reminder-settings-card">
          <h2>Reminder Settings</h2>
          <label>
            <span>Scholarship deadline alerts</span>
            <input type="checkbox" defaultChecked />
          </label>
          <label>
            <span>Appointment reminders</span>
            <input type="checkbox" defaultChecked />
          </label>
          <label>
            <span>Academic pathway tasks</span>
            <input type="checkbox" defaultChecked />
          </label>
          <div className="reminder-note">
            Alerts are shown inside the dashboard for now. Email or push notifications can be added later.
          </div>
        </aside>
      </section>
    </section>
  );
}

export default RemindersPage;
