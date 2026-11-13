import { Navigate, Outlet, useLocation } from "react-router-dom";
import SponsorSidebar from "../components/sponsor/SponsorSidebar";
import SponsorTopbar from "../components/sponsor/SponsorTopbar";
import { getStoredUser } from "../utils/authStorage";
import "../styles/sponsor-dashboard.css";
import "../styles/sponsor-home.css";
import "../styles/sponsor-listings.css";
import "../styles/sponsor-workspace.css";

function SponsorLayout() {
  const user = getStoredUser();
  const pathname = useLocation().pathname.replace(/\/$/, "");
  const isScholarships = pathname === "/sponsor/scholarships";

  if (user?.role === "advisor") {
    return <Navigate to="/advisor/dashboard" replace />;
  }

  if (user?.role === "student") {
    return <Navigate to="/dashboard" replace />;
  }

  if (user?.role !== "sponsor") {
    return <Navigate to="/login" replace />;
  }

  return (
    <main className={`sponsor-shell sponsor-home-shell sponsor-workspace-shell${isScholarships ? " sponsor-listings-shell" : ""}`}>
      <SponsorSidebar />

      <section className="sponsor-main">
        <SponsorTopbar />
        <Outlet />
      </section>
    </main>
  );
}

export default SponsorLayout;
