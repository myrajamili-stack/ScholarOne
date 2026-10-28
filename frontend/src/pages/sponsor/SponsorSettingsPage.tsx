import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import api from "../../api/axios";
import { getApiErrorMessage } from "../../utils/apiError";
import { getStoredUser, storeUser } from "../../utils/authStorage";

type SponsorSettingsData = {
  sponsor: {
    sponsor_id: number;
    full_name: string;
    email: string;
    phone_number?: string | null;
    status: string;
    organization_name: string;
    organization_type?: string | null;
    website?: string | null;
    subscription_status?: string | null;
  };
};

type SponsorSettingsForm = {
  organization_name: string;
  organization_type: string;
  website: string;
  phone_number: string;
};

const organizationTypes = [
  "Foundation",
  "Corporate",
  "Government Agency",
  "University",
  "Non-profit Organization",
  "Professional Body",
  "Private Education Provider",
];

function SponsorSettingsPage() {
  const user = getStoredUser();
  const [data, setData] = useState<SponsorSettingsData | null>(null);
  const [form, setForm] = useState<SponsorSettingsForm>({
    organization_name: "",
    organization_type: "",
    website: "",
    phone_number: "",
  });
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [applicationAlerts, setApplicationAlerts] = useState(true);
  const [appealAlerts, setAppealAlerts] = useState(true);
  const [weeklyDigest, setWeeklyDigest] = useState(false);
  const [profileVisible, setProfileVisible] = useState(true);
  const [autoRenewal, setAutoRenewal] = useState(false);
  const [requireDocuments, setRequireDocuments] = useState(true);
  const [allowStudentMessages, setAllowStudentMessages] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  async function loadSettings() {
    if (!user?.user_id) {
      setIsLoading(false);
      return;
    }

    try {
      const response = await api.get<SponsorSettingsData>(`/sponsors/${user.user_id}/settings`);
      setData(response.data);
      setForm({
        organization_name: response.data.sponsor.organization_name || "",
        organization_type: response.data.sponsor.organization_type || "",
        website: response.data.sponsor.website || "",
        phone_number: response.data.sponsor.phone_number || "",
      });
      setError("");
    } catch (error) {
      setError(getApiErrorMessage(error, "Unable to load provider settings."));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadSettings();
  }, [user?.user_id]);

  const profileCompletion = useMemo(() => {
    const fields = [form.organization_name, form.organization_type, form.website, form.phone_number];
    const completed = fields.filter((field) => field.trim().length > 0).length;
    return Math.round((completed / fields.length) * 100);
  }, [form]);

  function updateField(field: keyof SponsorSettingsForm, value: string) {
    setForm((currentForm) => ({
      ...currentForm,
      [field]: value,
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!user?.user_id) {
      setError("Please log in as a sponsorship provider before updating settings.");
      return;
    }

    setIsSaving(true);

    try {
      const response = await api.patch(`/sponsors/${user.user_id}/settings`, form);
      storeUser({
        ...user,
        full_name: response.data.user.full_name,
        phone_number: response.data.user.phone_number,
      });
      setSuccess(response.data.message || "Provider settings updated successfully.");
      await loadSettings();
    } catch (error) {
      setError(getApiErrorMessage(error, "Unable to update provider settings."));
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <div className="sponsor-page">
        <section className="sponsor-empty-state">Loading provider settings...</section>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="sponsor-page">
        <section className="sponsor-empty-state">{error}</section>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="sponsor-page">
        <section className="sponsor-empty-state">Provider settings are not available.</section>
      </div>
    );
  }

  return (
    <div className="sponsor-page">
      <section className="sponsor-settings-hero">
        <div>
          <p className="sponsor-kicker">Account Preferences</p>
          <h2>Settings</h2>
          <span>Manage provider profile details, scholarship workflow preferences, alerts, visibility, and account security.</span>
        </div>
        <div className="sponsor-settings-account">
          <div className="sponsor-settings-avatar">{form.organization_name ? form.organization_name.slice(0, 2).toUpperCase() : "SP"}</div>
          <div>
            <strong>{form.organization_name || "Sponsorship Provider"}</strong>
            <span>{data.sponsor.email}</span>
            <small>{profileCompletion}% profile complete</small>
          </div>
        </div>
      </section>

      {error && <div className="sponsor-form-error">{error}</div>}
      {success && <div className="sponsor-form-success">{success}</div>}

      <form className="sponsor-settings-layout redesigned" onSubmit={handleSubmit}>
        <section className="sponsor-settings-main">
          <article className="sponsor-panel sponsor-form-panel sponsor-settings-form">
            <div className="sponsor-settings-section-header">
              <div>
                <p className="sponsor-kicker">Organization Profile</p>
                <h2>Provider information</h2>
                <span>These details appear on scholarship listings and administrator records.</span>
              </div>
              <button className="sponsor-primary-button" disabled={isSaving} type="submit">
                {isSaving ? "Saving..." : "Save Changes"}
              </button>
            </div>

            <div className="sponsor-form-grid">
              <label>
                Organization name
                <input
                  required
                  value={form.organization_name}
                  onChange={(event) => updateField("organization_name", event.target.value)}
                />
              </label>

              <label>
                Organization type
                <select
                  value={form.organization_type}
                  onChange={(event) => updateField("organization_type", event.target.value)}
                >
                  <option value="">Select organization type</option>
                  {organizationTypes.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Email address
                <input disabled value={data.sponsor.email} />
              </label>

              <label>
                Phone number
                <input
                  placeholder="03-1234 5678"
                  value={form.phone_number}
                  onChange={(event) => updateField("phone_number", event.target.value)}
                />
              </label>

              <label className="sponsor-wide-field">
                Website
                <input
                  placeholder="https://brightfuture.org"
                  value={form.website}
                  onChange={(event) => updateField("website", event.target.value)}
                />
              </label>
            </div>
          </article>

          <div className="sponsor-settings-card-grid">
            <div className="sponsor-settings-column">
              <article className="sponsor-panel sponsor-settings-panel">
                <div className="sponsor-settings-section-header compact">
                  <div>
                    <p className="sponsor-kicker">Notifications</p>
                    <h2>Alert preferences</h2>
                  </div>
                </div>

                <div className="sponsor-settings-toggle-list">
                  <label>
                    <span>
                      <strong>All notifications</strong>
                      <small>Receive admin and application updates.</small>
                    </span>
                    <input
                      checked={notificationsEnabled}
                      type="checkbox"
                      onChange={(event) => setNotificationsEnabled(event.target.checked)}
                    />
                  </label>
                  <label>
                    <span>
                      <strong>Application alerts</strong>
                      <small>Notify when students submit applications.</small>
                    </span>
                    <input
                      checked={applicationAlerts}
                      type="checkbox"
                      onChange={(event) => setApplicationAlerts(event.target.checked)}
                    />
                  </label>
                  <label>
                    <span>
                      <strong>Appeal updates</strong>
                      <small>Notify when administrators review appeals.</small>
                    </span>
                    <input checked={appealAlerts} type="checkbox" onChange={(event) => setAppealAlerts(event.target.checked)} />
                  </label>
                  <label>
                    <span>
                      <strong>Weekly digest</strong>
                      <small>Receive a weekly provider activity summary.</small>
                    </span>
                    <input checked={weeklyDigest} type="checkbox" onChange={(event) => setWeeklyDigest(event.target.checked)} />
                  </label>
                </div>
              </article>

              <article className="sponsor-panel sponsor-settings-panel">
                <div className="sponsor-settings-section-header compact">
                  <div>
                    <p className="sponsor-kicker">Visibility</p>
                    <h2>Provider display</h2>
                  </div>
                </div>

                <div className="sponsor-settings-toggle-list">
                  <label>
                    <span>
                      <strong>Public provider profile</strong>
                      <small>Show organization name and website on scholarship details.</small>
                    </span>
                    <input checked={profileVisible} type="checkbox" onChange={(event) => setProfileVisible(event.target.checked)} />
                  </label>
                </div>
              </article>
            </div>

            <div className="sponsor-settings-column">
              <article className="sponsor-panel sponsor-settings-panel">
                <div className="sponsor-settings-section-header compact">
                  <div>
                    <p className="sponsor-kicker">Scholarship Workflow</p>
                    <h2>Submission rules</h2>
                  </div>
                </div>

                <div className="sponsor-settings-toggle-list">
                  <label>
                    <span>
                      <strong>Require applicant documents</strong>
                      <small>Students should upload supporting files before submission.</small>
                    </span>
                    <input
                      checked={requireDocuments}
                      type="checkbox"
                      onChange={(event) => setRequireDocuments(event.target.checked)}
                    />
                  </label>
                  <label>
                    <span>
                      <strong>Student messages</strong>
                      <small>Allow students to send questions about active listings.</small>
                    </span>
                    <input
                      checked={allowStudentMessages}
                      type="checkbox"
                      onChange={(event) => setAllowStudentMessages(event.target.checked)}
                    />
                  </label>
                </div>
              </article>

              <article className="sponsor-panel sponsor-settings-panel">
                <div className="sponsor-settings-section-header compact">
                  <div>
                    <p className="sponsor-kicker">Subscription</p>
                    <h2>Plan preferences</h2>
                  </div>
                </div>

                <div className="sponsor-settings-toggle-list">
                  <label>
                    <span>
                      <strong>Auto renewal</strong>
                      <small>Prepare plan renewal when the current cycle ends.</small>
                    </span>
                    <input checked={autoRenewal} type="checkbox" onChange={(event) => setAutoRenewal(event.target.checked)} />
                  </label>
                </div>
              </article>
            </div>
          </div>

          <article className="sponsor-panel sponsor-settings-security-panel">
            <div className="sponsor-settings-section-header compact">
              <div>
                <p className="sponsor-kicker">Security</p>
                <h2>Account access</h2>
              </div>
            </div>
            <div className="sponsor-security-list horizontal">
              <div>
                <span>Password</span>
                <strong>Protected</strong>
              </div>
              <div>
                <span>Role</span>
                <strong>Sponsorship Provider</strong>
              </div>
              <div>
                <span>Subscription</span>
                <strong>{data.sponsor.subscription_status || "free"}</strong>
              </div>
            </div>
          </article>
        </section>
      </form>
    </div>
  );
}

export default SponsorSettingsPage;
