import { useNavigate } from "react-router-dom";
import { clearStoredUser, getStoredUser } from "../../utils/authStorage";
import { getInitials } from "../../utils/userDisplay";

function SponsorTopbar() {
  const navigate = useNavigate();
  const user = getStoredUser();
  const displayName = user?.full_name || "Sponsorship Provider";

  function handleLogout() {
    clearStoredUser();
    navigate("/login", { replace: true });
  }

  return (
    <header className="sponsor-topbar">
      <div>
        <h1>Sponsorship Provider Dashboard</h1>
        <p>Review your scholarship programs, applications, and subscription usage.</p>
      </div>

      <div className="sponsor-top-actions">
        <button className="sponsor-icon-button" type="button" aria-label="Notifications">
          <span>2</span>
          ♧
        </button>
        <div className="sponsor-avatar">{getInitials(displayName)}</div>
        <div className="sponsor-top-user">
          <strong>{displayName}</strong>
          <span>Sponsorship Provider</span>
        </div>
        <button className="sponsor-logout" type="button" onClick={handleLogout}>
          Logout
        </button>
      </div>
    </header>
  );
}

export default SponsorTopbar;
