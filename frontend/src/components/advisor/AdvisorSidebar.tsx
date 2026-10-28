import { NavLink } from "react-router-dom";
import { getStoredUser } from "../../utils/authStorage";
import { getInitials } from "../../utils/userDisplay";

const advisorNavItems = [
  { label: "Dashboard", path: "/advisor/dashboard", icon: "⌂" },
  { label: "My Profile", path: "/advisor/profile", icon: "○" },
  { label: "My Schedule", path: "/advisor/schedule", icon: "□" },
  { label: "Appointments", path: "/advisor/appointments", icon: "▣" },
  { label: "Students", path: "/advisor/students", icon: "◉" },
  { label: "Pathway Quizzes", path: "/advisor/pathway-quizzes", icon: "▱" },
  { label: "Feedback & Performance", path: "/advisor/feedback", icon: "★" },
  { label: "Messages", path: "/advisor/messages", icon: "✉" },
  { label: "Settings", path: "/advisor/settings", icon: "⚙" },
];

function AdvisorSidebar() {
  const user = getStoredUser();

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
            <span className="advisor-nav-icon">{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="advisor-user-card">
        <div className="advisor-avatar small">{getInitials(user?.full_name || "Academic Advisor")}</div>
        <div>
          <strong>{user?.full_name || "Academic Advisor"}</strong>
          <span>Academic Advisor</span>
        </div>
      </div>
    </aside>
  );
}

export default AdvisorSidebar;
