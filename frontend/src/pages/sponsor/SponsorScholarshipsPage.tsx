import Icon from "../../components/advisor/AdvisorIcon";
import { Link } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import api from "../../api/axios";
import { getApiErrorMessage } from "../../utils/apiError";
import { getStoredUser } from "../../utils/authStorage";

type SponsorScholarship = {
  scholarship_id: number;
  title: string;
  description?: string | null;
  amount?: number | string | null;
  category?: string | null;
  deadline?: string | null;
  funding_type?: string | null;
  status?: string | null;
  rejection_reason?: string | null;
  created_at?: string | null;
  application_count: number;
};

type SponsorScholarshipsData = {
  sponsor: {
    organization_name: string;
  };
  summary: {
    total: number;
    active: number;
    pending: number;
    rejected: number;
  };
  scholarships: SponsorScholarship[];
};

const filters = [
  { label: "All", value: "all" },
  { label: "Active", value: "active" },
  { label: "Pending", value: "pending" },
  { label: "Rejected", value: "rejected" },
];

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

function normalizeStatus(status?: string | null) {
  const normalized = (status || "pending").toLowerCase();

  if (["active", "approved"].includes(normalized)) {
    return "active";
  }

  if (normalized === "rejected") {
    return "rejected";
  }

  return "pending";
}

function SponsorScholarshipsPage() {
  const sponsorId = getStoredUser()?.user_id;
  const [retry, setRetry] = useState(0);
  const [sortBy, setSortBy] = useState("latest");
  const [data, setData] = useState<SponsorScholarshipsData | null>(null);
  const [activeFilter, setActiveFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [deleting, setDeleting] = useState<SponsorScholarship | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const deleteConfirmation = useRef<HTMLElement>(null);
  useEffect(() => {
    if (deleting) deleteConfirmation.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [deleting]);

  async function deleteListing() {
    if (!deleting || isDeleting) return;
    setIsDeleting(true); setActionError("");
    try {
      await api.delete(`/sponsors/${sponsorId}/scholarships/${deleting.scholarship_id}`, { data: { confirm_scholarship_id: deleting.scholarship_id } });
      setDeleting(null); setNotice("Scholarship deleted successfully."); setRetry(value => value + 1);
    } catch (err) {
      setActionError(getApiErrorMessage(err, "Unable to delete this listing."));
    } finally { setIsDeleting(false); }
  }

  useEffect(() => {
    async function loadScholarships() {
      if (!sponsorId) {
        setIsLoading(false);
        return;
      }

      try {
        const response = await api.get<SponsorScholarshipsData>(`/sponsors/${sponsorId}/scholarships`);
        setData(response.data);
      } catch (error) {
        setError(getApiErrorMessage(error, "Unable to load sponsor scholarship listings."));
      } finally {
        setIsLoading(false);
      }
    }

    loadScholarships();
  }, [sponsorId, retry]);

  const filteredScholarships = useMemo(() => {
    if (!data) {
      return [];
    }

    return data.scholarships.filter((scholarship) => {
      const statusMatch = activeFilter === "all" || normalizeStatus(scholarship.status) === activeFilter;
      const searchMatch = scholarship.title.toLowerCase().includes(searchTerm.trim().toLowerCase());
      return statusMatch && searchMatch;
    }).sort((a, b) => {
      if (sortBy === "title") return a.title.localeCompare(b.title);
      if (sortBy === "deadline") return (a.deadline ? new Date(a.deadline).getTime() : Infinity) - (b.deadline ? new Date(b.deadline).getTime() : Infinity);
      return (b.created_at ? new Date(b.created_at).getTime() : 0) - (a.created_at ? new Date(a.created_at).getTime() : 0);
    });
  }, [activeFilter, data, searchTerm, sortBy]);

  if (isLoading) {
    return (
      <div className="sponsor-page">
        <section className="sponsor-empty-state">Loading scholarship listings...</section>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="sponsor-page">
        <section className="sponsor-empty-state" role="alert"><p>{error || "Scholarship listing data is not available."}</p><button type="button" className="sponsor-add-button" onClick={() => { setError(""); setIsLoading(true); setRetry(value => value + 1); }}>Try again</button></section>
      </div>
    );
  }

  return (
    <div className="sponsor-page">
      {notice && <p className="sponsor-form-success" role="status">{notice}</p>}
      {deleting && <section ref={deleteConfirmation} className="sponsor-panel" role="group" aria-label="Confirm scholarship deletion"><h2>Delete {deleting.title}?</h2><p>This permanently removes the listing. Listings with applications or other linked records cannot be deleted.</p>{actionError && <p className="sponsor-form-error" role="alert">{actionError}</p>}<button type="button" className="sponsor-add-button" disabled={isDeleting} onClick={() => void deleteListing()}>{isDeleting ? "Deleting…" : "Confirm Delete"}</button> <button type="button" className="sponsor-secondary-link" disabled={isDeleting} onClick={() => setDeleting(null)}>Cancel</button></section>}
      <section className="sponsor-hero spl-hero spl-trophy-banner">
        <div>
          <p className="sponsor-kicker"><Icon name="graduation" />Scholarship Management</p>
          <h2>Manage Your Scholarship Listings</h2>
          <span>View every scholarship advertisement listed by {data.sponsor.organization_name || "your organization"}.</span>
          <Link className="sponsor-hero-action" to="/sponsor/add-scholarship">
            <span aria-hidden="true">＋</span> Add Scholarship
          </Link>
        </div>
      </section>

      <section className="sponsor-stats-grid" aria-label="Scholarship listing summary">
        <article className="sponsor-stat-card purple">
          <span><Icon name="graduation" /></span>
          <p>Total Listings</p>
          <strong>{data.summary.total}</strong>
          <small>All scholarships submitted</small>
        </article>
        <article className="sponsor-stat-card green">
          <span><Icon name="appointment" /></span>
          <p>Active Listings</p>
          <strong>{data.summary.active}</strong>
          <small>Visible or approved listings</small>
        </article>
        <article className="sponsor-stat-card amber">
          <span><Icon name="hourglass" /></span>
          <p>Pending Review</p>
          <strong>{data.summary.pending}</strong>
          <small>Waiting for administrator approval</small>
        </article>
        <article className="sponsor-stat-card pink">
          <span><Icon name="close" /></span>
          <p>Rejected</p>
          <strong>{data.summary.rejected}</strong>
          <small>May need revision or appeal</small>
        </article>
      </section>

      <section className="sponsor-panel sponsor-scholarship-manager">
        <div className="sponsor-scholarship-toolbar">
          <div>
            <p className="sponsor-kicker">Listing Directory</p>
            <h2><Icon name="layers" />Your scholarship listings</h2>
          </div>
          <input
            aria-label="Search scholarship listings"
            placeholder="Search scholarship title..."
            type="search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
        </div>

        <div className="sponsor-filter-tabs" aria-label="Filter scholarship listings">
          {filters.map((filter) => (
            <button
              className={activeFilter === filter.value ? "active" : ""}
              key={filter.value}
              type="button"
              aria-pressed={activeFilter === filter.value}
              onClick={() => setActiveFilter(filter.value)}
            >
              {filter.label} <span>{data.summary[filter.value === "all" ? "total" : filter.value as "active" | "pending" | "rejected"]}</span>
            </button>
          ))}
        </div>

        <div className="spl-results-toolbar">
          <p role="status">Showing {filteredScholarships.length} of {data.summary.total} listings</p>
          <label>Sort by <select value={sortBy} onChange={event => setSortBy(event.target.value)}><option value="latest">Newest first</option><option value="deadline">Nearest deadline</option><option value="title">Title A–Z</option></select></label>
        </div>
        {data.scholarships.length === 0 ? (
          <div className="sponsor-empty-state scholarship-empty">
            <Icon name="graduation" /><strong>No scholarship listings yet.</strong>
            <p>Create your first scholarship advertisement so students can discover and apply after it is approved.</p>
            <Link to="/sponsor/add-scholarship">Add First Scholarship</Link>
          </div>
        ) : filteredScholarships.length > 0 ? (
          <div className="sponsor-scholarship-list">
            {filteredScholarships.map((scholarship) => (
              <article className="sponsor-scholarship-card" key={scholarship.scholarship_id}>
                <div className="sponsor-scholarship-main">
                  <span className={`sponsor-status ${normalizeStatus(scholarship.status)}`}>{scholarship.status || "Pending"}</span>
                  <div className="spl-card-title"><span><Icon name="graduation" /></span><h3>{scholarship.title}</h3></div>{scholarship.rejection_reason && normalizeStatus(scholarship.status) === "rejected" && <p role="note"><strong>Rejection reason:</strong> {scholarship.rejection_reason}</p>}
                  <p>{scholarship.description || "No description has been added yet."}</p>
                  <div className="sponsor-scholarship-tags">
                    <span>{scholarship.category || "Category not set"}</span>
                    <span>{scholarship.funding_type || "Funding type not set"}</span>
                  </div>
                  <div className="sponsor-listing-actions"><Link className="sponsor-secondary-link" to={`/sponsor/add-scholarship?edit=${scholarship.scholarship_id}`}>Edit Listing</Link><button type="button" className="sponsor-secondary-link" disabled={isDeleting} onClick={() => { setDeleting(scholarship); setActionError(""); }}>Delete Listing</button></div>
                </div>
                <div className="sponsor-scholarship-meta">
                  <div>
                    <Icon name="layers" /><strong>{formatCurrency(scholarship.amount)}</strong>
                    <span>Scholarship amount</span>
                  </div>
                  <div>
                    <Icon name="calendar" /><strong>{formatDate(scholarship.deadline)}</strong>
                    <span>Deadline</span>
                  </div>
                  <div>
                    <Icon name="users" /><strong>{scholarship.application_count}</strong>
                    <span>Applications</span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
<div className="sponsor-empty-state scholarship-empty"><Icon name="search" /><strong>No matching scholarships</strong><p>Try another title or reset the filters to see all your listings.</p><button type="button" className="sponsor-add-button" onClick={() => { setActiveFilter("all"); setSearchTerm(""); }}>Clear filters</button></div>
        )}
      </section>
    </div>
  );
}

export default SponsorScholarshipsPage;
