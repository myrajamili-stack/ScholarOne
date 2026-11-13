import { useEffect, useMemo, useRef, useState } from "react";

import { useSearchParams } from "react-router-dom";
import Icon from "../../components/advisor/AdvisorIcon";
import { getInitials } from "../../utils/userDisplay";
import "../../styles/admin-users.css";
import "../../styles/admin-applications.css";
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

type AdminApplicationsResponse = {
  summary: { new_this_week: number };
  applications: AdminApplication[];
};

const statusOptions = [
  { value: "all", label: "All Statuses" },
  { value: "pending", label: "Pending Review" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

function normalizeStatus(status: string) {
  return String(status || "pending").trim().toLowerCase().replace(/\s+/g, "_");
}

function getStatusLabel(status: string) {
  const normalized = normalizeStatus(status);
  if (normalized === "pending") return "Pending Review";
  return normalized.split("_").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

function formatDate(value: string | null) {
  if (!value || Number.isNaN(new Date(value).getTime())) return "No date recorded";
  return new Intl.DateTimeFormat("en-MY", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kuala_Lumpur" }).format(new Date(value));
}

function getMonthKey(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en", { year: "numeric", month: "2-digit", timeZone: "Asia/Kuala_Lumpur" }).formatToParts(date);
  return `${parts.find((part) => part.type === "year")?.value}-${parts.find((part) => part.type === "month")?.value}`;
}

function percentage(count: number, total: number) {
  return total ? Math.round(count / total * 100) : 0;
}

export default function AdminApplicationsPage() {
  const [applications, setApplications] = useState<AdminApplication[]>([]);
  const [newThisWeek, setNewThisWeek] = useState(0);
  const [searchParams] = useSearchParams();
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") === "pending" ? "pending" : "all");
  const [scholarshipFilter, setScholarshipFilter] = useState("all");
  const [providerFilter, setProviderFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [trendMonths, setTrendMonths] = useState(6);
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [selectedApplication, setSelectedApplication] = useState<AdminApplication | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [exportMessage, setExportMessage] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    let active = true;
    async function loadApplications() {
      try {
        const response = await api.get<AdminApplicationsResponse>("/admin/applications");
        if (active) {
          setApplications(response.data.applications);
          setNewThisWeek(response.data.summary.new_this_week);
        }
      } catch (err) {
        if (active) setError(getApiErrorMessage(err, "Unable to load applications."));
      } finally {
        if (active) setIsLoading(false);
      }
    }
    void loadApplications();
    return () => { active = false; };
  }, []);

  const summary = useMemo(() => ({
    total: applications.length,
    pending: applications.filter((item) => normalizeStatus(item.application_status) === "pending").length,
    approved: applications.filter((item) => normalizeStatus(item.application_status) === "approved").length,
    rejected: applications.filter((item) => normalizeStatus(item.application_status) === "rejected").length,
  }), [applications]);
  const scholarshipOptions = [...new Map(applications.map((item) => [item.scholarship_id, item.scholarship_title])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const providers = [...new Set(applications.map((item) => item.organization_name))].sort();
  const filteredApplications = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return applications.filter((application) => {
      const status = normalizeStatus(application.application_status);
      const text = [application.student_name, application.student_email, application.student_id, application.scholarship_title, application.organization_name, application.field_of_study, application.university].filter(Boolean).join(" ").toLowerCase();
      return (statusFilter === "all" || status === statusFilter)
        && (scholarshipFilter === "all" || String(application.scholarship_id) === scholarshipFilter)
        && (providerFilter === "all" || application.organization_name === providerFilter)
        && (!query || text.includes(query));
    });
  }, [applications, searchTerm, statusFilter, scholarshipFilter, providerFilter]);

  const trend = useMemo(() => {
    const currentMonth = getMonthKey(new Date().toISOString())!;
    const [year, month] = currentMonth.split("-").map(Number);
    const months = Array.from({ length: trendMonths }, (_, index) => {
      const date = new Date(Date.UTC(year, month - trendMonths + index, 1));
      return { key: date.toISOString().slice(0, 7), label: date.toLocaleDateString("en-MY", { month: "short", timeZone: "UTC" }), year: date.getUTCFullYear(), count: 0 };
    });
    applications.forEach((application) => {
      const key = application.application_date ? getMonthKey(application.application_date) : null;
      const target = months.find((item) => item.key === key);
      if (target) target.count += 1;
    });
    return months;
  }, [applications, trendMonths]);
  const maxCount = Math.max(4, ...trend.map((month) => month.count));
  const chartTop = Math.ceil(maxCount / 4) * 4;
  const chartPoints = trend.map((month, index) => ({ ...month, x: 38 + index * 470 / (trend.length - 1), y: 137 - month.count / chartTop * 112 }));
  const linePath = chartPoints.map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`).join(" ");
  const segments = [
    { label: "Pending Review", count: summary.pending, color: "#9148ff" },
    { label: "Approved", count: summary.approved, color: "#60ce68" },
    { label: "Rejected", count: summary.rejected, color: "#ff547b" },
    { label: "Other Statuses", count: Math.max(0, summary.total - summary.pending - summary.approved - summary.rejected), color: "#b7a6ce" },
  ].filter((segment) => segment.label !== "Other Statuses" || segment.count > 0);
  let end = 0;
  const gradient = segments.map((segment) => {
    const start = end;
    end += summary.total ? segment.count / summary.total * 100 : 0;
    return `${segment.color} ${start}% ${end}%`;
  }).join(", ");
  const pageSize = 5;
  const totalPages = Math.max(1, Math.ceil(filteredApplications.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const visibleApplications = filteredApplications.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const allPageSelected = visibleApplications.length > 0 && visibleApplications.every((item) => selectedIds.has(item.application_id));

  function selectApplication(id: number) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectPage() {
    setSelectedIds((current) => {
      const next = new Set(current);
      visibleApplications.forEach((item) => {
        if (allPageSelected) next.delete(item.application_id);
        else next.add(item.application_id);
      });
      return next;
    });
  }

  function openDetails(application: AdminApplication) {
    setSelectedApplication(application);
    dialogRef.current?.showModal();
  }

  function exportApplications() {
    const items = selectedIds.size ? applications.filter((item) => selectedIds.has(item.application_id)) : filteredApplications;
    const rows = [["Application ID", "Student ID", "Student", "Email", "Scholarship", "Provider", "Submitted On", "Status"],
      ...items.map((item) => [item.application_id, item.student_id, item.student_name, item.student_email, item.scholarship_title, item.organization_name, formatDate(item.application_date), getStatusLabel(item.application_status)])];
    const csv = rows.map((row) => row.map((value) => {
      const text = String(value);
      const safeText = /^\s*[=+@-]/.test(text) ? `'${text}` : text;
      return `"${safeText.replace(/"/g, '""')}"`;
    }).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8;" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "scholarone-admin-applications.csv";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setExportMessage(`Exported ${items.length} application${items.length === 1 ? "" : "s"}.`);
  }

  return <div className="admin-page aum-page aap-page">
    {error && <div className="admin-alert" role="alert">{error}</div>}
    {exportMessage && <div className="aum-success" role="status">{exportMessage}</div>}
    <section className="adh-metrics" aria-label="Application summary">{([
      { label: "Total Applications", count: summary.total, note: `${newThisWeek} submitted this week`, icon: "users", color: "purple" },
      { label: "Pending Review", count: summary.pending, note: `${percentage(summary.pending, summary.total)}% of total applications`, icon: "clock", color: "amber" },
      { label: "Approved", count: summary.approved, note: `${percentage(summary.approved, summary.total)}% of total applications`, icon: "appointment", color: "green" },
      { label: "Rejected", count: summary.rejected, note: `${percentage(summary.rejected, summary.total)}% of total applications`, icon: "close", color: "pink" },
    ] as const).map((metric) => <article className={`adh-metric ${metric.color}`} key={metric.label}><span className="adh-icon"><Icon name={metric.icon} /></span><div><h2>{metric.label}</h2><strong>{isLoading ? "—" : metric.count}</strong><small>{metric.note}</small></div></article>)}</section>

    <section className="aap-charts" aria-label="Application analytics">
      <article className="adh-panel aap-trend"><header className="adh-panel-heading"><span className="adh-icon"><Icon name="chart" /></span><div><h2>Application Trend</h2><p>Number of applications received over time.</p></div><select aria-label="Application trend period" value={trendMonths} onChange={(event) => setTrendMonths(Number(event.target.value))}><option value={3}>Last 3 Months</option><option value={6}>Last 6 Months</option><option value={12}>Last 12 Months</option></select></header>
        <svg className="aap-trend-chart" viewBox="0 0 540 170" role="img" aria-label={`Monthly application submissions over the last ${trendMonths} months`}>
          <title>Application submissions by month</title><desc>{trend.map((month) => `${month.label} ${month.year}, ${month.count} applications`).join(". ")}</desc>
          <defs><linearGradient id="aap-trend-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#9e5cff" stopOpacity=".3" /><stop offset="100%" stopColor="#9e5cff" stopOpacity=".04" /></linearGradient></defs>
          {[0, 1, 2, 3, 4].map((tick) => <g key={tick}><line x1="38" y1={137 - tick * 28} x2="508" y2={137 - tick * 28} stroke="#e9ddf7" /><text x="25" y={141 - tick * 28} textAnchor="end">{tick * chartTop / 4}</text></g>)}
          <path d={`${linePath} L508,137 L38,137 Z`} fill="url(#aap-trend-fill)" /><path d={linePath} fill="none" stroke="#8d3eff" strokeWidth="2.3" />
          {chartPoints.map((point, index) => <g key={point.key}><circle cx={point.x} cy={point.y} r="3.5" fill="white" stroke="#8d3eff" strokeWidth="1.8"><title>{point.label} {point.year}, {point.count} applications</title></circle>{(trendMonths !== 12 || index % 2 === 0 || index === 11) && <text x={point.x} y="160" textAnchor="middle">{point.label}</text>}</g>)}
        </svg>
        {!isLoading && !trend.some((month) => month.count > 0) && <p className="aap-chart-note">No submissions recorded in this period.</p>}
      </article>
      <article className="adh-panel aap-status-chart"><header className="adh-panel-heading"><span className="adh-icon"><Icon name="clock" /></span><div><h2>Applications by Status</h2><p>Distribution of application outcomes.</p></div></header>
        <div className="adh-chart-content"><div className="adh-donut" style={{ background: summary.total ? `conic-gradient(${gradient})` : "#eee5ff" }} role="img" aria-label={`${summary.total} applications by status`}><div><strong>{summary.total}</strong><span>Applications</span></div></div><div className="adh-breakdown">{segments.map((segment) => <div key={segment.label}><i style={{ background: segment.color }} /><span>{segment.label}</span><strong>{segment.count}</strong><small>({percentage(segment.count, summary.total)}%)</small></div>)}</div></div>
      </article>
    </section>

    <section className="aum-directory aap-directory" aria-label="Application records">
      <header className="adh-panel-heading"><span className="adh-icon"><Icon name="chart" /></span><div><h2>Application Records</h2><p>All student applications across scholarship providers.</p></div></header>
      <div className="aum-filters aap-filters">
        <label className="aum-search"><Icon name="search" /><input aria-label="Search applications" type="search" placeholder="Search by student name, scholarship, or provider..." value={searchTerm} onChange={(event) => { setSearchTerm(event.target.value); setPage(1); }} /></label>
        <select aria-label="Filter by scholarship" value={scholarshipFilter} onChange={(event) => { setScholarshipFilter(event.target.value); setPage(1); }}><option value="all">All Scholarships</option>{scholarshipOptions.map(([id, title]) => <option key={id} value={id}>{title}</option>)}</select>
        <select aria-label="Filter by provider" value={providerFilter} onChange={(event) => { setProviderFilter(event.target.value); setPage(1); }}><option value="all">All Providers</option>{providers.map((provider) => <option key={provider}>{provider}</option>)}</select>
        <select aria-label="Filter applications by status" value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }}>{statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
        <button className="aum-outline" type="button" onClick={exportApplications} disabled={isLoading || (!filteredApplications.length && !selectedIds.size)}>↓ Export{selectedIds.size ? ` (${selectedIds.size})` : ""}</button>
      </div>
      {selectedIds.size > 0 && <div className="aum-selected"><span>{selectedIds.size} selected for export</span><button type="button" onClick={() => setSelectedIds(new Set())}>Clear selection</button></div>}
      <div className="aum-table-panel"><div className="aum-table-scroll"><table className="aum-table aap-table"><thead><tr><th><input type="checkbox" aria-label="Select all applications on this page" checked={allPageSelected} onChange={selectPage} disabled={!visibleApplications.length} /></th><th>Student</th><th>Scholarship</th><th>Provider</th><th>Submitted On</th><th>Status</th><th>Action</th></tr></thead><tbody>
        {visibleApplications.map((application) => <tr key={application.application_id} className={selectedIds.has(application.application_id) ? "aum-checked" : ""}>
          <td><input type="checkbox" aria-label={`Select application ${application.application_id}`} checked={selectedIds.has(application.application_id)} onChange={() => selectApplication(application.application_id)} /></td>
          <td><div className="aum-user"><span className="aum-avatar">{getInitials(application.student_name)}</span><div><strong>{application.student_name}</strong><small>{application.student_email}</small></div></div></td>
          <td className="aap-scholarship">{application.scholarship_title}</td><td><div className="aap-provider"><span>{getInitials(application.organization_name)}</span>{application.organization_name}</div></td>
          <td className="aum-date">{formatDate(application.application_date)}</td><td><span className={`admin-status-badge ${normalizeStatus(application.application_status)}`}><i />{getStatusLabel(application.application_status)}</span></td>
          <td><button type="button" className="aum-outline aap-details" aria-label={`View details for application ${application.application_id}`} onClick={() => openDetails(application)}>View Details</button></td>
        </tr>)}
        {(isLoading || !visibleApplications.length) && <tr><td colSpan={7} className="aum-empty">{isLoading ? "Loading applications…" : error ? "Application records could not be loaded." : "No applications match your search or filters."}</td></tr>}
      </tbody></table></div><footer className="aum-table-footer"><span>Showing {filteredApplications.length ? (currentPage - 1) * pageSize + 1 : 0}–{Math.min(currentPage * pageSize, filteredApplications.length)} of {filteredApplications.length} applications</span><nav aria-label="Application pagination"><button type="button" aria-label="Previous page" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>‹</button>
        {Array.from({ length: totalPages }, (_, index) => index + 1).filter((number) => number === 1 || number === totalPages || Math.abs(number - currentPage) <= 1).map((number, index, numbers) => <span key={number}>{index > 0 && number - numbers[index - 1] > 1 && <span className="aum-page-gap">…</span>}<button type="button" aria-label={`Page ${number}`} aria-current={number === currentPage ? "page" : undefined} onClick={() => setPage(number)}>{number}</button></span>)}
        <button type="button" aria-label="Next page" disabled={currentPage === totalPages} onClick={() => setPage(currentPage + 1)}>›</button></nav></footer></div>
    </section>

    <dialog className="aum-dialog aap-dialog" ref={dialogRef} aria-labelledby="aap-dialog-title"><header><h2 id="aap-dialog-title">Application Details</h2><button type="button" aria-label="Close application details" onClick={() => dialogRef.current?.close()}><Icon name="close" /></button></header>
      {selectedApplication && <div><div className="aum-user"><span className="aum-avatar">{getInitials(selectedApplication.student_name)}</span><div><strong>{selectedApplication.student_name}</strong><small>{selectedApplication.student_email}</small></div></div>
        <dl className="aap-detail-grid">
          <div><dt>Application ID</dt><dd>{selectedApplication.application_id}</dd></div><div><dt>Student ID</dt><dd>{selectedApplication.student_id}</dd></div><div><dt>Scholarship</dt><dd>{selectedApplication.scholarship_title}</dd></div><div><dt>Provider</dt><dd>{selectedApplication.organization_name}<small>{selectedApplication.sponsor_email}</small></dd></div><div><dt>Submitted On</dt><dd>{formatDate(selectedApplication.application_date)}</dd></div><div><dt>Status</dt><dd>{getStatusLabel(selectedApplication.application_status)}</dd></div><div><dt>Education Level</dt><dd>{selectedApplication.education_level || "Not stated"}</dd></div><div><dt>CGPA</dt><dd>{selectedApplication.cgpa === null || selectedApplication.cgpa === "" ? "Not stated" : selectedApplication.cgpa}</dd></div><div><dt>Field of Study</dt><dd>{selectedApplication.field_of_study || "Not stated"}</dd></div><div><dt>University</dt><dd>{selectedApplication.university || "Not stated"}</dd></div><div><dt>Funding Type</dt><dd>{selectedApplication.funding_type || "Not stated"}</dd></div>
        </dl><h3>Remarks</h3><p className="aap-remarks">{selectedApplication.remarks || "No remarks have been added to this application."}</p><p className="aap-monitor-note">Application decisions are managed by the scholarship provider.</p>
      </div>}
    </dialog>
  </div>;
}
