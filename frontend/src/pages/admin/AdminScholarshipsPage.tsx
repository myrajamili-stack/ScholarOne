import { useCallback, useEffect, useMemo, useState } from "react";

import api from "../../api/axios";
import { getApiErrorMessage } from "../../utils/apiError";

type AdminScholarship = {
  scholarship_id: number;
  sponsor_id: number | null;
  organization_name: string;
  sponsor_email: string | null;
  title: string;
  description: string | null;
  amount: number | string | null;
  category: string | null;
  eligibility_criteria: string | null;
  deadline: string | null;
  funding_type: string | null;
  status: string;
  created_at: string | null;
  application_count: number | string;
};

type AdminScholarshipSummary = {
  total_scholarships: number;
  approved: number;
  pending: number;
  rejected: number;
  appeals: number;
};

type AdminScholarshipsResponse = {
  summary: AdminScholarshipSummary;
  scholarships: AdminScholarship[];
};

const statusOptions = [
  { value: "all", label: "All statuses" },
  { value: "pending", label: "Pending review" },
  { value: "appeal_submitted", label: "Appeals" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

function normalizeStatus(status: string) {
  return status.toLowerCase().replace(/\s+/g, "_");
}

function getStatusLabel(status: string) {
  const normalized = normalizeStatus(status);

  if (normalized === "appeal_submitted") return "Appeal submitted";
  if (normalized === "active") return "Approved";

  return normalized
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatCurrency(value: number | string | null) {
  const amount = Number(value ?? 0);

  if (!Number.isFinite(amount) || amount <= 0) return "Not stated";

  return new Intl.NumberFormat("en-MY", {
    style: "currency",
    currency: "MYR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(value: string | null) {
  if (!value) return "No deadline";

  return new Intl.DateTimeFormat("en-MY", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export default function AdminScholarshipsPage() {
  const [summary, setSummary] = useState<AdminScholarshipSummary>({
    total_scholarships: 0,
    approved: 0,
    pending: 0,
    rejected: 0,
    appeals: 0,
  });
  const [scholarships, setScholarships] = useState<AdminScholarship[]>([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [error, setError] = useState("");

  const loadScholarships = useCallback(async () => {
    try {
      setIsLoading(true);
      setError("");
      const response = await api.get<AdminScholarshipsResponse>(
        "/admin/scholarships",
      );
      setSummary(response.data.summary);
      setScholarships(response.data.scholarships);
    } catch (err) {
      setError(getApiErrorMessage(err, "Unable to load scholarship listings."));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadScholarships();
  }, [loadScholarships]);

  const filteredScholarships = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    return scholarships.filter((scholarship) => {
      const status = normalizeStatus(scholarship.status);
      const matchesStatus = statusFilter === "all" || status === statusFilter;
      const searchableText = [
        scholarship.title,
        scholarship.organization_name,
        scholarship.sponsor_email,
        scholarship.category,
        scholarship.funding_type,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return matchesStatus && (!query || searchableText.includes(query));
    });
  }, [scholarships, searchTerm, statusFilter]);

  async function updateScholarshipStatus(
    scholarshipId: number,
    nextStatus: "approved" | "rejected" | "pending",
  ) {
    try {
      setUpdatingId(scholarshipId);
      setError("");
      await api.patch(`/admin/scholarships/${scholarshipId}/status`, {
        status: nextStatus,
      });
      await loadScholarships();
    } catch (err) {
      setError(getApiErrorMessage(err, "Unable to update scholarship status."));
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <div className="admin-page">
      <section className="admin-module-hero">
        <div>
          <span>Scholarship Control</span>
          <h1>Scholarship Review</h1>
          <p>
            Review scholarship advertisements submitted by sponsorship
            providers, approve eligible listings, and reject submissions that
            need revision.
          </p>
        </div>
        <div className="admin-hero-metric">
          <strong>{summary.pending}</strong>
          <span>pending review</span>
        </div>
      </section>

      {error ? <div className="admin-alert">{error}</div> : null}

      <section className="admin-scholarship-summary">
        <article className="admin-stat-card">
          <span>Total Listings</span>
          <strong>{summary.total_scholarships}</strong>
          <small>Scholarships submitted by providers.</small>
        </article>
        <article className="admin-stat-card">
          <span>Pending Review</span>
          <strong>{summary.pending}</strong>
          <small>Waiting for administrator decision.</small>
        </article>
        <article className="admin-stat-card">
          <span>Approved</span>
          <strong>{summary.approved}</strong>
          <small>Visible or ready to be shown to students.</small>
        </article>
        <article className="admin-stat-card">
          <span>Rejected</span>
          <strong>{summary.rejected}</strong>
          <small>Listings that require provider revision.</small>
        </article>
      </section>

      <section className="admin-scholarship-panel">
        <div className="admin-scholarship-panel-header">
          <div>
            <span>Review Queue</span>
            <h2>Provider scholarship submissions</h2>
          </div>
          <div className="admin-scholarship-controls">
            <input
              aria-label="Search scholarships"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search title, provider, category..."
            />
            <select
              aria-label="Filter by status"
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
          <div className="admin-empty-state">Loading scholarship listings...</div>
        ) : filteredScholarships.length === 0 ? (
          <div className="admin-empty-state">
            No scholarship submissions found. Provider listings will appear here
            after they are submitted.
          </div>
        ) : (
          <div className="admin-scholarship-list">
            {filteredScholarships.map((scholarship) => {
              const status = normalizeStatus(scholarship.status);
              const canApprove = status !== "approved" && status !== "active";
              const canReject = status !== "rejected";

              return (
                <article
                  className="admin-scholarship-review-card"
                  key={scholarship.scholarship_id}
                >
                  <div className="admin-scholarship-card-head">
                    <div>
                      <h3>{scholarship.title}</h3>
                      <p>
                        {scholarship.organization_name}
                        {scholarship.sponsor_email
                          ? ` • ${scholarship.sponsor_email}`
                          : ""}
                      </p>
                    </div>
                    <span className={`admin-status-badge ${status}`}>
                      {getStatusLabel(scholarship.status)}
                    </span>
                  </div>

                  <div className="admin-scholarship-meta-grid">
                    <div>
                      <span>Amount</span>
                      <strong>{formatCurrency(scholarship.amount)}</strong>
                    </div>
                    <div>
                      <span>Deadline</span>
                      <strong>{formatDate(scholarship.deadline)}</strong>
                    </div>
                    <div>
                      <span>Category</span>
                      <strong>{scholarship.category || "Not stated"}</strong>
                    </div>
                    <div>
                      <span>Applications</span>
                      <strong>{Number(scholarship.application_count)}</strong>
                    </div>
                  </div>

                  <div className="admin-scholarship-copy-grid">
                    <div>
                      <span>Description</span>
                      <p>{scholarship.description || "No description added."}</p>
                    </div>
                    <div>
                      <span>Eligibility</span>
                      <p>
                        {scholarship.eligibility_criteria ||
                          "No eligibility criteria added."}
                      </p>
                    </div>
                  </div>

                  <div className="admin-scholarship-actions">
                    {canApprove ? (
                      <button
                        className="admin-primary-button"
                        disabled={updatingId === scholarship.scholarship_id}
                        type="button"
                        onClick={() =>
                          void updateScholarshipStatus(
                            scholarship.scholarship_id,
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
                        disabled={updatingId === scholarship.scholarship_id}
                        type="button"
                        onClick={() =>
                          void updateScholarshipStatus(
                            scholarship.scholarship_id,
                            "rejected",
                          )
                        }
                      >
                        Reject
                      </button>
                    ) : null}
                    {status === "rejected" ? (
                      <button
                        className="admin-secondary-button"
                        disabled={updatingId === scholarship.scholarship_id}
                        type="button"
                        onClick={() =>
                          void updateScholarshipStatus(
                            scholarship.scholarship_id,
                            "pending",
                          )
                        }
                      >
                        Reopen review
                      </button>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
