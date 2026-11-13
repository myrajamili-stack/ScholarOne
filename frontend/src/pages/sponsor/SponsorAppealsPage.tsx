import Icon from "../../components/advisor/AdvisorIcon";
import { Fragment, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import api from "../../api/axios";
import { getApiErrorMessage } from "../../utils/apiError";
import { getStoredUser } from "../../utils/authStorage";
import "../../styles/sponsor-appeals.css";

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
  rejection_date?: string | null;
  rejection_reason?: string | null;
};

type AppealHistory = {
  log_id: number;
  action: string;
  description: string;
  action_time?: string | null;
  scholarship_id?: number | null;
  scholarship_title?: string | null;
  current_status?: string | null;
};

type SponsorAppealsData = {
  sponsor: { organization_name: string };
  summary: { rejected: number; under_review: number; resolved: number; unsuccessful?: number; latest_status: string };
  scholarships: AppealScholarship[];
  appeal_history: AppealHistory[];
};

function formatDate(value?: string | null) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "Not recorded";
  return new Intl.DateTimeFormat("en-MY", {
    timeZone: "Asia/Kuala_Lumpur", day: "numeric", month: "short", year: "numeric",
  }).format(date);
}

function historyStatus(status?: string | null) {
  if (["active", "approved"].includes((status || "").toLowerCase())) return { label: "Approved", tone: "approved" };
  if ((status || "").toLowerCase() === "rejected") return { label: "Unsuccessful", tone: "rejected" };
  return { label: status === "appeal_submitted" ? "Under Review" : "Submitted", tone: "pending" };
}

function SponsorAppealsPage() {
  const sponsorId = getStoredUser()?.user_id;
  const [data, setData] = useState<SponsorAppealsData | null>(null);
  const [tab, setTab] = useState<"listings" | "history">("listings");
  const [activeId, setActiveId] = useState<number | null>(null);
  const [expandedHistoryId, setExpandedHistoryId] = useState<number | null>(null);
  const [appealMessages, setAppealMessages] = useState<Record<number, string>>({});
  const [messageError, setMessageError] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const submissionInFlight = useRef(false);
  const appealInput = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadAppeals() {
      try {
        if (!sponsorId) throw new Error("Please log in as a sponsorship provider to view appeals.");
        const response = await api.get<SponsorAppealsData>(`/sponsors/${sponsorId}/appeals`);
        if (!cancelled) { setData(response.data); setError(""); }
      } catch (loadError) {
        if (!cancelled) setError(getApiErrorMessage(loadError, "Unable to load appeal records."));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void loadAppeals();
    return () => { cancelled = true; };
  }, [sponsorId, reloadKey]);

  function openAppeal(id: number) {
    setActiveId(id);
    setMessageError("");
    requestAnimationFrame(() => appealInput.current?.focus());
  }

  async function submitAppeal(event: FormEvent<HTMLFormElement>, scholarship: AppealScholarship) {
    event.preventDefault();
    if (!sponsorId || submissionInFlight.current) return;
    const message = (appealMessages[scholarship.scholarship_id] || "").trim();
    if (message.length < 20) {
      setMessageError("Please provide at least 20 characters explaining your appeal.");
      appealInput.current?.focus();
      return;
    }
    submissionInFlight.current = true;
    setIsSubmitting(true);
    setMessageError("");
    setError("");
    setSuccess("");
    try {
      const response = await api.post(`/sponsors/${sponsorId}/appeals`, {
        scholarship_id: scholarship.scholarship_id, appeal_message: message,
      });
      setData((current) => {
        if (!current) return current;
        const previousUnsuccessful = current.appeal_history.some((item) => item.scholarship_id === scholarship.scholarship_id && item.current_status?.toLowerCase() === "rejected");
        return {
          ...current,
          summary: {
            ...current.summary,
            rejected: Math.max(0, current.summary.rejected - 1),
            under_review: current.summary.under_review + 1,
            unsuccessful: Math.max(0, (current.summary.unsuccessful || 0) - Number(previousUnsuccessful)),
            latest_status: "Under Review",
          },
          scholarships: current.scholarships.map((item) => item.scholarship_id === scholarship.scholarship_id ? { ...item, status: "appeal_submitted" } : item),
          appeal_history: [
            { ...response.data.appeal, scholarship_id: scholarship.scholarship_id, scholarship_title: scholarship.title, current_status: "appeal_submitted" },
            ...current.appeal_history.map((item) => item.scholarship_id === scholarship.scholarship_id ? { ...item, current_status: "appeal_submitted" } : item),
          ],
        };
      });
      setSuccess(response.data.message || "Appeal submitted for administrator review.");
      setAppealMessages((current) => ({ ...current, [scholarship.scholarship_id]: "" }));
      setActiveId(null);
      setTab("history");
    } catch (submitError) {
      setError(getApiErrorMessage(submitError, "Unable to submit this appeal."));
    } finally {
      submissionInFlight.current = false;
      setIsSubmitting(false);
    }
  }

  const rejectedListings = (data?.scholarships || []).filter((item) => item.status?.toLowerCase() === "rejected");

  return (
    <div className="sponsor-page sponsor-appeals-page">
      <section className="sponsor-appeals-hero sponsor-hero sponsor-workspace-hero sponsor-learning-banner sponsor-appeals-banner">
        <div>
          <p className="sponsor-kicker"><Icon name="shield" />Appeal Management</p>
          <h2>Request a Review for Rejected Listings</h2>
          <span>Submit an appeal with additional information so the administrator can reconsider a rejected scholarship listing.</span>
        </div>
      </section>

      <section className="sponsor-panel sap-overview" aria-label="Appeal overview">
        <h2><Icon name="chart" />Appeal Overview</h2>
        <div className="sap-summary-grid">
          {([
            { label: "Rejected Listings", value: data?.summary.rejected, icon: "close", color: "pink", note: "Listings that can be appealed" },
            { label: "Pending Appeals", value: data?.summary.under_review, icon: "send", color: "blue", note: "Appeals sent to administrator" },
            { label: "Approved Appeals", value: data?.summary.resolved, icon: "appointment", color: "green", note: "Listings reinstated" },
            { label: "Unsuccessful Appeals", value: data?.summary.unsuccessful, icon: "shield", color: "purple", note: "Listings remain rejected" },
          ] as const).map((stat) => <article className={`sap-summary-card ${stat.color}`} key={stat.label}>
            <span className="sap-summary-icon"><Icon name={stat.icon} /></span>
            <div><h3>{stat.label}</h3><strong>{stat.value ?? "—"}</strong><small>{stat.note}</small></div>
          </article>)}
        </div>
      </section>

      <section className="sponsor-panel sap-process" aria-label="Appeal process">
        <header><h2>Appeal Process</h2><p>The steps from rejection to final decision.</p></header>
        {([
          { title: "Rejected", text: "Listing is not approved", icon: "close", color: "pink" },
          { title: "Appeal Sent", text: "You submit an appeal", icon: "send", color: "purple" },
          { title: "Under Review", text: "Administrator reviews your appeal", icon: "clock", color: "purple" },
          { title: "Decision", text: "Listing is approved or remains rejected", icon: "appointment", color: "green" },
        ] as const).map((step, index) => <Fragment key={step.title}>
          {index > 0 && <span className="sap-process-arrow"><Icon name="chevron" /></span>}
          <div className={`sap-process-step ${step.color}`}><span><Icon name={step.icon} /></span><h3>{step.title}</h3><p>{step.text}</p></div>
        </Fragment>)}
      </section>

      {error && <div role="alert" className="sponsor-form-error">{error}<button className="sap-text-button" disabled={isSubmitting} onClick={() => { setIsLoading(true); setReloadKey((key) => key + 1); }} type="button">Refresh records</button></div>}
      {success && <div role="status" className="sponsor-form-success">{success}</div>}

      <div className="sap-tabs" role="tablist" aria-label="Appeal records">
        <button id="sap-listings-tab" type="button" role="tab" aria-selected={tab === "listings"} aria-controls="sap-listings-panel" onClick={() => setTab("listings")}>Rejected Listings ({rejectedListings.length})</button>
        <button id="sap-history-tab" type="button" role="tab" aria-selected={tab === "history"} aria-controls="sap-history-panel" onClick={() => setTab("history")}>Appeal History ({data?.appeal_history.length || 0})</button>
      </div>

      {tab === "listings" ? <section id="sap-listings-panel" className="sponsor-panel sap-records" role="tabpanel" aria-labelledby="sap-listings-tab" aria-busy={isLoading}>
        <header className="sap-records-heading"><Icon name="quiz" /><div><h2>Rejected Scholarship Listings</h2><p>Scholarship listings that were not approved. Review the rejection reason and submit an appeal if needed.</p></div></header>
        <div className="sap-table-scroll" tabIndex={0} role="region" aria-label="Rejected scholarship listings table">
          <table className="sap-table">
            <thead><tr><th scope="col">Scholarship Title</th><th scope="col">Rejection Date</th><th scope="col">Rejection Reason</th><th scope="col">Appeal Eligibility</th><th scope="col">Action</th></tr></thead>
            <tbody>
              {rejectedListings.map((scholarship) => <Fragment key={scholarship.scholarship_id}>
                <tr><td><strong>{scholarship.title}</strong></td><td>{formatDate(scholarship.rejection_date)}</td><td>{scholarship.rejection_reason || "No rejection reason was recorded."}</td><td><span className="sap-status approved">✓ Eligible</span></td><td><div className="sap-row-actions">
                  <button type="button" className="sap-appeal-button" disabled={isSubmitting} aria-expanded={activeId === scholarship.scholarship_id} aria-controls={`sap-detail-${scholarship.scholarship_id}`} onClick={() => openAppeal(scholarship.scholarship_id)}><Icon name="send" />Submit Appeal</button>
                  <button type="button" className="sap-detail-button" disabled={isSubmitting} aria-label={`View details for ${scholarship.title}`} aria-expanded={activeId === scholarship.scholarship_id} aria-controls={`sap-detail-${scholarship.scholarship_id}`} onClick={() => { setActiveId(activeId === scholarship.scholarship_id ? null : scholarship.scholarship_id); setMessageError(""); }}><Icon name="eye" /></button>
                </div></td></tr>
                {activeId === scholarship.scholarship_id && <tr><td colSpan={5} className="sap-expanded-cell">
                  <form id={`sap-detail-${scholarship.scholarship_id}`} className="sap-appeal-form" onSubmit={(event) => submitAppeal(event, scholarship)}>
                    <h3>{scholarship.title}</h3><p className="sap-listing-description">{scholarship.description || "No description was provided for this listing."}</p>
                    <dl><div><dt>Amount</dt><dd>{scholarship.amount == null ? "Not provided" : new Intl.NumberFormat("en-MY", { style: "currency", currency: "MYR" }).format(Number(scholarship.amount))}</dd></div><div><dt>Deadline</dt><dd>{formatDate(scholarship.deadline)}</dd></div><div><dt>Funding Type</dt><dd>{scholarship.funding_type || "Not provided"}</dd></div><div><dt>Eligibility Criteria</dt><dd>{scholarship.eligibility_criteria || "Not provided"}</dd></div></dl>
                    <label htmlFor="sap-appeal-message">Appeal message</label>
                    <textarea id="sap-appeal-message" ref={appealInput} disabled={isSubmitting} rows={4} aria-invalid={Boolean(messageError)} aria-describedby={messageError ? "sap-message-error" : "sap-message-help"} placeholder="Explain your corrections, clarify eligibility, or provide additional funding information for the administrator." value={appealMessages[scholarship.scholarship_id] || ""} onChange={(event) => { setAppealMessages((current) => ({ ...current, [scholarship.scholarship_id]: event.target.value })); setMessageError(""); }} />
                    <small id="sap-message-help">{(appealMessages[scholarship.scholarship_id] || "").trim().length} characters · 20 characters minimum</small>
                    {messageError && <p id="sap-message-error" className="sap-message-error" role="alert">{messageError}</p>}
                    <div className="sap-form-actions"><button type="button" className="sap-appeal-button" disabled={isSubmitting} onClick={() => setActiveId(null)}>Cancel</button><button className="sponsor-primary-button" disabled={isSubmitting} type="submit"><Icon name="send" />{isSubmitting ? "Submitting…" : "Send Appeal"}</button></div>
                  </form>
                </td></tr>}
              </Fragment>)}
              {rejectedListings.length === 0 && <tr><td colSpan={5}><div className="sap-empty" role="status"><Icon name="shield" /><h3>{isLoading ? "Loading appeal records…" : error && !data ? "Appeal records unavailable" : "No rejected scholarship listings"}</h3><p>{data ? "Rejected listings will appear here when they are available for appeal." : ""}</p></div></td></tr>}
            </tbody>
          </table>
        </div>
      </section> : <section id="sap-history-panel" className="sponsor-panel sap-records" role="tabpanel" aria-labelledby="sap-history-tab">
        <header className="sap-records-heading"><Icon name="clock" /><div><h2>Appeal History</h2><p>View submitted appeals and the current status of each scholarship listing.</p></div></header>
        <div className="sap-table-scroll" tabIndex={0} role="region" aria-label="Appeal history table"><table className="sap-table"><thead><tr><th scope="col">Scholarship Title</th><th scope="col">Date Submitted</th><th scope="col">Current Status</th><th scope="col">Action</th></tr></thead><tbody>
          {(data?.appeal_history || []).map((item) => {
            const status = historyStatus(item.current_status);
            return <Fragment key={item.log_id}><tr><td><strong>{item.scholarship_title || "Scholarship appeal"}</strong></td><td>{formatDate(item.action_time)}</td><td><span className={`sap-status ${status.tone}`}>{status.label}</span></td><td><button type="button" className="sap-appeal-button" aria-expanded={expandedHistoryId === item.log_id} aria-controls={`sap-history-detail-${item.log_id}`} onClick={() => setExpandedHistoryId(expandedHistoryId === item.log_id ? null : item.log_id)}>{expandedHistoryId === item.log_id ? "Hide Appeal" : "View Appeal"}</button></td></tr>{expandedHistoryId === item.log_id && <tr><td colSpan={4} className="sap-history-message" id={`sap-history-detail-${item.log_id}`}>{item.description}</td></tr>}</Fragment>;
          })}
          {!data?.appeal_history.length && <tr><td colSpan={4}><div className="sap-empty"><Icon name="send" /><h3>No appeal submissions yet</h3><p>Appeals you submit will appear here with their current listing status.</p></div></td></tr>}
        </tbody></table></div>
      </section>}
    </div>
  );
}

export default SponsorAppealsPage;
