import { Link, useLocation, useNavigate } from "react-router-dom";
import Icon from "../advisor/AdvisorIcon";
import { clearStoredUser, useStoredUser } from "../../utils/authStorage";
import { getInitials } from "../../utils/userDisplay";

function AdminTopbar() {
  const navigate = useNavigate();
  const pathname = useLocation().pathname;
  const isUserManagement = pathname === "/admin/users";
  const isScholarships = pathname === "/admin/scholarships";
  const isSubscriptions = pathname === "/admin/subscriptions";
  const isPathways = pathname === "/admin/pathways";
  const isAuditLogs = pathname === "/admin/audit-logs";
  const isSettings = pathname === "/admin/settings";
  const isReports = pathname === "/admin/reports";
  const isApplications = pathname === "/admin/applications";
  const user = useStoredUser();
  const displayName = user?.full_name || "Administrator";

  function handleLogout() {
    clearStoredUser();
    navigate("/login", { replace: true });
  }

  return (
    <header className="admin-topbar">
      <div>
        <h1>{isAuditLogs ? "Audit Logs" : isSettings ? "System Settings" : isReports ? "Reports & Statistics" : isUserManagement ? "User Management" : isScholarships ? "Manage Scholarship Listings" : isApplications ? "Applications" : isPathways ? "Academic Pathways" : isSubscriptions ? "Subscription Management" : "Administrator Dashboard"} <span className="adh-sparkle" aria-hidden="true">✦</span></h1>
        <p>{isAuditLogs ? "Review system activities, user actions, and administrative changes." : isSettings ? "Manage platform information, your admin account, and notification preferences." : isReports ? "Monitor platform performance, analyse activity, and generate reports." : isUserManagement ? "Review, manage, and maintain user accounts across ScholarOne." : isScholarships ? "Review, approve, and manage scholarship listings submitted by sponsorship providers." : isApplications ? "Monitor student scholarship applications across all sponsorship providers." : isPathways ? "Monitor academic pathways and advisor-created quizzes across the platform." : isSubscriptions ? "Manage provider subscriptions, monitor usage, and track renewal dates." : "Monitor platform activity, manage approvals, and review system records."}</p>
      </div>

      <div className="admin-top-actions">
        <Link className="admin-icon-button" to="/admin/dashboard#admin-pending" aria-label="View pending approvals"><Icon name="bell" /></Link>
        <div className="admin-avatar">{getInitials(displayName)}</div>
        <div className="admin-top-user">
          <strong>{displayName}</strong>
          <span>Administrator</span>
        </div>
        <button className="admin-logout" type="button" onClick={handleLogout}>
          Logout
        </button>
      </div>
    </header>
  );
}

export default AdminTopbar;
