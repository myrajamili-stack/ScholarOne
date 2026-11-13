import { useEffect, useState } from "react";
import api from "../../api/axios";
import { NavLink } from "react-router-dom";
import { useStoredUser } from "../../utils/authStorage";
import { getInitials } from "../../utils/userDisplay";
import Icon from "../advisor/AdvisorIcon";

const adminNavItems = [
  { label: "Dashboard", path: "/admin/dashboard", icon: "home" },
  { label: "User Management", path: "/admin/users", icon: "users" },
  { label: "Scholarships", path: "/admin/scholarships", icon: "layers" },
  { label: "Applications", path: "/admin/applications", icon: "quiz" },
  { label: "Academic Pathways", path: "/admin/pathways", icon: "graduation" },
  { label: "Subscription Management", path: "/admin/subscriptions", icon: "layers" },
  { label: "Reports & Statistics", path: "/admin/reports", icon: "chart" },
  { label: "System Settings", path: "/admin/settings", icon: "settings" },
  { label: "Audit Logs", path: "/admin/audit-logs", icon: "clock" },
] as const;

function AdminSidebar() {
  const user = useStoredUser();
  const [brand, setBrand] = useState({platform_name: "ScholarOne", platform_tagline: "Your Pathway. Your Future."});
  useEffect(() => {
    let active = true;
    api.get("/admin/settings").then(response => { if (active && response.data.general) setBrand(response.data.general); }).catch(() => {});
    function update(event: Event) {setBrand((event as CustomEvent).detail);}
    window.addEventListener("scholarone-platform-updated", update);
    return () => {active = false; window.removeEventListener("scholarone-platform-updated", update);};
  }, []);
  const displayName = user?.full_name || "Administrator";

  return (
    <aside className="admin-sidebar">
      <div className="admin-brand">
        <NavLink to="/admin/dashboard" className="admin-logo">
          <span className="adh-brand-cap"><Icon name="graduation" /></span>
          {brand.platform_name === "ScholarOne" ? <>Scholar<span>One</span></> : brand.platform_name}
        </NavLink>
        <p>{brand.platform_tagline}</p>
      </div>

      <p className="admin-role-label">Administrator</p>

      <nav className="admin-nav" aria-label="Administrator navigation">
        {adminNavItems.map((item) => (
          <NavLink key={item.path} to={item.path} className={({ isActive }) => `admin-nav-link${isActive ? " active" : ""}`}>
            <span><Icon name={item.icon} /></span>
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
