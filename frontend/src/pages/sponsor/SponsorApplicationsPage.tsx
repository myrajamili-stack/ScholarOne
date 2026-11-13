import Icon from "../../components/advisor/AdvisorIcon";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import "../../styles/sponsor-applications.css";
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
  { label: "All Status", value: "all" },
  { label: "Pending", value: "pending" },
  { label: "Approved", value: "approved" },
  { label: "Rejected", value: "rejected" },
];

function formatDate(value?: string | null) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "Date not available";
  return new Intl.DateTimeFormat("en-MY", {
    timeZone: "Asia/Kuala_Lumpur", day: "numeric", month: "short", year: "numeric",
  }).format(date);
}

function normalizeStatus(status?: string | null) {
  const normalized = (status || "pending").trim().toLowerCase();
  if (normalized === "approved" || normalized === "rejected") return normalized;
  return "pending";
}

function SponsorApplicationsPage() {
  const sponsorId = getStoredUser()?.user_id;
  const [data, setData] = useState<SponsorApplicationsData | null>(null);
  const [activeFilter, setActiveFilter] = useState("all");
  const [scholarshipFilter, setScholarshipFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const decisionInFlight = useRef(false);

  useEffect(() => {
    let cancelled = false;
    async function loadApplications() {
      try {
        if (!sponsorId) throw new Error("Please log in as a sponsorship provider to view applications.");
        const response = await api.get<SponsorApplicationsData>(`/sponsors/${sponsorId}/applications`);
        if (!cancelled) {
          setData(response.data);
          setError("");
        }
      } catch (loadError) {
        if (!cancelled) setError(getApiErrorMessage(loadError, "Unable to load sponsor applications."));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void loadApplications();
    return () => { cancelled = true; };
  }, [sponsorId, reloadKey]);

  const scholarshipOptions = useMemo(() => {
    const scholarships = new Map<number, string>();
    for (const application of data?.applications || []) {
      scholarships.set(application.scholarship_id, application.scholarship_title);
    }
    return [...scholarships].sort((a, b) => a[1].localeCompare(b[1]));
  }, [data]);

  const filteredApplications = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return (data?.applications || []).filter((application) => {
      const statusMatch = activeFilter === "all" || normalizeStatus(application.application_status) === activeFilter;
      const scholarshipMatch = scholarshipFilter === "all" || String(application.scholarship_id) === scholarshipFilter;
      const searchValue = `${application.student_name} ${application.student_id} ${application.scholarship_title} ${application.student_email}`.toLowerCase();
      return statusMatch && scholarshipMatch && searchValue.includes(query);
    });
  }, [activeFilter, scholarshipFilter, data, searchTerm]);

  async function updateApplicationStatus(applicationId: number, status: "approved" | "rejected") {
    if (!sponsorId || decisionInFlight.current) return;
    decisionInFlight.current = true;
    setUpdatingId(applicationId);
    setStatusMessage("");
    setError("");
    try {
      const response = await api.patch(`/sponsors/${sponsorId}/applications/${applicationId}`, { status });
      const savedStatus = normalizeStatus(response.data.application?.application_status || status);
      setData((current) => {
        if (!current) return current;
        const previous = current.applications.find((application) => application.application_id === applicationId);
        if (!previous) return current;
        const previousStatus = normalizeStatus(previous.application_status);
        const summary = { ...current.summary };
        if (previousStatus !== savedStatus) {
          summary[previousStatus] -= 1;
          summary[savedStatus] += 1;
        }
        return {
          ...current, summary,
          applications: current.applications.map((application) => application.application_id === applicationId
            ? { ...application, ...response.data.application, application_status: savedStatus }
            : application),
        };
      });
      setStatusMessage(response.data.message || `Application marked as ${savedStatus}.`);
    } catch (updateError) {
      setError(getApiErrorMessage(updateError, "Unable to update this application."));
    } finally {
      decisionInFlight.current = false;
      setUpdatingId(null);
    }
  }

  function exportApplications() {
    const rows = [
      ["No.", "Student Name", "Student ID", "Scholarship", "Date Submitted", "Status"],
      ...filteredApplications.map((application, index) => [
        index + 1, application.student_name, application.student_id, application.scholarship_title,
        formatDate(application.application_date), normalizeStatus(application.application_status),
      ]),
    ];
    const csv = rows.map((row) => row.map((value) => {
      const text = String(value);
      const safeText = /^[\s]*[=+@-]/.test(text) ? `'${text}` : text;
      return `"${safeText.replace(/"/g, '""')}"`;
    }).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8;" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "scholarone-applications.csv";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatusMessage(`Exported ${filteredApplications.length} application${filteredApplications.length === 1 ? "" : "s"}.`);
  }

  function clearFilters() {
    setActiveFilter("all");
    setScholarshipFilter("all");
    setSearchTerm("");
  }

  return (
    <div className="sponsor-page sponsor-applications-page">
      <section className="sponsor-applications-hero sponsor-hero sponsor-workspace-hero sponsor-learning-banner">
        <div>
          <p className="sponsor-kicker"><Icon name="users" />Student Applications</p>
          <h2>Review and Manage Student Applications</h2>
          <span>Review student submissions for your listed scholarships, check their details, and take action such as approve or reject.</span>
        </div>
      </section>

      <section className="sponsor-stats-grid" aria-label="Application summary">
        {([
          { label: "Total Applications", value: data?.summary.total, icon: "users", color: "purple", note: "Received across all listings" },
          { label: "Pending Review", value: data?.summary.pending, icon: "hourglass", color: "blue", note: "Waiting for your decision" },
          { label: "Approved", value: data?.summary.approved, icon: "appointment", color: "green", note: "Accepted applications" },
          { label: "Rejected", value: data?.summary.rejected, icon: "close", color: "pink", note: "Applications not selected" },
        ] as const).map((stat) => <article className={`sponsor-stat-card ${stat.color}`} key={stat.label}>
          <span><Icon name={stat.icon} /></span><p>{stat.label}</p><strong>{stat.value ?? "—"}</strong><small>{stat.note}</small>
        </article>)}
      </section>

      <section className="sponsor-panel spa-list-panel" aria-busy={isLoading}>
        <header className="spa-list-header">
          <h2><Icon name="quiz" />Student Application List</h2>
          <button type="button" className="spa-export" disabled={isLoading || filteredApplications.length === 0} onClick={exportApplications}><Icon name="down" />Export</button>
        </header>
        <div className="spa-filters">
          <select aria-label="Filter by scholarship" value={scholarshipFilter} onChange={(event) => setScholarshipFilter(event.target.value)}>
            <option value="all">All Scholarships</option>
            {scholarshipOptions.map(([id, title]) => <option key={id} value={String(id)}>{title}</option>)}
          </select>
          <select aria-label="Filter by status" value={activeFilter} onChange={(event) => setActiveFilter(event.target.value)}>
            {filters.map((filter) => <option key={filter.value} value={filter.value}>{filter.label}</option>)}
          </select>
          <label className="spa-search"><Icon name="search" /><input aria-label="Search applications" placeholder="Search by student name, ID, or scholarship…" type="search" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} /></label>
        </div>
        {error && <div role="alert" className="sponsor-form-error">{error} {!data && <button type="button" className="spa-link-button" onClick={() => { setIsLoading(true); setReloadKey((key) => key + 1); }}>Try again</button>}</div>}
        {statusMessage && <div role="status" className="sponsor-form-success">{statusMessage}</div>}

        <div className="spa-table-scroll" tabIndex={0} role="region" aria-label="Student applications table">
          <table className="spa-table">
            <thead><tr><th scope="col">No.</th><th scope="col">Student Name</th><th scope="col">Student ID</th><th scope="col">Scholarship</th><th scope="col">Date Submitted</th><th scope="col">Status</th><th scope="col">Action</th></tr></thead>
            <tbody>
              {filteredApplications.map((application, index) => {
                const status = normalizeStatus(application.application_status);
                const expanded = expandedId === application.application_id;
                return <Fragment key={application.application_id}>
                  <tr className={expanded ? "spa-selected-row" : ""}>
                    <td>{index + 1}</td><td><strong>{application.student_name}</strong><span className="spa-student-email">{application.student_email}</span></td>
                    <td>{application.student_id}</td><td>{application.scholarship_title}</td><td>{formatDate(application.application_date)}</td>
                    <td><span className={`sponsor-status ${status}`}>{status}</span></td>
                    <td><button type="button" className="spa-view-button" aria-expanded={expanded} aria-controls={`application-details-${application.application_id}`} onClick={() => setExpandedId(expanded ? null : application.application_id)}>{expanded ? "Hide Details" : "View Details"}<Icon name="chevron" /></button></td>
                  </tr>
                  {expanded && <tr><td colSpan={7} className="spa-expanded-cell">
                    <section id={`application-details-${application.application_id}`} className="spa-application-detail" aria-label={`Application details for ${application.student_name}`}>
                      <h3>{application.student_name} · {application.scholarship_title}</h3>
                      <dl>
                        <div><dt>Education Level</dt><dd>{application.education_level || "Not provided"}</dd></div>
                        <div><dt>CGPA</dt><dd>{application.cgpa != null && application.cgpa !== "" ? `${application.cgpa} / 4.00` : "Not provided"}</dd></div>
                        <div><dt>Field of Study</dt><dd>{application.field_of_study || "Not provided"}</dd></div>
                        <div><dt>University</dt><dd>{application.university || "Not provided"}</dd></div>
                        <div><dt>Funding Type</dt><dd>{application.funding_type || "Not provided"}</dd></div>
                        <div><dt>Remarks</dt><dd>{application.remarks || "No remarks"}</dd></div>
                      </dl>
                      <div className="spa-decision-actions">
                        <span>Current decision · {status}</span>
                        <button type="button" className="spa-approve" disabled={status === "approved" || updatingId !== null} onClick={() => updateApplicationStatus(application.application_id, "approved")}>Approve</button>
                        <button type="button" className="spa-reject" disabled={status === "rejected" || updatingId !== null} onClick={() => updateApplicationStatus(application.application_id, "rejected")}>Reject</button>
                        {updatingId === application.application_id && <span role="status">Saving decision…</span>}
                      </div>
                    </section>
                  </td></tr>}
                </Fragment>;
              })}
              {filteredApplications.length === 0 && <tr><td colSpan={7} className="spa-empty-cell">
                {isLoading ? <div className="spa-empty" role="status">Loading student applications…</div> : error && !data ? <div className="spa-empty">Applications could not be loaded.</div> : <div className="spa-empty">
                  <img src="/images/pathway-quizzes-empty.png" alt="" />
                  <h3>{data?.applications.length ? "No matching applications" : "No applications yet"}</h3>
                  <p>{data?.applications.length ? "Try another student, scholarship, or status filter." : "Student applications will appear here once they apply to your approved scholarships."}</p>
                  {data?.applications.length ? <button type="button" className="spa-link-button" onClick={clearFilters}>Clear filters</button> : null}
                </div>}
              </td></tr>}
            </tbody>
          </table>
        </div>
        {data && data.applications.length > 0 && <p className="spa-result-count" aria-live="polite">Showing {filteredApplications.length} of {data.applications.length} applications</p>}
      </section>
    </div>
  );
}

export default SponsorApplicationsPage;
