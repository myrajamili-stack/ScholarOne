import { useState, type FormEvent } from "react";
import api from "../api/axios";
import { getApiErrorMessage } from "../utils/apiError";
import ScholarshipEligibilityFields from "./ScholarshipEligibilityFields";

type Result = {
  status: "mismatch" | "needs_verification" | "matches_checked_rules";
  matched_count: number; mismatch_count: number; unknown_count: number;
  checks: { criterion: string; status: "matched" | "mismatch" | "unknown"; reason: string }[];
  disclaimer: string;
};

export default function ScholarshipEligibility({ scholarshipId }: { scholarshipId: number }) {
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function check(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    setBusy(true); setError(""); setResult(null);
    try {
      const response = await api.post<Result>(`/scholarships/${scholarshipId}/eligibility`, Object.fromEntries(data.entries()));
      setResult(response.data);
    } catch (err) { setError(getApiErrorMessage(err, "Unable to check eligibility. Please try again.")); }
    finally { setBusy(false); }
  }
  return <section className="scholarship-detail-section eligibility-check">
    <h3>Check My Eligibility</h3>
    <p>Your education level and CGPA come from your student profile. State and income below are used only for this check and are not saved.</p>
    <form onSubmit={check} onChange={() => { setResult(null); setError(""); }}>
      <fieldset disabled={busy}><ScholarshipEligibilityFields />
        <button type="submit" className="ss-button">{busy ? "Checking…" : "Check My Eligibility"}</button></fieldset>
    </form>
    {error && <p role="alert" className="dashboard-message error">{error}</p>}
    {result && <div aria-live="polite">
      <h4>{result.status === "mismatch" ? "Some requirements do not match" : result.status === "needs_verification" ? "Needs verification" : "Published checks match"}</h4>
      <p>{result.matched_count} matched · {result.mismatch_count} mismatched · {result.unknown_count} need verification</p>
      <ul className="eligibility-results">{result.checks.map(check => <li key={check.criterion} className={check.status}><strong>{check.criterion} — {check.status === "matched" ? "Match" : check.status === "mismatch" ? "Mismatch" : "Needs verification"}</strong><p>{check.reason}</p></li>)}</ul>
      <p>{result.disclaimer}</p>
    </div>}
  </section>;
}
