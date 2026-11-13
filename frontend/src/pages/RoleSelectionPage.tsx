import { Link, useSearchParams } from "react-router-dom";
import RoleIllustration from "../components/RoleIllustration";
import Icon from "../components/advisor/AdvisorIcon";
import "../styles/role-selection.css";

const roles = [
  { kind: "student", title: "Student", description: "Discover scholarships and academic pathways", to: "/register?role=student" },
  { kind: "sponsor", title: "Sponsorship Provider", description: "Manage and promote scholarship opportunities", to: "/register?role=sponsor" },
  { kind: "advisor", title: "Academic Advisor", description: "Support students with academic guidance", to: "/staff-login" },
] as const;

export default function RoleSelectionPage({ mode, onModeChange }: {
  mode?: "signup" | "login";
  onModeChange?: (mode: "signup" | "login") => void;
}) {
  const [searchParams] = useSearchParams();
  const isLogin = (mode ?? searchParams.get("mode")) === "login";
  const visibleRoles = isLogin ? roles : roles.filter((role) => role.kind !== "advisor");
  return (
    <main className={`role-selection ${isLogin ? "role-selection-login" : "role-selection-signup"}`}>
      <section className="role-selection-card" aria-labelledby="role-selection-title">
        <Link className="role-selection-brand" to="/" aria-label="ScholarOne home"><Icon name="graduation" /><span>Scholar<span>One</span></span></Link>
        <h1 id="role-selection-title">{isLogin ? "Welcome Back!" : "Your Journey Starts Here"}<span className="role-title-spark" aria-hidden="true">✦</span></h1>
        <p className="role-selection-subtitle">Choose your role to {isLogin ? "log in to your account." : "sign up with ScholarOne."}</p>
        <nav className="role-selection-options" aria-label="Choose your role">
          {visibleRoles.map((role) => {
            return (
            <Link className="role-selection-option" to={isLogin
              ? role.kind === "student" ? "/login" : role.kind === "sponsor" ? "/sponsor-login" : "/staff-login"
              : role.to} key={role.kind}>
              <RoleIllustration kind={role.kind} className="role-selection-art" />
              <span className="role-selection-label"><strong>{role.title}</strong><span>{role.description}.</span></span>
              <span className="role-selection-action">{isLogin ? "Log in" : "Sign up"} as {role.kind === "student" ? "Student" : role.kind === "sponsor" ? "Provider" : "Advisor"}<Icon name="chevron" /></span>
            </Link>
          ); })}
        </nav>
        <p className="role-selection-signin">
          {isLogin ? "Don’t have an account? " : "Already have an account? "}
          {onModeChange
            ? <button type="button" onClick={() => onModeChange(isLogin ? "signup" : "login")}>{isLogin ? "Sign Up" : "Sign In"}</button>
            : <Link to={isLogin ? "/choose-role" : "/choose-role?mode=login"}>{isLogin ? "Sign Up" : "Sign In"}</Link>}
        </p>
      </section>
    </main>
  );
}
