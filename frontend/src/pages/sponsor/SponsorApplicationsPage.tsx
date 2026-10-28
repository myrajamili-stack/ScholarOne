import { useEffect, useMemo, useState } from "react";
import api from "../../api/axios";
import { getApiErrorMessage } from "../../utils/apiError";
import { getStoredUser } from "../../utils/authStorage";

type SponsorApplication = {
  application_id: number;
  student_id: number;
  scholarship_id: number;
  application_date?: string | null;
  application_status: string;
  remarks?: string | null;
  scholarship_title: string;
  funding_type?: string | null;
  student_name: string;
  student_email: string;
  education_level?: string | null;
  cgpa?: number | string | null;
  field_of_study?: string | null;
  university?: string | null;
};

type SponsorApplicationsData = {
  sponsor: {
    organization_name: string;
  };
  summary: {
    total: number;
    pending: number;
    approved: number;
    rejected: number;
    new_this_week: number;
    most_applied?: string | null;
  };
  applications: SponsorApplication[];
};

const filters = [
  { label: "All", value: "all" },
  { label: "Pending", value: "pending" },
  { label: "Approved", value: "approved" },
  { label: "Rejected", value: "rejected" },
];

function formatDate(value?: string | null) {
  if (!value) {
    return "Date not available";
  }

  return new Intl.DateTimeFormat("en-MY", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function normalizeStatus(status?: string | null) {
  const normalized = (status || "pending").toLowerCase();

  if (normalized === "approved" || normalized === "rejected") {
    return normalized;
  }

  return "pending";
}

function SponsorApplicationsPage() {
  const user = getStoredUser();
  const [data, setData] = useState<SponsorApplicationsData | null>(null);
  const [activeFilter, setActiveFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  async function loadApplications() {
    if (!user?.user_id) {
      setIsLoading(false);
      return;
    }

    try {
      const response = await api.get<SponsorApplicationsData>(`/sponsors/${user.user_id}/applications`);
      setData(response.data);
      setError("");
    } catch (error) {
      setError(getApiErrorMessage(error, "Unable to load sponsor applications."));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadApplications();
  }, [user?.user_id]);

  const filteredApplications = useMemo(() => {
    if (!data) {
      return [];
    }

    return data.applications.filter((application) => {
      const statusMatch = activeFilter === "all" || normalizeStatus(application.application_status) === activeFilter;
      const searchValue = `${application.student_name} ${application.scholarship_title} ${application.student_email}`.toLowerCase();
      const searchMatch = searchValue.includes(searchTerm.trim().toLowerCase());
      return statusMatch && searchMatch;
    });
  }, [activeFilter, data, searchTerm]);

  async function updateApplicationStatus(applicationId: number, status: "approved" | "rejected") {
    if (!user?.user_id) {
      return;
    }

    setUpdatingId(applicationId);
    setStatusMessage("");
    setError("");

    try {
      const response = await api.patch(`/sponsors/${user.user_id}/applications/${applicationId}`, { status });
      setStatusMessage(response.data.message || `Application marked as ${status}.`);
      await loadApplications();
    } catch (error) {
      setError(getApiErrorMessage(error, "Unable to update this application."));
    } finally {
      setUpdatingId(null);
    }
  }

  if (isLoading) {
    return (
      <div className="sponsor-page">
        <section className="sponsor-empty-state">Loading student applications...</section>
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
        <section className="sponsor-empty-state">Application data is not available.</section>
      </div>
    );
  }

  return (
    <div className="sponsor-page">
      <section className="sponsor-applications-hero">
        <div>
          <p className="sponsor-kicker">Student Applications</p>
          <h2>Applications</h2>
          <span>Review student submissions for {data.sponsor.organization_name || "your organization"} and update their status.</span>
        </div>
      </section>

      <section className="sponsor-stats-grid" aria-label="Application summary">
        <article className="sponsor-stat-card purple">
          <span>▣</span>
          <p>Total Applications</p>
          <strong>{data.summary.total}</strong>
          <small>Received across all listings</small>
        </article>
        <article className="sponsor-stat-card blue">
          <span>□</span>
          <p>Pending Review</p>
          <strong>{data.summary.pending}</strong>
          <small>Waiting for your decision</small>
        </article>
        <article className="sponsor-stat-card green">
          <span>✓</span>
          <p>Approved</p>
          <strong>{data.summary.approved}</strong>
          <small>Accepted applications</small>
        </article>
        <article className="sponsor-stat-card blue">
          <span>✕</span>
          <p>Rejected</p>
          <strong>{data.summary.rejected}</strong>
          <small>Applications not selected</small>
        </article>
      </section>

      <section className="sponsor-panel sponsor-applications-panel">
        <div className="sponsor-scholarship-toolbar">
          <div>
            <p className="sponsor-kicker">Application Review</p>
            <h2>Student application list</h2>
          </div>
          <input
            aria-label="Search applications"
            placeholder="Search student or scholarship..."
            type="search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
        </div>

        <div className="sponsor-application-insights">
          <div>
            <span>New this week</span>
            <strong>{data.summary.new_this_week}</strong>
          </div>
          <div>
            <span>Most applied scholarship</span>
            <strong>{data.summary.most_applied || "No applications yet"}</strong>
          </div>
        </div>

        <div className="sponsor-filter-tabs" aria-label="Filter applications">
          {filters.map((filter) => (
            <button
              className={activeFilter === filter.value ? "active" : ""}
              key={filter.value}
              type="button"
              onClick={() => setActiveFilter(filter.value)}
            >
              {filter.label}
            </button>
          ))}
        </div>

        {error && <div className="sponsor-form-error">{error}</div>}
        {statusMessage && <div className="sponsor-form-success">{statusMessage}</div>}

        {data.applications.length === 0 ? (
          <div className="sponsor-empty-state scholarship-empty">
            <strong>No student applications yet.</strong>
            <p>Applications will appear here after students apply to your approved scholarship listings.</p>
          </div>
        ) : filteredApplications.length > 0 ? (
          <div className="sponsor-application-list">
            {filteredApplications.map((application) => {
              const status = normalizeStatus(application.application_status);
              const isApproved = status === "approved";
              const isRejected = status === "rejected";
              const isUpdating = updatingId === application.application_id;

              return (
                <article className="sponsor-application-card" key={application.application_id}>
                  <div className="sponsor-application-student">
                    <div className="sponsor-avatar small">
                      {application.student_name
                        .split(" ")
                        .map((name) => name[0])
                        .join("")
                        .slice(0, 2)
                        .toUpperCase()}
                    </div>
                    <div>
                      <span className={`sponsor-status ${status}`}>{status}</span>
                      <h3>{application.student_name}</h3>
                      <p>{application.student_email}</p>
                    </div>
                  </div>

                  <div className="sponsor-application-details">
                    <div>
                      <span>Scholarship</span>
                      <strong>{application.scholarship_title}</strong>
                    </div>
                    <div>
                      <span>Applied on</span>
                      <strong>{formatDate(application.application_date)}</strong>
                    </div>
                    <div>
                      <span>CGPA</span>
                      <strong>{application.cgpa ? `${application.cgpa} / 4.00` : "Not provided"}</strong>
                    </div>
                    <div>
                      <span>Field of study</span>
                      <strong>{application.field_of_study || "Not provided"}</strong>
                    </div>
                    <div>
                      <span>University</span>
                      <strong>{application.university || "Not provided"}</strong>
                    </div>
                    <div>
                      <span>Remarks</span>
                      <strong>{application.remarks || "No remarks"}</strong>
                    </div>
                  </div>

                  <div className="sponsor-application-actions">
                    <span className={`sponsor-decision-note ${status}`}>
                      Current decision: {status}
                    </span>
                    <button
                      className="approve"
                      disabled={isApproved || isUpdating}
                      title={isApproved ? "This application is already approved." : "Approve this application"}
                      type="button"
                      onClick={() => updateApplicationStatus(application.application_id, "approved")}
                    >
                      {isApproved ? "Approved" : "Approve"}
                    </button>
                    <button
                      className="reject"
                      disabled={isRejected || isUpdating}
                      title={isRejected ? "This application is already rejected." : "Reject this application"}
                      type="button"
                      onClick={() => updateApplicationStatus(application.application_id, "rejected")}
                    >
                      {isRejected ? "Rejected" : "Reject"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="sponsor-empty-state">No applications match this search or filter.</div>
        )}
      </section>
    </div>
  );
}

export default SponsorApplicationsPage;
