import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../api/axios";
import type { RegisterResponse } from "../types/auth";
import { getApiErrorMessage } from "../utils/apiError";
import { clearStoredUser } from "../utils/authStorage";
import "../styles/auth.css";

type AccountType = "student" | "sponsor";

function RegisterPage() {
  const navigate = useNavigate();
  const [accountType, setAccountType] = useState<AccountType | null>(null);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleStudentSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") || "").trim().toLowerCase();

    try {
      clearStoredUser();

      const response = await api.post<RegisterResponse>("/auth/register", {
        full_name: String(formData.get("full_name") || "").trim(),
        email,
        password: formData.get("password"),
        phone_number: String(formData.get("phone_number") || "").trim(),
        role: "student",
        education_level: formData.get("education_level"),
        cgpa: formData.get("cgpa"),
        field_of_study: String(formData.get("field_of_study") || "").trim(),
        university: String(formData.get("university") || "").trim(),
      });

      navigate("/login", {
        state: {
          message: "Account created successfully. Please log in to continue.",
          email: response.data.user.email,
        },
      });
    } catch (error) {
      setError(getApiErrorMessage(error, "Unable to create account. Please try again."));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSponsorSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") || "").trim().toLowerCase();

    try {
      clearStoredUser();

      const response = await api.post<RegisterResponse>("/auth/register", {
        full_name: String(formData.get("full_name") || "").trim(),
        email,
        password: formData.get("password"),
        phone_number: String(formData.get("phone_number") || "").trim(),
        role: "sponsor",
        organization_name: String(formData.get("organization_name") || "").trim(),
        organization_type: String(formData.get("organization_type") || "").trim(),
        website: String(formData.get("website") || "").trim(),
        subscription_status: "free",
      });

      navigate("/login", {
        state: {
          message: "Provider account created successfully. Please log in to continue.",
          email: response.data.user.email,
        },
      });
    } catch (error) {
      setError(getApiErrorMessage(error, "Unable to create provider account. Please try again."));
    } finally {
      setIsSubmitting(false);
    }
  }

  const isStudent = accountType === "student";
  const isSponsor = accountType === "sponsor";

  return (
    <main className="auth-shell">
      <section className="auth-visual">
        <a className="auth-logo" href="/">
          Scholar<span>One</span>
        </a>
        <div className="auth-hero">
          <p>{isSponsor ? "Provider Registration" : "Account Registration"}</p>
          <h1>{isSponsor ? "Advertise scholarships to the right students." : "Build your profile for better scholarship recommendations."}</h1>
        </div>
        <div className="auth-mock-card">
          <span>{isSponsor ? "Provider tools" : "Profile strength"}</span>
          <strong>{isSponsor ? "Manage listings, applications, and subscription usage" : "Academic details improve matching"}</strong>
          <small>{isSponsor ? "Scholarship advertisements and provider dashboard" : "CGPA, field, and education level"}</small>
        </div>
      </section>

      <section className="auth-panel">
        <div className="auth-card register-card">
          {!accountType && (
            <>
              <p className="auth-eyebrow">Create account</p>
              <h2>Are you a Student or Sponsorship Provider?</h2>
              <p className="auth-subcopy">Choose the account type that matches how you want to use ScholarOne.</p>

              <div className="account-choice-grid">
                <button type="button" className="account-choice-card" onClick={() => setAccountType("student")}>
                  <span>Student</span>
                  <strong>Find scholarships and academic pathways</strong>
                  <small>Create a student profile, get recommendations, take pathway quizzes, and book advisor sessions.</small>
                </button>

                <button type="button" className="account-choice-card" onClick={() => setAccountType("sponsor")}>
                  <span>Sponsorship Provider</span>
                  <strong>Advertise and manage scholarships</strong>
                  <small>Register your organization, submit scholarship listings, and review student applications.</small>
                </button>
              </div>

              <p className="auth-switch">
                Already have an account? <Link to="/login">Log in</Link>
              </p>
            </>
          )}

          {isStudent && (
            <>
              <button className="auth-back-button" type="button" onClick={() => setAccountType(null)}>
                Back to account type
              </button>
              <p className="auth-eyebrow">Create account</p>
              <h2>Register as Student</h2>
              <p className="auth-subcopy">Fill in your basic academic details to start receiving scholarship matches.</p>

              <form className="auth-form" onSubmit={handleStudentSubmit}>
                <div className="auth-grid">
                  <label>
                    Full name
                    <input name="full_name" type="text" placeholder="Sarah Lee" required />
                  </label>

                  <label>
                    Email
                    <input name="email" type="email" placeholder="sarah@student.com" required />
                  </label>
                </div>

                <div className="auth-grid">
                  <label>
                    Password
                    <input name="password" type="password" placeholder="Create a password" required />
                  </label>

                  <label>
                    Phone number
                    <input name="phone_number" type="tel" placeholder="0123456789" />
                  </label>
                </div>

                <div className="auth-grid">
                  <label>
                    Education level
                    <select name="education_level" defaultValue="Undergraduate">
                      <option>Foundation</option>
                      <option>Diploma</option>
                      <option>Undergraduate</option>
                      <option>Postgraduate</option>
                    </select>
                  </label>

                  <label>
                    CGPA
                    <input name="cgpa" type="number" min="0" max="4" step="0.01" placeholder="3.74" />
                  </label>
                </div>

                <div className="auth-grid">
                  <label>
                    Field of study
                    <input name="field_of_study" type="text" placeholder="Computer Science" />
                  </label>

                  <label>
                    University
                    <input name="university" type="text" placeholder="University of Malaya" />
                  </label>
                </div>

                {error && <p className="auth-error">{error}</p>}

                <button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "Creating account..." : "Create Student Account"}
                </button>
              </form>

              <p className="auth-switch">
                Already have an account? <Link to="/login">Log in</Link>
              </p>
            </>
          )}

          {isSponsor && (
            <>
              <button className="auth-back-button" type="button" onClick={() => setAccountType(null)}>
                Back to account type
              </button>
              <p className="auth-eyebrow">Create account</p>
              <h2>Register as Sponsorship Provider</h2>
              <p className="auth-subcopy">Register your organization to advertise scholarships and manage student applications.</p>

              <form className="auth-form" onSubmit={handleSponsorSubmit}>
                <div className="auth-grid">
                  <label>
                    Contact person name
                    <input name="full_name" type="text" placeholder="BrightFuture Foundation Admin" required />
                  </label>

                  <label>
                    Email
                    <input name="email" type="email" placeholder="provider@organization.com" required />
                  </label>
                </div>

                <div className="auth-grid">
                  <label>
                    Password
                    <input name="password" type="password" placeholder="Create a password" required />
                  </label>

                  <label>
                    Phone number
                    <input name="phone_number" type="tel" placeholder="0123456789" />
                  </label>
                </div>

                <div className="auth-grid">
                  <label>
                    Organization name
                    <input name="organization_name" type="text" placeholder="BrightFuture Foundation" required />
                  </label>

                  <label>
                    Organization type
                    <select name="organization_type" defaultValue="Foundation">
                      <option>Foundation</option>
                      <option>Corporate</option>
                      <option>Government Agency</option>
                      <option>University</option>
                      <option>Non-Profit Organization</option>
                    </select>
                  </label>
                </div>

                <label>
                  Website
                  <input name="website" type="url" placeholder="https://www.organization.com" />
                </label>

                {error && <p className="auth-error">{error}</p>}

                <button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "Creating account..." : "Create Provider Account"}
                </button>
              </form>

              <p className="auth-switch">
                Already have an account? <Link to="/login">Log in</Link>
              </p>
            </>
          )}
        </div>
      </section>
    </main>
  );
}

export default RegisterPage;
