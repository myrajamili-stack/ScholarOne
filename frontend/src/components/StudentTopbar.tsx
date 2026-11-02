import { useLocation, useNavigate } from "react-router-dom";
import { clearStoredUser, getStoredUser } from "../utils/authStorage";
import { getInitials } from "../utils/userDisplay";
import { useScholarshipReminders } from "../context/ScholarshipRemindersContext";
import ReminderBell from "./ReminderBell";

function StudentTopbar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const isDashboard = pathname.replace(/\/$/, "") === "/dashboard";
  const user = getStoredUser();
  const { dueReminders } = useScholarshipReminders();

  function handleLogout() {
    clearStoredUser();
    navigate("/login");
  }

  return (
    <header className={`topbar${isDashboard ? "" : " topbar-without-search"}`}>
      {isDashboard && <label className="search-box">
        <input type="search" placeholder="Search scholarships, advisors, and more..." />
        <span>⌕</span>
      </label>}

      <div className="user-actions">
        <button className="notification-button" type="button" aria-label={`Deadline reminders: ${dueReminders.length} due`} onClick={() => navigate("/reminders")}>
          <ReminderBell />{dueReminders.length > 0 && <b>{dueReminders.length}</b>}
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
