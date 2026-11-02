import { Outlet } from "react-router-dom";
import StudentSidebar from "../components/StudentSidebar";
import StudentTopbar from "../components/StudentTopbar";
import ScholarshipRemindersProvider from "../context/ScholarshipRemindersProvider";
import ScholarshipReminderAlert from "../components/ScholarshipReminderAlert";

function StudentLayout() {
  return (
    <ScholarshipRemindersProvider><main className="dashboard-shell">
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
