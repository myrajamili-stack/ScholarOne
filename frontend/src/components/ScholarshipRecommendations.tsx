import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import api from "../api/axios";
import { getApiErrorMessage } from "../utils/apiError";
import { PROFILE_UPDATED_EVENT } from "../utils/profileCompletion";
import ScholarshipEligibilityFields from "./ScholarshipEligibilityFields";
import Icon from "./advisor/AdvisorIcon";

const labels = {
  eligible: "Eligible on checked criteria",
  potentially_eligible: "Potentially eligible",
  insufficient_information: "Insufficient information",
};

type Recommendation = {
  scholarship_id: number;
  title: string;
  organization_name?: string;
  status: keyof typeof labels;
  checks: { criterion: string; status: "matched" | "unknown"; reason: string }[];
  relevance_reasons?: string[];
};

const RECOMMENDATION_LIMIT = 3;

export default function ScholarshipRecommendations() {
  const [context, setContext] = useState<Record<string, FormDataEntryValue>>({});
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let controller: AbortController;
    async function load() {
      controller?.abort();
      const request = new AbortController();
      controller = request;
      setLoading(true);
      setError("");
      try {
        const { data } = await api.post<{ recommendations: Recommendation[] }>(
          "/scholarships/recommendations", context, { signal: request.signal, timeout: 15000 },
        );
        if (!request.signal.aborted) setRecommendations(data.recommendations);
      } catch (error) {
        if (!request.signal.aborted) setError(getApiErrorMessage(error, "Unable to load scholarship recommendations."));
      } finally {
        if (!request.signal.aborted) setLoading(false);
      }
    }
    void load();
    window.addEventListener(PROFILE_UPDATED_EVENT, load);
    window.addEventListener("focus", load);
    return () => {
      controller?.abort();
      window.removeEventListener(PROFILE_UPDATED_EVENT, load);
      window.removeEventListener("focus", load);
    };
  }, [context]);

  function refine(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setContext(Object.fromEntries(new FormData(event.currentTarget)));
  }
  const filtersActive = Object.values(context).some(value => String(value).trim() !== "");

  return <section className="ss-card ss-scholarship-recommendations" aria-labelledby="ss-recommendation-heading">
    <div className="ss-heading">
      <h2 id="ss-recommendation-heading">Recommended Scholarships for You</h2>
      <Link className="ss-recommendation-catalogue" to="/scholarships">Browse catalogue <Icon name="chevron" /></Link>
    </div>
    <p className="ss-recommendation-intro">Ranked by your academic profile and published criteria. Confirm requirements with the provider.</p>
    <details className="ss-recommendation-context">
      <summary><Icon name="filter" /> Refine with state and household income {filtersActive && <span className="ss-refine-active">Active</span>} <Icon name="down" /></summary>
      <p>These details are used for this ranking and are never saved. <Link to="/profile">Edit your academic profile</Link> to update your education level or CGPA.</p>
      <form onSubmit={refine}>
        <ScholarshipEligibilityFields />
        <button type="submit" className="ss-button" disabled={loading}>Update recommendations</button>
      </form>
    </details>
    {loading ? <p className="ss-recommendation-state" role="status">Loading recommendations…</p>
      : error ? <div className="ss-recommendation-state" role="alert"><p>{error}</p><button type="button" className="ss-button" onClick={() => setContext({ ...context })}>Retry</button></div>
      : recommendations.length === 0 ? <p className="ss-recommendation-state">No scholarships match the supplied criteria right now.</p>
      : <div className="ss-list">
        {recommendations.slice(0, RECOMMENDATION_LIMIT).map(item => {
          const academicMatch = item.checks.find(check => check.status === "matched" && ["Academic qualification", "CGPA"].includes(check.criterion));
          const leadReason = academicMatch?.reason ?? item.relevance_reasons?.[0] ?? item.checks.find(check => check.status === "matched")?.reason;
          return <article key={item.scholarship_id} className="ss-scholarship ss-recommendation">
            <span className="ss-list-icon"><Icon name="graduation" /></span>
            <div>
              <div className="ss-recommendation-header">
                <div>
                  <h3><Link to={`/scholarships?listing=${item.scholarship_id}`}>{item.title}</Link></h3>
                  {item.organization_name && <small>{item.organization_name}</small>}
                </div>
                <span className={`ss-recommendation-status ${item.status}`}>{labels[item.status]}</span>
              </div>
              <p className="ss-recommendation-reason">{leadReason || "The available information doesn’t establish an academic match."}</p>
              <details className="ss-recommendation-reasons">
                <summary>Why this appears <Icon name="down" /></summary>
                <ul>
                  {item.relevance_reasons?.map(reason => <li key={reason}>{reason}</li>)}
                  {item.checks.map(check => <li key={check.criterion}>
                    <strong>{check.criterion} · {check.status === "matched" ? "Match" : "Needs verification"}</strong>
                    <p>{check.reason}</p>
                  </li>)}
                </ul>
              </details>
            </div>
          </article>;
        })}
      </div>}
  </section>;
}
