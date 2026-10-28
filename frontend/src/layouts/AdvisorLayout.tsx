import { Outlet } from "react-router-dom";
import AdvisorSidebar from "../components/advisor/AdvisorSidebar";
import AdvisorTopbar from "../components/advisor/AdvisorTopbar";
import "../styles/advisor-dashboard.css";

function AdvisorLayout() {
  return (
    <main className="advisor-shell">
      <AdvisorSidebar />

      <section className="advisor-main">
        <AdvisorTopbar />
        <Outlet />
      </section>
    </main>
  );
}

export default AdvisorLayout;
