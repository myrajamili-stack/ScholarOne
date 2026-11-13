import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import api from "../../api/axios";
import Icon from "../../components/advisor/AdvisorIcon";
import StudentRemindersPanel from "../../components/student/StudentRemindersPanel";
import { useScholarshipReminders } from "../../context/ScholarshipRemindersContext";
import "../../styles/student-calendar.css";

type DeadlineEvent = {
  scholarship_id: number;
  title: string;
  organization_name?: string | null;
  deadline: string;
};

type Appointment = {
  appointment_id: number;
  advisor_name: string;
  appointment_datetime: string | null;
  appointment_status: string;
  duration_minutes: number;
};

type CalendarEvent = {
  id: string;
  type: "deadline" | "appointment" | "reminder";
  title: string;
  date: string;
  description: string;
  link: string;
  time?: string;
  status?: string;
  duration?: number;
};

const weekDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const monthFormatter = new Intl.DateTimeFormat("en-MY", { timeZone: "UTC", month: "long", year: "numeric" });
const fullDateFormatter = new Intl.DateTimeFormat("en-MY", { timeZone: "UTC", dateStyle: "full" });
const shortMonthFormatter = new Intl.DateTimeFormat("en-MY", { timeZone: "UTC", month: "short" });
const eventIcons = { deadline: "graduation", appointment: "calendar", reminder: "bell" } as const;
const eventLabels = { deadline: "Scholarship Deadline", appointment: "Appointment", reminder: "Reminder" };

function malaysiaDateKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(date);
}

function calendarDate(dateKey: string) {
  return new Date(`${dateKey}T12:00:00Z`);
}

function buildCalendarDays(monthDate: Date, todayKey: string) {
  const year = monthDate.getUTCFullYear();
  const month = monthDate.getUTCMonth();
  const firstDay = new Date(Date.UTC(year, month, 1, 12));
  const offset = (firstDay.getUTCDay() + 6) % 7;

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(Date.UTC(year, month, 1 - offset + index, 12));
    const dateKey = date.toISOString().slice(0, 10);
    return { date, dateKey, inCurrentMonth: date.getUTCMonth() === month, isToday: dateKey === todayKey };
  });
}

export default function CalendarPage() {
  const { reminders } = useScholarshipReminders();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const reminderSectionRequested = searchParams.get("section") === "reminders";
  const reminderPanel = useRef<HTMLElement>(null);
  const [todayKey, setTodayKey] = useState(malaysiaDateKey);
  const [currentMonth, setCurrentMonth] = useState(() => calendarDate(malaysiaDateKey()));
  const [view, setView] = useState<"month" | "agenda">("month");
  const [deadlines, setDeadlines] = useState<DeadlineEvent[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errors, setErrors] = useState<string[]>([]);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [showAllDeadlines, setShowAllDeadlines] = useState(false);
  const eventDialog = useRef<HTMLDialogElement>(null);

  function focusReminders() {
    eventDialog.current?.close();
    reminderPanel.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    reminderPanel.current?.focus({ preventScroll: true });
  }

  useEffect(() => {
    if (reminderSectionRequested) {
      reminderPanel.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      reminderPanel.current?.focus({ preventScroll: true });
    }
  }, [reminderSectionRequested, location.key]);

  useEffect(() => {
    let controller: AbortController | null = null;
    async function loadEvents() {
      controller?.abort();
      const request = new AbortController();
      controller = request;
      const results = await Promise.allSettled([
        api.get<DeadlineEvent[]>("/calendar/deadlines", { signal: request.signal, timeout: 15000 }),
        api.get<Appointment[]>("/advisors/my-appointments", { signal: request.signal, timeout: 15000 }),
      ]);
      if (request.signal.aborted) return;
      const [scholarshipResponse, appointmentResponse] = results;
      if (scholarshipResponse.status === "fulfilled") setDeadlines(scholarshipResponse.value.data);
      if (appointmentResponse.status === "fulfilled") setAppointments(appointmentResponse.value.data);
      setErrors(results.flatMap((result, index) => result.status === "rejected"
        ? [`Unable to load ${index === 0 ? "scholarship deadlines" : "appointments"}. Please refresh to try again.`]
        : []));
      setTodayKey(malaysiaDateKey());
      setIsLoading(false);
    }

    void loadEvents();
    const timer = window.setInterval(() => { if (!document.hidden) void loadEvents(); }, 60000);
    const onFocus = () => { void loadEvents(); };
    window.addEventListener("focus", onFocus);
    return () => {
      controller?.abort();
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  const events = useMemo(() => {
    const scholarshipEvents: CalendarEvent[] = deadlines.map((deadline) => ({
      id: `deadline-${deadline.scholarship_id}`,
      type: "deadline",
      title: deadline.title,
      date: deadline.deadline.slice(0, 10),
      description: deadline.organization_name || "ScholarOne Provider",
      link: `/scholarships?q=${encodeURIComponent(deadline.title)}`,
    }));
    const reminderEvents: CalendarEvent[] = reminders.map((reminder) => ({
      id: `reminder-${reminder.scholarship_id}`,
      type: "reminder",
      title: reminder.title,
      date: reminder.remind_on.slice(0, 10),
      description: `Your selected reminder, 3 days before the deadline on ${reminder.deadline}.`,
      link: "/calendar?section=reminders",
    }));
    const bookingEvents: CalendarEvent[] = appointments
      .filter((appointment) => appointment.appointment_datetime && ["pending", "confirmed", "completed"].includes(appointment.appointment_status.toLowerCase()))
      .map((appointment) => {
        const date = new Date(appointment.appointment_datetime!);
        return {
          id: `appointment-${appointment.appointment_id}`,
          type: "appointment",
          title: `Advisor meeting · ${appointment.advisor_name}`,
          date: malaysiaDateKey(date),
          description: `Consultation with ${appointment.advisor_name}`,
          time: new Intl.DateTimeFormat("en-MY", { timeZone: "Asia/Kuala_Lumpur", hour: "numeric", minute: "2-digit", hourCycle: "h23" }).format(date),
          status: appointment.appointment_status,
          duration: appointment.duration_minutes,
          link: "/appointments",
        };
      });
    return [...scholarshipEvents, ...reminderEvents, ...bookingEvents]
      .sort((a, b) => a.date.localeCompare(b.date) || (a.time || "").localeCompare(b.time || "") || a.title.localeCompare(b.title));
  }, [deadlines, reminders, appointments]);

  const calendarDays = useMemo(() => buildCalendarDays(currentMonth, todayKey), [currentMonth, todayKey]);
  const eventsByDate = useMemo(() => {
    const grouped: Record<string, CalendarEvent[]> = {};
    for (const event of events) {
      (grouped[event.date] ||= []).push(event);
    }
    return grouped;
  }, [events]);
  const monthKey = currentMonth.toISOString().slice(0, 7);
  const monthEvents = events.filter((event) => event.date.startsWith(monthKey));
  const upcomingDeadlines = events.filter((event) => event.type === "deadline" && event.date >= todayKey);
  const visibleDeadlines = showAllDeadlines ? upcomingDeadlines : upcomingDeadlines.slice(0, 3);

  function changeMonth(offset: number) {
    setCurrentMonth((date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offset, 1, 12)));
    setSelectedDay(null);
  }

  function showEvent(event: CalendarEvent) {
    setSelectedEvent(event);
    eventDialog.current?.showModal();
  }

  return (
    <section className="student-calendar">
      <header className="sc-hero">
        <div className="sc-hero-copy">
          <p className="sc-eyebrow"><Icon name="calendar" />Important Dates</p>
          <h1>Calendar &amp; <span className="sc-title-accent">Reminders</span></h1>
          <p>Track important dates, plan consultations, and manage your scholarship reminders in one place.</p>
        </div>
        <img src="/images/student-calendar-hero.png" className="sc-hero-art" alt="" />
      </header>
      {errors.length > 0 && <div className="sc-notice" role="alert">
        {errors.map((error) => <p key={error}>{error}</p>)}
      </div>}
      <div className="sc-layout">
        <section className="sc-card sc-main" aria-labelledby="sc-month-title">
          <div className="sc-toolbar">
            <div className="sc-month-navigation">
              <button type="button" aria-label="Previous month" onClick={() => changeMonth(-1)}>‹</button>
              <button type="button" aria-label="Next month" onClick={() => changeMonth(1)}>›</button>
              <h2 id="sc-month-title" aria-live="polite">{monthFormatter.format(currentMonth)}</h2>
            </div>
            <div className="sc-view-controls">
              <button type="button" className="sc-today-button" onClick={() => { setCurrentMonth(calendarDate(malaysiaDateKey())); setSelectedDay(null); }}><Icon name="calendar" />Today</button>
              <div className="sc-view-switch" role="group" aria-label="Calendar view">
                <button type="button" aria-pressed={view === "month"} onClick={() => setView("month")}>Month</button>
                <button type="button" aria-pressed={view === "agenda"} onClick={() => setView("agenda")}>Agenda</button>
              </div>
            </div>
          </div>
          <ul className="sc-legend" aria-label="Event types">
            <li><span className="deadline" />Scholarship Deadline</li>
            <li><span className="appointment" />Appointment</li>
            <li><span className="reminder" />Reminder</li>
          </ul>
          {isLoading && <p className="sc-loading" role="status">Loading calendar events…</p>}
          {view === "month" ? <div className="sc-month-scroll">
            <div className="sc-month-grid" role="group" aria-label={`${monthFormatter.format(currentMonth)} calendar`}>
              {weekDays.map((day) => <div className="sc-weekday" key={day}>{day}</div>)}
              {calendarDays.map((day) => {
                const dayEvents = eventsByDate[day.dateKey] || [];
                return <div key={day.dateKey} className={`sc-day${day.inCurrentMonth ? "" : " muted"}${day.isToday ? " today" : ""}${selectedDay === day.dateKey ? " selected" : ""}`}>
                  <button className="sc-day-number" type="button" aria-label={`Show events for ${fullDateFormatter.format(day.date)}`} aria-current={day.isToday ? "date" : undefined} onClick={() => setSelectedDay(day.dateKey)}>{day.date.getUTCDate()}</button>
                  <div className="sc-day-events">{dayEvents.slice(0, 2).map((event) => <button type="button" className={`sc-event ${event.type}`} key={event.id} title={event.title} onClick={() => showEvent(event)}><Icon name={eventIcons[event.type]} /><span>{event.title}</span></button>)}</div>
                  {dayEvents.length > 2 && <button type="button" className="sc-more-events" onClick={() => setSelectedDay(day.dateKey)}>+{dayEvents.length - 2} more</button>}
                </div>;
              })}
            </div>
          </div> : <div className="sc-agenda" aria-label="Monthly agenda">
            {!isLoading && monthEvents.length === 0 && <div className="sc-empty"><Icon name="calendar" /><p>No events this month.</p></div>}
            {monthEvents.map((event) => <button type="button" className={`sc-agenda-event ${event.type}`} key={event.id} onClick={() => showEvent(event)}>
              <time dateTime={event.date}><strong>{calendarDate(event.date).getUTCDate()}</strong>{shortMonthFormatter.format(calendarDate(event.date))}</time>
              <Icon name={eventIcons[event.type]} />
              <span><strong>{event.title}</strong><small>{eventLabels[event.type]} · {event.time || "All day"}{event.status && ` · ${event.status}`}</small></span>
              <Icon name="chevron" />
            </button>)}
          </div>}
          {view === "month" && selectedDay && <section className="sc-selected-day" aria-labelledby="sc-selected-day-title">
            <header><h3 id="sc-selected-day-title">{fullDateFormatter.format(calendarDate(selectedDay))}</h3><button type="button" aria-label="Close selected day" onClick={() => setSelectedDay(null)}><Icon name="close" /></button></header>
            {(eventsByDate[selectedDay] || []).map((event) => <button type="button" className={`sc-event ${event.type}`} key={event.id} onClick={() => showEvent(event)}><Icon name={eventIcons[event.type]} /><span>{event.time && `${event.time} · `}{event.title}</span></button>)}
            {!eventsByDate[selectedDay]?.length && <p>No events on this date.</p>}
          </section>}
          <p className="sc-timezone">Malaysia time · UTC+08:00. Selected scholarship reminders appear 3 days before their deadlines.</p>
        </section>
        <aside className="sc-side-column">
          <section className="sc-card sc-deadlines" aria-labelledby="sc-deadlines-title">
            <div className="sc-section-heading"><Icon name="clock" /><h2 id="sc-deadlines-title">Upcoming Deadlines</h2>{upcomingDeadlines.length > 3 && <button type="button" onClick={() => setShowAllDeadlines((current) => !current)}>{showAllDeadlines ? "View Less" : "View All"} <Icon name="chevron" /></button>}</div>
            {isLoading ? <p role="status">Loading deadlines…</p> : errors.some((error) => error.includes("scholarship")) ? <p>Deadline information is currently unavailable.</p> : upcomingDeadlines.length === 0 ? <div className="sc-empty"><Icon name="graduation" /><p>No upcoming scholarship deadlines.</p></div> : visibleDeadlines.map((event) => <button type="button" className="sc-deadline-row" key={event.id} onClick={() => showEvent(event)}>
              <time dateTime={event.date}><strong>{calendarDate(event.date).getUTCDate()}</strong><span>{shortMonthFormatter.format(calendarDate(event.date))}</span></time>
              <span><strong>{event.title}</strong><small>{event.description}</small></span>
            </button>)}
          </section>
          <section id="reminders" className="sc-card sc-reminders" ref={reminderPanel} tabIndex={-1} aria-labelledby="sc-reminders-title">
            <StudentRemindersPanel />
          </section>
        </aside>
      </div>
      <dialog ref={eventDialog} className="sc-event-dialog" aria-labelledby="sc-event-title" onClick={(event) => { if (event.target === event.currentTarget) eventDialog.current?.close(); }}>
        <header><span>{selectedEvent && eventLabels[selectedEvent.type]}</span><button type="button" aria-label="Close event details" onClick={() => eventDialog.current?.close()}><Icon name="close" /></button></header>
        {selectedEvent && <><h2 id="sc-event-title">{selectedEvent.title}</h2><p>{selectedEvent.description}</p><dl><dt>Date</dt><dd>{fullDateFormatter.format(calendarDate(selectedEvent.date))}</dd><dt>Time</dt><dd>{selectedEvent.time ? `${selectedEvent.time} (Malaysia time)` : "All day"}</dd>{selectedEvent.duration !== undefined && <><dt>Duration</dt><dd>{selectedEvent.duration} minutes</dd></>}{selectedEvent.status && <><dt>Status</dt><dd className="sc-status">{selectedEvent.status}</dd></>}</dl><Link className="ss-button" to={selectedEvent.link} onClick={() => { if (selectedEvent.type === "reminder") focusReminders(); }}>{selectedEvent.type === "appointment" ? "View Appointments" : selectedEvent.type === "reminder" ? "Manage Reminders" : "View Scholarship"}<Icon name="chevron" /></Link></>}
      </dialog>
    </section>
  );
}
