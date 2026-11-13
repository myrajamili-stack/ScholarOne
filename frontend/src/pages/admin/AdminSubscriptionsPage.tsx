import { PaymentHistory, type SubscriptionPayment } from "../../components/sponsor/SubscriptionBilling";
import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import Icon from "../../components/advisor/AdvisorIcon";
import { getInitials } from "../../utils/userDisplay";
import { getApiErrorMessage } from "../../utils/apiError";
import api from "../../api/axios";
import "../../styles/admin-users.css";
import "../../styles/admin-subscriptions.css";

type Subscription = {
  subscription_id: number;
  sponsor_id: number;
  start_date: string | null;
  end_date: string | null;
  subscription_status: string;
  provider_name: string;
  provider_email: string | null;
  plan_name: string | null;
  price: number | string | null;
  scholarship_limit: number | null;
  listing_count: number;
  auto_renew: string | boolean | null;
};
type Plan = {
  plan_id: number;
  plan_name: string;
  price: string | number;
  scholarship_limit: number;
  duration_month: number;
  benefits: string[] | null;
};
type Provider = {
  sponsor_id: number;
  provider_name: string;
  provider_email: string | null;
  subscription_id: number | null;
  plan_id: number | null;
  plan_name: string;
  subscription_status: string;
  start_date: string | null;
  end_date: string | null;
  scholarship_limit: number;
  listing_count: number;
};
type ManagementData = { subscriptions: Subscription[]; providers: Provider[]; plans: Plan[]; monthly_revenue: number | null; payments_enabled: boolean; payments: SubscriptionPayment[] };
type Section = "providers" | "history" | "plans" | "payments";
const defaultBenefits = ["Application management dashboard", "Scholarship performance statistics"];
const currency = (value: number | string) => new Intl.NumberFormat("en-MY", { style: "currency", currency: "MYR" }).format(Number(value));
type SubscriptionView = Subscription & { displayStatus: string; active: boolean; expiring: boolean };
type Tab = "all" | "active" | "expiring" | "expired";

function dateLabel(value: string | null) {
  if (!value || Number.isNaN(Date.parse(value))) return "Not set";
  return new Intl.DateTimeFormat("en-MY", {
    day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kuala_Lumpur",
  }).format(new Date(value));
}
function autoRenewLabel(value: Subscription["auto_renew"]) {
  if (value === true || value === "true") return "Yes";
  if (value === false || value === "false") return "No";
  return "Not configured";
}
function statusLabel(value: string) {
  if (value === "expiring") return "Expiring Soon";
  return value.replace(/_/g, " ").replace(/\b\w/g, character => character.toUpperCase());
}
function subscriptionId(id: number) {
  return `SUB-${String(id).padStart(3, "0")}`;
}

export default function AdminSubscriptionsPage() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [providersData, setProvidersData] = useState<Provider[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [payments, setPayments] = useState<SubscriptionPayment[]>([]);
  const [monthlyRevenue, setMonthlyRevenue] = useState(0);
  const [section, setSection] = useState<Section>("providers");
  const [reloadKey, setReloadKey] = useState(0);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null);
  const [savingPlan, setSavingPlan] = useState(false);
  const [planError, setPlanError] = useState("");
  const planDialog = useRef<HTMLDialogElement>(null);
  const providerDialog = useRef<HTMLDialogElement>(null);
  const planSavePending = useRef(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("all");
  const [search, setSearch] = useState("");
  const [provider, setProvider] = useState("all");
  const [status, setStatus] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [selected, setSelected] = useState<SubscriptionView | null>(null);
  const [message, setMessage] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const response = await api.get<ManagementData>("/admin/subscriptions");
        if (active) {
          setSubscriptions(response.data.subscriptions);
          setProvidersData(response.data.providers);
          setPlans(response.data.plans);
          setPayments(response.data.payments || []);
          setMonthlyRevenue(Number(response.data.monthly_revenue || 0));
          setError("");
        }
      } catch (err) {
        if (active) setError(getApiErrorMessage(err, "Unable to load subscription records."));
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [reloadKey]);

  const records = useMemo(() => {
    const today = new Intl.DateTimeFormat("en-CA", {
      year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Kuala_Lumpur",
    }).format(new Date());
    const cutoff = new Date(`${today}T00:00:00+08:00`);
    cutoff.setUTCDate(cutoff.getUTCDate() + 30);
    const expiryLimit = new Intl.DateTimeFormat("en-CA", {
      year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Kuala_Lumpur",
    }).format(cutoff);
    return subscriptions.map((item): SubscriptionView => {
      const rawStatus = item.subscription_status.toLowerCase().trim();
      const start = item.start_date?.slice(0, 10);
      const end = item.end_date?.slice(0, 10);
      const expired = rawStatus === "expired" || (rawStatus === "active" && !!end && end < today);
      const active = rawStatus === "active" && !expired && (!start || start <= today);
      const expiring = active && !!end && end <= expiryLimit;
      let displayStatus = rawStatus;
      if (expired) displayStatus = "expired";
      else if (expiring) displayStatus = "expiring";
      else if (rawStatus === "active" && start && start > today) displayStatus = "scheduled";
      return { ...item, active, expiring, displayStatus };
    });
  }, [subscriptions]);
  const counts = {
    all: records.length,
    active: records.filter(item => item.active).length,
    expiring: records.filter(item => item.expiring).length,
    expired: records.filter(item => item.displayStatus === "expired").length,
  };
  const providers = [...new Map(records.map(item => [String(item.sponsor_id), item.provider_name])).entries()]
    .sort((a, b) => a[1].localeCompare(b[1]));
  const invalidDateRange = !!startDate && !!endDate && startDate > endDate;
  const filtered = records.filter(item => {
    const matchesTab = tab === "all" || (tab === "active" && item.active)
      || (tab === "expiring" && item.expiring) || (tab === "expired" && item.displayStatus === "expired");
    const matchesStatus = status === "all" || (status === "active" ? item.active : item.displayStatus === status);
    const text = `${item.provider_name} ${item.provider_email || ""} ${item.plan_name || ""} ${subscriptionId(item.subscription_id)}`.toLowerCase();
    const start = item.start_date?.slice(0, 10);
    // Match subscriptions whose recorded period overlaps the selected date range.
    const matchesDates = !invalidDateRange && (!startDate || !item.end_date || item.end_date.slice(0, 10) >= startDate)
      && (!endDate || !start || start <= endDate);
    return matchesTab && matchesStatus && matchesDates && (provider === "all" || String(item.sponsor_id) === provider)
      && text.includes(search.trim().toLowerCase());
  });
  const pageSize = 8;
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pages);
  const offset = (currentPage - 1) * pageSize;
  const visible = filtered.slice(offset, offset + pageSize);
  const allSelected = visible.length > 0 && visible.every(item => selectedIds.has(item.subscription_id));

  function changeSection(next: Section) {
    setSection(next);
    setSearch("");
    setProvider("all");
    setStatus("all");
    setPage(1);
  }
  function editPlan(plan: Plan) {
    setEditingPlan(plan);
    setPlanError("");
    planDialog.current?.showModal();
  }
  async function savePlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingPlan || planSavePending.current) return;
    const values = new FormData(event.currentTarget);
    const benefits = String(values.get("benefits") || "").split("\n").map(value => value.trim()).filter(Boolean);
    planSavePending.current = true;
    setSavingPlan(true);
    setPlanError("");
    try {
      await api.patch(`/admin/subscription-plans/${editingPlan.plan_id}`, {
        price: String(values.get("price")),
        scholarship_limit: Number(values.get("scholarship_limit")),
        duration_month: Number(values.get("duration_month")),
        benefits,
      });
      setMessage(`${editingPlan.plan_name} configuration saved.`);
      planDialog.current?.close();
      setLoading(true);
      setReloadKey(value => value + 1);
    } catch (err) {
      setPlanError(getApiErrorMessage(err, "Unable to save plan configuration."));
    } finally {
      planSavePending.current = false;
      setSavingPlan(false);
    }
  }
  function changeTab(next: Tab) {
    setSection("history");
    setTab(next);
    setStatus("all");
    setPage(1);
  }
  function selectRow(id: number) {
    setSelectedIds(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function selectPage() {
    setSelectedIds(current => {
      const next = new Set(current);
      visible.forEach(item => {
        if (allSelected) next.delete(item.subscription_id);
        else next.add(item.subscription_id);
      });
      return next;
    });
  }
  function openDetails(item: SubscriptionView) {
    setSelected(item);
    dialog.current?.showModal();
  }
  function exportRecords() {
    const items = selectedIds.size ? records.filter(item => selectedIds.has(item.subscription_id)) : filtered;
    const rows = [["Subscription ID", "Provider", "Email", "Plan", "Start Date", "End Date", "Status", "Auto Renew", "Listings", "Listing Allowance"],
      ...items.map(item => [subscriptionId(item.subscription_id), item.provider_name, item.provider_email || "", item.plan_name || "Not recorded", item.start_date || "", item.end_date || "", statusLabel(item.displayStatus), autoRenewLabel(item.auto_renew), item.listing_count, item.scholarship_limit ?? ""])];
    const csv = rows.map(row => row.map(value => {
      const text = String(value);
      const safe = /^\s*[=+@-]/.test(text) ? `'${text}` : text;
      return `"${safe.replace(/"/g, '""')}"`;
    }).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8;" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "scholarone-subscriptions.csv";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage(`Exported ${items.length} subscription records.`);
  }
  const tabs: { id: Tab; name: string }[] = [
    { id: "all", name: "All Subscriptions" }, { id: "active", name: "Active" },
    { id: "expiring", name: "Expiring Soon" }, { id: "expired", name: "Expired" },
  ];

  const providerRows = providersData.filter(item => `${item.provider_name} ${item.provider_email || ""} ${item.plan_name}`.toLowerCase().includes(search.trim().toLowerCase()));
  const providerPages = Math.max(1, Math.ceil(providerRows.length / 8));
  const providerPage = Math.min(page, providerPages);
  const providerOffset = (providerPage - 1) * 8;
  const subscribedProviders = new Set(records.map(item => item.sponsor_id)).size;

  return <div className="admin-page aum-page asu-page">
    {error && <p className="admin-alert" role="alert">{error}</p>}
    {message && <p className="aum-success" role="status">{message}</p>}
    <section className="adh-metrics" aria-label="Subscription summary">
      {([
        { title: "Subscribed Providers", value: subscribedProviders, note: "Providers with subscription records", icon: "users", color: "purple" },
        { title: "Active Subscriptions", value: counts.active, note: "Includes subscriptions expiring soon", icon: "clock", color: "purple" },
        { title: "Expired", value: counts.expired, note: "Past their subscription end date", icon: "close", color: "pink" },
      ] as const).map(item => <article className={`adh-metric ${item.color}`} key={item.title}>
        <span className="adh-icon"><Icon name={item.icon} /></span><div><h2>{item.title}</h2><strong>{loading ? "—" : item.value}</strong><small>{item.note}</small></div>
      </article>)}
      <article className="adh-metric amber"><span className="adh-icon"><Icon name="chart" /></span><div><h2>Monthly Revenue</h2><strong>—</strong><small>Payment tracking unavailable</small></div></article>
    </section>
    <div className="aum-tabs" role="group" aria-label="Subscription management sections">
      {([{ id: "providers", title: "Provider Subscriptions" }, { id: "history", title: "Subscription History" }, { id: "plans", title: "Plan Configuration" }, { id: "payments", title: "Payment Records" }] as const).map(item => <button key={item.id} type="button" aria-pressed={section === item.id} onClick={() => changeSection(item.id)}>{item.title}</button>)}
    </div>
    {section === "providers" && <section className="adh-panel asu-provider-directory">
      <header className="adh-panel-heading"><span className="adh-icon"><Icon name="users" /></span><div><h2>Provider Subscription List</h2><p>Current plans and scholarship advertisement quotas for every sponsorship provider.</p></div></header>
      <label className="aum-search"><Icon name="search" /><input type="search" aria-label="Search providers" placeholder="Search provider, email, or current plan..." value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} /></label>
      <div className="aum-table-panel"><div className="aum-table-scroll"><table className="aum-table asu-provider-table"><thead><tr><th>Provider</th><th>Current Plan</th><th>Status</th><th>Expiry Date</th><th>Scholarship Listing Usage</th><th>Action</th></tr></thead><tbody>
        {providerRows.slice(providerOffset, providerOffset + 8).map(item => <tr key={item.sponsor_id}>
          <td><div className="asu-provider"><span>{getInitials(item.provider_name)}</span><div><strong>{item.provider_name}</strong><small>{item.provider_email}</small></div></div></td><td>{item.plan_name}</td>
          <td><span className={`admin-status-badge ${item.subscription_status}`}><i />{statusLabel(item.subscription_status)}</span></td><td>{dateLabel(item.end_date)}</td>
          <td><div className="asu-quota"><strong>{item.listing_count} / {item.scholarship_limit} listings</strong><progress max={Math.max(item.scholarship_limit, item.listing_count, 1)} value={item.listing_count} aria-label={`Listing usage for ${item.provider_name}`} /><small>{item.listing_count > item.scholarship_limit ? `${item.listing_count - item.scholarship_limit} above current allowance` : `${item.scholarship_limit - item.listing_count} slots remaining`}</small></div></td>
          <td><button type="button" className="aum-outline asu-details" aria-label={`Investigate ${item.provider_name}`} onClick={() => { setSelectedProvider(item); providerDialog.current?.showModal(); }}>View Details</button></td>
        </tr>)}
        {(loading || !providerRows.length) && <tr><td colSpan={6} className="aum-empty">{loading ? "Loading providers…" : error ? "Provider records could not be loaded." : "No providers match your search."}</td></tr>}
      </tbody></table></div><footer className="aum-table-footer"><span>Showing {providerRows.length ? providerOffset + 1 : 0}–{Math.min(providerOffset + 8, providerRows.length)} of {providerRows.length} providers</span><nav aria-label="Provider subscription pagination"><button type="button" disabled={providerPage === 1} onClick={() => setPage(providerPage - 1)}>Previous</button><span>{providerPage} / {providerPages}</span><button type="button" disabled={providerPage === providerPages} onClick={() => setPage(providerPage + 1)}>Next</button></nav></footer></div>
    </section>}
    {section === "plans" && <section className="adh-panel asu-plan-section"><header className="adh-panel-heading"><span className="adh-icon"><Icon name="settings" /></span><div><h2>Subscription Plan Management</h2><p>Configure plan prices, duration, listing allowances, and displayed benefits.</p></div></header><p className="asu-policy-note">Prices and benefits update the provider plan catalogue. Listing limits also apply to providers already using a plan. New durations apply to future activations.</p>
      <div className="asu-plan-grid">{plans.map(plan => <article key={plan.plan_id}><h3>{plan.plan_name}</h3><strong>{currency(plan.price)} / {plan.duration_month} month{plan.duration_month === 1 ? "" : "s"}</strong><p>{plan.scholarship_limit} scholarship listings</p><ul>{(plan.benefits ?? defaultBenefits).map(benefit => <li key={benefit}>{benefit}</li>)}</ul><button className="aum-outline" type="button" aria-label={`Configure ${plan.plan_name}`} onClick={() => editPlan(plan)}>Configure Plan</button></article>)}</div>
      {!plans.length && <p>{loading ? "Loading plans…" : "No subscription plans have been configured."}</p>}
    </section>}
    {section === "payments" && <section className="adh-panel"><header className="adh-panel-heading"><span className="adh-icon"><Icon name="quiz" /></span><div><h2>Payment Records</h2><p>Subscription payments and monthly revenue</p></div></header><p>Stripe test-mode payments · This month {currency(monthlyRevenue)} MYR received</p><PaymentHistory payments={payments} /><button type="button" className="aum-outline" onClick={() => changeSection("history")}>View Subscription History →</button></section>}
    {section === "history" &&
    <div className="asu-columns">
      <section className="adh-panel asu-directory" aria-label="Subscription directory">
        <div className="aum-tabs asu-tabs" role="group" aria-label="Subscription views">
          {tabs.map(item => <button type="button" key={item.id} aria-pressed={tab === item.id} onClick={() => changeTab(item.id)}>{item.name} ({counts[item.id]})</button>)}
        </div>
        <div className="aum-filters asu-filters">
          <label className="aum-search"><Icon name="search" /><input type="search" aria-label="Search subscriptions" placeholder="Search provider, plan, or subscription ID..." value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} /></label>
          <select aria-label="Filter subscription provider" value={provider} onChange={event => { setProvider(event.target.value); setPage(1); }}><option value="all">All Providers</option>{providers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>
          <select aria-label="Filter subscription status" value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}><option value="all">All Statuses</option>{[...new Set(["active", "expiring", "expired", ...records.map(item => item.displayStatus)])].map(value => <option key={value} value={value}>{statusLabel(value)}</option>)}</select>
          <button type="button" className="aum-outline" onClick={exportRecords} disabled={loading || (!filtered.length && !selectedIds.size)}>↓ Export{selectedIds.size ? ` (${selectedIds.size})` : ""}</button>
        </div>
        <div className="asu-date-filters">
          <span>Subscription period</span>
          <label>From<input type="date" aria-label="Subscription period from" value={startDate} onChange={event => { setStartDate(event.target.value); setPage(1); }} /></label>
          <label>To<input type="date" aria-label="Subscription period to" value={endDate} min={startDate || undefined} onChange={event => { setEndDate(event.target.value); setPage(1); }} /></label>
          {(startDate || endDate) && <button type="button" onClick={() => { setStartDate(""); setEndDate(""); setPage(1); }}>Clear dates</button>}
        </div>
        {invalidDateRange && <p className="aum-form-error" role="alert">Choose an end date on or after the start date.</p>}
        {selectedIds.size > 0 && <div className="aum-selected"><span>{selectedIds.size} selected for export</span><button type="button" onClick={() => setSelectedIds(new Set())}>Clear selection</button></div>}
        <div className="aum-table-panel"><div className="aum-table-scroll"><table className="aum-table asu-table">
          <thead><tr><th><input type="checkbox" aria-label="Select all subscriptions on this page" checked={allSelected} disabled={!visible.length} onChange={selectPage} /></th><th>Subscription ID</th><th>Provider</th><th>Plan</th><th>Start Date</th><th>End Date</th><th>Status</th><th>Auto Renew</th><th>Action</th></tr></thead>
          <tbody>{visible.map(item => <tr key={item.subscription_id} className={selectedIds.has(item.subscription_id) ? "aum-checked" : ""}>
            <td><input type="checkbox" aria-label={`Select ${subscriptionId(item.subscription_id)}`} checked={selectedIds.has(item.subscription_id)} onChange={() => selectRow(item.subscription_id)} /></td>
            <td>{subscriptionId(item.subscription_id)}</td><td><div className="asu-provider"><span>{getInitials(item.provider_name)}</span><strong>{item.provider_name}</strong></div></td><td>{item.plan_name || "Not recorded"}</td>
            <td className="aum-date">{dateLabel(item.start_date)}</td><td className="aum-date">{dateLabel(item.end_date)}</td><td><span className={`admin-status-badge ${item.displayStatus}`}><i />{statusLabel(item.displayStatus)}</span></td><td>{autoRenewLabel(item.auto_renew)}</td>
            <td><button className="aum-outline asu-details" type="button" aria-label={`View ${subscriptionId(item.subscription_id)}`} onClick={() => openDetails(item)}>View Details</button></td>
          </tr>)}{(loading || !visible.length) && <tr><td colSpan={9} className="aum-empty">{loading ? "Loading subscriptions…" : error ? "Subscription records could not be loaded." : "No subscriptions match your search or filters."}</td></tr>}</tbody>
        </table></div><footer className="aum-table-footer"><span>Showing {filtered.length ? offset + 1 : 0}–{Math.min(offset + pageSize, filtered.length)} of {filtered.length} subscriptions</span><nav aria-label="Subscription pagination">
          <button type="button" aria-label="Previous page" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>‹</button>
          {Array.from({ length: pages }, (_, index) => index + 1).filter(n => n === 1 || n === pages || Math.abs(n - currentPage) <= 1).map((n, index, numbers) => <span key={n}>{index > 0 && n - numbers[index - 1] > 1 && <span className="aum-page-gap">…</span>}<button type="button" aria-label={`Page ${n}`} aria-current={currentPage === n ? "page" : undefined} onClick={() => setPage(n)}>{n}</button></span>)}
          <button type="button" aria-label="Next page" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}>›</button>
        </nav></footer></div>
      </section>
      <aside className="asu-aside">
        <section className="adh-panel"><span className="adh-icon"><Icon name="quiz" /></span><h2>Subscription Overview</h2><p>Review provider plans, subscription periods, and scholarship listing allowances.</p><button type="button" className="aum-outline" onClick={exportRecords} disabled={loading || (!filtered.length && !selectedIds.size)}>Export Subscription Report →</button></section>
        <section className="adh-panel"><header className="adh-panel-heading"><span className="adh-icon"><Icon name="bolt" /></span><div><h2>Quick Actions</h2></div></header>
          <button type="button" className="asu-action" onClick={() => changeTab("expiring")}><Icon name="hourglass" /><span><strong>Review Upcoming Renewals</strong><small>{counts.expiring} subscriptions expiring within 30 days</small></span><Icon name="chevron" /></button>
          <button type="button" className="asu-action" onClick={() => changeTab("active")}><Icon name="layers" /><span><strong>View Active Plans</strong><small>Check subscription periods and listing usage</small></span><Icon name="chevron" /></button>
        </section>
        <section className="adh-panel"><h2>Upcoming Renewals</h2>{records.filter(item => item.expiring).sort((a, b) => (a.end_date || "").localeCompare(b.end_date || "")).slice(0, 3).map(item => <button className="asu-renewal" type="button" key={item.subscription_id} onClick={() => openDetails(item)}><strong>{item.provider_name}</strong><small>{item.plan_name} · {dateLabel(item.end_date)}</small></button>)}{!counts.expiring && <p>No subscriptions expire within 30 days.</p>}</section>
      </aside>
    </div>
    }
    <dialog className="aum-dialog asu-dialog" ref={providerDialog} aria-labelledby="asu-provider-title"><header><h2 id="asu-provider-title">Provider Subscription Details</h2><button type="button" aria-label="Close provider details" onClick={() => providerDialog.current?.close()}><Icon name="close" /></button></header>
      {selectedProvider && <div><h3>{selectedProvider.provider_name}</h3><p>{selectedProvider.provider_email}</p><dl><div><dt>Current Plan</dt><dd>{selectedProvider.plan_name}</dd></div><div><dt>Listing Usage</dt><dd>{selectedProvider.listing_count} / {selectedProvider.scholarship_limit}</dd></div><div><dt>Expiry</dt><dd>{dateLabel(selectedProvider.end_date)}</dd></div><div><dt>Status</dt><dd>{statusLabel(selectedProvider.subscription_status)}</dd></div></dl><h4>Subscription History</h4>
        {records.filter(item => item.sponsor_id === selectedProvider.sponsor_id).map(item => <button className="asu-history-item" key={item.subscription_id} type="button" onClick={() => { providerDialog.current?.close(); openDetails(item); }}><strong>{subscriptionId(item.subscription_id)} · {item.plan_name}</strong><span>{dateLabel(item.start_date)} – {dateLabel(item.end_date)} · {statusLabel(item.displayStatus)}</span></button>)}
        {!records.some(item => item.sponsor_id === selectedProvider.sponsor_id) && <p>This provider uses the default Free plan and has no subscription history.</p>}
      </div>}
    </dialog>
    <dialog className="aum-dialog asu-dialog" ref={planDialog} aria-labelledby="asu-plan-title" onCancel={event => { if (planSavePending.current) event.preventDefault(); }}><header><h2 id="asu-plan-title">Configure {editingPlan?.plan_name}</h2><button type="button" aria-label="Close plan configuration" disabled={savingPlan} onClick={() => planDialog.current?.close()}><Icon name="close" /></button></header>
      {planError && <p className="aum-form-error" role="alert">{planError}</p>}
      {editingPlan && <form key={`${editingPlan.plan_id}:${editingPlan.price}:${editingPlan.scholarship_limit}:${editingPlan.duration_month}:${editingPlan.benefits?.join("|")}`} onSubmit={savePlan}>
        <label>Price (MYR)<input name="price" type="number" required min="0" max="99999999.99" step="0.01" defaultValue={editingPlan.price} /></label>
        <label>Scholarship Listing Limit<input name="scholarship_limit" type="number" required min="1" max="1000000" step="1" defaultValue={editingPlan.scholarship_limit} /></label>
        <label>Duration (months)<input name="duration_month" type="number" required min="1" max="120" step="1" defaultValue={editingPlan.duration_month} /></label>
        <label>Benefits<small>One benefit per line, up to 20 benefits of 200 characters each.</small><textarea name="benefits" rows={5} defaultValue={(editingPlan.benefits ?? defaultBenefits).join("\n")} /></label>
        <p className="asu-policy-note">Saving updates this plan’s catalogue and listing allowance. Existing subscription end dates keep their recorded values.</p>
        <button type="submit" className="aum-primary" disabled={savingPlan}>{savingPlan ? "Saving…" : "Save Configuration"}</button>
      </form>}
    </dialog>
    <dialog className="aum-dialog asu-dialog" ref={dialog} aria-labelledby="asu-dialog-title"><header><h2 id="asu-dialog-title">Subscription Details</h2><button type="button" aria-label="Close subscription details" onClick={() => dialog.current?.close()}><Icon name="close" /></button></header>
      {selected && <div><h3>{selected.provider_name}</h3><p>{selected.provider_email || "No contact email recorded"}</p><dl>
        <div><dt>Subscription ID</dt><dd>{subscriptionId(selected.subscription_id)}</dd></div><div><dt>Plan</dt><dd>{selected.plan_name || "Not recorded"}</dd></div>
        <div><dt>Status</dt><dd>{statusLabel(selected.displayStatus)}</dd></div><div><dt>Auto Renew</dt><dd>{autoRenewLabel(selected.auto_renew)}</dd></div>
        <div><dt>Start Date</dt><dd>{dateLabel(selected.start_date)}</dd></div><div><dt>End Date</dt><dd>{dateLabel(selected.end_date)}</dd></div>
        <div><dt>Plan Price (MYR)</dt><dd>{selected.price == null ? "Not recorded" : new Intl.NumberFormat("en-MY", { style: "currency", currency: "MYR" }).format(Number(selected.price))}</dd></div>
        <div><dt>Current Provider Listings</dt><dd>{selected.listing_count}</dd></div><div><dt>Plan Listing Allowance</dt><dd>{selected.scholarship_limit ?? "Not recorded"}</dd></div>
      </dl><p className="asu-note">Listing usage reflects the provider’s current listings. Plan dates and status describe this subscription record.</p></div>}
    </dialog>
  </div>;
}
