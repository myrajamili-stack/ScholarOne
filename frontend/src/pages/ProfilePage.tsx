import { type ChangeEvent, type FormEvent, useEffect, useState } from "react";
import api from "../api/axios";
import type { StudentProfile } from "../types/student";
import { getStoredUser, storeUser } from "../utils/authStorage";
import { PROFILE_UPDATED_EVENT } from "../utils/profileCompletion";
import { getInitials } from "../utils/userDisplay";

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
  const birthDate = profile?.date_of_birth ? String(profile.date_of_birth).slice(0, 10) : "";

  return {
    full_name: profile?.full_name || fallback?.full_name || "",
    email: profile?.email || fallback?.email || "",
    phone_number: profile?.phone_number || fallback?.phone_number || "",
    date_of_birth: birthDate,
    gender: profile?.gender || "",
    nationality: profile?.nationality || "",
    education_level: profile?.education_level || "",
    cgpa: profile?.cgpa ? String(profile.cgpa) : "",
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
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadProfile() {
      if (!user?.user_id || user.role !== "student") {
        setIsLoading(false);
        return;
      }

      try {
        const response = await api.get<StudentProfile>(`/students/${user.user_id}/profile`);
        const profileForm = toForm(response.data, user);
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
  }

  function handleDatePartChange(part: "year" | "month" | "day", value: string) {
    setBirthDate((currentDate) => ({ ...currentDate, [part]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");

    if (!user?.user_id) {
      setError("Please log in again before editing your profile.");
      return;
    }

    try {
      setIsSaving(true);
      const response = await api.put<StudentProfile>(`/students/${user.user_id}/profile`, {
        ...form,
        date_of_birth: toDateString(birthDate),
      });
      const profileForm = toForm(response.data, user);
      setForm(profileForm);
      setBirthDate(toDateParts(profileForm.date_of_birth));
      storeUser({
        ...user,
        full_name: response.data.full_name,
        phone_number: response.data.phone_number,
      });
      window.dispatchEvent(new CustomEvent(PROFILE_UPDATED_EVENT, { detail: response.data }));
      setMessage("Profile updated successfully.");
    } catch {
      setError("Unable to update profile. Please check your details and try again.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="profile-editor-page">
      <header className="profile-editor-hero">
        <div className="profile-editor-avatar">{getInitials(form.full_name)}</div>
        <div>
          <p>Student Information</p>
          <h1>Edit Profile</h1>
          <span>Keep your personal and academic details updated for better scholarship matching.</span>
        </div>
      </header>

      <form className="profile-editor-card" onSubmit={handleSubmit}>
        <div className="profile-editor-heading">
          <div>
            <h2>Profile Details</h2>
            <p>These details help ScholarOne match you with suitable scholarships and pathways.</p>
          </div>
          <button type="submit" disabled={isSaving || isLoading}>
            {isSaving ? "Saving..." : "Save Changes"}
          </button>
        </div>

        {message && <p className="form-alert success">{message}</p>}
        {error && <p className="form-alert error">{error}</p>}

        <section className="profile-form-section">
          <h3>Personal Information</h3>
          <div className="profile-form-grid">
            <label>
              <span>Full name</span>
              <input name="full_name" value={form.full_name} onChange={handleChange} required />
            </label>
            <label>
              <span>Email</span>
              <input name="email" value={form.email} disabled />
            </label>
            <label>
              <span>Phone number</span>
              <input name="phone_number" value={form.phone_number} onChange={handleChange} />
            </label>
            <label>
              <span>Date of birth</span>
              <div className="date-select-grid">
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

        <section className="profile-form-section">
          <h3>Academic Information</h3>
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
                name="cgpa"
                type="number"
                min="0"
                max="4"
                step="0.01"
                value={form.cgpa}
                onChange={handleChange}
              />
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
      </form>
    </section>
  );
}

export default ProfilePage;
