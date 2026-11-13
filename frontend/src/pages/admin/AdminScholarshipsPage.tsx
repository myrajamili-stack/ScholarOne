import { useEffect, useMemo, useRef, useState } from "react";

import { useSearchParams } from "react-router-dom";
import Icon from "../../components/advisor/AdvisorIcon";
import { getInitials } from "../../utils/userDisplay";
import "../../styles/admin-users.css";
import "../../styles/admin-scholarships.css";
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
  const normalized = String(status || "pending").trim().toLowerCase().replace(/\s+/g, "_");
  return normalized === "active" ? "approved" : normalized;
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
  if (!value || Number.isNaN(new Date(value).getTime())) return "No deadline";

  return new Intl.DateTimeFormat("en-MY", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function providerKey(scholarship: AdminScholarship) {
  return scholarship.sponsor_id === null ? `name:${scholarship.organization_name}` : String(scholarship.sponsor_id);
}

export default function AdminScholarshipsPage() {
  const [scholarships, setScholarships] = useState<AdminScholarship[]>([]);
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(searchParams.get("status") === "pending" ? "pending" : "all");
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") === "appeal_submitted" ? "appeal_submitted" : "all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [providerFilter, setProviderFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedScholarship, setSelectedScholarship] = useState<AdminScholarship | null>(null);
  const [error, setError] = useState("");
  const [dialogError, setDialogError] = useState("");
  const [success, setSuccess] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const operationPending = useRef(false);

  useEffect(() => {
    let active = true;
    async function loadScholarships() {
      try {
        const response = await api.get<AdminScholarshipsResponse>("/admin/scholarships");
        if (active) setScholarships(response.data.scholarships);
      } catch (err) {
        if (active) setError(getApiErrorMessage(err, "Unable to load scholarship listings."));
      } finally {
        if (active) setIsLoading(false);
      }
    }
    void loadScholarships();
    return () => { active = false; };
  }, []);

  const summary = useMemo(() => ({
    total_scholarships: scholarships.length,
    approved: scholarships.filter((item) => normalizeStatus(item.status) === "approved").length,
    pending: scholarships.filter((item) => ["pending", "appeal_submitted"].includes(normalizeStatus(item.status))).length,
    rejected: scholarships.filter((item) => normalizeStatus(item.status) === "rejected").length,
  }), [scholarships]);
  const categories = [...new Set(scholarships.map((item) => item.category).filter((category): category is string => !!category))].sort();
  const providerOptions = [...new Map(scholarships.map((item) => [providerKey(item), { key: providerKey(item), name: item.organization_name }])).values()].sort((a, b) => a.name.localeCompare(b.name));
  const filteredScholarships = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return scholarships.filter((scholarship) => {
      const status = normalizeStatus(scholarship.status);
      const matchesTab = activeTab === "all" || (activeTab === "pending" ? ["pending", "appeal_submitted"].includes(status) : status === activeTab);
      const matchesStatus = statusFilter === "all" || status === statusFilter;
      const matchesCategory = categoryFilter === "all" || scholarship.category === categoryFilter;
      const matchesProvider = providerFilter === "all" || providerKey(scholarship) === providerFilter;
      const text = [scholarship.title, scholarship.organization_name, scholarship.sponsor_email, scholarship.category, scholarship.funding_type].filter(Boolean).join(" ").toLowerCase();
      return matchesTab && matchesStatus && matchesCategory && matchesProvider && (!query || text.includes(query));
    });
  }, [scholarships, searchTerm, activeTab, statusFilter, categoryFilter, providerFilter]);
  const pageSize = 4;
  const totalPages = Math.max(1, Math.ceil(filteredScholarships.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const visibleScholarships = filteredScholarships.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const allPageSelected = visibleScholarships.length > 0 && visibleScholarships.every((item) => selectedIds.has(item.scholarship_id));

  function selectListing(id: number) {
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
      visibleScholarships.forEach((item) => {
        if (allPageSelected) next.delete(item.scholarship_id);
        else next.add(item.scholarship_id);
      });
      return next;
    });
  }

  function openReview(scholarship: AdminScholarship) {
    setSelectedScholarship(scholarship);
    setDialogError("");
    dialogRef.current?.showModal();
  }

  async function updateScholarshipStatus(id: number, status: "approved" | "rejected") {
    if (operationPending.current || !selectedScholarship || !["pending", "appeal_submitted"].includes(normalizeStatus(selectedScholarship.status))) return;
    operationPending.current = true;
    setIsSaving(true);
    setDialogError("");
    setSuccess("");
    try {
      const response = await api.patch<{ scholarship: Pick<AdminScholarship, "scholarship_id" | "title" | "status"> }>(`/admin/scholarships/${id}/status`, { status });
      setScholarships((current) => current.map((item) => item.scholarship_id === id ? { ...item, ...response.data.scholarship } : item));
      setSuccess(`Scholarship marked as ${status}.`);
      dialogRef.current?.close();
    } catch (err) {
      setDialogError(getApiErrorMessage(err, "Unable to update scholarship status."));
    } finally {
      setIsSaving(false);
      operationPending.current = false;
    }
  }

  function exportListings() {
    const items = selectedIds.size ? scholarships.filter((item) => selectedIds.has(item.scholarship_id)) : filteredScholarships;
    const rows = [["Scholarship ID", "Scholarship Title", "Provider", "Category", "Amount (MYR)", "Deadline", "Applications", "Status"],
      ...items.map((item) => [item.scholarship_id, item.title, item.organization_name, item.category || "", item.amount ?? "", item.deadline || "", item.application_count, getStatusLabel(item.status)])];
    const csv = rows.map((row) => row.map((value) => {
      const text = String(value);
      const safe = /^\s*[=+@-]/.test(text) ? `'${text}` : text;
      return `"${safe.replace(/"/g, '""')}"`;
    }).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8;" }));
    const link = document.createElement("a"); link.href = url; link.download = "scholarone-scholarship-listings.csv"; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setSuccess(`Exported ${items.length} scholarship listing${items.length === 1 ? "" : "s"}.`);
  }

  return <div className="admin-page aum-page asm-page">
    {error && <div className="admin-alert" role="alert">{error}</div>}
    {success && <div className="aum-success" role="status">{success}</div>}
    <section className="adh-metrics" aria-label="Scholarship listing summary">{([
      { label: "Total Listings", value: summary.total_scholarships, note: "All provider submissions", icon: "layers", color: "purple" },
      { label: "Pending Review", value: summary.pending, note: summary.pending ? "Includes submitted appeals" : "No items to review", icon: "clock", color: "amber" },
      { label: "Approved", value: summary.approved, note: "Published and visible", icon: "appointment", color: "green" },
      { label: "Rejected", value: summary.rejected, note: "Require provider revision", icon: "close", color: "pink" },
    ] as const).map((stat) => <article className={`adh-metric ${stat.color}`} key={stat.label}><span className="adh-icon"><Icon name={stat.icon} /></span><div><h2>{stat.label}</h2><strong>{isLoading ? "—" : stat.value}</strong><small>{stat.note}</small></div></article>)}</section>
    <section className="aum-directory" aria-label="Scholarship directory">
      <div className="aum-tabs-row"><div className="aum-tabs" role="group" aria-label="Listing groups">{([
        { id: "all", label: "All Listings", count: summary.total_scholarships, icon: "layers" },
        { id: "pending", label: "Pending Review", count: summary.pending, icon: "clock" },
        { id: "approved", label: "Approved", count: summary.approved, icon: "appointment" },
        { id: "rejected", label: "Rejected", count: summary.rejected, icon: "close" },
      ] as const).map((tab) => <button type="button" key={tab.id} aria-pressed={activeTab === tab.id} onClick={() => { setActiveTab(tab.id); setStatusFilter("all"); setPage(1); }}><Icon name={tab.icon} />{tab.label} ({tab.count})</button>)}</div>
      </div>
      <div className="aum-filters asm-filters">
        <label className="aum-search"><Icon name="search" /><input type="search" aria-label="Search scholarships" placeholder="Search by scholarship title, provider, or category..." value={searchTerm} onChange={(event) => { setSearchTerm(event.target.value); setPage(1); }} /></label>
        <select aria-label="Filter by category" value={categoryFilter} onChange={(event) => { setCategoryFilter(event.target.value); setPage(1); }}><option value="all">All Categories</option>{categories.map((category) => <option key={category}>{category}</option>)}</select>
        <select aria-label="Filter by provider" value={providerFilter} onChange={(event) => { setProviderFilter(event.target.value); setPage(1); }}><option value="all">All Providers</option>{providerOptions.map((provider) => <option key={provider.key} value={provider.key}>{provider.name}</option>)}</select>
        <select aria-label="Filter by status" value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }}>{statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
        <button type="button" className="aum-outline" disabled={isLoading || (!filteredScholarships.length && !selectedIds.size)} onClick={exportListings}>↓ Export{selectedIds.size ? ` (${selectedIds.size})` : ""}</button>
      </div>
      {selectedIds.size > 0 && <div className="aum-selected"><span>{selectedIds.size} selected for export</span><button type="button" onClick={() => setSelectedIds(new Set())}>Clear selection</button></div>}
      <div className="aum-table-panel"><div className="aum-table-scroll"><table className="aum-table asm-table"><thead><tr>
        <th><input type="checkbox" aria-label="Select all listings on this page" checked={allPageSelected} onChange={selectPage} disabled={!visibleScholarships.length} /></th><th>Scholarship Title</th><th>Provider</th><th>Category</th><th>Amount (MYR)</th><th>Deadline</th><th>Applications</th><th>Status</th><th>Action</th>
      </tr></thead><tbody>{visibleScholarships.map((scholarship) => <tr key={scholarship.scholarship_id} className={selectedIds.has(scholarship.scholarship_id) ? "aum-checked" : ""}>
        <td><input type="checkbox" aria-label={`Select ${scholarship.title}`} checked={selectedIds.has(scholarship.scholarship_id)} onChange={() => selectListing(scholarship.scholarship_id)} /></td>
        <td><button type="button" className="asm-title" onClick={() => openReview(scholarship)}>{scholarship.title}</button></td>
        <td><div className="asm-provider"><span>{getInitials(scholarship.organization_name)}</span><strong>{scholarship.organization_name}</strong></div></td>
        <td><span className="asm-category">{scholarship.category || "Not stated"}</span></td><td className="asm-amount">{formatCurrency(scholarship.amount)}</td><td className="aum-date">{formatDate(scholarship.deadline)}</td>
        <td className="asm-count">{Number(scholarship.application_count || 0)}</td><td><span className={`admin-status-badge ${normalizeStatus(scholarship.status)}`}><i />{getStatusLabel(scholarship.status)}</span></td>
        <td><button type="button" className="aum-outline asm-details" aria-label={`${["pending", "appeal_submitted"].includes(normalizeStatus(scholarship.status)) ? "Review" : "View"} details for ${scholarship.title}`} onClick={() => openReview(scholarship)}>{["pending", "appeal_submitted"].includes(normalizeStatus(scholarship.status)) ? "Review Details" : "View Details"}</button></td>
      </tr>)}{(isLoading || !visibleScholarships.length) && <tr><td colSpan={9} className="aum-empty">{isLoading ? "Loading scholarship listings…" : error ? "Scholarship records could not be loaded." : "No scholarships match your search or filters."}</td></tr>}</tbody></table></div>
        <footer className="aum-table-footer"><span>Showing {filteredScholarships.length ? (currentPage - 1) * pageSize + 1 : 0}–{Math.min(currentPage * pageSize, filteredScholarships.length)} of {filteredScholarships.length} listings</span><nav aria-label="Scholarship pagination">
          <button type="button" aria-label="Previous page" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>‹</button>
          {Array.from({ length: totalPages }, (_, index) => index + 1).filter((number) => number === 1 || number === totalPages || Math.abs(number - currentPage) <= 1).map((number, index, numbers) => <span key={number}>{index > 0 && number - numbers[index - 1] > 1 && <span className="aum-page-gap">…</span>}<button type="button" aria-label={`Page ${number}`} aria-current={number === currentPage ? "page" : undefined} onClick={() => setPage(number)}>{number}</button></span>)}
          <button type="button" aria-label="Next page" disabled={currentPage === totalPages} onClick={() => setPage(currentPage + 1)}>›</button>
        </nav></footer>
      </div>
    </section>

    <dialog className="aum-dialog asm-dialog" aria-labelledby="asm-dialog-title" ref={dialogRef} onCancel={(event) => { if (operationPending.current) event.preventDefault(); }}>
      <header><h2 id="asm-dialog-title">{selectedScholarship && ["pending", "appeal_submitted"].includes(normalizeStatus(selectedScholarship.status)) ? "Review Scholarship" : "Scholarship Details"}</h2><button type="button" aria-label="Close listing dialog" disabled={isSaving} onClick={() => dialogRef.current?.close()}><Icon name="close" /></button></header>
      {dialogError && <p className="aum-form-error" role="alert">{dialogError}</p>}
      {selectedScholarship && <div className="asm-review">
        <h3>{selectedScholarship.title}</h3><p>{selectedScholarship.organization_name}{selectedScholarship.sponsor_email ? ` · ${selectedScholarship.sponsor_email}` : ""}</p>
        <dl><div><dt>Status</dt><dd>{getStatusLabel(selectedScholarship.status)}</dd></div><div><dt>Funding</dt><dd>{formatCurrency(selectedScholarship.amount)} · {selectedScholarship.funding_type || "Not stated"}</dd></div><div><dt>Deadline</dt><dd>{formatDate(selectedScholarship.deadline)}</dd></div><div><dt>Applications</dt><dd>{Number(selectedScholarship.application_count || 0)}</dd></div></dl>
        <h4>Description</h4><p className="asm-copy">{selectedScholarship.description || "No description added."}</p><h4>Eligibility</h4><p className="asm-copy">{selectedScholarship.eligibility_criteria || "No eligibility criteria added."}</p>
        {["pending", "appeal_submitted"].includes(normalizeStatus(selectedScholarship.status)) && <div className="asm-review-actions">
          <button type="button" className="aum-primary" disabled={isSaving} onClick={() => void updateScholarshipStatus(selectedScholarship.scholarship_id, "approved")}>{isSaving ? "Saving…" : "Approve Listing"}</button>
          <button type="button" className="aum-outline asm-reject" disabled={isSaving} onClick={() => void updateScholarshipStatus(selectedScholarship.scholarship_id, "rejected")}>Reject Listing</button>
        </div>}
      </div>}
    </dialog>
  </div>;
}
