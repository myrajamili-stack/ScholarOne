import { useNavigate } from "react-router-dom";
import { clearStoredUser, getStoredUser } from "../../utils/authStorage";
import { getInitials } from "../../utils/userDisplay";

function AdvisorTopbar() {
  const navigate = useNavigate();
  const user = getStoredUser();

  function handleLogout() {
    clearStoredUser();
    navigate("/login", { replace: true });
  }

  return (
    <header className="advisor-topbar">
      <div>
        <h1>Academic Advisor Dashboard</h1>
        <p>Here is your schedule and advising activity for today.</p>
      </div>

      <div className="advisor-top-actions">
        <button className="advisor-icon-button" type="button" aria-label="Notifications">
          <span>3</span>
          ♧
        </button>
        <div className="advisor-avatar">{getInitials(user?.full_name || "Academic Advisor")}</div>
        <div className="advisor-top-user">
          <strong>{user?.full_name || "Academic Advisor"}</strong>
          <span>Academic Advisor</span>
        </div>
        <button className="advisor-logout" type="button" onClick={handleLogout}>
          Logout
        </button>
      </div>
    </header>
  );
}

export default AdvisorTopbar;
