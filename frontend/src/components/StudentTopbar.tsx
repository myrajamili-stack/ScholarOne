import Icon from "./advisor/AdvisorIcon";
import ProfileAvatar from "./advisor/ProfileAvatar";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { clearStoredUser, getStoredUser } from "../utils/authStorage";
import { useScholarshipReminders } from "../context/ScholarshipRemindersContext";
import ReminderBell from "./ReminderBell";

const pageTitles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/pathway-quiz": "Pathway Quiz",
  "/appointments": "Appointments",
  "/calendar": "Calendar & Reminders",
  "/messages": "Messages",
  "/profile": "My Profile",
  "/settings": "Settings",
};

function StudentTopbar() {
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const pagePath = pathname.replace(/\/$/, "");
  const isScholarships = pagePath === "/scholarships";
  const pageTitle = pageTitles[pagePath] || "Student Workspace";
  const user = getStoredUser();
  const { dueReminders } = useScholarshipReminders();

  function handleLogout() {
    clearStoredUser();
    navigate("/login");
  }

  const accountMenu = (<details className="ss-account"><summary><ProfileAvatar className="ss-top-avatar" name={user?.full_name || "Student"} imageUrl={user?.profile_picture} /><span><strong>Hi, {user?.full_name?.split(" ")[0] || "Student"}!</strong><small>Student</small></span><Icon name="down" /></summary><nav aria-label="Student account"><button onClick={() => navigate("/profile")}>My Profile</button><button onClick={() => navigate("/settings")}>Settings</button><button onClick={handleLogout}>Logout</button></nav></details>);

  return <header className={`ss-topbar${isScholarships ? "" : " ss-topbar-with-page"}`}>
    {isScholarships && <form className="ss-search" role="search" onSubmit={(event) => { event.preventDefault(); const query = new FormData(event.currentTarget).get("q"); navigate(`/scholarships?q=${encodeURIComponent(String(query || "").trim())}${pathname === "/scholarships" && new URLSearchParams(search).get("view") === "saved" ? "&view=saved" : ""}`); }}>
      <button type="submit" aria-label="Search scholarships"><Icon name="search" /></button><input key={`${pathname}${search}`} defaultValue={pathname === "/scholarships" ? new URLSearchParams(search).get("q") || "" : ""} name="q" aria-label="Search scholarships" type="search" placeholder="Search scholarships…" />
    </form>}
    {!isScholarships && <div className="ss-page-heading">
      <p className="ss-page-title">{pageTitle}</p>
      <nav aria-label="Breadcrumb"><ol><li><Link to="/dashboard">Home</Link></li><li><span aria-hidden="true">/</span><span aria-current="page">{pageTitle}</span></li></ol></nav>
    </div>}
    <div className="ss-top-actions"><button className="notification-button" type="button" aria-label={`Deadline reminders: ${dueReminders.length} due`} onClick={() => navigate("/calendar?section=reminders")}><ReminderBell />{dueReminders.length > 0 && <b>{dueReminders.length}</b>}</button>
      {accountMenu}
    </div>
  </header>;

}

export default StudentTopbar;
