import StudentPageArtwork from "../../components/student/StudentPageArtwork";
import { type ChangeEvent, type FormEvent, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import Icon from "../../components/advisor/AdvisorIcon";
import ProfileAvatar from "../../components/advisor/ProfileAvatar";
import { getApiErrorMessage } from "../../utils/apiError";
import "../../styles/student-profile.css";
import api from "../../api/axios";
import type { StudentProfile } from "../../types/student";
import { getStoredUser, storeUser } from "../../utils/authStorage";
import { getProfileCompletion, PROFILE_UPDATED_EVENT } from "../../utils/profileCompletion";

type ProfileForm = {
  full_name: string;
  email: string;
  phone_number: string;
  date_of_birth: string;
  gender: string;
  nationality: string;
  education_level: string;
  cgpa: string;
  field_of_study: string;
  university: string;
};

type BirthDateParts = {
  day: string;
  month: string;
  year: string;
};

const currentYear = new Date().getFullYear();
const yearOptions = Array.from({ length: 80 }, (_, index) => String(currentYear - index));
const monthOptions = [
  { value: "01", label: "January" },
  { value: "02", label: "February" },
  { value: "03", label: "March" },
  { value: "04", label: "April" },
  { value: "05", label: "May" },
  { value: "06", label: "June" },
  { value: "07", label: "July" },
  { value: "08", label: "August" },
  { value: "09", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
];
const dayOptions = Array.from({ length: 31 }, (_, index) => String(index + 1).padStart(2, "0"));
const nationalityOptions = [
  "Malaysian Citizen",
  "Permanent Resident of Malaysia",
  "International Student in Malaysia",
];
const fieldOfStudyOptions = [
  "Accounting",
  "Actuarial Science",
  "Agriculture",
  "Architecture",
  "Arts and Design",
  "Biomedical Science",
  "Biotechnology",
  "Business Administration",
  "Chemical Engineering",
  "Civil Engineering",
  "Communication and Media Studies",
  "Computer Science",
  "Counselling",
  "Culinary Arts",
  "Cybersecurity",
  "Data Science",
  "Dentistry",
  "Early Childhood Education",
  "Economics",
  "Education",
  "Electrical and Electronic Engineering",
  "Engineering",
  "Environmental Science",
  "Finance",
  "Food Science",
  "Graphic Design",
  "Hospitality and Tourism",
  "Human Resource Management",
  "Information Systems",
  "Information Technology",
  "International Relations",
  "Islamic Studies",
  "Law",
  "Logistics and Supply Chain Management",
  "Marketing",
  "Mass Communication",
  "Mathematics",
  "Mechanical Engineering",
  "Medicine",
  "Nursing",
  "Pharmacy",
  "Psychology",
  "Public Administration",
  "Quantity Surveying",
  "Science",
  "Social Science",
  "Software Engineering",
  "Sports Science",
  "Statistics",
  "TESL",
  "Other",
];

function toForm(profile: StudentProfile | null, fallback = getStoredUser()): ProfileForm {
  const rawDate = profile?.date_of_birth ? String(profile.date_of_birth) : "";
  const birthDate = /^\d{4}-\d{2}-\d{2}/.test(rawDate) ? rawDate.slice(0, 10) : rawDate && Number.isFinite(Date.parse(rawDate)) ? new Date(rawDate).toISOString().slice(0, 10) : "";

  return {
    full_name: profile?.full_name || fallback?.full_name || "",
    email: profile?.email || fallback?.email || "",
    phone_number: profile?.phone_number || fallback?.phone_number || "",
    date_of_birth: birthDate,
    gender: profile?.gender || "",
    nationality: profile?.nationality || "",
    education_level: profile?.education_level || "",
    cgpa: profile?.cgpa != null ? String(profile.cgpa) : "",
    field_of_study: profile?.field_of_study || "",
    university: profile?.university || "",
  };
}

function getDatePart(date: string, part: "year" | "month" | "day") {
  const [year = "", month = "", day = ""] = date.split("-");

  if (part === "year") {
    return year;
  }

  if (part === "month") {
    return month;
  }

  return day;
}

function toDateParts(date: string): BirthDateParts {
  return {
    day: getDatePart(date, "day"),
    month: getDatePart(date, "month"),
    year: getDatePart(date, "year"),
  };
}

function toDateString(parts: BirthDateParts) {
  if (!parts.year || !parts.month || !parts.day) {
    return "";
  }

  return `${parts.year}-${parts.month}-${parts.day}`;
}

function ProfilePage() {
  const user = getStoredUser();
  const [form, setForm] = useState<ProfileForm>(toForm(null, user));
  const [birthDate, setBirthDate] = useState<BirthDateParts>(toDateParts(form.date_of_birth));
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [savedProfile, setSavedProfile] = useState<StudentProfile | null>(null);
  const [savedForm, setSavedForm] = useState<ProfileForm>(toForm(null, user));
  const [tab, setTab] = useState<"personal" | "academic">("personal");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);
  const completion = getProfileCompletion(savedProfile);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadProfile() {
      const profileUser = getStoredUser();
      if (!profileUser?.user_id || profileUser.role !== "student") {
        setIsLoading(false);
        return;
      }

      try {
        const response = await api.get<StudentProfile>(`/students/${profileUser.user_id}/profile`);
        const profileForm = toForm(response.data, profileUser);
        setSavedProfile(response.data);
        setSavedForm(profileForm);
        setForm(profileForm);
        setBirthDate(toDateParts(profileForm.date_of_birth));
      } catch {
        setError("Unable to load your profile details.");
      } finally {
        setIsLoading(false);
      }
    }

    loadProfile();
  }, [user?.role, user?.user_id]);

  function handleChange(event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const { name, value } = event.target;
    setForm((currentForm) => ({ ...currentForm, [name]: value }));
    setFields((current) => ({ ...current, [name]: "" }));
    setMessage("");
  }

  function handleDatePartChange(part: "year" | "month" | "day", value: string) {
    setBirthDate((currentDate) => ({ ...currentDate, [part]: value }));
    setFields((current) => ({ ...current, date_of_birth: "" }));
    setMessage("");
  }

  function discardChanges() {
    setForm(savedForm);
    setBirthDate(toDateParts(savedForm.date_of_birth));
    setFields({}); setError(""); setMessage("Unsaved changes discarded.");
  }

  async function uploadPhoto(file?: File) {
    if (!file || !user || uploading) return;
    setError(""); setMessage("");
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) { setError("Choose a JPG, PNG or WebP photo."); return; }
    if (file.size > 5 * 1024 * 1024) { setError("Choose a photo smaller than 5 MB."); return; }
    setUploading(true);
    try {
      const body = new FormData(); body.append("photo", file);
      const { data } = await api.post<{ profile_picture: string }>(`/students/${user.user_id}/profile/photo`, body);
      setSavedProfile((current) => current ? { ...current, profile_picture: data.profile_picture } : current);
      storeUser({ ...user, profile_picture: data.profile_picture });
      setMessage("Profile photo updated successfully.");
    } catch (error) { setError(getApiErrorMessage(error, "Unable to upload your photo. Please try again.")); }
    finally { setUploading(false); }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");

    if (!user?.user_id) {
      setError("Please log in again before editing your profile.");
      return;
    }

    const errors: Record<string, string> = {};
    if (form.full_name.trim().length < 2 || form.full_name.trim().length > 100) errors.full_name = "Enter your full name (2–100 characters).";
    const phone = form.phone_number.trim();
    if (phone && (!/^\+?[0-9 ()-]+$/.test(phone) || !/^\+?[0-9]{7,15}$/.test(phone.replace(/[ ()-]/g, "")))) errors.phone_number = "Enter 7–15 digits, with an optional +, spaces, brackets or hyphens.";
    const dob = toDateString(birthDate);
    if (Object.values(birthDate).some(Boolean)) {
      const parsed = new Date(`${dob}T12:00:00Z`);
      if (!dob || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== dob || parsed.getTime() > new Date().setUTCHours(23, 59, 59, 999)) errors.date_of_birth = "Choose a valid birth date that is not in the future.";
    }
    if (form.cgpa !== "" && (!Number.isFinite(Number(form.cgpa)) || Number(form.cgpa) < 0 || Number(form.cgpa) > 4)) errors.cgpa = "Enter a CGPA between 0.00 and 4.00.";
    if (Object.keys(errors).length) {
      setFields(errors); setTab(errors.full_name || errors.phone_number || errors.date_of_birth ? "personal" : "academic");
      setError("Please correct the highlighted fields before saving."); return;
    }
    try {
      setIsSaving(true);
      const response = await api.put<StudentProfile>(`/students/${user.user_id}/profile`, {
        ...form,
        date_of_birth: toDateString(birthDate),
      });
      const profileForm = toForm(response.data, user);
      setSavedProfile(response.data);
      setSavedForm(profileForm);
      setFields({});
      setForm(profileForm);
      setBirthDate(toDateParts(profileForm.date_of_birth));
      storeUser({
        ...user,
        full_name: response.data.full_name,
        phone_number: response.data.phone_number,
      });
      window.dispatchEvent(new CustomEvent(PROFILE_UPDATED_EVENT, { detail: response.data }));
      setMessage("Profile updated successfully.");
    } catch (error) {
      setError(getApiErrorMessage(error, "Unable to update profile. Please check your details and try again."));
    } finally {
      setIsSaving(false);
    }
  }

  const busy = isLoading || isSaving || uploading;
  return (
    <section className="student-profile">
      <header className="sp-hero">
        <div className="sp-hero-copy"><span className="sp-eyebrow"><Icon name="user" />Student Profile</span><h1>My Profile <span aria-hidden="true">✦</span></h1><p>Keep your personal and academic details updated for better scholarship matching.</p></div>
        <StudentPageArtwork name="profile" className="sp-hero-art" />
      </header>
      <div className="sp-layout">
        <aside className="sp-card sp-summary">
          <div className="sp-photo"><ProfileAvatar className="sp-avatar" name={savedProfile?.full_name || user?.full_name || "Student"} imageUrl={savedProfile?.profile_picture || user?.profile_picture} /><button type="button" aria-label="Choose profile photo" title="Choose a photo from your device" disabled={busy} onClick={() => photoInput.current?.click()}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m8 5 2-3h4l2 3h5v16H3V5h5Z"/><circle cx="12" cy="12" r="4"/></svg></button></div>
          <h2>{savedProfile?.full_name || user?.full_name || "Student"}</h2><p>Student</p>
          <div className="sp-completion"><div><strong>Profile Completion</strong><b>{completion}%</b></div><div role="progressbar" aria-label="Profile completion" aria-valuenow={completion} aria-valuemin={0} aria-valuemax={100}><span style={{width: `${completion}%`}} /></div></div>
          <nav aria-label="Profile sections"><button type="button" aria-current={tab === "personal" ? "page" : undefined} onClick={() => setTab("personal")}><Icon name="user" />Personal Information</button><button type="button" aria-current={tab === "academic" ? "page" : undefined} onClick={() => setTab("academic")}><Icon name="graduation" />Academic Information</button><Link to="/settings"><Icon name="shield" />Account &amp; Security</Link></nav>
          <p className="sp-photo-help">Choose a JPG, PNG or WebP photo, up to 5 MB. Photos save immediately.</p>
        </aside>
        <form className="sp-card sp-editor" onSubmit={handleSubmit} noValidate>
          <div className="sp-tabs" role="tablist" aria-label="Profile details"><button type="button" role="tab" id="sp-personal-tab" aria-selected={tab === "personal"} aria-controls="sp-personal" tabIndex={tab === "personal" ? 0 : -1} onClick={() => setTab("personal")} onKeyDown={event => {if (event.key === "ArrowRight" || event.key === "ArrowLeft") {setTab("academic"); document.getElementById("sp-academic-tab")?.focus();}}}><Icon name="user" />Personal Information</button><button type="button" role="tab" id="sp-academic-tab" aria-selected={tab === "academic"} aria-controls="sp-academic" tabIndex={tab === "academic" ? 0 : -1} onClick={() => setTab("academic")} onKeyDown={event => {if (event.key === "ArrowRight" || event.key === "ArrowLeft") {setTab("personal"); document.getElementById("sp-personal-tab")?.focus();}}}><Icon name="graduation" />Academic Information</button></div>
          <div className="sp-editor-body">
            {isLoading && <p className="sp-notice" role="status">Loading your profile…</p>}
            {uploading && <p className="sp-notice" role="status">Uploading photo…</p>}
            {message && <p className="sp-notice success" role="status">{message}</p>}
            {error && <p className="sp-notice error" role="alert">{error}</p>}
            <fieldset disabled={busy}>
              <section id="sp-personal" role="tabpanel" aria-labelledby="sp-personal-tab" hidden={tab !== "personal"}>
                <h2>Personal Information</h2><p className="sp-description">Your basic details and contact information.</p>
          <div className="profile-form-grid">
            <label>
              <span>Full name <b className="sp-required" aria-hidden="true">*</b></span>
              <input name="full_name" aria-invalid={!!fields.full_name} aria-describedby={fields.full_name ? "sp-error-full_name" : undefined} value={form.full_name} onChange={handleChange} required />
              {fields.full_name && <small className="sp-field-error" id="sp-error-full_name">{fields.full_name}</small>}
            </label>
            <label>
              <span>Email</span>
              <input name="email" value={form.email} disabled />
            </label>
            <label>
              <span>Phone number</span>
              <input type="tel" autoComplete="tel" name="phone_number" aria-invalid={!!fields.phone_number} aria-describedby={fields.phone_number ? "sp-error-phone_number" : undefined} value={form.phone_number} onChange={handleChange} />
              {fields.phone_number && <small className="sp-field-error" id="sp-error-phone_number">{fields.phone_number}</small>}
            </label>
            <label>
              <span id="sp-birth-label">Date of birth</span>
              <div className="date-select-grid" role="group" aria-labelledby="sp-birth-label" aria-invalid={!!fields.date_of_birth} aria-describedby={fields.date_of_birth ? "sp-error-date_of_birth" : undefined}>
                <select
                  aria-label="Birth day"
                  value={birthDate.day}
                  onChange={(event) => handleDatePartChange("day", event.target.value)}
                >
                  <option value="">Day</option>
                  {dayOptions.map((day) => (
                    <option value={day} key={day}>
                      {day}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Birth month"
                  value={birthDate.month}
                  onChange={(event) => handleDatePartChange("month", event.target.value)}
                >
                  <option value="">Month</option>
                  {monthOptions.map((month) => (
                    <option value={month.value} key={month.value}>
                      {month.label}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Birth year"
                  value={birthDate.year}
                  onChange={(event) => handleDatePartChange("year", event.target.value)}
                >
                  <option value="">Year</option>
                  {yearOptions.map((year) => (
                    <option value={year} key={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </div>
              {fields.date_of_birth && <small className="sp-field-error" id="sp-error-date_of_birth">{fields.date_of_birth}</small>}
            </label>
            <label>
              <span>Gender</span>
              <select name="gender" value={form.gender} onChange={handleChange}>
                <option value="">Select gender</option>
                <option value="Female">Female</option>
                <option value="Male">Male</option>
                <option value="Prefer not to say">Prefer not to say</option>
              </select>
            </label>
            <label>
              <span>Nationality</span>
              <select name="nationality" value={form.nationality} onChange={handleChange}>
                <option value="">Select nationality</option>
                {nationalityOptions.map((nationality) => (
                  <option value={nationality} key={nationality}>
                    {nationality}
                  </option>
                ))}
              </select>
            </label>
          </div>

              </section>
              <section id="sp-academic" role="tabpanel" aria-labelledby="sp-academic-tab" hidden={tab !== "academic"}>
                <h2>Academic Information</h2><p className="sp-description">Your current studies and academic achievements.</p>
          <div className="profile-form-grid">
            <label>
              <span>Education level</span>
              <select name="education_level" value={form.education_level} onChange={handleChange}>
                <option value="">Select education level</option>
                <option value="Foundation">Foundation</option>
                <option value="Diploma">Diploma</option>
                <option value="Undergraduate">Undergraduate</option>
                <option value="Postgraduate">Postgraduate</option>
              </select>
            </label>
            <label>
              <span>CGPA</span>
              <input
                name="cgpa" aria-invalid={!!fields.cgpa} aria-describedby={fields.cgpa ? "sp-error-cgpa" : undefined}
                type="number"
                min="0"
                max="4"
                step="0.01"
                value={form.cgpa}
                onChange={handleChange}
              />
              {fields.cgpa && <small className="sp-field-error" id="sp-error-cgpa">{fields.cgpa}</small>}
            </label>
            <label>
              <span>Field of study</span>
              <select name="field_of_study" value={form.field_of_study} onChange={handleChange}>
                <option value="">Select field of study</option>
                {fieldOfStudyOptions.map((field) => (
                  <option value={field} key={field}>
                    {field}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>University</span>
              <input name="university" value={form.university} onChange={handleChange} />
            </label>
          </div>

              </section>
            </fieldset>
            <footer className="sp-footer"><button className="sp-discard" type="button" disabled={busy} onClick={discardChanges}>Discard</button><button className="ss-button" type="submit" disabled={busy}><span aria-hidden="true">✓</span>{isSaving ? "Saving…" : "Save Changes"}</button></footer>
          </div>
        </form>
      </div>
      <input ref={photoInput} type="file" accept="image/jpeg,image/png,image/webp" hidden aria-label="Choose a profile photo from your device" onChange={event => {const file = event.target.files?.[0]; event.target.value = ""; void uploadPhoto(file);}} />
    </section>
  );
}

export default ProfilePage;
