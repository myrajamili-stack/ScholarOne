import StudentPageArtwork from "./student/StudentPageArtwork";
import { useEffect, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import Icon, { type AdvisorIconName } from "./advisor/AdvisorIcon";
import AppointmentArtwork from "./student/AppointmentArtwork";
import PathwayArtwork from "./student/PathwayArtwork";
import api from "../api/axios";
import type { StudentProfile } from "../types/student";
import { getStoredUser } from "../utils/authStorage";
import { getProfileCompletion, isProfileComplete, PROFILE_UPDATED_EVENT } from "../utils/profileCompletion";

const navItems: Array<[AdvisorIconName, string, string]> = [
  ["home", "Dashboard", "/dashboard"],
  ["layers", "Scholarships", "/scholarships"],
  ["appointment", "Pathway Quiz", "/pathway-quiz"],
  ["calendar", "Appointments", "/appointments"],
  ["calendar", "Calendar & Reminders", "/calendar"],
  ["message", "Messages", "/messages"],
  ["user", "My Profile", "/profile"],
  ["settings", "Settings", "/settings"],
];

function StudentSidebar() {
  const user = getStoredUser();
  const pathname = useLocation().pathname.replace(/\/$/, "");
  const isDashboard = pathname === "/dashboard";
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
            <span><Icon name={icon} /></span>
            {label}
          </NavLink>
        ))}
      </nav>

      {pathname === "/scholarships" && <img className="ss-sidebar-books" src="/images/student-scholarships-hero.png" alt="" />}
      {isDashboard && <img className="ss-sidebar-books" src="/images/student-dashboard-books.png" alt="" />}

      {pathname === "/appointments" && <AppointmentArtwork name="calendar" className="sa-sidebar-art" />}
      {pathname === "/calendar" && <StudentPageArtwork name="calendar" className="sa-sidebar-art" />}

      {isProfileComplete(profile) && <>
        {pathname === "/pathway-quiz" && <StudentPageArtwork name="pathway" className="student-sidebar-footer-art" />}
        {pathname === "/messages" && <img className="student-sidebar-footer-art" src="/images/student-messages-hero.png" alt="" />}
        {pathname === "/profile" && <StudentPageArtwork name="profile" className="student-sidebar-footer-art" />}
        {pathname === "/settings" && <StudentPageArtwork name="settings" className="student-sidebar-footer-art" />}
      </>}

      {!isDashboard && !["/appointments", "/calendar", "/scholarships"].includes(pathname) && !isProfileComplete(profile) && (
        <section className="profile-progress">
          {pathname === "/pathway-quiz" ? <PathwayArtwork name="mountain" className="spq-progress-art" /> : <div className="student-illustration" aria-hidden="true">
            <div className="head"></div>
            <div className="body"></div>
            <div className="book"></div>
          </div>}
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
