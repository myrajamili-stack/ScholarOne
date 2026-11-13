import { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import AdvisorSidebar from "../components/advisor/AdvisorSidebar";
import AdvisorTopbar from "../components/advisor/AdvisorTopbar";
import "../styles/advisor-dashboard.css";
import "../styles/advisor-home.css";

function AdvisorLayout() {
  const pathname = useLocation().pathname.replace(/\/$/, "");
  const isMessages = pathname === "/advisor/messages";
  const hasPageHeader = ["/advisor/dashboard", "/advisor/profile", "/advisor/schedule", "/advisor/appointments", "/advisor/students", "/advisor/pathway-quizzes", "/advisor/feedback", "/advisor/settings"].includes(pathname);
  const [unreadMessages, setUnreadMessages] = useState(0);

  return (
    <main className={`advisor-shell${isMessages ? " messages-shell" : ""}${hasPageHeader || isMessages ? " advisor-dashboard-shell" : ""}`}>
      <AdvisorSidebar unreadMessages={unreadMessages} />

      <section className="advisor-main">
        {!hasPageHeader && <AdvisorTopbar />}
        <Outlet context={{ setUnreadMessages }} />
      </section>
    </main>
  );
}

export default AdvisorLayout;
