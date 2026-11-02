import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import api from "../../api/axios";
import type { LoginResponse } from "../../types/auth";
import { getApiErrorMessage } from "../../utils/apiError";
import { clearStoredUser, storeAccessToken, storeUser } from "../../utils/authStorage";
import "../../styles/auth.css";

type LoginPageProps = {
  audience?: "student" | "sponsor" | "staff";
};

const studentRoles = ["student"];
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

function LoginPage({ audience = "student" }: LoginPageProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = location.state as { message?: string; email?: string } | null;
  const [email, setEmail] = useState(locationState?.email || "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [successMessage] = useState(locationState?.message || "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isStaffLogin = audience === "staff";
  const isSponsorLogin = audience === "sponsor";

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
      const allowedRoles = isStaffLogin ? staffRoles : isSponsorLogin ? ["sponsor"] : studentRoles;

      if (!allowedRoles.includes(userRole)) {
        clearStoredUser();
        setError(
          isStaffLogin
            ? "This login is only for administrators and academic advisors."
            : isSponsorLogin ? "This login is only for sponsorship providers."
            : "This login is only for students. Please use a student account.",
        );
        return;
      }

      storeUser(response.data.user);
      storeAccessToken(response.data.access_token);
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
          <p>{isStaffLogin ? "Staff Workspace" : isSponsorLogin ? "Provider Workspace" : "Scholarship Management & Academic Pathway System"}</p>
          <h1>{isStaffLogin ? "Manage ScholarOne with confidence." : isSponsorLogin ? "Connect your scholarships with the right students." : "Plan your scholarship journey with clarity."}</h1>
        </div>
        <div className="auth-mock-card">
          <span>{isStaffLogin ? "Staff access" : isSponsorLogin ? "Provider tools" : "Recommended match"}</span>
          <strong>{isStaffLogin ? "Administrator & Academic Advisor Portal" : isSponsorLogin ? "Sponsorship Provider Portal" : "Future Leaders Scholarship"}</strong>
          <small>{isStaffLogin ? "Manage users, approvals, schedules, and reports" : isSponsorLogin ? "Manage scholarships and review applications" : "95% profile match"}</small>
        </div>
      </section>

      <section className="auth-panel">
        <div className="auth-card">
          <p className="auth-eyebrow">{isStaffLogin ? "Staff login" : isSponsorLogin ? "Provider login" : "Student login"}</p>
          <h2>{isStaffLogin ? "Log in as Staff" : isSponsorLogin ? "Log in as Sponsorship Provider" : "Log in as Student"}</h2>
          <p className="auth-subcopy">
            {isStaffLogin
              ? "For administrators and academic advisors managing ScholarOne operations."
              : isSponsorLogin ? "Manage your scholarship listings and student applications."
              : "Access scholarships, plan your academic pathway, and manage your student profile."}
          </p>

          <form className="auth-form" onSubmit={handleSubmit}>
            {successMessage && <p className="auth-success">{successMessage}</p>}

            <label>
              Email
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder={isStaffLogin ? "staff@scholarone.com" : isSponsorLogin ? "provider@organization.com" : "sarah@student.com"}
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
          {!isStaffLogin && !isSponsorLogin && (
            <p className="auth-switch">
              Do not have an account yet? <Link to="/register?role=student">Sign Up</Link>
            </p>
          )}
        </div>
      </section>
    </main>
  );
}

export default LoginPage;
