import { Link } from "react-router-dom";
import { getStoredUser } from "../utils/authStorage";

function SettingsPage() {
  const user = getStoredUser();

  return (
    <section className="settings-page">
      <header className="settings-hero">
        <div>
          <p className="module-eyebrow">Account Preferences</p>
          <h1>Settings</h1>
          <span>Manage notification preferences, account security, and student privacy settings.</span>
        </div>
        <button type="button" disabled>
          Save Settings
        </button>
      </header>

      <section className="settings-layout">
        <article className="settings-main-card">
          <div className="settings-profile-row">
            <div className="settings-avatar">
              {user?.full_name
                ?.split(" ")
                .slice(0, 2)
                .map((part) => part[0])
                .join("")
                .toUpperCase() || "ST"}
            </div>
            <div>
              <h2>{user?.full_name || "Student"}</h2>
              <p>{user?.email || "No email available"}</p>
            </div>
            <Link to="/profile">Edit Profile</Link>
          </div>

          <section className="settings-group">
            <h3>Notifications</h3>
            <label className="settings-toggle-row">
              <div>
                <strong>Scholarship deadline alerts</strong>
                <span>Show reminders for provider-added scholarship deadlines.</span>
              </div>
              <input type="checkbox" defaultChecked />
            </label>
            <label className="settings-toggle-row">
              <div>
                <strong>Advisor appointment alerts</strong>
                <span>Notify me about upcoming consultation bookings.</span>
              </div>
              <input type="checkbox" defaultChecked />
            </label>
            <label className="settings-toggle-row">
              <div>
                <strong>Academic pathway updates</strong>
                <span>Show updates related to quiz results and pathway recommendations.</span>
              </div>
              <input type="checkbox" defaultChecked />
            </label>
          </section>

          <section className="settings-group">
            <h3>Privacy</h3>
            <label className="settings-select-row">
              <span>Profile visibility</span>
              <select defaultValue="student_only">
                <option value="student_only">Student only</option>
                <option value="advisor_only">Visible to academic advisors</option>
                <option value="application_only">Visible during scholarship applications</option>
              </select>
            </label>
            <label className="settings-toggle-row">
              <div>
                <strong>Allow advisors to view academic profile</strong>
                <span>Used when booking consultation sessions.</span>
              </div>
              <input type="checkbox" defaultChecked />
            </label>
          </section>
        </article>

        <aside className="settings-side-card">
          <h2>Account Security</h2>
          <div className="security-status">
            <span>Password</span>
            <strong>Managed by ScholarOne</strong>
          </div>
          <button type="button" disabled>
            Change Password
          </button>
          <p>Password change and persistent settings will be connected after the account settings backend is added.</p>
        </aside>
      </section>
    </section>
  );
}

export default SettingsPage;
