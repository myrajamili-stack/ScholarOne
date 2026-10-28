import { useNavigate } from "react-router-dom";
import { clearStoredUser, getStoredUser } from "../utils/authStorage";
import { getInitials } from "../utils/userDisplay";

function StudentTopbar() {
  const navigate = useNavigate();
  const user = getStoredUser();

  function handleLogout() {
    clearStoredUser();
    navigate("/login");
  }

  return (
    <header className="topbar">
      <label className="search-box">
        <input type="search" placeholder="Search scholarships, advisors, and more..." />
        <span>⌕</span>
      </label>

      <div className="user-actions">
        <button className="notification-button" type="button" aria-label="Notifications">
          ♧<b>3</b>
        </button>
        <div className="user-mini">
          <div className="avatar">{getInitials(user?.full_name)}</div>
          <div>
            <strong>Hi, {user?.full_name?.split(" ")[0] || "Student"}!</strong>
            <small>{user?.role || "Student"}</small>
          </div>
          <button className="logout-button" type="button" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </div>
    </header>
  );
}

export default StudentTopbar;
