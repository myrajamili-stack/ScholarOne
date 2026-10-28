import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import api from "../api/axios";
import type { StudentProfile } from "../types/student";
import { getStoredUser } from "../utils/authStorage";
import { formatEducationLevel, getInitials } from "../utils/userDisplay";

function StudentRightPanel() {
  const user = getStoredUser();
  const [profile, setProfile] = useState<StudentProfile | null>(null);

  useEffect(() => {
    async function loadProfile() {
      if (!user?.user_id || user.role !== "student") {
        return;
      }

      try {
        const response = await api.get<StudentProfile>(`/students/${user.user_id}/profile`);
        setProfile(response.data);
      } catch {
        setProfile(null);
      }
    }

    loadProfile();
  }, [user?.role, user?.user_id]);

  const displayUser = profile || user;

  return (
    <aside className="right-content">
      <section className="profile-card">
        <Link className="edit-button" to="/profile" aria-label="Edit profile">
          ✎
        </Link>
        <div className="profile-top">
          <div className="large-avatar">{getInitials(displayUser?.full_name)}</div>
          <div>
            <h2>{displayUser?.full_name || "Student"}</h2>
            <p>{displayUser?.email || "No email available"}</p>
            <span>{formatEducationLevel(profile?.education_level)}</span>
          </div>
        </div>
        <div className="profile-stats">
          <div>
            <small>Current CGPA</small>
            <strong>{profile?.cgpa ? `${profile.cgpa} / 4.00` : "Not set"}</strong>
          </div>
          <div>
            <small>Field of Study</small>
            <strong>{profile?.field_of_study || "Not set"}</strong>
          </div>
        </div>
      </section>

      <section className="deadline-card">
        <div className="side-heading">
          <h3>Upcoming Deadlines</h3>
          <Link to="/calendar">View Calendar</Link>
        </div>
        <p className="dashboard-message">
          No upcoming scholarship deadlines yet. Deadlines will appear here after approved scholarship listings are
          available.
        </p>
      </section>

      <section className="notification-card">
        <div className="side-heading">
          <h3>Latest Notifications</h3>
          <Link to="/reminders">View All</Link>
        </div>
        <p className="dashboard-message">No notifications yet.</p>
      </section>
    </aside>
  );
}

export default StudentRightPanel;
