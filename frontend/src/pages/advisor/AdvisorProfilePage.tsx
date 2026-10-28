import { useEffect, useState, type FormEvent } from "react";
import api from "../../api/axios";
import { getApiErrorMessage } from "../../utils/apiError";
import { getStoredUser, storeUser } from "../../utils/authStorage";
import { getInitials } from "../../utils/userDisplay";

type AdvisorProfile = {
  advisor_id: number;
  full_name: string;
  email: string;
  phone_number?: string | null;
  profile_picture?: string | null;
  status?: string | null;
  specialization?: string | null;
  qualification?: string | null;
  experience_years?: number | null;
  average_rating?: number | string | null;
};

function AdvisorProfilePage() {
  const user = getStoredUser();
  const [profile, setProfile] = useState<AdvisorProfile | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    async function loadProfile() {
      if (!user?.user_id) {
        setIsLoading(false);
        return;
      }

      try {
        const response = await api.get<AdvisorProfile>(`/advisors/${user.user_id}/profile`);
        setProfile(response.data);
      } catch (error) {
        setError(getApiErrorMessage(error, "Unable to load advisor profile."));
      } finally {
        setIsLoading(false);
      }
    }

    loadProfile();
  }, [user?.user_id]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!user?.user_id) {
      return;
    }

    const formData = new FormData(event.currentTarget);
    setError("");
    setSuccess("");
    setIsSaving(true);

    try {
      const response = await api.put<AdvisorProfile>(`/advisors/${user.user_id}/profile`, {
        full_name: String(formData.get("full_name") || "").trim(),
        phone_number: String(formData.get("phone_number") || "").trim(),
        profile_picture: String(formData.get("profile_picture") || "").trim(),
        specialization: String(formData.get("specialization") || "").trim(),
        qualification: String(formData.get("qualification") || "").trim(),
        experience_years: formData.get("experience_years") || null,
      });

      setProfile(response.data);
      storeUser({
        ...user,
        full_name: response.data.full_name,
        phone_number: response.data.phone_number,
        profile_picture: response.data.profile_picture,
      });
      setSuccess("Profile updated successfully.");
    } catch (error) {
      setError(getApiErrorMessage(error, "Unable to update advisor profile."));
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <div className="advisor-page">
        <section className="advisor-empty-state">Loading advisor profile...</section>
      </div>
    );
  }

  if (error && !profile) {
    return (
      <div className="advisor-page">
        <section className="advisor-empty-state">{error}</section>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="advisor-page">
        <section className="advisor-empty-state">Advisor profile is not available.</section>
      </div>
    );
  }

  return (
    <div className="advisor-page">
      <section className="advisor-profile-hero">
        <div className="advisor-profile-avatar">{getInitials(profile.full_name)}</div>
        <div>
          <p className="advisor-kicker">Advisor Profile</p>
          <h2>{profile.full_name}</h2>
          <span>{profile.specialization || "Specialization not set"}</span>
        </div>
        <div className="advisor-profile-rating">
          <span>Average Rating</span>
          <strong>{Number(profile.average_rating || 0).toFixed(1)} / 5</strong>
        </div>
      </section>

      <form className="advisor-profile-form" onSubmit={handleSubmit}>
        <section className="advisor-panel advisor-profile-section">
          <div className="advisor-profile-section-heading">
            <div>
              <p className="advisor-kicker">Personal Information</p>
              <h2>Contact Details</h2>
            </div>
            <button className="advisor-primary-button" type="submit" disabled={isSaving}>
              {isSaving ? "Saving..." : "Save Changes"}
            </button>
          </div>

          <div className="advisor-form-grid">
            <label>
              Full name
              <input name="full_name" type="text" defaultValue={profile.full_name || ""} required />
            </label>

            <label>
              Email
              <input type="email" value={profile.email || ""} disabled />
            </label>

            <label>
              Phone number
              <input name="phone_number" type="tel" defaultValue={profile.phone_number || ""} placeholder="0123456789" />
            </label>

            <label>
              Profile picture URL
              <input name="profile_picture" type="url" defaultValue={profile.profile_picture || ""} placeholder="https://example.com/profile.jpg" />
            </label>
          </div>
        </section>

        <section className="advisor-panel advisor-profile-section">
          <div className="advisor-profile-section-heading">
            <div>
              <p className="advisor-kicker">Professional Profile</p>
              <h2>Expertise & Qualifications</h2>
            </div>
          </div>

          <div className="advisor-form-grid">
            <label>
              Specialization
              <input
                name="specialization"
                type="text"
                defaultValue={profile.specialization || ""}
                placeholder="Academic Pathway and Scholarship Guidance"
              />
            </label>

            <label>
              Qualification
              <input name="qualification" type="text" defaultValue={profile.qualification || ""} placeholder="PhD in Education" />
            </label>

            <label>
              Experience years
              <input name="experience_years" type="number" min="0" max="60" defaultValue={profile.experience_years ?? ""} placeholder="8" />
            </label>

            <label>
              Profile status
              <input type="text" value={profile.status || "active"} disabled />
            </label>
          </div>
        </section>

        {(error || success) && <p className={error ? "advisor-form-error" : "advisor-form-success"}>{error || success}</p>}
      </form>
    </div>
  );
}

export default AdvisorProfilePage;
