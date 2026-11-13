import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import axios from "axios";
import api from "../../api/axios";
import type { LoginResponse } from "../../types/auth";
import { getApiErrorMessage } from "../../utils/apiError";
import { clearStoredUser, storeAccessToken, storeUser } from "../../utils/authStorage";
import RoleIllustration from "../../components/RoleIllustration";
import Icon from "../../components/advisor/AdvisorIcon";
import "../../styles/auth.css";
import "../../styles/login.css";

type LoginPageProps = {
  audience?: "student" | "sponsor" | "staff";
};

const loginContent = {
  student: {
    workspace: "Scholarship Management & Academic Pathway System",
    headline: <>Plan Your<br />Scholarship Journey<br />with <em>Clarity.</em></>,
    introduction: "Discover scholarships, get academic guidance, and build your future with ScholarOne.",
    features: [
      { icon: "graduation", label: "Find Scholarships" },
      { icon: "trend", label: "Explore Academic Pathways" },
      { icon: "calendar", label: "Track Important Dates" },
    ],
  },
  sponsor: {
    workspace: "Sponsorship Provider Workspace",
    headline: <>Connect Your<br />Scholarships with<br /><em>Future Talent.</em></>,
    introduction: "Share funding opportunities, review applications, and support students on their education journey.",
    features: [
      { icon: "graduation", label: "Manage Scholarships" },
      { icon: "users", label: "Review Applications" },
      { icon: "chart", label: "Track Performance" },
    ],
  },
  staff: {
    workspace: "Administrator & Academic Advisor Workspace",
    headline: <>Guide Students.<br />Manage ScholarOne<br />with <em>Confidence.</em></>,
    introduction: "Access your administrator or academic advisor workspace to manage platform activity and support students.",
    features: [
      { icon: "users", label: "Support Students" },
      { icon: "appointment", label: "Manage Your Workspace" },
      { icon: "chart", label: "Review Activity" },
    ],
  },
} as const;

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
  const rememberedEmailKey = audience === "student" ? "scholarone_login_email" : `scholarone_${audience}_login_email`;
  const [email, setEmail] = useState(locationState?.email || localStorage.getItem(rememberedEmailKey) || "");
  const [rememberEmail, setRememberEmail] = useState(Boolean(localStorage.getItem(rememberedEmailKey)));
  const [showPassword, setShowPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [successMessage] = useState(locationState?.message || "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isStaffLogin = audience === "staff";
  const isSponsorLogin = audience === "sponsor";
  const content = loginContent[audience];

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

      if (rememberEmail) localStorage.setItem(rememberedEmailKey, email.trim());
      else localStorage.removeItem(rememberedEmailKey);
      storeUser(response.data.user);
      storeAccessToken(response.data.access_token);
      navigate(getDashboardPath(userRole));
    } catch (error) {
      setError(getApiErrorMessage(error,
        axios.isAxiosError(error) && !error.response
          ? "Cannot connect to the login server. Make sure the ScholarOne backend is running and try again."
          : "Unable to complete login. Please try again.",
      ));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-shell branded-login-shell">
      <section className="auth-visual">
        <a className="auth-logo" href="/">
          <Icon name="graduation" />
          <span className="auth-logo-word">Scholar<span>One</span></span>
        </a>
        <div className="auth-hero">
          <p>{content.workspace}</p>
          <h1>{content.headline}</h1>
        </div>
        <p className="login-intro">{content.introduction}</p>
        <RoleIllustration kind={isStaffLogin ? "advisor" : audience} className="login-art" />
        <div className="login-features">
          {content.features.map((feature) => <div key={feature.label}><Icon name={feature.icon} /><span>{feature.label}</span></div>)}
        </div>
      </section>

      <section className="auth-panel">
        <div className="auth-card">
          <div className="login-card-cap" aria-hidden="true"><Icon name={isStaffLogin ? "shield" : "graduation"} /></div>
          <p className="auth-eyebrow">{isStaffLogin ? "Staff login" : isSponsorLogin ? "Provider login" : "Student login"}</p>
          <h2>{isStaffLogin ? "Log in as Staff" : isSponsorLogin ? "Log in as Provider" : "Log in as Student"}</h2>
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
              <span className="login-input-wrap">
              <Icon name="mail" />
              <input
                autoComplete="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder={isStaffLogin ? "staff@scholarone.com" : isSponsorLogin ? "provider@organization.com" : "Enter your email"}
                required
              />
              </span>
            </label>

            <label>
              Password
              <span className="login-input-wrap">
              <Icon name="lock" />
              <input
                autoComplete="current-password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter your password"
                required
              />
              <button className="login-password-toggle" type="button" aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}><Icon name="eye" /></button>
              </span>
            </label>

            <label className="login-remember"><input type="checkbox" checked={rememberEmail} onChange={(event) => setRememberEmail(event.target.checked)} />Remember email</label>

            {error && <p className="auth-error" role="alert">{error}</p>}

            <button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Logging in..." : "Log In"}
            </button>
          </form>
          {!isStaffLogin && (
            <p className="auth-switch">
              Don’t have an account? <Link to={`/register?role=${audience}`}>Sign Up</Link>
            </p>
          )}
          {isStaffLogin && <p className="login-staff-note">Administrator and academic advisor accounts are managed by ScholarOne.</p>}
          <Link className="login-role-link" to="/choose-role?mode=login">Choose another login option <Icon name="chevron" /></Link>
        </div>
      </section>
    </main>
  );
}

export default LoginPage;
