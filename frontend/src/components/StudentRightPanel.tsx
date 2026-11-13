import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import api from "../api/axios";
import type { StudentProfile } from "../types/student";
import { getStoredUser } from "../utils/authStorage";
import { formatEducationLevel, getInitials } from "../utils/userDisplay";
import { useScholarshipReminders } from "../context/ScholarshipRemindersContext";

function StudentRightPanel() {
  const user = getStoredUser();
  const { reminders, dueReminders, isLoading: remindersLoading, error: remindersError } = useScholarshipReminders();
  const upcomingReminders = reminders.filter((reminder) => reminder.days_until >= 0).slice(0, 3);
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
        {remindersLoading ? <p className="dashboard-message">Loading reminders...</p>
          : remindersError ? <p className="dashboard-message error">{remindersError}</p>
            : upcomingReminders.length ? upcomingReminders.map((reminder) => <div className="student-reminder-preview" key={reminder.scholarship_id}>
              <strong>{reminder.title}</strong><span>{reminder.days_until === 0 ? "Due today" : `${reminder.days_until} days left`}</span>
            </div>) : <p className="dashboard-message">Click the bell beside a scholarship to track its deadline.</p>}
      </section>

      <section className="notification-card">
        <div className="side-heading">
          <h3>Latest Notifications</h3>
          <Link to="/calendar?section=reminders">View All</Link>
        </div>
        {remindersLoading ? <p className="dashboard-message">Loading notifications...</p>
          : remindersError ? <p className="dashboard-message error">{remindersError}</p>
          : dueReminders.length ? dueReminders.slice(0, 3).map((reminder) => <div className="student-reminder-preview" key={reminder.scholarship_id}>
          <strong>{reminder.title}</strong><span>{reminder.days_until === 0 ? "Deadline is today" : `Deadline in ${reminder.days_until} days`}</span>
        </div>) : <p className="dashboard-message">No scholarship deadlines within 3 days.</p>}
      </section>
    </aside>
  );
}

export default StudentRightPanel;
