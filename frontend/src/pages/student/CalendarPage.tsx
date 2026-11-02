import { useEffect, useMemo, useState } from "react";
import api from "../../api/axios";
import { useScholarshipReminders } from "../../context/ScholarshipRemindersContext";

type DeadlineEvent = {
  scholarship_id: number;
  title: string;
  organization_name?: string | null;
  deadline: string;
  status?: string | null;
  is_reminder?: boolean;
};

type CalendarDay = {
  date: Date;
  dateKey: string;
  inCurrentMonth: boolean;
  isToday: boolean;
};

const weekDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const monthFormatter = new Intl.DateTimeFormat("en-MY", { month: "long", year: "numeric" });
const dayFormatter = new Intl.DateTimeFormat("en-MY", { day: "numeric", month: "short" });

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getMondayFirstDayIndex(date: Date) {
  return (date.getDay() + 6) % 7;
}

function buildCalendarDays(monthDate: Date): CalendarDay[] {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const startOffset = getMondayFirstDayIndex(firstDay);
  const calendarStart = new Date(year, month, 1 - startOffset);
  const todayKey = toDateKey(new Date());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(calendarStart);
    date.setDate(calendarStart.getDate() + index);
    const dateKey = toDateKey(date);

    return {
      date,
      dateKey,
      inCurrentMonth: date.getMonth() === month,
      isToday: dateKey === todayKey,
    };
  });
}

function CalendarPage() {
  const { reminders, error: remindersError } = useScholarshipReminders();
  const [currentMonth, setCurrentMonth] = useState(() => new Date());
  const [deadlines, setDeadlines] = useState<DeadlineEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let controller: AbortController | null = null;
    async function loadDeadlines() {
      controller?.abort();
      const request = new AbortController();
      controller = request;
      try {
        const response = await api.get<DeadlineEvent[]>("/calendar/deadlines", { signal: request.signal, timeout: 15000 });
        if (!request.signal.aborted) { setDeadlines(response.data); setError(""); }
      } catch {
        if (!request.signal.aborted) setError("Unable to load calendar deadlines right now.");
      } finally {
        if (!request.signal.aborted) setIsLoading(false);
      }
    }

    loadDeadlines();
    const timer = window.setInterval(() => { if (!document.hidden) void loadDeadlines(); }, 60000);
    const onFocus = () => { void loadDeadlines(); };
    window.addEventListener("focus", onFocus);
    return () => { controller?.abort(); window.clearInterval(timer); window.removeEventListener("focus", onFocus); };
  }, []);

  const calendarDays = useMemo(() => buildCalendarDays(currentMonth), [currentMonth]);

  const deadlinesByDate = useMemo(() => {
    const reminderEvents: DeadlineEvent[] = reminders.map((reminder) => ({
      scholarship_id: reminder.scholarship_id, title: reminder.title,
      deadline: reminder.remind_on, is_reminder: true,
    }));
    return [...deadlines, ...reminderEvents].reduce<Record<string, DeadlineEvent[]>>((groupedDeadlines, deadline) => {
      groupedDeadlines[deadline.deadline] = [...(groupedDeadlines[deadline.deadline] || []), deadline];
      return groupedDeadlines;
    }, {});
  }, [deadlines, reminders]);

  const upcomingDeadlines = deadlines
    .filter((deadline) => deadline.deadline >= toDateKey(new Date()))
    .slice(0, 5);

  function goToPreviousMonth() {
    setCurrentMonth((date) => new Date(date.getFullYear(), date.getMonth() - 1, 1));
  }

  function goToNextMonth() {
    setCurrentMonth((date) => new Date(date.getFullYear(), date.getMonth() + 1, 1));
  }

  function goToToday() {
    setCurrentMonth(new Date());
  }

  return (
    <section className="calendar-page">
      <header className="calendar-header-card">
        <div>
          <p className="module-eyebrow">Important Dates</p>
          <h1>Calendar</h1>
          <span>Track scholarship deadlines and your selected 3-day reminder dates.</span>
        </div>
        <div className="calendar-actions">
          <button type="button" onClick={goToPreviousMonth} aria-label="Previous month">
            ‹
          </button>
          <button type="button" onClick={goToToday}>
            Today
          </button>
          <button type="button" onClick={goToNextMonth} aria-label="Next month">
            ›
          </button>
        </div>
      </header>

      <section className="calendar-layout">
        <article className="calendar-card">
          <div className="calendar-month-row">
            <h2>{monthFormatter.format(currentMonth)}</h2>
            <span>{deadlines.length} important dates</span>
          </div>

          <div className="calendar-weekdays">
            {weekDays.map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>

          <div className="calendar-grid-view">
            {calendarDays.map((day) => {
              const dayDeadlines = deadlinesByDate[day.dateKey] || [];

              return (
                <div
                  className={`calendar-day ${day.inCurrentMonth ? "" : "muted"} ${day.isToday ? "today" : ""}`}
                  key={day.dateKey}
                >
                  <time dateTime={day.dateKey}>{day.date.getDate()}</time>
                  <div className="calendar-events">
                    {dayDeadlines.slice(0, 2).map((deadline) => (
                      <span className={`calendar-event${deadline.is_reminder ? " calendar-reminder-event" : ""}`} key={`${deadline.scholarship_id}-${deadline.is_reminder ? "reminder" : "deadline"}`} title={`${deadline.is_reminder ? "3-day reminder" : "Deadline"}: ${deadline.title}`}>
                        {deadline.is_reminder ? "🔔 " : ""}{deadline.title}
                      </span>
                    ))}
                    {dayDeadlines.length > 2 && <small>+{dayDeadlines.length - 2} more</small>}
                  </div>
                </div>
              );
            })}
          </div>
        </article>

        <aside className="calendar-side-card">
          <h2>Upcoming Deadlines</h2>
          {isLoading && <p className="dashboard-message">Loading deadlines...</p>}
          {error && <p className="dashboard-message error">{error}</p>}
          {remindersError && <p className="dashboard-message error">{remindersError}</p>}
          <p className="dashboard-message">Bell markers show your selected reminder dates, 3 days before the deadline.</p>
          {!isLoading && !error && upcomingDeadlines.length === 0 && (
            <p className="dashboard-message">
              No scholarship deadlines yet. Provider-added scholarship deadlines will appear here.
            </p>
          )}
          {upcomingDeadlines.map((deadline) => (
            <article className="calendar-deadline-item" key={deadline.scholarship_id}>
              <time dateTime={deadline.deadline}>{dayFormatter.format(new Date(deadline.deadline))}</time>
              <div>
                <strong>{deadline.title}</strong>
                <span>{deadline.organization_name || "ScholarOne Provider"}</span>
              </div>
            </article>
          ))}
        </aside>
      </section>
    </section>
  );
}

export default CalendarPage;
