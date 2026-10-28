import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import api from "../api/axios";
import type { LoginResponse } from "../types/auth";
import { getApiErrorMessage } from "../utils/apiError";
import { clearStoredUser, storeUser } from "../utils/authStorage";
import "../styles/auth.css";

type LoginPageProps = {
  audience?: "general" | "staff";
};

const generalRoles = ["student", "sponsor"];
const staffRoles = ["admin", "advisor"];

function getDashboardPath(role: string) {
  if (role === "admin") {
    return "/admin/dashboard";
  }

  if (role === "advisor") {
    return "/advisor/dashboard";
  }

  if (role === "sponsor") {
    return "/sponsor/dashboard";
  }

  return "/dashboard";
}

function LoginPage({ audience = "general" }: LoginPageProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = location.state as { message?: string; email?: string } | null;
  const [email, setEmail] = useState(locationState?.email || "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [successMessage] = useState(locationState?.message || "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isStaffLogin = audience === "staff";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const response = await api.post<LoginResponse>("/auth/login", {
        email,
        password,
      });

      const userRole = response.data.user.role;
      const allowedRoles = isStaffLogin ? staffRoles : generalRoles;

      if (!allowedRoles.includes(userRole)) {
        clearStoredUser();
        setError(
          isStaffLogin
            ? "This login is only for administrators and academic advisors. Please use the general user login."
            : "This login is only for students and sponsorship providers. Please use the staff login.",
        );
        return;
      }

      storeUser(response.data.user);
      navigate(getDashboardPath(userRole));
    } catch (error) {
      setError(getApiErrorMessage(error, "Invalid email or password. Please try again."));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-visual">
        <a className="auth-logo" href="/">
          Scholar<span>One</span>
        </a>
        <div className="auth-hero">
          <p>{isStaffLogin ? "Staff Workspace" : "Scholarship Management & Academic Pathway System"}</p>
          <h1>{isStaffLogin ? "Manage ScholarOne with confidence." : "Plan your scholarship journey with clarity."}</h1>
        </div>
        <div className="auth-mock-card">
          <span>{isStaffLogin ? "Staff access" : "Recommended match"}</span>
          <strong>{isStaffLogin ? "Administrator & Academic Advisor Portal" : "Future Leaders Scholarship"}</strong>
          <small>{isStaffLogin ? "Manage users, approvals, schedules, and reports" : "95% profile match"}</small>
        </div>
      </section>

      <section className="auth-panel">
        <div className="auth-card">
          <p className="auth-eyebrow">{isStaffLogin ? "Staff login" : "General user login"}</p>
          <h2>{isStaffLogin ? "Log in as Staff" : "Log in as Student or Provider"}</h2>
          <p className="auth-subcopy">
            {isStaffLogin
              ? "For administrators and academic advisors managing ScholarOne operations."
              : "For students and sponsorship providers using ScholarOne services."}
          </p>

          <div className="auth-login-tabs" aria-label="Login type">
            <Link className={!isStaffLogin ? "active" : ""} to="/login">
              General User
            </Link>
            <Link className={isStaffLogin ? "active" : ""} to="/staff-login">
              Staff User
            </Link>
          </div>

          <form className="auth-form" onSubmit={handleSubmit}>
            {successMessage && <p className="auth-success">{successMessage}</p>}

            <label>
              Email
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="sarah@student.com"
                required
              />
            </label>

            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter your password"
                required
              />
            </label>

            {error && <p className="auth-error">{error}</p>}

            <button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Logging in..." : "Log In"}
            </button>
          </form>

          {isStaffLogin ? (
            <p className="auth-switch">
              Student or sponsorship provider? <Link to="/login">Use general user login</Link>
            </p>
          ) : (
            <p className="auth-switch">
              Need an account? <Link to="/register">Create an account</Link>
            </p>
          )}
        </div>
      </section>
    </main>
  );
}

export default LoginPage;
