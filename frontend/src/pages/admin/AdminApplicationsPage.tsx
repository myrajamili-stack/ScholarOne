import { useCallback, useEffect, useMemo, useState } from "react";

import api from "../../api/axios";
import { getApiErrorMessage } from "../../utils/apiError";

type AdminApplication = {
  application_id: number;
  student_id: number;
  scholarship_id: number;
  application_date: string | null;
  application_status: string;
  remarks: string | null;
  scholarship_title: string;
  funding_type: string | null;
  organization_name: string;
  sponsor_email: string | null;
  student_name: string;
  student_email: string;
  education_level: string | null;
  cgpa: number | string | null;
  field_of_study: string | null;
  university: string | null;
};

type ScholarshipBreakdown = {
  scholarship_id: number;
  title: string;
  organization_name: string;
  total_applications: number | string;
  pending: number | string;
  approved: number | string;
  rejected: number | string;
};

type AdminApplicationsSummary = {
  total_applications: number;
  pending: number;
  approved: number;
  rejected: number;
  new_this_week: number;
  most_applied: {
    title: string;
    total_applications: number;
  } | null;
};

type AdminApplicationsResponse = {
  summary: AdminApplicationsSummary;
  applications: AdminApplication[];
  scholarship_breakdown: ScholarshipBreakdown[];
};

const statusOptions = [
  { value: "all", label: "All statuses" },
  { value: "pending", label: "Pending review" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

function normalizeStatus(status: string) {
  return status.toLowerCase().replace(/\s+/g, "_");
}

function getStatusLabel(status: string) {
  return normalizeStatus(status)
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatDate(value: string | null) {
  if (!value) return "No date recorded";

  return new Intl.DateTimeFormat("en-MY", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default function AdminApplicationsPage() {
  const [summary, setSummary] = useState<AdminApplicationsSummary>({
    total_applications: 0,
    pending: 0,
    approved: 0,
    rejected: 0,
    new_this_week: 0,
    most_applied: null,
  });
  const [applications, setApplications] = useState<AdminApplication[]>([]);
  const [breakdown, setBreakdown] = useState<ScholarshipBreakdown[]>([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [error, setError] = useState("");

  const loadApplications = useCallback(async () => {
    try {
      setIsLoading(true);
      setError("");
      const response =
        await api.get<AdminApplicationsResponse>("/admin/applications");
      setSummary(response.data.summary);
      setApplications(response.data.applications);
      setBreakdown(response.data.scholarship_breakdown);
    } catch (err) {
      setError(getApiErrorMessage(err, "Unable to load applications."));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadApplications();
  }, [loadApplications]);

  const filteredApplications = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    return applications.filter((application) => {
      const status = normalizeStatus(application.application_status);
      const matchesStatus = statusFilter === "all" || status === statusFilter;
      const searchableText = [
        application.student_name,
        application.student_email,
        application.scholarship_title,
        application.organization_name,
        application.field_of_study,
        application.university,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return matchesStatus && (!query || searchableText.includes(query));
    });
  }, [applications, searchTerm, statusFilter]);

  async function updateApplicationStatus(
    applicationId: number,
    nextStatus: "approved" | "rejected" | "pending",
  ) {
    try {
      setUpdatingId(applicationId);
      setError("");
      await api.patch(`/admin/applications/${applicationId}/status`, {
        status: nextStatus,
      });
      await loadApplications();
    } catch (err) {
      setError(getApiErrorMessage(err, "Unable to update application status."));
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <div className="admin-page">
      <section className="admin-module-hero">
        <div>
          <span>Application Oversight</span>
          <h1>Student Applications</h1>
          <p>
            Monitor student scholarship applications across every provider,
            review application status, and keep the application flow visible to
            administrators.
          </p>
        </div>
        <div className="admin-hero-metric">
          <strong>{summary.pending}</strong>
          <span>pending review</span>
        </div>
      </section>

      {error ? <div className="admin-alert">{error}</div> : null}

      <section className="admin-applications-summary">
        <article className="admin-stat-card">
          <span>Total Applications</span>
          <strong>{summary.total_applications}</strong>
          <small>Student submissions in the database.</small>
        </article>
        <article className="admin-stat-card">
          <span>Pending Review</span>
          <strong>{summary.pending}</strong>
          <small>Waiting for a status decision.</small>
        </article>
        <article className="admin-stat-card">
          <span>Approved</span>
          <strong>{summary.approved}</strong>
          <small>Applications marked successful.</small>
        </article>
        <article className="admin-stat-card">
          <span>Rejected</span>
          <strong>{summary.rejected}</strong>
          <small>Applications that did not pass review.</small>
        </article>
      </section>

      <section className="admin-applications-layout">
        <div className="admin-scholarship-panel">
          <div className="admin-scholarship-panel-header">
            <div>
              <span>Application Records</span>
              <h2>Student application monitor</h2>
            </div>
            <div className="admin-scholarship-controls">
              <input
                aria-label="Search applications"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search student, scholarship, provider..."
              />
              <select
                aria-label="Filter applications by status"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                {statusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {isLoading ? (
            <div className="admin-empty-state">Loading applications...</div>
          ) : filteredApplications.length === 0 ? (
            <div className="admin-empty-state">
              No student applications found. Applications will appear here after
              students submit to approved scholarship listings.
            </div>
          ) : (
            <div className="admin-application-list">
              {filteredApplications.map((application) => {
                const status = normalizeStatus(application.application_status);
                const canApprove = status !== "approved";
                const canReject = status !== "rejected";

                return (
                  <article
                    className="admin-application-card"
                    key={application.application_id}
                  >
                    <div className="admin-application-card-head">
                      <div className="admin-user-cell">
                        <span className="admin-user-avatar">
                          {getInitials(application.student_name)}
                        </span>
                        <div>
                          <strong>{application.student_name}</strong>
                          <small>{application.student_email}</small>
                        </div>
                      </div>
                      <span className={`admin-status-badge ${status}`}>
                        {getStatusLabel(application.application_status)}
                      </span>
                    </div>

                    <div className="admin-application-detail-grid">
                      <div>
                        <span>Scholarship</span>
                        <strong>{application.scholarship_title}</strong>
                        <small>{application.organization_name}</small>
                      </div>
                      <div>
                        <span>Academic Profile</span>
                        <strong>
                          {application.cgpa
                            ? `${application.cgpa} CGPA`
                            : "CGPA not stated"}
                        </strong>
                        <small>
                          {application.field_of_study || "Field not stated"}
                        </small>
                      </div>
                      <div>
                        <span>Submitted</span>
                        <strong>{formatDate(application.application_date)}</strong>
                        <small>
                          {application.education_level || "Level not stated"}
                        </small>
                      </div>
                    </div>

                    <div className="admin-application-note">
                      <span>Remarks</span>
                      <p>
                        {application.remarks ||
                          "No remarks have been added to this application."}
                      </p>
                    </div>

                    <div className="admin-scholarship-actions">
                      {canApprove ? (
                        <button
                          className="admin-primary-button"
                          disabled={updatingId === application.application_id}
                          type="button"
                          onClick={() =>
                            void updateApplicationStatus(
                              application.application_id,
                              "approved",
                            )
                          }
                        >
                          Approve
                        </button>
                      ) : null}
                      {canReject ? (
                        <button
                          className="admin-danger-button"
                          disabled={updatingId === application.application_id}
                          type="button"
                          onClick={() =>
                            void updateApplicationStatus(
                              application.application_id,
                              "rejected",
                            )
                          }
                        >
                          Reject
                        </button>
                      ) : null}
                      {status !== "pending" ? (
                        <button
                          className="admin-secondary-button"
                          disabled={updatingId === application.application_id}
                          type="button"
                          onClick={() =>
                            void updateApplicationStatus(
                              application.application_id,
                              "pending",
                            )
                          }
                        >
                          Mark pending
                        </button>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>

        <aside className="admin-panel admin-application-insights">
          <div className="admin-panel-header">
            <div>
              <span className="admin-kicker">Scholarship Demand</span>
              <h2>Application summary</h2>
            </div>
          </div>

          <div className="admin-insight-card">
            <span>New This Week</span>
            <strong>{summary.new_this_week}</strong>
            <p>Applications submitted in the last 7 days.</p>
          </div>

          <div className="admin-insight-card">
            <span>Most Applied</span>
            <strong>{summary.most_applied?.title || "No applications yet"}</strong>
            <p>
              {summary.most_applied
                ? `${summary.most_applied.total_applications} applications received.`
                : "The most applied scholarship will appear here."}
            </p>
          </div>

          <div className="admin-breakdown-list">
            {breakdown.length === 0 ? (
              <p className="admin-empty-copy">
                Scholarship application totals will appear after providers add
                listings.
              </p>
            ) : (
              breakdown.map((item) => (
                <div key={item.scholarship_id}>
                  <strong>{item.title}</strong>
                  <span>{item.organization_name}</span>
                  <small>
                    {Number(item.total_applications)} total ·{" "}
                    {Number(item.pending)} pending · {Number(item.approved)}{" "}
                    approved · {Number(item.rejected)} rejected
                  </small>
                </div>
              ))
            )}
          </div>
        </aside>
      </section>
    </div>
  );
}
