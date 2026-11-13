import StudentPageArtwork from "../../components/student/StudentPageArtwork";
import { Link, useNavigate } from "react-router-dom";
import Icon, { type AdvisorIconName } from "../../components/advisor/AdvisorIcon";
import { clearStoredUser } from "../../utils/authStorage";
import "../../styles/student-settings.css";

function Heading({ icon, title, description }: { icon: AdvisorIconName; title: string; description: string }) {
  return <header className="st-heading"><Icon name={icon} /><div><h2>{title}</h2><p>{description}</p></div></header>;
}
function Preference({ icon, title, description, note }: { icon: AdvisorIconName; title: string; description: string; note: string }) {
  return <div className="st-row"><span className="st-icon"><Icon name={icon} /></span><div className="st-copy"><strong>{title}</strong><p>{description}</p></div><input className="st-switch" type="checkbox" role="switch" checked={false} disabled aria-label={`${title} unavailable`} aria-describedby={note} /></div>;
}
export default function SettingsPage() {
  const navigate = useNavigate();
  return <section className="student-settings">
    <header className="st-hero"><div className="st-hero-copy"><span className="st-eyebrow"><Icon name="settings" />Account Settings</span><h1>Settings <span aria-hidden="true">✦</span></h1><p>Manage your notifications, account security, and privacy preferences.</p></div><StudentPageArtwork name="settings" className="st-hero-art" /></header>
    <div className="st-layout">
      <div className="st-column">
        <section className="st-card" aria-label="Notifications">
          <Heading icon="bell" title="Notifications" description="Review your updates and scholarship reminders." />
          <div className="st-rows">
            <Link className="st-row st-action" to="/calendar?section=reminders"><span className="st-icon"><Icon name="graduation" /></span><span className="st-copy"><strong>Scholarship deadline alerts</strong><span>Manage reminders for the scholarships you choose to follow.</span></span><Icon name="chevron" /></Link>
            <Preference icon="calendar" title="Advisor appointment alerts" description="Notifications about your consultation bookings." note="st-notifications-note" />
            <Preference icon="flag" title="Academic pathway updates" description="Updates about quiz results and recommended pathways." note="st-notifications-note" />
          </div>
          <p className="st-note" id="st-notifications-note">Appointment and pathway notification preferences are not available yet. Check <Link to="/appointments">Appointments</Link> and <Link to="/pathway-quiz">Pathway Quiz</Link> for your latest updates.</p>
        </section>
        <section className="st-card" aria-label="Privacy">
          <Heading icon="shield" title="Privacy" description="Review how your profile and academic information are managed." />
          <div className="st-rows">
            <div className="st-row st-visibility"><span className="st-icon"><Icon name="users" /></span><div className="st-copy"><label htmlFor="st-visibility">Profile visibility</label><p>Profile visibility preferences are not available yet.</p></div><select id="st-visibility" disabled value="unavailable" aria-describedby="st-privacy-note"><option value="unavailable">Unavailable</option></select></div>
            <Preference icon="eye" title="Advisor academic profile access" description="Manage which academic details you share with advisors." note="st-privacy-note" />
          </div>
          <p className="st-note" id="st-privacy-note">Privacy controls are not available yet. You can review and update your academic details in <Link to="/profile">My Profile</Link>.</p>
        </section>
      </div>
      <div className="st-column">
        <section className="st-card" aria-label="Account security">
          <Heading icon="lock" title="Account Security" description="Keep your account safe and secure." />
          <div className="st-rows">
            <div className="st-row"><span className="st-icon"><Icon name="lock" /></span><div className="st-copy"><strong>Password</strong><p>Password changes are not available yet.</p></div><span className="st-badge">Unavailable</span></div>
            <Preference icon="shield" title="Two-Factor Authentication" description="An extra layer of security for your account." note="st-security-note" />
          </div>
          <p className="st-note" id="st-security-note">Two-factor authentication is not available yet.</p>
        </section>
        <section className="st-card" aria-label="Account">
          <Heading icon="user" title="Account" description="Manage your profile and current session." />
          <div className="st-rows">
            <Link className="st-row st-action" to="/profile"><span className="st-icon"><Icon name="user" /></span><span className="st-copy"><strong>Edit Profile</strong><span>Update your personal and academic details.</span></span><Icon name="chevron" /></Link>
            <button className="st-row st-action st-logout" type="button" onClick={() => { clearStoredUser(); navigate("/login", {replace:true}); }}><span className="st-icon"><Icon name="logout" /></span><span className="st-copy"><strong>Log Out</strong><span>Sign out from your ScholarOne account.</span></span><Icon name="chevron" /></button>
          </div>
        </section>
      </div>
    </div>
  </section>;
}
