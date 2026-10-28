import { useEffect, useMemo, useState } from "react";
import api from "../../api/axios";
import { getApiErrorMessage } from "../../utils/apiError";
import { getStoredUser } from "../../utils/authStorage";

type AppealScholarship = {
  scholarship_id: number;
  title: string;
  description?: string | null;
  amount?: number | string | null;
  category?: string | null;
  eligibility_criteria?: string | null;
  deadline?: string | null;
  funding_type?: string | null;
  status?: string | null;
  created_at?: string | null;
};

type AppealHistory = {
  log_id: number;
  action: string;
  description: string;
  action_time?: string | null;
};

type SponsorAppealsData = {
  sponsor: {
    organization_name: string;
  };
  summary: {
    rejected: number;
    under_review: number;
    resolved: number;
    latest_status: string;
  };
  scholarships: AppealScholarship[];
  appeal_history: AppealHistory[];
};

function formatCurrency(value?: number | string | null) {
  const amount = Number(value || 0);

  if (!amount) {
    return "Amount not set";
  }

  return new Intl.NumberFormat("en-MY", {
    style: "currency",
    currency: "MYR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(value?: string | null) {
  if (!value) {
    return "Not set";
  }

  return new Intl.DateTimeFormat("en-MY", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function getStatusLabel(status?: string | null) {
  const normalized = (status || "pending").toLowerCase();

  if (normalized === "appeal_submitted") {
    return "Appeal Submitted";
  }

  return `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}`;
}

function getStatusTone(status?: string | null) {
  return (status || "").toLowerCase() === "appeal_submitted" ? "pending" : "rejected";
}

function SponsorAppealsPage() {
  const user = getStoredUser();
  const [data, setData] = useState<SponsorAppealsData | null>(null);
  const [appealMessages, setAppealMessages] = useState<Record<number, string>>({});
  const [activeScholarshipId, setActiveScholarshipId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function loadAppeals() {
    if (!user?.user_id) {
      setIsLoading(false);
      return;
    }

    try {
      const response = await api.get<SponsorAppealsData>(`/sponsors/${user.user_id}/appeals`);
      setData(response.data);
      setError("");
    } catch (error) {
      setError(getApiErrorMessage(error, "Unable to load appeal records."));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadAppeals();
  }, [user?.user_id]);

  const activeScholarship = useMemo(() => {
    if (!data || !activeScholarshipId) {
      return null;
    }

    return data.scholarships.find((scholarship) => scholarship.scholarship_id === activeScholarshipId) || null;
  }, [activeScholarshipId, data]);

  async function submitAppeal(scholarshipId: number) {
    if (!user?.user_id) {
      return;
    }

    setIsSubmitting(true);
    setError("");
    setSuccess("");

    try {
      const response = await api.post(`/sponsors/${user.user_id}/appeals`, {
        scholarship_id: scholarshipId,
        appeal_message: appealMessages[scholarshipId] || "",
      });
      setSuccess(response.data.message || "Appeal submitted for administrator review.");
      setAppealMessages((current) => ({ ...current, [scholarshipId]: "" }));
      setActiveScholarshipId(null);
      await loadAppeals();
    } catch (error) {
      setError(getApiErrorMessage(error, "Unable to submit this appeal."));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="sponsor-page">
        <section className="sponsor-empty-state">Loading appeal records...</section>
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
        <section className="sponsor-empty-state">Appeal data is not available.</section>
      </div>
    );
  }

  return (
    <div className="sponsor-page">
      <section className="sponsor-appeals-hero">
        <div>
          <p className="sponsor-kicker">Rejected Submissions</p>
          <h2>Appeals</h2>
          <span>
            Review rejected scholarship advertisements from {data.sponsor.organization_name || "your organization"} and
            submit a clear appeal for administrator review.
          </span>
        </div>
      </section>

      <section className="sponsor-stats-grid" aria-label="Appeal summary">
        <article className="sponsor-stat-card blue">
          <span>!</span>
          <p>Rejected Listings</p>
          <strong>{data.summary.rejected}</strong>
          <small>Listings that can still be appealed</small>
        </article>
        <article className="sponsor-stat-card blue">
          <span>□</span>
          <p>Under Review</p>
          <strong>{data.summary.under_review}</strong>
          <small>Appeals already sent to administrator</small>
        </article>
        <article className="sponsor-stat-card green">
          <span>✓</span>
          <p>Resolved</p>
          <strong>{data.summary.resolved}</strong>
          <small>Approved listings after review</small>
        </article>
        <article className="sponsor-stat-card purple">
          <span>▣</span>
          <p>Latest Status</p>
          <strong>{data.summary.latest_status}</strong>
          <small>Current appeal progress</small>
        </article>
      </section>

      {error && <div className="sponsor-form-error">{error}</div>}
      {success && <div className="sponsor-form-success">{success}</div>}

      <section className="sponsor-appeals-layout">
        <div className="sponsor-panel sponsor-appeal-list-panel">
          <div className="sponsor-panel-header">
            <div>
              <p className="sponsor-kicker">Appeal Queue</p>
              <h2>Rejected scholarship listings</h2>
            </div>
          </div>

          {data.scholarships.length === 0 ? (
            <div className="sponsor-empty-state scholarship-empty">
              <strong>No rejected scholarship listings.</strong>
              <p>If an administrator rejects a scholarship advertisement, it will appear here for revision or appeal.</p>
            </div>
          ) : (
            <div className="sponsor-appeal-list">
              {data.scholarships.map((scholarship) => {
                const hasAppeal = (scholarship.status || "").toLowerCase() === "appeal_submitted";
                const isActive = activeScholarshipId === scholarship.scholarship_id;

                return (
                  <button
                    className={`sponsor-appeal-card ${isActive ? "active" : ""}`}
                    key={scholarship.scholarship_id}
                    type="button"
                    onClick={() => setActiveScholarshipId(scholarship.scholarship_id)}
                  >
                    <span className={`sponsor-status ${getStatusTone(scholarship.status)}`}>
                      {getStatusLabel(scholarship.status)}
                    </span>
                    <strong>{scholarship.title}</strong>
                    <small>{hasAppeal ? "Waiting for administrator decision" : "Ready for appeal submission"}</small>
                    <div>
                      <span>{scholarship.category || "Category not set"}</span>
                      <span>{formatDate(scholarship.created_at)}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <aside className="sponsor-panel sponsor-appeal-detail-panel">
          {activeScholarship ? (
            <>
              <p className="sponsor-kicker">Selected Listing</p>
              <h2>{activeScholarship.title}</h2>
              <p>{activeScholarship.description || "No description was provided for this listing."}</p>

              <div className="sponsor-appeal-facts">
                <div>
                  <span>Amount</span>
                  <strong>{formatCurrency(activeScholarship.amount)}</strong>
                </div>
                <div>
                  <span>Deadline</span>
                  <strong>{formatDate(activeScholarship.deadline)}</strong>
                </div>
                <div>
                  <span>Funding Type</span>
                  <strong>{activeScholarship.funding_type || "Not set"}</strong>
                </div>
                <div>
                  <span>Status</span>
                  <strong>{getStatusLabel(activeScholarship.status)}</strong>
                </div>
              </div>

              <label className="sponsor-form-field full">
                <span>Appeal message</span>
                <textarea
                  disabled={(activeScholarship.status || "").toLowerCase() === "appeal_submitted"}
                  placeholder="Explain why the scholarship should be reconsidered. Mention corrections, eligibility clarity, funding proof, or updated details."
                  value={appealMessages[activeScholarship.scholarship_id] || ""}
                  onChange={(event) =>
                    setAppealMessages((current) => ({
                      ...current,
                      [activeScholarship.scholarship_id]: event.target.value,
                    }))
                  }
                />
              </label>

              <button
                className="sponsor-primary-action"
                disabled={(activeScholarship.status || "").toLowerCase() === "appeal_submitted" || isSubmitting}
                type="button"
                onClick={() => submitAppeal(activeScholarship.scholarship_id)}
              >
                {isSubmitting ? "Submitting Appeal..." : "Submit Appeal"}
              </button>
            </>
          ) : (
            <div className="sponsor-empty-state small">
              <strong>Select a rejected listing.</strong>
              <p>Choose a scholarship from the queue to review its details and write an appeal message.</p>
            </div>
          )}
        </aside>
      </section>

      <section className="sponsor-panel sponsor-appeal-history">
        <div className="sponsor-panel-header">
          <div>
            <p className="sponsor-kicker">Appeal History</p>
            <h2>Submitted appeal records</h2>
          </div>
        </div>

        {data.appeal_history.length > 0 ? (
          <div className="sponsor-history-list">
            {data.appeal_history.map((item) => (
              <div className="sponsor-history-row" key={item.log_id}>
                <span>!</span>
                <div>
                  <strong>{item.description}</strong>
                  <small>{formatDate(item.action_time)}</small>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="sponsor-empty-state small">No appeal submissions have been recorded yet.</div>
        )}
      </section>
    </div>
  );
}

export default SponsorAppealsPage;
