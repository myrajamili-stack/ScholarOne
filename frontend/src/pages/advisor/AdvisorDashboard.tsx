import { useEffect, useRef, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import api from "../../api/axios";
import AdvisorIcon, { type AdvisorIconName } from "../../components/advisor/AdvisorIcon";
import { getApiErrorMessage } from "../../utils/apiError";
import { getStoredUser } from "../../utils/authStorage";
import AdvisorAccountMenu from "../../components/advisor/AdvisorAccountMenu";
import "../../styles/advisor-home.css";

type Appointment = {
  appointment_id: number;
  student_id: number;
  student_name: string;
  appointment_datetime: string | null;
  appointment_status: string;
  duration_minutes: number;
  education_level: string | null;
};
type DashboardData = {
  advisor: { full_name: string; specialization: string | null };
  summary: { today_appointments: number; pending_requests: number; total_students: number; average_rating: number | string; unread_messages: number };
  selected_date: string;
  schedule: Appointment[];
  calendar_month: string;
  calendar_days: Array<{ date: string; count: number; pending_count: number }>;
  recent_booking_requests: Appointment[];
  student_insights: Array<{ label: string; value: number; percent: string; color: string }>;
  insight_total: number;
  quiz_overview: { total_quizzes: number; total_attempts: number; average_score: number | string };
  feedback: { total_reviews: number };
};
type SearchResult = { kind: "student" | "appointment" | "quiz"; id: number; title: string; subtitle: string; href: string };
type SearchState = { query: string; results: SearchResult[]; error?: string };

function malaysiaDate() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur" }).format(new Date());
}
function moveDate(value: string, days: number) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
function moveMonth(value: string, months: number) {
  const date = new Date(`${value}-01T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 7);
}
function formatDate(value: string, full = false) {
  return new Intl.DateTimeFormat("en-MY", { timeZone: "Asia/Kuala_Lumpur", day: "numeric", month: full ? "long" : "short", year: "numeric" }).format(new Date(`${value}T12:00:00+08:00`));
}
function formatTime(value: string | null) {
  if (!value) return "Time not set";
  return new Intl.DateTimeFormat("en-MY", { timeZone: "Asia/Kuala_Lumpur", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(value));
}
function greeting() {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kuala_Lumpur", hour: "2-digit", hourCycle: "h23" }).format(new Date()));
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 18) return "Good afternoon";
  return "Good evening";
}
function donutBackground(data: DashboardData | null) {
  if (!data?.insight_total) return "#eee5fc";
  let position = 0;
  const segments: string[] = [];
  for (const insight of data.student_insights) {
    const nextPosition = position + insight.value / data.insight_total * 100;
    segments.push(`${insight.color} ${position}% ${nextPosition}%`);
    position = nextPosition;
  }
  return `conic-gradient(${segments.join(", ")})`;
}
const quickActions: Array<{ label: string; icon: AdvisorIconName; href: string }> = [
  { label: "Set Availability", icon: "calendar", href: "/advisor/schedule?tab=availability" },
  { label: "Create Pathway Quiz", icon: "quiz", href: "/advisor/pathway-quizzes?create=1" },
  { label: "Manage Appointments", icon: "appointment", href: "/advisor/appointments" },
  { label: "View Student List", icon: "users", href: "/advisor/students" },
];

function AdvisorDashboard() {
  const user = getStoredUser();
  const userId = user?.user_id;
  const { setUnreadMessages } = useOutletContext<{ setUnreadMessages: (count: number) => void }>();
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [selectedDate, setSelectedDate] = useState(malaysiaDate);
  const [calendarMonth, setCalendarMonth] = useState(() => malaysiaDate().slice(0, 7));
  const [refresh, setRefresh] = useState(0);
  const [refreshing, setRefreshing] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionStatus, setActionStatus] = useState("");
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState<SearchState>({ query: "", results: [] });
  const [searchOpen, setSearchOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const searchArea = useRef<HTMLDivElement>(null);
  const notificationsArea = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!userId) return;
    const controller = new AbortController();
    let loading = false;
    async function load() {
      if (loading) return;
      loading = true;
      setRefreshing(true);
      try {
        const response = await api.get<DashboardData>(`/advisors/${userId}/dashboard`, {
          params: { date: selectedDate, month: calendarMonth }, signal: controller.signal,
        });
        if (!controller.signal.aborted) {
          setDashboard(response.data);
          setUnreadMessages(response.data.summary.unread_messages);
          setError("");
        }
      } catch (error) {
        if (!controller.signal.aborted) setError(getApiErrorMessage(error, "Unable to load your dashboard."));
      } finally {
        loading = false;
        if (!controller.signal.aborted) setRefreshing(false);
      }
    }
    function refreshVisible() {
      if (document.visibilityState === "visible") void load();
    }
    void load();
    const timer = window.setInterval(refreshVisible, 30000);
    window.addEventListener("focus", refreshVisible);
    return () => { controller.abort(); window.clearInterval(timer); window.removeEventListener("focus", refreshVisible); };
  }, [userId, selectedDate, calendarMonth, refresh, setUnreadMessages]);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2 || !userId) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await api.get<{ results: SearchResult[] }>(`/advisors/${userId}/search`, { params: { q: trimmed }, signal: controller.signal });
        if (!controller.signal.aborted) setSearch({ query: trimmed, results: response.data.results });
      } catch (error) {
        if (!controller.signal.aborted) setSearch({ query: trimmed, results: [], error: getApiErrorMessage(error, "Unable to search right now.") });
      }
    }, 250);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [query, userId]);

  useEffect(() => {
    function closePopovers(event: PointerEvent) {
      const target = event.target as Node;
      if (!searchArea.current?.contains(target)) setSearchOpen(false);
      if (!notificationsArea.current?.contains(target)) setNotificationsOpen(false);
    }
    document.addEventListener("pointerdown", closePopovers);
    return () => document.removeEventListener("pointerdown", closePopovers);
  }, []);

  async function updateRequest(appointment: Appointment, status: "confirmed" | "cancelled") {
    if (updatingId || refreshing) return;
    setUpdatingId(appointment.appointment_id);
    setActionError("");
    setActionStatus("");
    try {
      await api.patch(`/advisors/${userId}/appointments/${appointment.appointment_id}/status`, { status });
      setActionStatus(`${appointment.student_name}’s appointment ${status === "confirmed" ? "accepted" : "declined"}.`);
      setRefresh((value) => value + 1);
    } catch (error) {
      setActionError(getApiErrorMessage(error, "Unable to update this request."));
    } finally {
      setUpdatingId(null);
    }
  }
  function selectDay(value: string) {
    setSelectedDate(value);
    setCalendarMonth(value.slice(0, 7));
  }

  const fullName = dashboard?.advisor.full_name || user?.full_name || "Academic Advisor";
  const pendingCount = dashboard?.summary.pending_requests || 0;
  const unreadCount = dashboard?.summary.unread_messages || 0;
  const notificationCount = pendingCount + unreadCount;
  const monthDate = new Date(`${calendarMonth}-01T12:00:00Z`);
  const monthTitle = new Intl.DateTimeFormat("en-MY", { timeZone: "UTC", month: "long", year: "numeric" }).format(monthDate);
  const firstWeekday = (monthDate.getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth() + 1, 0)).getUTCDate();
  const calendarDays = Array.from({ length: Math.ceil((daysInMonth + firstWeekday) / 7) * 7 }, (_, index) => index - firstWeekday + 1);
  const schedule = dashboard?.selected_date === selectedDate ? dashboard.schedule : [];

  return (
    <div className="advisor-home">
      <header className="advisor-home-toolbar" onKeyDown={(event) => { if (event.key === "Escape") { setSearchOpen(false); setNotificationsOpen(false); } }}>
        <div className="advisor-home-search" ref={searchArea}>
          <AdvisorIcon name="search" />
          <input type="search" aria-label="Search students, appointments, or quizzes" placeholder="Search students, appointments, or quizzes..." value={query} maxLength={100} onFocus={() => setSearchOpen(true)} onChange={(event) => { setQuery(event.target.value); setSearchOpen(true); }} />
          {searchOpen && query.trim() && <div className="advisor-home-search-results" aria-live="polite">
            {query.trim().length < 2 ? <p>Enter at least two characters to search.</p> : search.query !== query.trim() ? <p>Searching...</p> : search.error ? <p role="alert">{search.error}</p> : search.results.length === 0 ? <p>No students, appointments, or quizzes match your search.</p> : search.results.map((result) => <Link key={`${result.kind}-${result.id}`} to={result.href} onClick={() => setSearchOpen(false)}>
              <AdvisorIcon name={result.kind === "student" ? "user" : result.kind === "appointment" ? "appointment" : "quiz"} />
              <span><strong>{result.title}</strong><small>{result.subtitle}</small></span><AdvisorIcon name="chevron" />
            </Link>)}
          </div>}
        </div>
        <div className="advisor-home-account-actions">
          <div ref={notificationsArea} className="advisor-home-popover-anchor">
            <button type="button" className="advisor-home-bell" aria-label={`Notifications, ${pendingCount} pending requests and ${unreadCount} unread messages`} aria-expanded={notificationsOpen} onClick={() => { setNotificationsOpen((value) => !value); }}>
              <AdvisorIcon name="bell" />{notificationCount > 0 && <span>{notificationCount > 99 ? "99+" : notificationCount}</span>}
            </button>
            {notificationsOpen && <section className="advisor-home-popover" aria-label="Notifications"><h2>Notifications</h2><Link to="/advisor/appointments?status=pending"><AdvisorIcon name="appointment" /><span><strong>{pendingCount} pending requests</strong><small>Review student bookings</small></span></Link><Link to="/advisor/messages"><AdvisorIcon name="message" /><span><strong>{unreadCount} unread messages</strong><small>Open your inbox</small></span></Link>{notificationCount === 0 && <p>You’re all caught up.</p>}</section>}
          </div>
          <AdvisorAccountMenu name={fullName} onOpen={() => setNotificationsOpen(false)} />
        </div>
      </header>

      <section className="advisor-home-welcome">
        <div><h1>{greeting()}, {fullName}! <span aria-hidden="true">👋</span></h1><p>Guide, support, and empower students<br className="advisor-home-hero-break" /> in their academic journey.<span className="advisor-home-underline" aria-hidden="true" /></p></div>
        <div className="advisor-home-welcome-art"><img src="/images/advisor-dashboard-welcome.png" alt="" /></div>
      </section>
      {error && <div className="advisor-home-error" role="alert">{error}<button type="button" onClick={() => setRefresh((value) => value + 1)}>Retry dashboard</button></div>}
      <section className="advisor-home-metrics" aria-label="Advisor activity summary">
        <Link className="advisor-home-metric purple" to={`/advisor/schedule?date=${malaysiaDate()}`}><span className="advisor-home-metric-icon"><AdvisorIcon name="calendar" /></span><div><span>Today’s Appointments</span><strong>{dashboard?.summary.today_appointments ?? "—"}</strong></div></Link>
        <Link className="advisor-home-metric amber" to="/advisor/appointments?status=pending"><span className="advisor-home-metric-icon"><AdvisorIcon name="hourglass" /></span><div><span>Pending Requests</span><strong>{dashboard?.summary.pending_requests ?? "—"}</strong></div></Link>
        <Link className="advisor-home-metric blue" to="/advisor/students"><span className="advisor-home-metric-icon"><AdvisorIcon name="users" /></span><div><span>Total Students</span><strong>{dashboard?.summary.total_students ?? "—"}</strong></div></Link>
        <Link className="advisor-home-metric green" to="/advisor/feedback"><span className="advisor-home-metric-icon"><AdvisorIcon name="star" /></span><div><span>Average Rating</span><strong>{dashboard ? Number(dashboard.summary.average_rating).toFixed(1) : "—"}<small> / 5</small></strong></div></Link>
      </section>
      <section className="advisor-home-main-grid">
        <article className="advisor-home-card advisor-home-schedule">
          <header className="advisor-home-schedule-header"><h2><AdvisorIcon name="calendar" />{selectedDate === malaysiaDate() ? "Today’s Schedule" : "Consultation Schedule"}</h2><div className="advisor-home-date-switch"><button type="button" aria-label="Previous day" disabled={!!updatingId} onClick={() => selectDay(moveDate(selectedDate, -1))}><AdvisorIcon name="chevron" /></button><span>{formatDate(selectedDate)}</span><button type="button" aria-label="Next day" disabled={!!updatingId} onClick={() => selectDay(moveDate(selectedDate, 1))}><AdvisorIcon name="chevron" /></button></div></header>
          <div className="advisor-home-schedule-body" aria-busy={refreshing}>
            {!dashboard || dashboard.selected_date !== selectedDate ? <p className="advisor-home-empty" role="status">{error ? "Schedule is unavailable." : "Loading schedule..."}</p> : schedule.length === 0 ? <p className="advisor-home-empty">No appointments on {formatDate(selectedDate)}. Choose another day in the calendar.</p> : <div className="advisor-home-schedule-list">{schedule.slice(0, 3).map((appointment, index) => <Link className={`advisor-home-schedule-row accent-${index % 3}`} to={`/advisor/appointments?appointment=${appointment.appointment_id}`} key={appointment.appointment_id}><time>{formatTime(appointment.appointment_datetime)}</time><div><strong>Consultation Session</strong><span>{appointment.student_name}</span></div><span className={`advisor-home-status ${appointment.appointment_status.toLowerCase()}`}>{appointment.appointment_status}</span></Link>)}</div>}
            <Link className="advisor-home-primary" to={`/advisor/schedule?date=${selectedDate}`}><AdvisorIcon name="calendar" />View Full Schedule</Link>
          </div>
        </article>
        <article className="advisor-home-card advisor-home-calendar">
          <header><button type="button" aria-label="Previous month" onClick={() => setCalendarMonth(moveMonth(calendarMonth, -1))}><AdvisorIcon name="chevron" /></button><h2>{monthTitle}</h2><button type="button" aria-label="Next month" onClick={() => setCalendarMonth(moveMonth(calendarMonth, 1))}><AdvisorIcon name="chevron" /></button></header>
          <div className="advisor-home-calendar-grid" role="group" aria-label={`${monthTitle} calendar`}>
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => <span className="advisor-home-weekday" key={day}>{day}</span>)}
            {calendarDays.map((day, index) => {
              if (day < 1 || day > daysInMonth) return <span key={`empty-${index}`} />;
              const value = `${calendarMonth}-${String(day).padStart(2, "0")}`;
              const bookings = dashboard?.calendar_month === calendarMonth ? dashboard.calendar_days.find((item) => item.date === value) : null;
              return <button type="button" key={value} className={`${selectedDate === value ? "selected" : ""} ${value === malaysiaDate() ? "today" : ""}`} aria-pressed={selectedDate === value} aria-label={`${formatDate(value, true)}, ${bookings?.count || 0} appointments`} onClick={() => selectDay(value)}>{day}{bookings && <i className={bookings.pending_count > 0 ? "has-pending" : ""} />}</button>;
            })}
          </div>
          <div className="advisor-home-calendar-footer"><span><i />Bookings <i className="has-pending" />Pending</span><button type="button" onClick={() => selectDay(malaysiaDate())}>Today</button></div>
        </article>
        <article className="advisor-home-card advisor-home-quick-actions"><h2><AdvisorIcon name="bolt" />Quick Actions</h2><nav aria-label="Quick actions">{quickActions.map((action) => <Link key={action.href} to={action.href}><AdvisorIcon name={action.icon} /><span>{action.label}</span><AdvisorIcon name="chevron" /></Link>)}</nav></article>
      </section>
      <section className="advisor-home-bottom-grid">
        <article className="advisor-home-card advisor-home-requests"><header className="advisor-home-card-heading"><h2><AdvisorIcon name="users" />Recent Booking Requests</h2><Link to="/advisor/appointments?status=pending">View All</Link></header>
          {!dashboard ? <p className="advisor-home-empty">{error ? "Requests are unavailable." : "Loading requests..."}</p> : dashboard.recent_booking_requests.length === 0 ? <p className="advisor-home-empty">No pending requests. New student bookings will appear here.</p> : <div className="advisor-home-request-list">{dashboard.recent_booking_requests.slice(0, 2).map((appointment) => <div className="advisor-home-request" key={appointment.appointment_id}><span className="advisor-home-student-icon"><AdvisorIcon name="user" /></span><Link to={`/advisor/appointments?appointment=${appointment.appointment_id}`}><strong>{appointment.student_name}</strong><small>{appointment.appointment_datetime ? `${formatDate(appointment.appointment_datetime.slice(0, 10))} · ${formatTime(appointment.appointment_datetime)}` : "Date not set"}</small></Link><div className="advisor-home-request-buttons"><button type="button" className="accept" disabled={!!updatingId || refreshing} onClick={() => updateRequest(appointment, "confirmed")} aria-label={`Accept ${appointment.student_name}’s appointment`}>{updatingId === appointment.appointment_id ? "..." : "Accept"}</button><button type="button" className="decline" disabled={!!updatingId || refreshing} onClick={() => updateRequest(appointment, "cancelled")} aria-label={`Decline ${appointment.student_name}’s appointment`}>Decline</button></div></div>)}</div>}
          {actionError && <p className="advisor-home-error" role="alert">{actionError}</p>}{actionStatus && <p className="advisor-home-action-status" role="status">{actionStatus}</p>}
        </article>
        <article className="advisor-home-card advisor-home-insights"><header className="advisor-home-card-heading"><h2><AdvisorIcon name="chart" />Student Insights</h2></header>
          {dashboard && dashboard.insight_total > 0 ? <div className="advisor-home-insights-body"><Link to="/advisor/students" className="advisor-home-donut" style={{ background: donutBackground(dashboard) }} aria-label={`${dashboard.insight_total} guided students. View student list.`}><span><strong>{dashboard.insight_total}</strong><small>Students</small></span></Link><ul>{dashboard.student_insights.map((item) => <li key={item.label}><i style={{ background: item.color }} /><span>{item.label}</span><strong>{item.percent}</strong></li>)}</ul></div> : <p className="advisor-home-empty">{dashboard ? "Education insights appear when students book consultations." : "Loading student insights..."}</p>}
          <p className="advisor-home-insight-note">Education levels of your guided students</p>
        </article>
        <article className="advisor-home-card advisor-home-quizzes"><header className="advisor-home-card-heading"><h2><AdvisorIcon name="layers" />Pathway Quiz Overview</h2></header><div className="advisor-home-quiz-stats"><Link to="/advisor/pathway-quizzes"><AdvisorIcon name="quiz" /><strong>{dashboard?.quiz_overview.total_quizzes ?? "—"}</strong><span>Quizzes<br />Created</span></Link><Link to="/advisor/pathway-quizzes"><AdvisorIcon name="play" /><strong>{dashboard?.quiz_overview.total_attempts ?? "—"}</strong><span>Total<br />Attempts</span></Link><Link to="/advisor/pathway-quizzes"><AdvisorIcon name="star" /><strong>{dashboard ? Number(dashboard.quiz_overview.average_score).toFixed(0) : "—"}%</strong><span>Average<br />Score</span></Link></div></article>
      </section>
      <p className="advisor-home-live-note">Times shown in Malaysia time <span>·</span> {refreshing ? "Updating dashboard..." : "Updates every 30 seconds"}<button type="button" disabled={refreshing} onClick={() => setRefresh((value) => value + 1)}><AdvisorIcon name="refresh" />Refresh</button></p>
    </div>
  );
}
export default AdvisorDashboard;
