import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import Icon from "./advisor/AdvisorIcon";
import "../styles/student-registration.css";

type Props = {
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  error: string;
  isSubmitting: boolean;
};

export default function StudentRegistration({ onSubmit, error, isSubmitting }: Props) {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);

  return (
    <main className="student-registration">
      <section className="registration-introduction">
        <Link className="registration-brand" to="/" aria-label="ScholarOne home">
          <Icon name="graduation" />
          <span><strong>Scholar<span>One</span></strong><small>Your Pathway. Your Future.</small></span>
        </Link>
        <div className="registration-welcome">
          <p className="registration-badge"><Icon name="users" />Student Registration</p>
          <h1>Create Your<br /><span>Student Account</span></h1>
          <p>Sign up to explore scholarships, manage your profile, and get personalised recommendations for your academic journey.</p>
        </div>
        <img className="registration-illustration" src="/images/landing-student-hero.png" alt="Student exploring academic opportunities with ScholarOne" />
      </section>
      <section className="registration-form-panel">
        <div className="registration-card">
          <p className="registration-eyebrow">Create account</p>
          <h2>Register as Student</h2>
          <p className="registration-description">Create your account to start your scholarship journey with ScholarOne.</p>
          <form onSubmit={onSubmit} className="registration-form">
            <label><span><Icon name="user" />Full Name</span><input name="full_name" autoComplete="name" placeholder="Enter your full name" required maxLength={150} /></label>
            <label><span><Icon name="mail" />Email</span><input name="email" type="email" autoComplete="email" placeholder="Enter your email address" required /></label>
            <label><span><Icon name="lock" />Password</span>
              <span className="registration-password"><input name="password" type={showPassword ? "text" : "password"} autoComplete="new-password" placeholder="Create a password" required /><button type="button" aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}><Icon name="eye" /></button></span>
            </label>
            <label><span><Icon name="lock" />Confirm Password</span>
              <span className="registration-password"><input name="confirm_password" type={showConfirmation ? "text" : "password"} autoComplete="new-password" placeholder="Confirm your password" required /><button type="button" aria-label={showConfirmation ? "Hide confirmed password" : "Show confirmed password"} aria-pressed={showConfirmation} onClick={() => setShowConfirmation(!showConfirmation)}><Icon name="eye" /></button></span>
            </label>
            <div className="registration-phone-field">
              <label htmlFor="registration-phone"><span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m7 3 3 5-3 3a16 16 0 0 0 6 6l3-3 5 3c-1 5-4 5-7 4C8 19 5 16 3 10 2 7 2 4 7 3Z" /></svg>Phone Number</span></label>
              <div className="registration-phone">
                <select name="dial_code" aria-label="Country calling code" defaultValue="+60"><option value="+60">+60 MY</option><option value="+65">+65 SG</option><option value="+62">+62 ID</option><option value="+673">+673 BN</option><option value="+66">+66 TH</option><option value="+63">+63 PH</option></select>
                <input id="registration-phone" name="phone_number" type="tel" inputMode="numeric" autoComplete="tel-national" placeholder="Enter your phone number" pattern="[0-9]{7,12}" title="Enter 7 to 12 digits only, without letters or spaces." required />
              </div>
            </div>
            {error && <p className="auth-error" role="alert">{error}</p>}
            <button className="registration-submit" type="submit" disabled={isSubmitting}>{isSubmitting ? "Creating account..." : "Create Student Account"}<Icon name="chevron" /></button>
          </form>
          <p className="registration-login">Already have an account? <Link to="/login">Log In</Link></p>
        </div>
      </section>
    </main>
  );
}
