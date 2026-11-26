import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import api from "../../api/axios";
import { getApiErrorMessage } from "../../utils/apiError";
import type { AcademicPathway } from "../../types/pathways";
import PathwayProgression from "../../components/PathwayProgression";
import Icon from "../../components/advisor/AdvisorIcon";
import "../../styles/academic-pathways.css";

type Recommendations = { pathways: AcademicPathway[]; has_assessment: boolean; has_education_level: boolean; note: string };

function PathwayCards({ rows, personal = false, opening, onOpen }: { rows: AcademicPathway[]; personal?: boolean; opening: boolean; onOpen: (row: AcademicPathway) => Promise<void> }) {
  return <div className="academic-pathway-grid">{rows.map(row => (
    <article className="academic-pathway-card" key={row.pathway_id}>
      <span className="pathway-tag">{row.field} &middot; {row.level}</span>
      <h3>{row.title}</h3>
      <p>{row.description}</p>
      {personal && Boolean(row.reasons?.length) && <>
        <h4>Why explore this?</h4>
        <ul>{row.reasons?.map(reason => <li key={reason}>{reason}</li>)}</ul>
      </>}
      <button type="button" className="ss-button" aria-label={`View Progression & Next Steps for ${row.title}`}
        disabled={opening} onClick={() => void onOpen(row)}>View Progression & Next Steps</button>
    </article>
  ))}</div>;
}

export default function AcademicPathwaysPage() {
  const [searchParams] = useSearchParams();
  const [records, setRecords] = useState<AcademicPathway[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendations | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [recommendationError, setRecommendationError] = useState("");
  const [query, setQuery] = useState(searchParams.get("q") || "");
  const [field, setField] = useState("");
  const [level, setLevel] = useState("");
  const [selected, setSelected] = useState<AcademicPathway | null>(null);
  const [opening, setOpening] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const catalogue = useRef<HTMLElement>(null);
  const currentRequest = useRef(0);
  useEffect(() => {
    let active = true;
    Promise.allSettled([api.get<{ pathways: AcademicPathway[] }>("/pathways"), api.get<Recommendations>("/pathways/recommendations")]).then(([catalogue, personal]) => {
      if (!active) return;
      if (catalogue.status === "fulfilled") setRecords(catalogue.value.data.pathways);
      else setError(getApiErrorMessage(catalogue.reason, "Unable to load the pathway catalogue."));
      if (personal.status === "fulfilled") setRecommendations(personal.value.data);
      else setRecommendationError(getApiErrorMessage(personal.reason, "Unable to load personalized suggestions."));
      setLoading(false);
    });
    return () => { active = false; currentRequest.current += 1; };
  }, []);
  async function open(pathway: AcademicPathway) {
    const request = ++currentRequest.current;
    setOpening(true); setError("");
    try {
      const response = await api.get<{ pathway: AcademicPathway }>(`/pathways/${pathway.pathway_id}`);
      if (request !== currentRequest.current) return;
      setSelected(response.data.pathway); dialog.current?.showModal();
    } catch (err) { if (request === currentRequest.current) setError(getApiErrorMessage(err, "This pathway could not be loaded. Refresh the catalogue and try again.")); }
    finally { if (request === currentRequest.current) setOpening(false); }
  }
  function explorePathways() {
    catalogue.current?.focus({ preventScroll: true });
    catalogue.current?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
      block: "start",
    });
  }

  const filtered = records.filter(row => `${row.title} ${row.description} ${row.field}`.toLowerCase().includes(query.trim().toLowerCase()) && (!field || row.field === field) && (!level || row.level === level));
  return <div className="academic-pathways-page">
    <header className="academic-pathway-intro">
      <div className="academic-pathway-hero-copy">
        <span className="academic-pathway-hero-badge"><Icon name="graduation" />Plan your next step</span>
        <h1>Academic Pathways</h1>
        <p>Explore qualifications, discover study routes, and plan your next academic journey.</p>
        <button type="button" className="ss-button academic-pathway-hero-button" onClick={explorePathways}>
          Explore Pathways <Icon name="chevron" />
        </button>
      </div>
      <div className="academic-pathway-hero-art" aria-hidden="true">
        <img className="academic-pathway-campus" src="/images/academic-pathways-campus.svg" alt="" width="620" height="310" />
        <img className="academic-pathway-books" src="/images/student-dashboard-books.png" alt="" width="1920" height="819" />
      </div>
    </header>
    {error && <p className="dashboard-message error" role="alert">{error}</p>}
    {opening && <p role="status">Loading current pathway details…</p>}
    <section ref={catalogue} tabIndex={-1} className="academic-pathway-catalogue" aria-label="Pathway Catalogue"><div className="academic-pathway-filters">
      <label>Search pathways<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search route, subject or description…" /></label>
      <label>Field<select value={field} onChange={event => setField(event.target.value)}><option value="">All fields</option>{[...new Set(records.map(row => row.field))].sort().map(value => <option key={value}>{value}</option>)}</select></label>
      <label>Destination level<select value={level} onChange={event => setLevel(event.target.value)}><option value="">All levels</option>{[...new Set(records.map(row => row.level))].sort().map(value => <option key={value}>{value}</option>)}</select></label>
      <button className="ss-button" onClick={() => { setQuery(""); setField(""); setLevel(""); }}>Clear Filters</button>
    </div><p role="status">{loading ? "Loading catalogue…" : `${filtered.length} of ${records.length} pathways`}</p>
      <PathwayCards rows={filtered} opening={opening} onOpen={open} />{!loading && !filtered.length && <p>{records.length ? "No pathways match your filters." : "No pathways are published yet. An administrator needs to add or publish routes."}</p>}
    </section>
    <details className="academic-pathway-recommendations">
      <summary>Recommended pathways</summary>
      <p>{recommendations?.note || "Suggestions use your profile and latest saved Career Assessment."}</p>
      {!recommendations?.has_education_level && <p><Link to="/profile">Complete your education profile</Link> to refine your starting point.</p>}
      {!recommendations?.has_assessment && <p><Link to="/pathway-quiz">Complete and save the Career Assessment</Link> to include your interests.</p>}
      {recommendationError && <p role="alert">{recommendationError}</p>}
      {loading ? <p>Loading recommendations…</p> : recommendations?.pathways.length ? <PathwayCards rows={recommendations.pathways} personal opening={opening} onOpen={open} /> : <p>No personalized routes are available for your current profile yet. Explore the full catalogue or ask an advisor.</p>}
    </details>
    <dialog className="academic-pathway-dialog" ref={dialog} aria-labelledby="pathway-title"><header><h2 id="pathway-title">{selected?.title}</h2><button aria-label="Close pathway details" onClick={() => dialog.current?.close()}>×</button></header>{selected && <PathwayProgression pathway={selected} />}<Link to="/appointments" onClick={() => dialog.current?.close()}>Discuss this route with an advisor ↗</Link></dialog>
  </div>;
}
