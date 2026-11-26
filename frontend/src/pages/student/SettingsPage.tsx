import StudentPageArtwork from "../../components/student/StudentPageArtwork";
import { Link, useNavigate } from "react-router-dom";
import { useEffect, useState, type FormEvent } from "react";
import { isAxiosError } from "axios";
import api from "../../api/axios";
import Icon, { type AdvisorIconName } from "../../components/advisor/AdvisorIcon";
import { clearStoredUser } from "../../utils/authStorage";
import "../../styles/student-settings.css";

function Heading({ icon, title, description }: { icon: AdvisorIconName; title: string; description: string }) {
  return <header className="st-heading"><Icon name={icon} /><div><h2>{title}</h2><p>{description}</p></div></header>;
}
function Preference({ icon, title, description, checked, disabled, onChange }: {
  icon: AdvisorIconName; title: string; description: string; checked?: boolean;
  disabled?: boolean; onChange?: (value: boolean) => void;
}) {
  return <div className="st-row"><span className="st-icon"><Icon name={icon} /></span><div className="st-copy"><strong>{title}</strong><p>{description}</p></div>
    {checked === undefined ? <span className="st-badge">Unavailable</span> :
      <input className="st-switch" type="checkbox" role="switch" checked={checked} disabled={disabled}
        aria-label={title} onChange={event => onChange?.(event.target.checked)} />}
  </div>;
}

type NotificationPreferences = { appointment_alerts: boolean; pathway_updates: boolean };
const notificationSettingsUrl = "/students/settings/notifications";
const emptyPasswords = { current_password: "", new_password: "", confirm_password: "" };
const passwordFields = [
  { key: "current_password", label: "Current password", autocomplete: "current-password" },
  { key: "new_password", label: "New password", autocomplete: "new-password" },
  { key: "confirm_password", label: "Confirm new password", autocomplete: "new-password" },
] as const;

function settingsError(error: unknown, fallback: string) {
  if (isAxiosError(error) && typeof error.response?.data?.error === "string") {
    return error.response.data.error;
  }
  return fallback;
}

export default function SettingsPage() {
  const navigate = useNavigate();
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  const [reloading, setReloading] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notificationError, setNotificationError] = useState("");
  const [notificationStatus, setNotificationStatus] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [passwords, setPasswords] = useState(emptyPasswords);
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordStatus, setPasswordStatus] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    api.get<{ preferences: NotificationPreferences }>(notificationSettingsUrl, { signal: controller.signal })
      .then(({ data }) => {
        if (!controller.signal.aborted) setPreferences(data.preferences);
      })
      .catch(error => {
        if (!controller.signal.aborted) setNotificationError(settingsError(error, "Unable to load notification preferences."));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [reloading]);

  function retryPreferences() {
    setLoading(true);
    setNotificationError("");
    setReloading(value => value + 1);
  }

  async function savePreference(key: keyof NotificationPreferences, value: boolean) {
    setSaving(true);
    setNotificationError("");
    setNotificationStatus("");
    try {
      const { data } = await api.patch<{ preferences: NotificationPreferences }>(notificationSettingsUrl, { [key]: value });
      setPreferences(data.preferences);
      setNotificationStatus("Notification preference saved.");
    } catch (error) {
      setNotificationError(settingsError(error, "Unable to save your notification preference. Please try again."));
    } finally {
      setSaving(false);
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordError("");
    setPasswordStatus("");
    if (passwords.new_password !== passwords.confirm_password) {
      setPasswordError("New passwords do not match.");
      return;
    }
    setChangingPassword(true);
    try {
      await api.post("/auth/student/password", passwords);
      setPasswords(emptyPasswords);
      setShowPassword(false);
      setPasswordStatus("Password changed successfully.");
    } catch (error) {
      setPasswordError(settingsError(error, "Unable to change your password. Please try again."));
    } finally {
      setChangingPassword(false);
    }
  }

  return <section className="student-settings">
    <header className="st-hero"><div className="st-hero-copy"><span className="st-eyebrow"><Icon name="settings" />Account Settings</span><h1>Settings <span aria-hidden="true">✦</span></h1><p>Manage your notifications, account security, and privacy preferences.</p></div><StudentPageArtwork name="settings" className="st-hero-art" /></header>
    <div className="st-layout">
      <div className="st-column">
        <section className="st-card" aria-label="Notifications">
          <Heading icon="bell" title="Notifications" description="Review your updates and scholarship reminders." />
          <div className="st-rows">
            <Link className="st-row st-action" to="/calendar?section=reminders"><span className="st-icon"><Icon name="graduation" /></span><span className="st-copy"><strong>Scholarship deadline alerts</strong><span>Manage reminders for the scholarships you choose to follow.</span></span><Icon name="chevron" /></Link>
            <Preference icon="calendar" title="Advisor appointment alerts" description="Notifications about your consultation bookings."
              checked={preferences?.appointment_alerts} disabled={loading || saving} onChange={value => void savePreference("appointment_alerts", value)} />
            <Preference icon="flag" title="Academic pathway updates" description="Notifications when your quiz results and related pathways are ready."
              checked={preferences?.pathway_updates} disabled={loading || saving} onChange={value => void savePreference("pathway_updates", value)} />
          </div>
          {(loading || saving || notificationStatus) && <p className="st-note" role="status">
            {loading ? "Loading notification preferences…" : saving ? "Saving preference…" : notificationStatus}
          </p>}
          {notificationError && <p className="st-note st-error" role="alert">{notificationError}</p>}
          {notificationError && !preferences && <button type="button" className="st-button" onClick={retryPreferences}>Retry</button>}
          <p className="st-note">Check <Link to="/appointments">Appointments</Link> and <Link to="/pathway-quiz">Pathway Quiz</Link> for your latest updates.</p>
        </section>
        <section className="st-card" aria-label="Privacy">
          <Heading icon="shield" title="Privacy" description="Review how your profile and academic information are managed." />
          <div className="st-rows">
            <div className="st-row st-visibility"><span className="st-icon"><Icon name="users" /></span><div className="st-copy"><label htmlFor="st-visibility">Profile visibility</label><p>Profile visibility preferences are not available yet.</p></div><select id="st-visibility" disabled value="unavailable" aria-describedby="st-privacy-note"><option value="unavailable">Unavailable</option></select></div>
            <Preference icon="eye" title="Advisor academic profile access" description="Advisors can see academic details for students they have guided through consultations." />
          </div>
          <p className="st-note" id="st-privacy-note">Privacy controls are not available yet. You can review and update your academic details in <Link to="/profile">My Profile</Link>.</p>
        </section>
      </div>
      <div className="st-column">
        <section className="st-card" aria-label="Account security">
          <Heading icon="lock" title="Account Security" description="Keep your account safe and secure." />
          <div className="st-rows">
            <button className="st-row st-action" type="button" aria-expanded={showPassword} disabled={changingPassword}
              onClick={() => { setShowPassword(value => !value); setPasswords(emptyPasswords); setPasswordError(""); setPasswordStatus(""); }}>
              <span className="st-icon"><Icon name="lock" /></span><span className="st-copy"><strong>Change Password</strong><span>Update your account password.</span></span><Icon name="chevron" />
            </button>
            {showPassword && <form className="st-password-form" onSubmit={changePassword}>
              {passwordFields.map(({ key, label, autocomplete }) => <label key={key}>
                {label}
                <input type="password" required minLength={key === "current_password" ? 1 : 8} maxLength={4096}
                  autoComplete={autocomplete} disabled={changingPassword} value={passwords[key]}
                  onChange={event => setPasswords(previous => ({ ...previous, [key]: event.target.value }))} />
              </label>)}
              <button className="st-button" disabled={changingPassword}>{changingPassword ? "Changing password…" : "Save password"}</button>
              {passwordError && <p className="st-note st-error" role="alert">{passwordError}</p>}
            </form>}
            <Preference icon="shield" title="Two-Factor Authentication" description="An extra layer of security for your account." />
          </div>
          {passwordStatus && <p className="st-note" role="status">{passwordStatus}</p>}
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
