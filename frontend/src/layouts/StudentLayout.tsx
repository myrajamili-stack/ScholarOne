import "../styles/student-success.css";
import { Outlet, useLocation } from "react-router-dom";
import StudentSidebar from "../components/StudentSidebar";
import StudentTopbar from "../components/StudentTopbar";
import ScholarshipRemindersProvider from "../context/ScholarshipRemindersProvider";
import ScholarshipReminderAlert from "../components/ScholarshipReminderAlert";

function StudentLayout() {
  const pathname = useLocation().pathname.replace(/\/$/, "");
  const isMessages = pathname === "/messages";

  return (
    <ScholarshipRemindersProvider><main className={`dashboard-shell${isMessages ? " messages-shell" : ""}${["/dashboard", "/pathway-quiz", "/appointments", "/calendar", "/profile", "/settings", "/messages", "/scholarships"].includes(pathname) ? " student-success-shell" : ""}${pathname === "/pathway-quiz" ? " student-pathway-shell" : ""}`}>
      <StudentSidebar />

      <section className="main-area">
        <StudentTopbar />
        <ScholarshipReminderAlert />
        <Outlet />
      </section>
    </main></ScholarshipRemindersProvider>
  );
}

export default StudentLayout;
