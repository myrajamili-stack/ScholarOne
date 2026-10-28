import { useEffect, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import api from "../api/axios";
import type { StudentProfile } from "../types/student";
import { getStoredUser } from "../utils/authStorage";
import { getProfileCompletion, isProfileComplete, PROFILE_UPDATED_EVENT } from "../utils/profileCompletion";

const navItems: Array<[string, string, string]> = [
  ["⌂", "Dashboard", "/dashboard"],
  ["◇", "Scholarships", "/scholarships"],
  ["▱", "Pathway Quiz", "/pathway-quiz"],
  ["□", "Appointments", "/appointments"],
  ["▣", "Calendar", "/calendar"],
  ["♧", "Reminders", "/reminders"],
  ["✉", "Messages", "/messages"],
  ["○", "My Profile", "/profile"],
  ["⚙", "Settings", "/settings"],
];

function StudentSidebar() {
  const user = getStoredUser();
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const completion = getProfileCompletion(profile);

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

    function handleProfileUpdated(event: Event) {
      const updatedProfile = (event as CustomEvent<StudentProfile>).detail;
      setProfile(updatedProfile);
    }

    loadProfile();
    window.addEventListener(PROFILE_UPDATED_EVENT, handleProfileUpdated);

    return () => {
      window.removeEventListener(PROFILE_UPDATED_EVENT, handleProfileUpdated);
    };
  }, [user?.role, user?.user_id]);

  return (
    <aside className="sidebar">
      <NavLink className="logo" to="/dashboard">
        <span>
          Scholar<span>One</span>
        </span>
        <small>Your Pathway. Your Future.</small>
      </NavLink>

      <nav className="nav-list" aria-label="Student navigation">
        {navItems.map(([icon, label, path]) => (
          <NavLink className={({ isActive }) => (isActive ? "active" : "")} to={path} key={label}>
            <span>{icon}</span>
            {label}
          </NavLink>
        ))}
      </nav>

      {!isProfileComplete(profile) && (
        <section className="profile-progress">
          <div className="student-illustration" aria-hidden="true">
            <div className="head"></div>
            <div className="body"></div>
            <div className="book"></div>
          </div>
          <h3>Complete your profile</h3>
          <p>Get better scholarship matches.</p>
          <div className="progress-line">
            <span style={{ width: `${completion}%` }}></span>
          </div>
          <strong>{completion}%</strong>
          <Link className="profile-progress-link" to="/profile">
            Complete Now
          </Link>
        </section>
      )}
    </aside>
  );
}

export default StudentSidebar;
