import { useEffect, useState, type FormEvent } from "react";
import api from "../../api/axios";
import { getApiErrorMessage } from "../../utils/apiError";
import { getStoredUser } from "../../utils/authStorage";
import { getInitials } from "../../utils/userDisplay";

type AdvisorProfile = {
  advisor_id: number;
  full_name: string;
  email: string;
  phone_number?: string | null;
  status?: string | null;
  specialization?: string | null;
};

function AdvisorSettingsPage() {
  const user = getStoredUser();
  const [profile, setProfile] = useState<AdvisorProfile | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [bookingAlerts, setBookingAlerts] = useState(true);
  const [messageAlerts, setMessageAlerts] = useState(true);
  const [bookingWindow, setBookingWindow] = useState("14");
  const [sessionDuration, setSessionDuration] = useState("30");
  const [profileVisibility, setProfileVisibility] = useState("students");
  const [autoConfirm, setAutoConfirm] = useState(false);

  useEffect(() => {
    async function loadProfile() {
      if (!user?.user_id) {
        setIsLoading(false);
        return;
      }

      try {
        const response = await api.get<AdvisorProfile>(`/advisors/${user.user_id}/profile`);
        setProfile(response.data);
      } catch (error) {
        setError(getApiErrorMessage(error, "Unable to load advisor account settings."));
      } finally {
        setIsLoading(false);
      }
    }

    loadProfile();
  }, [user?.user_id]);

  function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("Settings saved for this browser session.");
  }

  if (isLoading) {
    return (
      <div className="advisor-page">
        <section className="advisor-empty-state">Loading advisor settings...</section>
      </div>
    );
  }

  if (error && !profile) {
    return (
      <div className="advisor-page">
        <section className="advisor-empty-state">{error}</section>
      </div>
    );
  }

  return (
    <div className="advisor-page">
      <section className="advisor-settings-hero">
        <div>
          <p className="advisor-kicker">Preferences</p>
          <h2>Settings</h2>
          <span>Manage advisor notifications, booking rules, profile visibility, and account security.</span>
        </div>
        <div className="advisor-settings-account">
          <div className="advisor-avatar">{getInitials(profile?.full_name || user?.full_name || "Advisor")}</div>
          <div>
            <strong>{profile?.full_name || user?.full_name || "Academic Advisor"}</strong>
            <span>{profile?.email || user?.email || "advisor account"}</span>
          </div>
        </div>
      </section>

      <form className="advisor-settings-layout" onSubmit={handleSave}>
        <section className="advisor-panel advisor-settings-panel">
          <div className="advisor-panel-header">
            <div>
              <p className="advisor-kicker">Notifications</p>
              <h2>Alert preferences</h2>
            </div>
          </div>

          <div className="advisor-settings-list">
            <label className="advisor-setting-row">
              <span>
                <strong>Email notifications</strong>
                <small>Receive important advisor updates through email.</small>
              </span>
              <input checked={emailNotifications} onChange={(event) => setEmailNotifications(event.target.checked)} type="checkbox" />
            </label>
            <label className="advisor-setting-row">
              <span>
                <strong>Booking alerts</strong>
                <small>Notify me when a student makes or changes an appointment request.</small>
              </span>
              <input checked={bookingAlerts} onChange={(event) => setBookingAlerts(event.target.checked)} type="checkbox" />
            </label>
            <label className="advisor-setting-row">
              <span>
                <strong>Student message alerts</strong>
                <small>Show an alert when a student sends a new message.</small>
              </span>
              <input checked={messageAlerts} onChange={(event) => setMessageAlerts(event.target.checked)} type="checkbox" />
            </label>
          </div>
        </section>

        <section className="advisor-panel advisor-settings-panel">
          <div className="advisor-panel-header">
            <div>
              <p className="advisor-kicker">Booking Rules</p>
              <h2>Consultation settings</h2>
            </div>
          </div>

          <div className="advisor-form-grid">
            <label>
              Booking window
              <select value={bookingWindow} onChange={(event) => setBookingWindow(event.target.value)}>
                <option value="7">7 days ahead</option>
                <option value="14">14 days ahead</option>
                <option value="30">30 days ahead</option>
              </select>
            </label>

            <label>
              Default session duration
              <select value={sessionDuration} onChange={(event) => setSessionDuration(event.target.value)}>
                <option value="30">30 minutes</option>
                <option value="45">45 minutes</option>
                <option value="60">60 minutes</option>
              </select>
            </label>

            <label className="advisor-setting-row full">
              <span>
                <strong>Auto-confirm appointment requests</strong>
                <small>Automatically confirm requests when the chosen slot is available.</small>
              </span>
              <input checked={autoConfirm} onChange={(event) => setAutoConfirm(event.target.checked)} type="checkbox" />
            </label>
          </div>
        </section>

        <section className="advisor-panel advisor-settings-panel">
          <div className="advisor-panel-header">
            <div>
              <p className="advisor-kicker">Privacy</p>
              <h2>Profile visibility</h2>
            </div>
          </div>

          <div className="advisor-visibility-options">
            <label className={profileVisibility === "students" ? "selected" : ""}>
              <input
                checked={profileVisibility === "students"}
                name="profile_visibility"
                onChange={() => setProfileVisibility("students")}
                type="radio"
              />
              <span>
                <strong>Students only</strong>
                <small>Visible to signed-in students who need academic guidance.</small>
              </span>
            </label>
            <label className={profileVisibility === "hidden" ? "selected" : ""}>
              <input
                checked={profileVisibility === "hidden"}
                name="profile_visibility"
                onChange={() => setProfileVisibility("hidden")}
                type="radio"
              />
              <span>
                <strong>Hidden from search</strong>
                <small>Keep profile private while you update your schedule or details.</small>
              </span>
            </label>
          </div>
        </section>

        <section className="advisor-panel advisor-settings-panel">
          <div className="advisor-panel-header">
            <div>
              <p className="advisor-kicker">Security</p>
              <h2>Account access</h2>
            </div>
          </div>

          <div className="advisor-security-list">
            <div>
              <span>
                <strong>Password</strong>
                <small>Change password support can be connected when authentication security is expanded.</small>
              </span>
              <button className="advisor-secondary-button" type="button">
                Change Password
              </button>
            </div>
            <div>
              <span>
                <strong>Account status</strong>
                <small>Your advisor account is currently {profile?.status || "active"}.</small>
              </span>
              <span className="advisor-status confirmed">{profile?.status || "active"}</span>
            </div>
          </div>
        </section>

        {(error || success) && <p className={error ? "advisor-form-error" : "advisor-form-success"}>{error || success}</p>}

        <div className="advisor-settings-actions">
          <button className="advisor-primary-button" type="submit">
            Save Settings
          </button>
        </div>
      </form>
    </div>
  );
}

export default AdvisorSettingsPage;
