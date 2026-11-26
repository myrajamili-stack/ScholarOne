import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../../api/axios";
import Icon from "../../components/advisor/AdvisorIcon";
import ProfileAvatar from "../../components/advisor/ProfileAvatar";
import ScholarshipRecommendations from "../../components/ScholarshipRecommendations";
import PathwayRecommendations from "../../components/PathwayRecommendations";
import { useScholarshipReminders } from "../../context/ScholarshipRemindersContext";
import type { StudentProfile } from "../../types/student";
import { useStoredUser } from "../../utils/authStorage";
import { getProfileCompletion, PROFILE_UPDATED_EVENT } from "../../utils/profileCompletion";
import "../../styles/student-success.css";

type Booking = { appointment_id: number; advisor_name: string; appointment_datetime: string | null; appointment_status: string; consultation_topic?: string };
const quickActions = [
  { icon: "graduation", label: "Browse Scholarships", path: "/scholarships", color: "purple" },
  { icon: "appointment", label: "Take Pathway Quiz", path: "/pathway-quiz", color: "blue" },
  { icon: "calendar", label: "Book Appointment", path: "/appointments", color: "gold" },
  { icon: "calendar", label: "Calendar & Reminders", path: "/calendar", color: "green" },
] as const;
const timeLabel = (date: string) => new Intl.DateTimeFormat("en-MY", { timeZone: "Asia/Kuala_Lumpur", hour: "numeric", minute: "2-digit" }).format(new Date(date));
const dateLabel = (date: string) => new Intl.DateTimeFormat("en-MY", { timeZone: "Asia/Kuala_Lumpur", day: "numeric", month: "short", year: "numeric" }).format(new Date(date));

export default function StudentDashboard() {
  const user = useStoredUser();
  const studentId = user?.user_id;
  const [now, setNow] = useState(() => new Date());
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<string[]>([]);
  const { reminders, isLoading: remindersLoading, error: remindersError } = useScholarshipReminders();

  useEffect(() => {
    if (!studentId) return;
    let active = true;
    async function load() {
      const results = await Promise.allSettled([
        api.get<StudentProfile>(`/students/${studentId}/profile`),
        api.get<Booking[]>("/advisors/my-appointments"),
      ]);
      if (!active) return;
      const [personal, appointments] = results;
      if (personal.status === "fulfilled") setProfile(personal.value.data);
      if (appointments.status === "fulfilled") setBookings(appointments.value.data);
      setErrors(results.flatMap((result, index) => result.status === "rejected" ? [`Unable to load ${["your profile", "appointments"][index]}. Please refresh to try again.`] : []));
      setLoading(false);
      setNow(new Date());
    }
    function updateProfile(event: Event) { setProfile((event as CustomEvent<StudentProfile>).detail); }
    void load();
    window.addEventListener(PROFILE_UPDATED_EVENT, updateProfile);
    window.addEventListener("focus", load);
    const timer = window.setInterval(() => setNow(new Date()), 60000);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener("focus", load); window.removeEventListener(PROFILE_UPDATED_EVENT, updateProfile); };
  }, [studentId]);

  const person = profile || user;
  const name = person?.full_name || "Student";
  const completion = getProfileCompletion(profile);
  const malaysiaHour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kuala_Lumpur", hour: "2-digit", hourCycle: "h23" }).format(now));
  const greeting = malaysiaHour < 12 ? "Good morning" : malaysiaHour < 18 ? "Good afternoon" : "Good evening";
  const upcoming = bookings.filter((item) => ["pending", "confirmed"].includes(item.appointment_status.toLowerCase()) && item.appointment_datetime && new Date(item.appointment_datetime).getTime() >= now.getTime()).sort((a, b) => Date.parse(a.appointment_datetime!) - Date.parse(b.appointment_datetime!))[0];
  const deadlines = reminders
    .filter(item => item.days_until >= 0 && (!item.deadline_at || Date.parse(item.deadline_at) >= now.getTime()))
    .sort((a, b) => Date.parse(a.deadline_at || a.deadline) - Date.parse(b.deadline_at || b.deadline))
    .slice(0, 2);
  const urgentDeadline = remindersError ? undefined : deadlines.find(item => item.days_until <= 1);
  const appointmentDate = upcoming?.appointment_datetime;
  const appointmentError = errors.some(error => error.includes("appointments"));
  const urgentAppointment = !appointmentError && appointmentDate && Date.parse(appointmentDate) - now.getTime() <= 86_400_000;

  return <div className="student-success">
    {errors.length > 0 && <div className="ss-notice" role="alert">{errors.map(error => <p key={error}>{error}</p>)}</div>}
    <section className="ss-hero">
      <div className="ss-hero-copy">
        <p>{greeting}, {name.split(" ")[0]}! <span aria-hidden="true">👋</span></p>
        <h1>Your Academic<br />Journey Starts Here!</h1>
        <p className="ss-hero-description">Discover scholarships, explore your pathway,<br className="ss-desktop-break" /> and get guidance from expert advisors.</p>
        <Link className="ss-button ss-explore" to="/scholarships">Explore Opportunities <span aria-hidden="true">→</span></Link>
      </div>
      <img src="/images/student-journey-illustration.png" alt="Cheerful student with scholarship, pathway, and advising signposts" />
    </section>
    <nav className="ss-action-grid" aria-label="Quick actions">{quickActions.map((action) => <Link className={`ss-action ${action.color}`} to={action.path} key={action.path}><Icon name={action.icon} /><strong>{action.label}</strong><Icon name="chevron" /></Link>)}</nav>
    {(urgentDeadline || urgentAppointment) && <aside className="ss-priority" aria-label="Coming up soon">
      {urgentDeadline && <Link to="/calendar?section=reminders"><Icon name="clock" /><span>
        <strong>{urgentDeadline.days_until === 0 ? "Deadline today" : "Deadline tomorrow"}</strong>
        {urgentDeadline.title}
      </span></Link>}
      {urgentAppointment && appointmentDate && <Link to="/appointments"><Icon name="appointment" /><span>
        <strong>{upcoming?.appointment_status.toLowerCase() === "pending" ? "Pending appointment within 24 hours" : "Appointment within 24 hours"}</strong>
        {dateLabel(appointmentDate)} at {timeLabel(appointmentDate)}
      </span></Link>}
    </aside>}

    <div className="ss-content-grid">
      <div className="ss-main-column">
        <ScholarshipRecommendations key={studentId} />
        <PathwayRecommendations key={`pathways-${studentId}`} />
        <section className="ss-card ss-appointment">
          <div className="ss-heading"><h2><Icon name="calendar" />Upcoming Appointment</h2><Link to="/appointments">View All &#8250;</Link></div>
          {loading ? <p role="status">Loading appointments...</p>
            : appointmentError ? <p>Appointments are currently unavailable.</p>
            : upcoming && appointmentDate ? <Link className="ss-booking" to="/appointments">
              <ProfileAvatar className="ss-booking-avatar" name={upcoming.advisor_name} />
              <div>
                <strong>{upcoming.consultation_topic || "Academic consultation"}</strong>
                {upcoming.advisor_name && <p>with {upcoming.advisor_name}</p>}
                <time dateTime={appointmentDate}>{dateLabel(appointmentDate)} &middot; {timeLabel(appointmentDate)}</time>
                <span className="ss-tag">{upcoming.appointment_status}</span>
              </div>
              <Icon name="chevron" />
            </Link>
            : <div className="ss-empty"><p>Your next consultation will appear here.</p><Link className="ss-button" to="/appointments">Book an Appointment</Link></div>}
        </section>
      </div>

      <div className="ss-side-column">
        <section className="ss-card ss-progress">
          <h2><Icon name="trend" />Your Profile Progress</h2>
          {loading ? <p role="status">Loading profile progress...</p>
            : profile ? <div className="ss-progress-body">
              <div className="ss-ring" role="progressbar" aria-label="Profile completion" aria-valuenow={completion}
                aria-valuemin={0} aria-valuemax={100} style={{ background: `conic-gradient(#6245ff ${completion}%, #eee7ff 0)` }}>
                <strong>{completion}%</strong>
              </div>
              <div>
                <p>{completion === 100 ? "Your profile is complete. Keep it up to date for relevant opportunities." : "Complete your profile to get more relevant scholarship recommendations."}</p>
                <Link className="ss-button" to="/profile">{completion === 100 ? "View Profile" : "Complete Profile"}</Link>
              </div>
            </div> : <Link className="ss-button" to="/profile">View Profile</Link>}
        </section>
        <section className="ss-card ss-deadlines">
          <div className="ss-heading"><h2><Icon name="calendar" />Upcoming Deadlines</h2><Link to="/calendar">View Calendar &#8250;</Link></div>
          {remindersLoading ? <p role="status">Loading deadlines...</p>
            : remindersError ? <p role="alert">{remindersError}</p>
            : deadlines.length ? deadlines.map(item => (
              <Link className="ss-deadline" to="/calendar?section=reminders" key={item.scholarship_id}>
                <div><strong>{item.title}</strong><small>Application deadline</small></div>
                <time dateTime={item.deadline_at || item.deadline}>
                  <Icon name="calendar" />
                  {dateLabel(item.deadline_at || item.deadline)}{item.deadline_at && ` at ${timeLabel(item.deadline_at)}`}
                </time>
              </Link>
            )) : <div className="ss-empty"><Icon name="calendar" /><p>No upcoming deadline reminders.</p><Link to="/scholarships">Track a scholarship deadline &#8250;</Link></div>}
        </section>
        <section className="ss-card ss-quiz"><div><h2><Icon name="layers" />Pathway Quiz</h2><p>Discover suitable academic and career pathways based on your interests.</p><Link className="ss-button" to="/pathway-quiz">Take Quiz Now ›</Link></div><img src="/images/pathway-quizzes-empty.png" alt="Graduation checklist" /></section>
      </div>
    </div>
  </div>;
}
