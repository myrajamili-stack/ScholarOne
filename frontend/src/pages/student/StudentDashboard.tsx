import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../../api/axios";
import Icon from "../../components/advisor/AdvisorIcon";
import ProfileAvatar from "../../components/advisor/ProfileAvatar";
import { useScholarshipReminders } from "../../context/ScholarshipRemindersContext";
import type { StudentProfile } from "../../types/student";
import { useStoredUser } from "../../utils/authStorage";
import { getProfileCompletion, PROFILE_UPDATED_EVENT } from "../../utils/profileCompletion";
import "../../styles/student-success.css";

type Opportunity = { scholarship_id: number; title: string; organization_name?: string; study_level?: string; study_levels?: string[]; eligible_state?: string; deadline?: string; status?: string };
type Booking = { appointment_id: number; advisor_name: string; appointment_datetime: string | null; appointment_status: string; consultation_topic?: string };
const quickActions = [
  { icon: "graduation", label: "Browse Scholarships", path: "/scholarships", color: "purple" },
  { icon: "appointment", label: "Take Pathway Quiz", path: "/pathway-quiz", color: "blue" },
  { icon: "calendar", label: "Book Appointment", path: "/appointments", color: "gold" },
  { icon: "calendar", label: "Calendar & Reminders", path: "/calendar", color: "green" },
] as const;
const dateLabel = (date: string) => new Intl.DateTimeFormat("en-MY", { timeZone: "Asia/Kuala_Lumpur", day: "numeric", month: "short", year: "numeric" }).format(new Date(date));

export default function StudentDashboard() {
  const user = useStoredUser();
  const studentId = user?.user_id;
  const [now, setNow] = useState(() => new Date());
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [scholarships, setScholarships] = useState<Opportunity[]>([]);
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
        api.get<Opportunity[]>("/scholarships"),
        api.get<Booking[]>("/advisors/my-appointments"),
      ]);
      if (!active) return;
      const [personal, opportunities, appointments] = results;
      if (personal.status === "fulfilled") setProfile(personal.value.data);
      if (opportunities.status === "fulfilled") setScholarships(opportunities.value.data);
      if (appointments.status === "fulfilled") setBookings(appointments.value.data);
      setErrors(results.flatMap((result, index) => result.status === "rejected" ? [`Unable to load ${["your profile", "scholarships", "appointments"][index]}. Please refresh to try again.`] : []));
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
  const level = profile?.education_level?.toLowerCase();
  const opportunities = scholarships.filter((item) => {
    if (["closed", "expired", "draft", "inactive"].includes(item.status?.toLowerCase() || "")) return false;
    if (item.deadline && new Date(item.deadline).getTime() < new Date(now.toLocaleDateString("en-CA", { timeZone: "Asia/Kuala_Lumpur" }) + "T00:00:00+08:00").getTime()) return false;
    const levels = item.study_levels?.length ? item.study_levels : item.study_level ? [item.study_level] : [];
    return !level || !levels.length || levels.some((value) => value.toLowerCase() === level || ["all", "all levels"].includes(value.toLowerCase()));
  }).slice(0, 3);
  const upcoming = bookings.filter((item) => ["pending", "confirmed"].includes(item.appointment_status.toLowerCase()) && item.appointment_datetime && new Date(item.appointment_datetime).getTime() >= now.getTime()).sort((a, b) => Date.parse(a.appointment_datetime!) - Date.parse(b.appointment_datetime!))[0];
  const deadlines = reminders.filter((item) => item.days_until >= 0).sort((a, b) => Date.parse(a.deadline) - Date.parse(b.deadline)).slice(0, 2);


  return <div className="student-success">
    {errors.length > 0 && <div className="ss-notice" role="alert">{errors.map((error) => <p key={error}>{error}</p>)}</div>}
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
    <div className="ss-content-grid">
      <div className="ss-main-column">
      <section className="ss-card ss-recommendations"><div className="ss-heading"><h2>Recommended Scholarships for You</h2><Link to="/scholarships">View All ›</Link></div><p className="ss-helper">{level ? "Explore opportunities for your education level. Check each listing’s full eligibility." : "Explore opportunities and complete your profile to refine your matches."}</p><div className="ss-list">{loading ? <p>Loading scholarships…</p> : opportunities.length ? opportunities.map((item) => <Link className="ss-scholarship" to={`/scholarships?q=${encodeURIComponent(item.title)}`} key={item.scholarship_id}><span className="ss-list-icon"><Icon name="graduation" /></span><div><strong>{item.title}</strong><small>{item.organization_name || "Scholarship provider"}</small></div><span className="ss-tag">{item.study_level || item.study_levels?.[0] || "All levels"}</span>{item.eligible_state && <span className="ss-tag ss-local">{item.eligible_state}</span>}<Icon name="chevron" /></Link>) : <div className="ss-empty"><Icon name="graduation" /><p>No matching scholarships available yet.</p><Link to="/scholarships">Browse all opportunities ›</Link></div>}</div></section>
<section className="ss-card ss-appointment"><div className="ss-heading"><h2><Icon name="calendar" />Upcoming Appointment</h2><Link to="/appointments">View All ›</Link></div>{loading ? <p>Loading appointments…</p> : upcoming ? <Link className="ss-booking" to="/appointments"><ProfileAvatar className="ss-booking-avatar" name={upcoming.advisor_name} /><div><strong>{upcoming.consultation_topic || "Academic consultation"}</strong><p>with {upcoming.advisor_name}</p><time dateTime={upcoming.appointment_datetime!}>{dateLabel(upcoming.appointment_datetime!)} · {new Intl.DateTimeFormat("en-MY", { timeZone: "Asia/Kuala_Lumpur", hour: "numeric", minute: "2-digit" }).format(new Date(upcoming.appointment_datetime!))}</time><span className="ss-tag">{upcoming.appointment_status}</span></div><Icon name="chevron" /></Link> : <div className="ss-empty"><p>Your next consultation will appear here.</p><Link className="ss-button" to="/appointments">Book an Appointment</Link></div>}</section>
      </div>
      <div className="ss-side-column">
      <section className="ss-card ss-progress"><h2><Icon name="trend" />Your Profile Progress</h2><div className="ss-progress-body"><div className="ss-ring" role="progressbar" aria-label="Profile completion" aria-valuenow={completion} aria-valuemin={0} aria-valuemax={100} style={{ background: `conic-gradient(#6245ff ${completion}%, #eee7ff 0)` }}><strong>{completion}%</strong></div><div><p>{completion === 100 ? "Your profile is complete. Keep it up to date for relevant opportunities." : "Complete your profile to get more relevant scholarship recommendations."}</p><Link className="ss-button" to="/profile">{completion === 100 ? "View Profile" : "Complete Profile"}</Link></div></div></section>
      <section className="ss-card ss-deadlines"><div className="ss-heading"><h2><Icon name="calendar" />Upcoming Deadlines</h2><Link to="/calendar">View Calendar ›</Link></div>{remindersLoading ? <p>Loading deadlines…</p> : remindersError ? <p role="alert">{remindersError}</p> : deadlines.length ? deadlines.map((item) => <Link className="ss-deadline" to="/calendar?section=reminders" key={item.scholarship_id}><div><strong>{item.title}</strong><small>Application deadline</small></div><time dateTime={item.deadline}><Icon name="calendar" />{dateLabel(item.deadline)}</time></Link>) : <div className="ss-empty"><Icon name="calendar" /><p>No upcoming deadline reminders.</p><Link to="/scholarships">Track a scholarship deadline ›</Link></div>}</section>      <section className="ss-card ss-quiz"><div><h2><Icon name="layers" />Pathway Quiz</h2><p>Discover suitable academic and career pathways based on your interests.</p><Link className="ss-button" to="/pathway-quiz">Take Quiz Now ›</Link></div><img src="/images/pathway-quizzes-empty.png" alt="Graduation checklist" /></section>
      </div>
    </div>
  </div>;
}
