import { Navigate, Outlet, useLocation } from "react-router-dom";
import { getAccessToken, getStoredUser } from "../utils/authStorage";

function ProtectedRoute() {
  const user = getStoredUser();
  const { pathname } = useLocation();

  if (!user || !getAccessToken() || (user.status && user.status !== "active")) {
    return <Navigate to="/login" replace />;
  }

  const dashboards = { student: "/dashboard", advisor: "/advisor/dashboard", sponsor: "/sponsor/dashboard", admin: "/admin/dashboard" };
  if (!(user.role in dashboards)) return <Navigate to="/login" replace />;
  const requiredRole = pathname.startsWith("/admin/") ? "admin"
    : pathname.startsWith("/advisor/") ? "advisor"
    : pathname.startsWith("/sponsor/") ? "sponsor" : "student";
  if (user.role !== requiredRole) return <Navigate to={dashboards[user.role]} replace />;

  return <Outlet />;
}

export default ProtectedRoute;
