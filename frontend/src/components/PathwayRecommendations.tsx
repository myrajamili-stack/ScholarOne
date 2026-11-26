import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/axios";
import type { AcademicPathway } from "../types/pathways";
import { PROFILE_UPDATED_EVENT } from "../utils/profileCompletion";

type Recommendations = {
  pathways: AcademicPathway[];
  has_assessment: boolean;
  has_education_level: boolean;
};

export default function PathwayRecommendations() {
  const [data, setData] = useState<Recommendations | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let controller: AbortController | undefined;
    async function load() {
      controller?.abort();
      const request = new AbortController();
      controller = request;
      setLoading(true);
      setError(false);
      try {
        const response = await api.get<Recommendations>("/pathways/recommendations", {
          signal: request.signal, timeout: 15000,
        });
        if (!Array.isArray(response.data?.pathways)) throw new Error("Invalid pathway recommendations response.");
        if (!request.signal.aborted) setData(response.data);
      } catch {
        if (!request.signal.aborted) setError(true);
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
  }, [retry]);

  return <section className="ss-card ss-recommendations" aria-label="Personalized Academic Pathway Recommendations">
    <div className="ss-heading">
      <h2>Recommended Academic Pathways for You</h2><Link to="/academic-pathways">Browse pathways ›</Link>
    </div>
    <p className="ss-helper">Explore routes based on your academic profile and saved assessment interests. Confirm entry requirements and costs with the institution.</p>
    {loading ? <p role="status">Loading pathway recommendations…</p>
      : error ? <p role="alert">Unable to load pathway recommendations. <button type="button" onClick={() => setRetry(value => value + 1)}>Retry</button></p>
      : data && <>
        {!data.has_education_level && <p><Link to="/profile">Complete your education profile</Link> to refine your starting point.</p>}
        {!data.has_assessment && <p><Link to="/pathway-quiz">Complete your Career Assessment</Link> to include your interests.</p>}
        {data.pathways.length === 0 ? <p>No personalized routes match yet. <Link to="/academic-pathways">Explore the pathway catalogue</Link>.</p>
          : <div className="ss-list">{data.pathways.slice(0, 3).map(pathway =>
            <article className="ss-scholarship ss-recommendation" key={pathway.pathway_id}>
              <div>
                <Link to={`/academic-pathways?q=${encodeURIComponent(pathway.title)}`}><strong>{pathway.title}</strong></Link>
                {pathway.reasons?.[0] && <p>{pathway.reasons[0]}</p>}
                {(pathway.reasons?.length ?? 0) > 1 && <details className="ss-pathway-details">
                  <summary>Why this matches</summary>
                  <ul>{pathway.reasons?.slice(1).map(reason => <li key={reason}>{reason}</li>)}</ul>
                </details>}
              </div>
            </article>
          )}</div>}
      </>}
  </section>;
}
