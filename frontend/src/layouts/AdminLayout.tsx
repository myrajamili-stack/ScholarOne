import { Navigate, Outlet } from "react-router-dom";
import AdminSidebar from "../components/admin/AdminSidebar";
import AdminTopbar from "../components/admin/AdminTopbar";
import { getStoredUser } from "../utils/authStorage";
import "../styles/admin-dashboard.css";

function AdminLayout() {
  const user = getStoredUser();

  if (user?.role === "student") {
    return <Navigate to="/dashboard" replace />;
  }

  if (user?.role === "advisor") {
    return <Navigate to="/advisor/dashboard" replace />;
  }

  if (user?.role === "sponsor") {
    return <Navigate to="/sponsor/dashboard" replace />;
  }

  if (user?.role !== "admin") {
    return <Navigate to="/login" replace />;
  }

  return (
    <main className="admin-shell">
      <AdminSidebar />

      <section className="admin-main">
        <AdminTopbar />
        <Outlet />
      </section>
    </main>
  );
}

export default AdminLayout;
