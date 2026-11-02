import { Link, useSearchParams } from "react-router-dom";
import "../styles/role-selection.css";

function RoleIcon({ kind }: { kind: "student" | "sponsor" | "advisor" }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {kind === "student" ? <><path d="m3 12 13-6 13 6-13 6z" /><path d="M8 15v8q8 6 16 0v-8M29 12v10" /></>
        : kind === "sponsor" ? <><path d="M5 27h23M8 27V8h10v19M18 13h7v14M12 12h2m-2 5h2m-2 5h2" /></>
          : <><path d="M16 8v19M16 8Q9 4 3 7v18q7-3 13 2 6-5 13-2V7q-6-3-13 1Z" /></>}
    </svg>
  );
}

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
    <main className="role-selection">
      <section className="role-selection-card" aria-labelledby="role-selection-title">
        <Link className="role-selection-brand" to="/" aria-label="ScholarOne home">Scholar<span>One</span></Link>
        <span className="role-selection-emblem"><RoleIcon kind="student" /></span>
        <h1 id="role-selection-title">{isLogin ? "Welcome Back" : "Your Journey Starts Here"}</h1>
        <p className="role-selection-subtitle">Choose your role to {isLogin ? "log in" : "sign up"} with ScholarOne.</p>
        <nav className="role-selection-options" aria-label="Choose your role">
          {visibleRoles.map((role) => (
            <Link className="role-selection-option" to={isLogin
              ? role.kind === "student" ? "/login" : role.kind === "sponsor" ? "/sponsor-login" : "/staff-login"
              : role.to} key={role.kind}>
              <span className="role-selection-icon"><RoleIcon kind={role.kind} /></span>
              <span className="role-selection-label"><strong>{role.title}</strong><span>{role.description}</span></span>
              <span className="role-selection-chevron" aria-hidden="true">›</span>
            </Link>
          ))}
        </nav>
        <p className="role-selection-signin">
          {isLogin ? "Need an account? " : "Already have an account? "}
          {onModeChange
            ? <button type="button" onClick={() => onModeChange(isLogin ? "signup" : "login")}>{isLogin ? "Sign Up" : "Sign In"}</button>
            : <Link to={isLogin ? "/choose-role" : "/choose-role?mode=login"}>{isLogin ? "Sign Up" : "Sign In"}</Link>}
        </p>
      </section>
    </main>
  );
}
