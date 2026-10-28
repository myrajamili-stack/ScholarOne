import { NavLink } from "react-router-dom";
import { getStoredUser } from "../../utils/authStorage";
import { getInitials } from "../../utils/userDisplay";

const sponsorNavItems = [
  { label: "Dashboard", path: "/sponsor/dashboard", icon: "⌂" },
  { label: "My Scholarships", path: "/sponsor/scholarships", icon: "◇" },
  { label: "Add Scholarship", path: "/sponsor/add-scholarship", icon: "+" },
  { label: "Applications", path: "/sponsor/applications", icon: "▣" },
  { label: "Statistics", path: "/sponsor/statistics", icon: "▥" },
  { label: "Subscriptions", path: "/sponsor/subscriptions", icon: "□" },
  { label: "Appeals", path: "/sponsor/appeals", icon: "!" },
  { label: "Messages", path: "/sponsor/messages", icon: "✉" },
  { label: "Settings", path: "/sponsor/settings", icon: "⚙" },
];

function SponsorSidebar() {
  const user = getStoredUser();
  const displayName = user?.full_name || "Sponsorship Provider";

  return (
    <aside className="sponsor-sidebar">
      <div className="sponsor-brand">
        <NavLink to="/sponsor/dashboard" className="sponsor-logo">
          Scholar<span>One</span>
        </NavLink>
        <p>Your Pathway. Your Future.</p>
      </div>

      <p className="sponsor-role-label">Sponsorship Provider</p>

      <nav className="sponsor-nav" aria-label="Sponsorship provider navigation">
        {sponsorNavItems.map((item) => (
          <NavLink key={item.path} to={item.path} className={({ isActive }) => `sponsor-nav-link${isActive ? " active" : ""}`}>
            <span>{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="sponsor-user-card">
        <div className="sponsor-avatar small">{getInitials(displayName)}</div>
        <div>
          <strong>{displayName}</strong>
          <span>Provider Account</span>
        </div>
      </div>
    </aside>
  );
}

export default SponsorSidebar;
