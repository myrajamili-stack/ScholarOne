import { Outlet } from "react-router-dom";
import StudentSidebar from "../components/StudentSidebar";
import StudentTopbar from "../components/StudentTopbar";

function StudentLayout() {
  return (
    <main className="dashboard-shell">
      <StudentSidebar />

      <section className="main-area">
        <StudentTopbar />
        <Outlet />
      </section>
    </main>
  );
}

export default StudentLayout;
