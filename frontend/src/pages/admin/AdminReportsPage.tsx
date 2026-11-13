import { useEffect, useMemo, useState } from "react";
import Icon from "../../components/advisor/AdvisorIcon";
import type { AdvisorIconName } from "../../components/advisor/AdvisorIcon";
import api from "../../api/axios";
import { getApiErrorMessage } from "../../utils/apiError";
import "../../styles/admin-users.css";
import "../../styles/admin-reports.css";

type Count = { label: string; count: number };
type Analytics = { roles: Count[]; categories: Count[]; statuses: Count[]; trend: {month: string; count: number}[]; scholarships: {scholarship_id: number; title: string; provider: string; count: number}[]; active_subscriptions: number; generated_at: string; start: string | null; end: string | null };
type Recent = { id: number; title: string; date: string; csv: string };
const tabs = ["Overview", "User Reports", "Scholarship Reports", "Application Reports", "Subscription Reports"];
const colors = ["#8145ff", "#f27cbc", "#669aff", "#82c92e", "#a7a3b4"];
const sum = (rows: Count[]) => rows.reduce((total, row) => total + Number(row.count), 0);
const pct = (value: number, total: number) => total ? `${(value / total * 100).toFixed(1)}%` : "0%";
const roleNames: Record<string, string> = {student: "Students", sponsor: "Sponsorship Providers", advisor: "Academic Advisors", admin: "Administrators"};
function download(csv: string, name: string) {
  const url = URL.createObjectURL(new Blob(["\ufeff" + csv], {type: "text/csv;charset=utf-8"}));
  const link = document.createElement("a"); link.href = url; link.download = name; link.click(); URL.revokeObjectURL(url);
}
function csvCell(value: unknown) {
  const text = String(value ?? "");
  return '"' + (/^[=+@\-\t\r]/.test(text) ? "'" + text : text).replace(/"/g, '""') + '"';
}
function Heading({icon, title, text}: {icon: AdvisorIconName; title: string; text: string}) {
  return <div className="adh-panel-heading"><span><Icon name={icon}/></span><div><h2>{title}</h2><p>{text}</p></div></div>;
}
export default function AdminReportsPage() {
  const [data, setData] = useState<Analytics | null>(null);
  const [tab, setTab] = useState("Overview");
  const [start, setStart] = useState(""); const [end, setEnd] = useState("");
  const [range, setRange] = useState({start: "", end: ""});
  const [revision, setRevision] = useState(0); const [months, setMonths] = useState(6);
  const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  const [recent, setRecent] = useState<Recent[]>([]);
  useEffect(() => {
    let active = true;
    api.get<Analytics>("/admin/reports", {params: range}).then(response => {if (active) setData(response.data);})
      .catch(err => {if (active) setError(getApiErrorMessage(err, "Unable to load analytics."));})
      .finally(() => {if (active) setLoading(false);});
    return () => {active = false;};
  }, [range, revision]);
  const trend = useMemo(() => {
    if (!data) return [];
    const last = data.end || new Intl.DateTimeFormat("en-CA", {timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit"}).format(new Date());
    const parts = last.split("-").map(Number);
    return Array.from({length: months}, (_, i) => {
      const date = new Date(Date.UTC(parts[0], parts[1] - months + i, 1));
      const key = date.toISOString().slice(0, 7);
      return {month: key, count: Number(data.trend.find(row => row.month === key)?.count || 0)};
    });
  }, [data, months]);
  function applyRange(reset = false) {
    if (!reset && start && end && start > end) {setError("Start date must be on or before end date."); return;}
    setError(""); setLoading(true); setData(null);
    if (reset) {setStart(""); setEnd("");}
    setRange(reset ? {start: "", end: ""} : {start, end});
  }
  function exportCsv() {
    if (!data) return;
    const rows: unknown[][] = [["ScholarOne", tab], ["Generated at", data.generated_at], ["From", data.start || "All time", "To", data.end || "Today"], ["Section", "Metric", "Count"]];
    if (tab === "Overview" || tab === "User Reports") data.roles.forEach(r => rows.push(["Users", roleNames[r.label] || r.label, r.count]));
    if (tab === "Overview" || tab === "Scholarship Reports") {
      data.categories.forEach(r => rows.push(["Scholarship categories", r.label, r.count]));
      data.scholarships.forEach(r => rows.push(["Most applied scholarships", r.title, r.count, r.provider]));
    }
    if (tab === "Overview" || tab === "Application Reports") {
      rows.push(["Applications received", "Total", sum(data.statuses)]);
      data.statuses.forEach(r => rows.push(["Provider-recorded outcomes", r.label, r.count]));
      data.trend.forEach(r => rows.push(["Application trend", r.month, r.count]));
    }
    if (tab === "Overview" || tab === "Subscription Reports") rows.push(["Subscriptions", "Active now (not date-filtered)", data.active_subscriptions]);
    const csv = rows.map(row => row.map(csvCell).join(",")).join("\r\n");
    const entry = {id: Date.now(), title: tab === "Overview" ? "Platform Summary" : tab, date: new Date().toLocaleString("en-MY"), csv};
    download(csv, `scholarone-${tab.toLowerCase().replaceAll(" ", "-")}.csv`);
    setRecent(previous => [entry, ...previous].slice(0, 5));
  }
  const overview = tab === "Overview";
  const users = data ? sum(data.roles) : 0; const applications = data ? sum(data.statuses) : 0;
  const roleRows = data ? [...Object.keys(roleNames).map(label => ({label, count: Number(data.roles.find(row => row.label === label)?.count || 0)})), ...data.roles.filter(row => !roleNames[row.label])] : [];
  let angle = 0;
  const donut = roleRows.map((row, index) => {const from = angle; angle += users ? row.count / users * 360 : 0; return `${colors[index % colors.length]} ${from}deg ${angle}deg`;}).join(",");
  const max = Math.max(4, ...trend.map(row => row.count));
  const points = trend.map((row, i) => `${40 + i * 470 / Math.max(1, trend.length - 1)},${145 - row.count / max * 115}`).join(" ");
  return <div className="aum-page arp-page">
    <div className="arp-toolbar"><nav className="aum-tabs" aria-label="Report sections">{tabs.map(name => <button key={name} type="button" aria-pressed={tab === name} onClick={() => setTab(name)}>{name}</button>)}</nav><div className="arp-exports"><button className="aum-primary" disabled={!data || loading || !!error} onClick={exportCsv}><Icon name="quiz"/>Export CSV</button><button className="aum-outline" disabled={!data || loading || !!error} onClick={() => window.print()}>Print / Save PDF</button></div></div>
    <form className="arp-range adh-panel" onSubmit={event => {event.preventDefault(); applyRange();}}><label>From<input aria-label="Report start date" type="date" value={start} onChange={event => setStart(event.target.value)}/></label><label>To<input aria-label="Report end date" type="date" value={end} onChange={event => setEnd(event.target.value)}/></label><button className="aum-primary" disabled={loading}>Apply dates</button><button className="aum-outline" type="button" disabled={loading} onClick={() => applyRange(true)}>All time</button><p>Dates filter account creation, listing creation, and application submissions. Active subscriptions show the current total.</p></form>
    {error && <div className="aum-form-error" role="alert">{error} <button onClick={() => {setError(""); setLoading(true); setRevision(value => value + 1);}}>Retry</button></div>}
    {loading && <p role="status">Loading report analytics…</p>}
    {data && !loading && !error && <>
      <p className="arp-period">{tab} · {data.start || "All time"} – {data.end || "Today"} · Generated {new Date(data.generated_at).toLocaleString("en-MY")}</p>
      <div className="adh-metrics">{([ ["users", "Total Users", users, "Accounts created in range"], ["layers", "Scholarship Listings", sum(data.categories), "Listings created in range"], ["quiz", "Student Applications", applications, "Submissions received in range"], ["calendar", "Active Subscriptions", data.active_subscriptions, "Current active subscriptions"] ] as [AdvisorIconName, string, number, string][]).map(([icon, title, count, helper], index) => <article className={`adh-metric arp-metric-${index}`} key={title}><span className="adh-icon"><Icon name={icon}/></span><div><h2>{title}</h2><strong>{count.toLocaleString()}</strong><small>{helper}</small></div></article>)}</div>
      <div className="arp-grid">
      {(overview || tab === "Application Reports" || tab === "Scholarship Reports") && <section className="adh-panel"><div className="arp-chart-heading"><Heading icon="trend" title="Application Trend" text="Monthly submissions within the selected dates."/><select aria-label="Trend period" value={months} onChange={event => setMonths(Number(event.target.value))}>{[3,6,12].map(n => <option key={n} value={n}>Last {n} Months</option>)}</select></div><svg className="arp-line" viewBox="0 0 540 180" role="img" aria-label={`Monthly application submissions: ${trend.map(row => `${row.month}: ${row.count}`).join(', ')}`}><defs><linearGradient id="arp-fill" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#955aff" stopOpacity=".4"/><stop offset="1" stopColor="#955aff" stopOpacity=".03"/></linearGradient></defs>{[0,1,2,3,4].map(n => <g key={n}><line x1="40" x2="510" y1={145-n*28.75} y2={145-n*28.75} stroke="#ece3fa"/><text x="3" y={149-n*28.75}>{Math.round(n*max/4)}</text></g>)}<polygon points={`40,145 ${points} 510,145`} fill="url(#arp-fill)"/><polyline points={points} fill="none" stroke="#803bff" strokeWidth="2.5"/>{trend.map((row,i) => <g key={row.month}><circle cx={40+i*470/(trend.length-1)} cy={145-row.count/max*115} r="4" fill="white" stroke="#803bff" strokeWidth="2"><title>{row.month}: {row.count}</title></circle><text textAnchor="middle" x={40+i*470/(trend.length-1)} y="170">{new Date(`${row.month}-01T00:00:00Z`).toLocaleString('en', {month:'short', timeZone:'UTC'})}</text></g>)}</svg>{!applications && <p className="arp-note">No applications recorded in this period.</p>}</section>}
      {(overview || tab === "User Reports") && <section className="adh-panel"><Heading icon="users" title="Users by Role" text="Accounts created within the selected dates."/><div className="adh-chart-content"><div className="adh-donut" role="img" aria-label={`${users} users: ${roleRows.map(row => `${roleNames[row.label] || row.label} ${row.count}`).join(', ')}`} style={{background: users ? `conic-gradient(${donut})` : "#eee5fc"}}><div><strong>{users.toLocaleString()}</strong><span>Users</span></div></div><div className="adh-breakdown">{roleRows.map((row,i) => <div key={row.label}><i style={{background: colors[i % colors.length]}}/><span>{roleNames[row.label] || row.label}</span><strong>{row.count}</strong><span>{pct(row.count,users)}</span></div>)}</div></div></section>}
      {(overview || tab === "Application Reports") && <section className="adh-panel"><Heading icon="chart" title="Application Analytics" text="Current provider-recorded outcomes of submissions in range."/><div className="arp-bars">{[{label:"Received",count:applications}, ...["approved","pending","rejected"].map(label => ({label:label.charAt(0).toUpperCase()+label.slice(1),count:Number(data.statuses.find(r => r.label === label)?.count || 0)})), ...data.statuses.filter(r => !["approved","pending","rejected"].includes(r.label))].map(row => <div key={row.label}><span>{row.label}</span><progress aria-label={`${row.label} applications`} max={applications || 1} value={row.count}/><strong>{row.count}</strong></div>)}</div><p className="arp-note">Received includes all outcomes. Sponsorship providers approve or reject applications.</p></section>}
      {(overview || tab === "Scholarship Reports") && <section className="adh-panel"><Heading icon="layers" title="Scholarships by Category" text="Listings created in the selected dates, across all approval statuses."/><div className="arp-bars">{data.categories.map(row => <div key={row.label}><span>{row.label}</span><progress aria-label={`${row.label} scholarships`} max={Math.max(1,...data.categories.map(r=>r.count))} value={row.count}/><strong>{row.count}</strong></div>)}</div>{!data.categories.length && <p>No scholarship listings in this period.</p>}</section>}
      {(overview || tab === "Scholarship Reports") && <section className="adh-panel arp-performance"><Heading icon="trophy" title="Most Applied Scholarships" text="Top ten scholarships by submissions within the selected dates."/><div className="aum-table-scroll"><table className="aum-table"><thead><tr><th>Scholarship</th><th>Provider</th><th>Applications</th></tr></thead><tbody>{data.scholarships.map(row => <tr key={row.scholarship_id}><td>{row.title}</td><td>{row.provider}</td><td>{row.count}</td></tr>)}{!data.scholarships.length && <tr><td colSpan={3}>No scholarship applications in this period.</td></tr>}</tbody></table></div></section>}
      {tab === "Subscription Reports" && <section className="adh-panel"><Heading icon="calendar" title="Subscription Overview" text="Current subscription activity across sponsorship providers."/><p><strong>{data.active_subscriptions}</strong> subscriptions are active now.</p><p className="arp-note">Payment tracking is not implemented. Revenue and payment reports are unavailable.</p><a href="/admin/subscriptions" className="aum-outline">View Subscription Management</a></section>}
      <section className="adh-panel arp-recent"><Heading icon="quiz" title="Recent CSV Reports" text="Downloads generated during this page session."/><div className="aum-table-scroll"><table className="aum-table"><thead><tr><th>Report Name</th><th>Generated On</th><th>Action</th></tr></thead><tbody>{recent.map(row => <tr key={row.id}><td>{row.title}</td><td>{row.date}</td><td><button className="aum-outline" onClick={() => download(row.csv,`scholarone-report-${row.id}.csv`)}>Download</button></td></tr>)}{!recent.length && <tr><td colSpan={3}>No exports yet. Export a CSV report to add it here.</td></tr>}</tbody></table></div></section>
      </div>
    </>}
  </div>;
}
