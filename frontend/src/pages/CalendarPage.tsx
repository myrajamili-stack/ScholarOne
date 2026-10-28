import { useEffect, useMemo, useState } from "react";
import api from "../api/axios";

type DeadlineEvent = {
  scholarship_id: number;
  title: string;
  organization_name?: string | null;
  deadline: string;
  status?: string | null;
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
  const [currentMonth, setCurrentMonth] = useState(() => new Date());
  const [deadlines, setDeadlines] = useState<DeadlineEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadDeadlines() {
      try {
        const response = await api.get<DeadlineEvent[]>("/calendar/deadlines");
        setDeadlines(response.data);
      } catch {
        setError("Unable to load calendar deadlines right now.");
      } finally {
        setIsLoading(false);
      }
    }

    loadDeadlines();
  }, []);

  const calendarDays = useMemo(() => buildCalendarDays(currentMonth), [currentMonth]);

  const deadlinesByDate = useMemo(() => {
    return deadlines.reduce<Record<string, DeadlineEvent[]>>((groupedDeadlines, deadline) => {
      groupedDeadlines[deadline.deadline] = [...(groupedDeadlines[deadline.deadline] || []), deadline];
      return groupedDeadlines;
    }, {});
  }, [deadlines]);

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
          <span>Track scholarship deadlines added by sponsorship providers.</span>
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
                      <span className="calendar-event" key={deadline.scholarship_id}>
                        {deadline.title}
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
