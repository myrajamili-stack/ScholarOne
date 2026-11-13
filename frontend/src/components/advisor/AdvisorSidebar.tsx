import AdvisorIcon, { type AdvisorIconName } from "./AdvisorIcon";
import { NavLink } from "react-router-dom";
import { useStoredUser } from "../../utils/authStorage";
import ProfileAvatar from "./ProfileAvatar";

const advisorNavItems: Array<{ label: string; path: string; icon: AdvisorIconName }> = [
  { label: "Dashboard", path: "/advisor/dashboard", icon: "home" },
  { label: "My Profile", path: "/advisor/profile", icon: "user" },
  { label: "My Schedule", path: "/advisor/schedule", icon: "calendar" },
  { label: "Appointments", path: "/advisor/appointments", icon: "appointment" },
  { label: "Students", path: "/advisor/students", icon: "users" },
  { label: "Pathway Quizzes", path: "/advisor/pathway-quizzes", icon: "layers" },
  { label: "Feedback & Performance", path: "/advisor/feedback", icon: "chart" },
  { label: "Messages", path: "/advisor/messages", icon: "message" },
  { label: "Settings", path: "/advisor/settings", icon: "settings" },
];

function AdvisorSidebar({ unreadMessages = 0 }: { unreadMessages?: number }) {
  const user = useStoredUser();

  return (
    <aside className="advisor-sidebar">
      <div className="advisor-brand">
        <NavLink to="/advisor/dashboard" className="advisor-logo">
          Scholar<span>One</span>
        </NavLink>
        <p>Your Pathway. Your Future.</p>
      </div>

      <p className="advisor-role-label">Academic Advisor</p>

      <nav className="advisor-nav" aria-label="Academic advisor navigation">
        {advisorNavItems.map((item) => (
          <NavLink key={item.path} to={item.path} className={({ isActive }) => `advisor-nav-link${isActive ? " active" : ""}`}>
            <span className="advisor-nav-icon"><AdvisorIcon name={item.icon} /></span>
            {item.label}
            {item.path === "/advisor/messages" && unreadMessages > 0 && <span className="advisor-nav-unread" aria-label={`${unreadMessages} unread messages`}>{unreadMessages > 99 ? "99+" : unreadMessages}</span>}
          </NavLink>
        ))}
      </nav>

      <NavLink to="/advisor/profile" className="advisor-user-card">
        <ProfileAvatar className="advisor-avatar small" name={user?.full_name || "Academic Advisor"} imageUrl={user?.profile_picture}/>
        <div>
          <strong>{user?.full_name || "Academic Advisor"}</strong>
          <span>Academic Advisor</span>
        </div>
        <AdvisorIcon name="chevron" />
      </NavLink>
    </aside>
  );
}

export default AdvisorSidebar;
