import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../../api/axios";
import { getApiErrorMessage } from "../../utils/apiError";
import { clearStoredUser, useStoredUser } from "../../utils/authStorage";
import AdvisorPageHeader from "../../components/advisor/AdvisorPageHeader";
import AdvisorIcon, { type AdvisorIconName } from "../../components/advisor/AdvisorIcon";
import ProfileAvatar from "../../components/advisor/ProfileAvatar";
import "../../styles/advisor-settings.css";

type Profile = {
  full_name: string;
  email: string;
  professional_title: string;
  profile_picture: string | null;
  status: string;
  has_availability: boolean;
};
function Heading({ icon, title, description }: { icon: AdvisorIconName; title: string; description: string }) {
  return <header className="at-card-heading"><AdvisorIcon name={icon} /><div><h2>{title}</h2><p>{description}</p></div></header>;
}
function UnavailablePreference({ icon, title, description }: { icon: AdvisorIconName; title: string; description: string }) {
  return <div className="at-preference">
    <span className="at-row-icon"><AdvisorIcon name={icon} /></span>
    <div><strong>{title}</strong><p>{description}</p></div>
    <input className="at-switch" type="checkbox" role="switch" checked={false} disabled aria-label={title} aria-describedby="at-notifications-note" />
  </div>;
}
export default function AdvisorSettingsPage() {
  const user = useStoredUser();
  const advisorId = user?.user_id;
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    if (!advisorId) return;
    api.get<Profile>(`/advisors/${advisorId}/profile`, { signal: controller.signal }).then(response => {
      if (!controller.signal.aborted) setProfile(response.data);
    }).catch(error => {
      if (!controller.signal.aborted) setError(getApiErrorMessage(error, "Unable to load your account details."));
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [advisorId, retry]);
  return <div className="am-page at-page">
    <AdvisorPageHeader title="Settings" description="Manage your account, notifications, privacy, and security settings." />
    {loading ? <p className="am-empty" role="status">Loading account settings…</p> : error || !profile ? <p className="am-feedback error" role="alert">{error || "Account details are unavailable."} <button type="button" onClick={() => { setError(""); setLoading(true); setRetry(value => value + 1); }}>Retry</button></p> : <>
      <div className="at-grid">
        <section className="am-card at-account" id="at-general" tabIndex={-1} aria-label="Account information">
          <Heading icon="user" title="Account Information" description="Update your basic account details." />
          <div className="at-account-details">
            <Link to="/advisor/profile" className="at-photo-link" aria-label="Edit profile photo"><ProfileAvatar className="at-photo" name={profile.full_name} imageUrl={profile.profile_picture} /><span><AdvisorIcon name="user" /></span></Link>
            <div className="at-identity"><h3>{profile.full_name}</h3><p>{profile.professional_title || "Academic Advisor"}</p><a href={`mailto:${profile.email}`}>{profile.email}</a></div>
            <Link className="at-outline" to="/advisor/profile">Edit Profile <AdvisorIcon name="chevron" /></Link>
          </div>
          <p className="at-account-note">Manage your photo, contact details, expertise, and qualifications in My Profile.</p>
        </section>
        <section className="am-card at-notifications" id="at-notifications" tabIndex={-1} aria-label="Notification preferences">
          <Heading icon="bell" title="Notification Preferences" description="Choose what updates you want to receive." />
          <UnavailablePreference icon="calendar" title="Appointment updates" description="New, confirmed, or cancelled bookings." />
          <UnavailablePreference icon="message" title="Student messages" description="Alerts when a student sends a message." />
          <UnavailablePreference icon="bell" title="Platform updates" description="Announcements and system updates." />
          <p className="at-note" id="at-notifications-note">Notification delivery preferences are currently unavailable. <Link to="/advisor/messages">Open Messages</Link> or <Link to="/advisor/appointments">view appointments</Link> to check updates.</p>
        </section>
        <section className="am-card at-privacy" id="at-privacy" tabIndex={-1} aria-label="Privacy and visibility">
          <Heading icon="eye" title="Privacy & Visibility" description="Review your profile and consultation availability." />
          <Link className="at-action-row" to="/advisor/profile"><span className="at-row-icon"><AdvisorIcon name="user" /></span><span><strong>Advisor profile</strong><small>Manage the professional details shown to students.</small></span><AdvisorIcon name="chevron" /></Link>
          <Link className="at-action-row" to="/advisor/schedule"><span className="at-row-icon"><AdvisorIcon name="calendar" /></span><span><strong>Consultation availability <span className={`at-badge ${profile.has_availability ? "positive" : ""}`}>{profile.has_availability ? "Published" : "Not published"}</span></strong><small>Set your bookable hours and time off in My Schedule.</small></span><AdvisorIcon name="chevron" /></Link>
          <p className="at-note">Save your consultation hours in My Schedule to update the availability students see.</p>
        </section>
        <section className="am-card at-security" id="at-security" tabIndex={-1} aria-label="Account security">
          <Heading icon="lock" title="Security" description="Keep your account safe and secure." />
          <div className="at-action-row at-unavailable"><span className="at-row-icon"><AdvisorIcon name="lock" /></span><span><strong>Change Password</strong><small>Password changes are currently unavailable.</small></span><span className="at-badge">Unavailable</span></div>
          <div className="at-action-row at-unavailable"><span className="at-row-icon"><AdvisorIcon name="shield" /></span><span><strong>Two-Factor Authentication</strong><small>Two-factor authentication is currently unavailable.</small></span><input className="at-switch" type="checkbox" role="switch" checked={false} disabled aria-label="Two-factor authentication unavailable" /></div>
          <details className="at-session"><summary><span className="at-row-icon"><AdvisorIcon name="user" /></span><span><strong>Current Session</strong><small>Review your signed-in account and sign out.</small></span><AdvisorIcon name="chevron" /></summary><div><p>Signed in as <strong>{profile.full_name}</strong><br />{profile.email}</p><button className="at-outline" type="button" onClick={() => { clearStoredUser(); navigate("/staff-login", { replace: true }); }}><AdvisorIcon name="logout" />Sign Out</button></div></details>
        </section>
      </div>
    </>}
  </div>;
}
