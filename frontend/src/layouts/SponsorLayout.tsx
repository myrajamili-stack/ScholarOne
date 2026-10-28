import { Navigate, Outlet } from "react-router-dom";
import SponsorSidebar from "../components/sponsor/SponsorSidebar";
import SponsorTopbar from "../components/sponsor/SponsorTopbar";
import { getStoredUser } from "../utils/authStorage";
import "../styles/sponsor-dashboard.css";

function SponsorLayout() {
  const user = getStoredUser();

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
    <main className="sponsor-shell">
      <SponsorSidebar />

      <section className="sponsor-main">
        <SponsorTopbar />
        <Outlet />
      </section>
    </main>
  );
}

export default SponsorLayout;
