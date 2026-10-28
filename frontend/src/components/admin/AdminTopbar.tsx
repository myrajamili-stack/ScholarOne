import { useNavigate } from "react-router-dom";
import { clearStoredUser, getStoredUser } from "../../utils/authStorage";
import { getInitials } from "../../utils/userDisplay";

function AdminTopbar() {
  const navigate = useNavigate();
  const user = getStoredUser();
  const displayName = user?.full_name || "Administrator";

  function handleLogout() {
    clearStoredUser();
    navigate("/login", { replace: true });
  }

  return (
    <header className="admin-topbar">
      <div>
        <h1>Administrator Dashboard</h1>
        <p>Monitor users, scholarship activity, approvals, reports, and system operations.</p>
      </div>

      <div className="admin-top-actions">
        <button className="admin-icon-button" type="button" aria-label="Notifications">
          <span>0</span>
          ♧
        </button>
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
