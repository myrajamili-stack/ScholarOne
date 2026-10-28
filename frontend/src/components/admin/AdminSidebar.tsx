import { NavLink } from "react-router-dom";
import { getStoredUser } from "../../utils/authStorage";
import { getInitials } from "../../utils/userDisplay";

const adminNavItems = [
  { label: "Dashboard", path: "/admin/dashboard", icon: "⌂" },
  { label: "User Management", path: "/admin/users", icon: "♙" },
  { label: "Scholarships", path: "/admin/scholarships", icon: "◇" },
  { label: "Applications", path: "/admin/applications", icon: "▣" },
  { label: "Academic Pathways", path: "/admin/pathways", icon: "▱" },
  { label: "Subscriptions", path: "/admin/subscriptions", icon: "□" },
  { label: "Reports & Statistics", path: "/admin/reports", icon: "▥" },
  { label: "System Settings", path: "/admin/settings", icon: "⚙" },
  { label: "Audit Logs", path: "/admin/audit-logs", icon: "◷" },
];

function AdminSidebar() {
  const user = getStoredUser();
  const displayName = user?.full_name || "Administrator";

  return (
    <aside className="admin-sidebar">
      <div className="admin-brand">
        <NavLink to="/admin/dashboard" className="admin-logo">
          Scholar<span>One</span>
        </NavLink>
        <p>Your Pathway. Your Future.</p>
      </div>

      <p className="admin-role-label">Administrator</p>

      <nav className="admin-nav" aria-label="Administrator navigation">
        {adminNavItems.map((item) => (
          <NavLink key={item.path} to={item.path} className={({ isActive }) => `admin-nav-link${isActive ? " active" : ""}`}>
            <span>{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="admin-user-card">
        <div className="admin-avatar small">{getInitials(displayName)}</div>
        <div>
          <strong>{displayName}</strong>
          <span>System Administrator</span>
        </div>
      </div>
    </aside>
  );
}

export default AdminSidebar;
