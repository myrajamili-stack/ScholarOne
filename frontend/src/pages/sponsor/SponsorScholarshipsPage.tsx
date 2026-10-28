import { Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
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
  const user = getStoredUser();
  const [data, setData] = useState<SponsorScholarshipsData | null>(null);
  const [activeFilter, setActiveFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadScholarships() {
      if (!user?.user_id) {
        setIsLoading(false);
        return;
      }

      try {
        const response = await api.get<SponsorScholarshipsData>(`/sponsors/${user.user_id}/scholarships`);
        setData(response.data);
      } catch (error) {
        setError(getApiErrorMessage(error, "Unable to load sponsor scholarship listings."));
      } finally {
        setIsLoading(false);
      }
    }

    loadScholarships();
  }, [user?.user_id]);

  const filteredScholarships = useMemo(() => {
    if (!data) {
      return [];
    }

    return data.scholarships.filter((scholarship) => {
      const statusMatch = activeFilter === "all" || normalizeStatus(scholarship.status) === activeFilter;
      const searchMatch = scholarship.title.toLowerCase().includes(searchTerm.trim().toLowerCase());
      return statusMatch && searchMatch;
    });
  }, [activeFilter, data, searchTerm]);

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
        <section className="sponsor-empty-state">{error || "Scholarship listing data is not available."}</section>
      </div>
    );
  }

  return (
    <div className="sponsor-page">
      <section className="sponsor-scholarships-hero">
        <div>
          <p className="sponsor-kicker">Scholarship Management</p>
          <h2>My Scholarships</h2>
          <span>View every scholarship advertisement listed by {data.sponsor.organization_name || "your organization"}.</span>
        </div>
        <Link className="sponsor-hero-action" to="/sponsor/add-scholarship">
          Add Scholarship
        </Link>
      </section>

      <section className="sponsor-stats-grid" aria-label="Scholarship listing summary">
        <article className="sponsor-stat-card purple">
          <span>▣</span>
          <p>Total Listings</p>
          <strong>{data.summary.total}</strong>
          <small>All scholarships submitted</small>
        </article>
        <article className="sponsor-stat-card green">
          <span>◉</span>
          <p>Active Listings</p>
          <strong>{data.summary.active}</strong>
          <small>Visible or approved listings</small>
        </article>
        <article className="sponsor-stat-card blue">
          <span>□</span>
          <p>Pending Review</p>
          <strong>{data.summary.pending}</strong>
          <small>Waiting for administrator approval</small>
        </article>
        <article className="sponsor-stat-card blue">
          <span>!</span>
          <p>Rejected</p>
          <strong>{data.summary.rejected}</strong>
          <small>May need revision or appeal</small>
        </article>
      </section>

      <section className="sponsor-panel sponsor-scholarship-manager">
        <div className="sponsor-scholarship-toolbar">
          <div>
            <p className="sponsor-kicker">Listing Directory</p>
            <h2>Scholarship advertisements</h2>
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
              onClick={() => setActiveFilter(filter.value)}
            >
              {filter.label}
            </button>
          ))}
        </div>

        {data.scholarships.length === 0 ? (
          <div className="sponsor-empty-state scholarship-empty">
            <strong>No scholarship listings yet.</strong>
            <p>Create your first scholarship advertisement so students can discover and apply after it is approved.</p>
            <Link to="/sponsor/add-scholarship">Add First Scholarship</Link>
          </div>
        ) : filteredScholarships.length > 0 ? (
          <div className="sponsor-scholarship-list">
            {filteredScholarships.map((scholarship) => (
              <article className="sponsor-scholarship-card" key={scholarship.scholarship_id}>
                <div className="sponsor-scholarship-main">
                  <span className={`sponsor-status ${normalizeStatus(scholarship.status)}`}>{scholarship.status || "Pending"}</span>
                  <h3>{scholarship.title}</h3>
                  <p>{scholarship.description || "No description has been added yet."}</p>
                  <div className="sponsor-scholarship-tags">
                    <span>{scholarship.category || "Category not set"}</span>
                    <span>{scholarship.funding_type || "Funding type not set"}</span>
                  </div>
                </div>
                <div className="sponsor-scholarship-meta">
                  <div>
                    <strong>{formatCurrency(scholarship.amount)}</strong>
                    <span>Scholarship amount</span>
                  </div>
                  <div>
                    <strong>{formatDate(scholarship.deadline)}</strong>
                    <span>Deadline</span>
                  </div>
                  <div>
                    <strong>{scholarship.application_count}</strong>
                    <span>Applications</span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="sponsor-empty-state">No scholarships match this search or filter.</div>
        )}
      </section>
    </div>
  );
}

export default SponsorScholarshipsPage;
