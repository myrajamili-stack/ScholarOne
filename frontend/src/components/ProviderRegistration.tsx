import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import Icon from "./advisor/AdvisorIcon";
import RoleIllustration from "./RoleIllustration";
import "../styles/student-registration.css";
import "../styles/provider-registration.css";

type Props = { onSubmit: (event: FormEvent<HTMLFormElement>) => void; error: string; isSubmitting: boolean; submitted: boolean };

export default function ProviderRegistration({ onSubmit, error, isSubmitting, submitted }: Props) {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  return (
    <main className="student-registration provider-registration">
      <section className="registration-introduction">
        <Link className="registration-brand" to="/" aria-label="ScholarOne home"><Icon name="graduation" /><span><strong>Scholar<span>One</span></strong><small>Your Pathway. Your Future.</small></span></Link>
        <div className="registration-welcome">
          <p className="registration-badge"><Icon name="home" />Sponsorship Provider Registration</p>
          <h1>Partner with<br /><span>ScholarOne</span></h1>
          <p>Create your provider account to advertise scholarships, manage applications, and reach qualified students.</p>
        </div>
        <RoleIllustration kind="sponsor" className="provider-registration-art" />
        <div className="provider-registration-benefits"><h2>Why Join as a Provider?</h2><div><p><Icon name="users" />Reach more qualified students</p><p><Icon name="settings" />Manage scholarship listings</p><p><Icon name="chart" />Track applications easily</p></div></div>
      </section>
      <section className="registration-form-panel">
        <div className="registration-card">
          {submitted ? <div className="provider-registration-success" role="status"><Icon name="shield" /><p className="registration-eyebrow">Registration submitted</p><h2>Pending administrator verification</h2><p>Your registration has been submitted successfully! Your account is pending administrator verification. You will be notified once your account has been reviewed.</p><p>Check your account status by logging in. Review updates will appear in your provider notifications once access is approved.</p><Link className="registration-submit" to="/sponsor-login">Go to Provider Login<Icon name="chevron" /></Link></div> : <>
            <p className="registration-eyebrow">Create account</p><h2>Register as Sponsorship Provider</h2><p className="registration-description">Create your organisation account to advertise scholarships on ScholarOne.</p>
            <form className="registration-form" onSubmit={onSubmit}>
              <label><span><Icon name="home" />Organisation / Institution Name *</span><input name="organization_name" placeholder="Enter your organisation or institution name" autoComplete="organization" required maxLength={200} /></label>
              <div className="provider-registration-grid">
                <label><span><Icon name="user" />Contact Person Name *</span><input name="full_name" placeholder="Enter the person in charge" autoComplete="name" required maxLength={150} /></label>
                <label><span><Icon name="mail" />Official Email *</span><input name="email" type="email" placeholder="provider@organisation.com" autoComplete="email" required maxLength={254} /></label>
              </div>
              <div className="registration-phone-field"><label htmlFor="provider-phone"><span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m7 3 3 5-3 3a16 16 0 0 0 6 6l3-3 5 3c-1 5-4 5-7 4C8 19 5 16 3 10 2 7 2 4 7 3Z" /></svg>Phone Number *</span></label><div className="registration-phone"><select name="dial_code" aria-label="Country calling code" defaultValue="+60"><option>+60</option><option>+65</option><option>+62</option><option>+673</option><option>+66</option><option>+63</option></select><input id="provider-phone" name="phone_number" type="tel" inputMode="numeric" autoComplete="tel-national" placeholder="Enter your phone number" pattern="[0-9]{7,12}" title="Enter 7 to 12 digits only, without letters or spaces." required /></div></div>
              <div className="provider-registration-grid">
                <label><span><Icon name="layers" />Organisation Type *</span><select name="organization_type" required defaultValue=""><option value="" disabled>Select organisation type</option>{['Government Agency', 'Foundation', 'Private Company', 'NGO', 'Educational Institution'].map(type => <option key={type}>{type}</option>)}</select></label>
                <label><span><Icon name="home" />Official Website (Optional)</span><input name="website" type="url" pattern="https?://.+" placeholder="https://www.organisation.com" autoComplete="url" maxLength={500} /></label>
              </div>
              <label><span><Icon name="lock" />Password *</span><span className="registration-password"><input name="password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" placeholder="Create a password" minLength={8} required /><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}><Icon name="eye" /></button></span></label>
              <label><span><Icon name="lock" />Confirm Password *</span><span className="registration-password"><input name="confirm_password" type={showConfirmation ? 'text' : 'password'} autoComplete="new-password" placeholder="Confirm your password" required /><button type="button" aria-label={showConfirmation ? 'Hide confirmed password' : 'Show confirmed password'} aria-pressed={showConfirmation} onClick={() => setShowConfirmation(!showConfirmation)}><Icon name="eye" /></button></span></label>
              <p className="provider-verification-notice"><Icon name="shield" />Provider accounts require administrator approval before they can publish scholarships. Use at least 8 characters for your password.</p>
              {error && <p className="auth-error" role="alert">{error}</p>}
              <button className="registration-submit" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Submitting registration...' : 'Create Provider Account'}<Icon name="chevron" /></button>
            </form><p className="registration-login">Already have an account? <Link to="/sponsor-login">Log In</Link></p>
          </>}
        </div>
      </section>
    </main>
  );
}
