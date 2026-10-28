import { useEffect, useState } from "react";
import api from "../api/axios";
import ScholarshipCard, { type Scholarship } from "../components/ScholarshipCard";
import { getStoredUser } from "../utils/authStorage";

type ApiScholarship = {
  scholarship_id: number;
  title: string;
  organization_name?: string | null;
  description?: string | null;
  eligibility_criteria?: string | null;
  deadline?: string | null;
  amount?: number | string | null;
  funding_type?: string | null;
  category?: string | null;
  status?: string | null;
};

type ApiApplication = {
  application_id: number;
  student_id: number;
  scholarship_id: number;
  application_date?: string | null;
  application_status?: string | null;
  remarks?: string | null;
};

type ApplicationNotice = {
  type: "success" | "error";
  message: string;
};

function formatDate(date?: string | null) {
  if (!date) return null;
  return new Intl.DateTimeFormat("en-MY", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(date));
}

function toScholarshipCard(scholarship: ApiScholarship): Scholarship {
  return {
    scholarship_id: scholarship.scholarship_id,
    title: scholarship.title,
    organization_name: scholarship.organization_name,
    description: scholarship.description,
    eligibility_criteria: scholarship.eligibility_criteria,
    deadline: formatDate(scholarship.deadline),
    amount: scholarship.amount,
    status: scholarship.status,
    funding_type: scholarship.funding_type,
    category: scholarship.category,
    saved: false,
    tags: [scholarship.category || "Bachelor", scholarship.funding_type || "Scholarship"],
  };
}

function getApplicationStatusLabel(status?: string | null) {
  if (!status) return "";
  return status.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function ScholarshipsPage() {
  const [scholarships, setScholarships] = useState<Scholarship[]>([]);
  const [selectedScholarship, setSelectedScholarship] = useState<Scholarship | null>(null);
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [applyingId, setApplyingId] = useState<number | null>(null);
  const [applicationNotice, setApplicationNotice] = useState<ApplicationNotice | null>(null);
  const [error, setError] = useState("");
  const storedUser = getStoredUser();
  const studentId = storedUser?.role === "student" ? storedUser.user_id : null;

  useEffect(() => {
    async function loadScholarships() {
      try {
        const [scholarshipsResponse, savedResponse, applicationsResponse] = await Promise.all([
          api.get<ApiScholarship[]>("/scholarships"),
          studentId
            ? api.get<ApiScholarship[]>(`/students/${studentId}/saved-scholarships`)
            : Promise.resolve({ data: [] as ApiScholarship[] }),
          studentId
            ? api.get<ApiApplication[]>(`/applications/student/${studentId}`)
            : Promise.resolve({ data: [] as ApiApplication[] }),
        ]);
        const savedIds = new Set(savedResponse.data.map((scholarship) => scholarship.scholarship_id));
        const applicationsByScholarship = new Map(
          applicationsResponse.data.map((application) => [application.scholarship_id, application]),
        );
        setScholarships(
          scholarshipsResponse.data.map((scholarship) => {
            const application = applicationsByScholarship.get(scholarship.scholarship_id);

            return {
              ...toScholarshipCard(scholarship),
              saved: savedIds.has(scholarship.scholarship_id),
              application_id: application?.application_id ?? null,
              application_status: application?.application_status ?? null,
            };
          }),
        );
      } catch {
        setError("Unable to load scholarships right now.");
      } finally {
        setIsLoading(false);
      }
    }

    loadScholarships();
  }, [studentId]);

  const filteredScholarships = scholarships.filter((scholarship) =>
    scholarship.title.toLowerCase().includes(query.toLowerCase())
  );

  function updateSavedState(scholarshipId: number, saved: boolean) {
    setScholarships((currentScholarships) =>
      currentScholarships.map((scholarship) =>
        scholarship.scholarship_id === scholarshipId ? { ...scholarship, saved } : scholarship,
      ),
    );
    setSelectedScholarship((currentScholarship) =>
      currentScholarship?.scholarship_id === scholarshipId ? { ...currentScholarship, saved } : currentScholarship,
    );
  }

  function updateApplicationState(application: ApiApplication) {
    setScholarships((currentScholarships) =>
      currentScholarships.map((scholarship) =>
        scholarship.scholarship_id === application.scholarship_id
          ? {
              ...scholarship,
              application_id: application.application_id,
              application_status: application.application_status || "pending",
            }
          : scholarship,
      ),
    );
    setSelectedScholarship((currentScholarship) =>
      currentScholarship?.scholarship_id === application.scholarship_id
        ? {
            ...currentScholarship,
            application_id: application.application_id,
            application_status: application.application_status || "pending",
          }
        : currentScholarship,
    );
  }

  async function handleToggleSaved(scholarship: Scholarship) {
    if (!studentId) {
      setError("Please log in as a student to save scholarships.");
      return;
    }

    setError("");
    setSavingId(scholarship.scholarship_id);

    try {
      if (scholarship.saved) {
        await api.delete(`/students/${studentId}/saved-scholarships/${scholarship.scholarship_id}`);
        updateSavedState(scholarship.scholarship_id, false);
      } else {
        await api.post(`/students/${studentId}/saved-scholarships/${scholarship.scholarship_id}`);
        updateSavedState(scholarship.scholarship_id, true);
      }
    } catch {
      setError("Unable to update saved scholarships right now.");
    } finally {
      setSavingId(null);
    }
  }

  async function handleApplyScholarship(scholarship: Scholarship) {
    if (!studentId) {
      setApplicationNotice({
        type: "error",
        message: "Please log in as a student before applying for a scholarship.",
      });
      return;
    }

    setApplicationNotice(null);
    setApplyingId(scholarship.scholarship_id);

    try {
      const response = await api.post<{ message: string; application: ApiApplication }>("/applications", {
        student_id: studentId,
        scholarship_id: scholarship.scholarship_id,
      });
      updateApplicationState(response.data.application);
      setApplicationNotice({
        type: "success",
        message: "Application submitted. Your status is now pending review.",
      });
    } catch (err) {
      const response =
        typeof err === "object" && err !== null && "response" in err
          ? (err as {
              response?: {
                status?: number;
                data?: { message?: string; application?: ApiApplication };
              };
            }).response
          : undefined;

      if (response?.status === 409 && response.data?.application) {
        updateApplicationState(response.data.application);
        setApplicationNotice({
          type: "success",
          message: "You have already applied for this scholarship.",
        });
      } else {
        setApplicationNotice({
          type: "error",
          message: response?.data?.message || "Unable to submit your application right now.",
        });
      }
    } finally {
      setApplyingId(null);
    }
  }

  async function handleViewDetails(scholarship: Scholarship) {
    setError("");
    setApplicationNotice(null);

    try {
      const response = await api.get<ApiScholarship>(`/scholarships/${scholarship.scholarship_id}`);
      setSelectedScholarship({
        ...toScholarshipCard(response.data),
        saved: scholarship.saved,
        application_id: scholarship.application_id,
        application_status: scholarship.application_status,
      });
    } catch {
      setSelectedScholarship(scholarship);
    }
  }

  return (
    <section className="module-page">
      <div className="module-header-row">
        <div>
          <p className="module-eyebrow">Scholarship Search</p>
          <h1>Scholarships</h1>
          <span>Search and filter scholarship opportunities available in ScholarOne.</span>
        </div>
        <input
          className="module-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search scholarship name..."
        />
      </div>

      <section className="scholarship-grid module-scholarship-grid">
        {isLoading && <p className="dashboard-message">Loading scholarships...</p>}
        {error && <p className="dashboard-message error">{error}</p>}
        {filteredScholarships.map((scholarship) => (
          <ScholarshipCard
            scholarship={scholarship}
            key={scholarship.scholarship_id}
            isSaving={savingId === scholarship.scholarship_id}
            onToggleSaved={handleToggleSaved}
            onViewDetails={handleViewDetails}
          />
        ))}
        {!isLoading && !error && filteredScholarships.length === 0 && (
          <p className="dashboard-message">
            No scholarships have been added yet. Approved scholarship listings will appear here after a sponsorship
            provider creates them.
          </p>
        )}
      </section>

      {selectedScholarship && (
        <div
          className="scholarship-detail-backdrop"
          role="presentation"
          onClick={() => setSelectedScholarship(null)}
        >
          <article
            className="scholarship-detail-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="scholarship-detail-title"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="scholarship-detail-close"
              aria-label="Close scholarship details"
              onClick={() => setSelectedScholarship(null)}
            >
              ×
            </button>

            <div className="scholarship-detail-header">
              <span className="match listing-status">{selectedScholarship.status || "Available"}</span>
              <h2 id="scholarship-detail-title">{selectedScholarship.title}</h2>
              <p>{selectedScholarship.organization_name || "ScholarOne Partner"}</p>
              <div className="pill-row">
                {selectedScholarship.tags.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
            </div>

            <div className="scholarship-detail-grid">
              <div>
                <span>Deadline</span>
                <strong>{selectedScholarship.deadline || "To be announced"}</strong>
              </div>
              <div>
                <span>Funding amount</span>
                <strong>{selectedScholarship.amount ? `RM ${selectedScholarship.amount}` : "Amount TBA"}</strong>
              </div>
              <div>
                <span>Funding type</span>
                <strong>{selectedScholarship.funding_type || "Scholarship"}</strong>
              </div>
            </div>

            <section className="scholarship-detail-section">
              <h3>Scholarship Description</h3>
              <p>
                {selectedScholarship.description ||
                  "No description has been added by the sponsorship provider yet."}
              </p>
            </section>

            <section className="scholarship-detail-section">
              <h3>Eligibility Criteria</h3>
              <p>
                {selectedScholarship.eligibility_criteria ||
                  "Eligibility criteria will be shown here once the provider adds it."}
              </p>
            </section>

            <div className="scholarship-detail-actions">
              <button
                type="button"
                className={`scholarship-detail-apply${
                  selectedScholarship.application_status ? " is-applied" : ""
                }`}
                disabled={
                  Boolean(selectedScholarship.application_status) ||
                  applyingId === selectedScholarship.scholarship_id
                }
                onClick={() => handleApplyScholarship(selectedScholarship)}
              >
                {selectedScholarship.application_status
                  ? `Applied: ${getApplicationStatusLabel(selectedScholarship.application_status)}`
                  : applyingId === selectedScholarship.scholarship_id
                    ? "Submitting..."
                    : "Apply for Scholarship"}
              </button>
              <button
                type="button"
                className={`scholarship-detail-save${selectedScholarship.saved ? " is-saved" : ""}`}
                disabled={savingId === selectedScholarship.scholarship_id}
                onClick={() => handleToggleSaved(selectedScholarship)}
              >
                {selectedScholarship.saved ? "Saved to Favourites" : "Save to Favourites"}
              </button>
            </div>
            {applicationNotice && (
              <p className={`scholarship-application-notice ${applicationNotice.type}`}>
                {applicationNotice.message}
              </p>
            )}
          </article>
        </div>
      )}
    </section>
  );
}

export default ScholarshipsPage;
