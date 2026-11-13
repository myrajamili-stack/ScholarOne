import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import api from "../../api/axios";
import { getApiErrorMessage } from "../../utils/apiError";
import Icon from "../../components/advisor/AdvisorIcon";
import type { AdvisorIconName } from "../../components/advisor/AdvisorIcon";
import "../../styles/admin-users.css";
import "../../styles/admin-audit-logs.css";

type AuditLog = {
  log_id: number;
  user_id: number | null;
  user_name: string | null;
  role: string | null;
  action: string | null;
  description: string | null;
  action_time: string | null;
  module: string | null;
};

type Filters = {
  search: string;
  module: string;
  role: string;
  start: string;
  end: string;
};

const emptyFilters: Filters = { search: "", module: "all", role: "all", start: "", end: "" };
const roleLabels: Record<string, string> = {
  student: "Student",
  sponsor: "Sponsorship Provider",
  advisor: "Academic Advisor",
  admin: "Administrator",
};

function actionWords(action: string | null) {
  return (action || "unknown").toLowerCase().split(/[^a-z0-9]+/);
}

function formatAction(action: string | null) {
  return (action || "Unknown action").replace(/[_-]+/g, " ").replace(/\b\w/g, letter => letter.toUpperCase());
}

function moduleName(log: AuditLog) {
  if (log.module?.trim()) return log.module;
  const words = actionWords(log.action);
  if (words.some(word => ["scholarship", "scholarships", "appeal"].includes(word))) return "Scholarships";
  if (words.some(word => ["application", "applications"].includes(word))) return "Applications";
  if (words.some(word => ["subscription", "plan", "payment"].includes(word))) return "Subscription Management";
  if (words.some(word => ["quiz", "pathway", "pathways"].includes(word))) return "Academic Pathways";
  if (words.some(word => ["settings", "configuration"].includes(word))) return "System Settings";
  if (words.some(word => ["login", "logout", "password", "authentication"].includes(word))) return "Security";
  if (words.some(word => ["user", "account", "register", "registration"].includes(word))) return "User Management";
  return "Other";
}

function eventKind(log: AuditLog) {
  const words = actionWords(log.action);
  if (words.some(word => ["login", "logout", "password", "authentication", "security", "deactivated", "suspended", "disabled"].includes(word))) return "security";
  if (words.some(word => ["approved", "approve", "approval"].includes(word))) return "approval";
  if (words.some(word => ["updated", "update", "changed", "edited"].includes(word))) return "update";
  return "other";
}

function localDate(value: string | null) {
  if (!value || Number.isNaN(new Date(value).getTime())) return "";
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date(value));
  return ["year", "month", "day"].map(type => parts.find(part => part.type === type)?.value).join("-");
}

function dateLabel(value: string | null) {
  if (!localDate(value)) return "Date not recorded";
  return new Intl.DateTimeFormat("en-MY", {
    timeZone: "Asia/Kuala_Lumpur", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(new Date(value!));
}

function actorName(log: AuditLog) {
  return log.user_name || (log.user_id === null ? "System" : `Account #${log.user_id}`);
}

function csvCell(value: unknown) {
  const text = String(value ?? "");
  const safe = /^[=+@\-\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

export default function AdminAuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [draft, setDraft] = useState<Filters>(emptyFilters);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filterError, setFilterError] = useState("");
  const [exportMessage, setExportMessage] = useState("");
  const [retry, setRetry] = useState(0);
  const pageSize = 5;

  useEffect(() => {
    const controller = new AbortController();
    api.get<{ logs: AuditLog[] }>("/admin/audit-logs", { signal: controller.signal })
      .then(response => {
        if (!controller.signal.aborted) setLogs(response.data.logs);
      })
      .catch(err => {
        if (!controller.signal.aborted) setError(getApiErrorMessage(err, "Unable to load audit logs."));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [retry]);

  const modules = useMemo(() => [...new Set(logs.map(moduleName))].sort(), [logs]);
  const roles = useMemo(() => [...new Set(logs.map(log => log.role || "unknown"))].sort(), [logs]);
  const filteredLogs = useMemo(() => logs.filter(log => {
    const search = filters.search.trim().toLowerCase();
    const module = moduleName(log);
    const date = localDate(log.action_time);
    const matchesSearch = [actorName(log), log.user_id, log.action, log.description, module, roleLabels[log.role || ""] || log.role]
      .join(" ").toLowerCase().includes(search);
    return matchesSearch
      && (filters.module === "all" || filters.module === module)
      && (filters.role === "all" || filters.role === (log.role || "unknown"))
      && (!filters.start || (!!date && date >= filters.start))
      && (!filters.end || (!!date && date <= filters.end));
  }), [logs, filters]);

  const pageCount = Math.max(1, Math.ceil(filteredLogs.length / pageSize));
  const visibleLogs = filteredLogs.slice((page - 1) * pageSize, page * pageSize);
  const metrics: { label: string; value: number; icon: AdvisorIconName }[] = [
    { label: "Total Activities", value: logs.length, icon: "users" },
    { label: "Approvals", value: logs.filter(log => eventKind(log) === "approval").length, icon: "appointment" },
    { label: "Updates", value: logs.filter(log => eventKind(log) === "update").length, icon: "quiz" },
    { label: "Security Events", value: logs.filter(log => eventKind(log) === "security").length, icon: "shield" },
  ];
  const pagination = [...new Set([1, page - 1, page, page + 1, pageCount])]
    .filter(number => number >= 1 && number <= pageCount).sort((a, b) => a - b);

  function applyFilters(event: FormEvent) {
    event.preventDefault();
    if (draft.start && draft.end && draft.start > draft.end) {
      setFilterError("Start date must be on or before end date.");
      return;
    }
    setFilters({ ...draft });
    setPage(1);
    setFilterError("");
    setExportMessage("");
  }

  function resetFilters() {
    setDraft(emptyFilters);
    setFilters(emptyFilters);
    setPage(1);
    setFilterError("");
    setExportMessage("");
  }

  function exportLogs() {
    const rows = [["Date & Time (Malaysia)", "User", "User ID", "Role", "Action", "Module", "Details"]];
    filteredLogs.forEach(log => rows.push([
      dateLabel(log.action_time), actorName(log), String(log.user_id ?? ""), roleLabels[log.role || ""] || log.role || "Unknown",
      log.action || "", moduleName(log), log.description || "",
    ]));
    const csv = rows.map(row => row.map(csvCell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "scholarone-audit-logs.csv";
    link.click();
    URL.revokeObjectURL(url);
    setExportMessage(`Exported ${filteredLogs.length} matching activities as CSV.`);
  }

  return (
    <div className="aum-page aal-page">

      {loading ? <p role="status">Loading activity history…</p> : error ? (
        <div className="aum-form-error" role="alert">
          {error} <button onClick={() => { setError(""); setLoading(true); setRetry(value => value + 1); }}>Retry</button>
        </div>
      ) : <>
        <div className="adh-metrics aal-metrics">
          {metrics.map(metric => (
            <article className="adh-metric" key={metric.label}>
              <span className="adh-icon"><Icon name={metric.icon} /></span>
              <div><strong>{metric.value.toLocaleString()}</strong><h2>{metric.label}</h2></div>
            </article>
          ))}
        </div>

        <section className="aum-table-panel aal-history">
          <header className="aal-heading">
            <span className="adh-icon"><Icon name="quiz" /></span>
            <div><h2>Activity History</h2><p>Recorded user and system actions.</p></div>
            <button type="button" className="aum-outline" disabled={!filteredLogs.length} onClick={exportLogs}><Icon name="quiz" />Export Logs</button>
          </header>
          <form className="aal-filters" onSubmit={applyFilters}>
            <label className="aum-search"><Icon name="search" /><input type="search" aria-label="Search activity history" placeholder="Search by user, action, or details…" value={draft.search} onChange={event => setDraft({ ...draft, search: event.target.value })} /></label>
            <select aria-label="Filter by module" value={draft.module} onChange={event => setDraft({ ...draft, module: event.target.value })}><option value="all">All Modules</option>{modules.map(module => <option key={module}>{module}</option>)}</select>
            <select aria-label="Filter by role" value={draft.role} onChange={event => setDraft({ ...draft, role: event.target.value })}><option value="all">All Roles</option>{roles.map(role => <option key={role} value={role}>{roleLabels[role] || role}</option>)}</select>
            <label className="aal-date">From<input type="date" aria-label="Activity start date" value={draft.start} onChange={event => setDraft({ ...draft, start: event.target.value })} /></label>
            <label className="aal-date">To<input type="date" aria-label="Activity end date" value={draft.end} onChange={event => setDraft({ ...draft, end: event.target.value })} /></label>
            <button className="aum-primary">Apply</button>
            <button type="button" className="aum-outline" onClick={resetFilters}>Reset</button>
          </form>
          {filterError && <p className="aal-feedback ast-error" role="alert">{filterError}</p>}
          {exportMessage && <p className="aal-feedback" role="status">{exportMessage}</p>}
          <div className="aal-table-wrap aum-table-scroll">
            <table className="aum-table aal-table">
              <thead><tr><th>Date & Time</th><th>User</th><th>Role</th><th>Action</th><th>Module</th><th>Details</th></tr></thead>
              <tbody>
                {visibleLogs.map(log => (
                  <tr key={log.log_id}>
                    <td>{dateLabel(log.action_time)}</td>
                    <td><span className="aal-actor"><Icon name="user" />{actorName(log)}</span></td>
                    <td><span className={`aal-role ${log.role || "unknown"}`}>{roleLabels[log.role || ""] || log.role || "Unknown"}</span></td>
                    <td><span className={`aal-action ${eventKind(log)}`}>{formatAction(log.action)}</span></td>
                    <td>{moduleName(log)}</td>
                    <td>{log.description || "No additional details recorded."}</td>
                  </tr>
                ))}
                {!visibleLogs.length && <tr><td className="aum-empty" colSpan={6}>{logs.length ? "No activities match your filters." : "No audit activities have been recorded yet."}</td></tr>}
              </tbody>
            </table>
          </div>
          <footer className="aum-table-footer">
            <span>Showing {filteredLogs.length ? (page - 1) * pageSize + 1 : 0}–{Math.min(page * pageSize, filteredLogs.length)} of {filteredLogs.length} activities</span>
            <nav aria-label="Activity history pages">
              <button type="button" aria-label="Previous page" disabled={page === 1} onClick={() => setPage(page - 1)}>‹</button>
              {pagination.map((number, index) => <span key={number}>{index > 0 && number - pagination[index - 1] > 1 && <span className="aal-ellipsis">…</span>}<button type="button" aria-label={`Page ${number}`} aria-current={page === number ? "page" : undefined} onClick={() => setPage(number)}>{number}</button></span>)}
              <button type="button" aria-label="Next page" disabled={page === pageCount} onClick={() => setPage(page + 1)}>›</button>
            </nav>
          </footer>
          <p className="aal-note">Times use Malaysia time (UTC+08:00). Overview cards count all recorded activities. Modules and event categories are identified from recorded action names when a module is not supplied.</p>
        </section>
      </>}
    </div>
  );
}
