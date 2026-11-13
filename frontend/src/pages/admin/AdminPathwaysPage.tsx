import { useEffect, useMemo, useRef, useState } from "react";
import Icon from "../../components/advisor/AdvisorIcon";
import api from "../../api/axios";
import { getApiErrorMessage } from "../../utils/apiError";
import "../../styles/admin-users.css";
import "../../styles/admin-pathways.css";

type PathwayRecord = Record<string, unknown>;
type Quiz = { quiz_id: number; title: string; description: string | null; status: string; created_at: string | null; advisor_name: string | null; question_count: number; attempt_count: number; pathway_results: string[] };
type Response = { pathways: PathwayRecord[]; quizzes: Quiz[] };
type Pathway = { id: string; name: string; description: string; status: string; updated: string | null; quizzes: Quiz[] };
const normalize = (value: string) => value.trim().toLowerCase().replace(/\s+/g, "_");
const pending = (value: string) => ["pending", "pending_review", "submitted"].includes(normalize(value));
const label = (value: string) => pending(value) ? "Pending Review" : value.split("_").map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
function dateLabel(value: string | null) {
  return value && !Number.isNaN(Date.parse(value)) ? new Intl.DateTimeFormat("en-MY", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kuala_Lumpur" }).format(new Date(value)) : "Not recorded";
}
function field(record: PathwayRecord, keys: string[], fallback = "") {
  for (const key of keys) if (typeof record[key] === "string" || typeof record[key] === "number") return String(record[key]);
  return fallback;
}
export default function AdminPathwaysPage() {
  const [records, setRecords] = useState<Response>({ pathways: [], quizzes: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"pathways" | "quizzes" | "pending">("pathways");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [details, setDetails] = useState<Pathway | Quiz | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const response = await api.get<Response>("/admin/pathways");
        if (active) setRecords(response.data);
      } catch (err) {
        if (active) setError(getApiErrorMessage(err, "Unable to load academic pathways."));
      } finally { if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; };
  }, []);
  const pathways = useMemo(() => records.pathways.map((record, index): Pathway => {
    const name = field(record, ["pathway_name", "name", "title", "pathway_title"], `Pathway ${index + 1}`);
    return { id: field(record, ["pathway_id", "id"], String(index)), name, description: field(record, ["description", "pathway_description"]), status: normalize(field(record, ["status"], "active")), updated: field(record, ["updated_at", "last_updated", "created_at"]) || null,
      quizzes: records.quizzes.filter(quiz => quiz.pathway_results.some(result => result.trim().toLowerCase() === name.trim().toLowerCase())) };
  }).sort((a, b) => a.name.localeCompare(b.name)), [records]);
  const published = records.quizzes.filter(quiz => normalize(quiz.status) === "published");
  const waiting = records.quizzes.filter(quiz => pending(quiz.status));
  const drafts = records.quizzes.filter(quiz => normalize(quiz.status) === "draft");
  const other = records.quizzes.length - published.length - waiting.length - drafts.length;
  const breakdown = [{ name: "Published", count: published.length, color: "#42c875" }, { name: "Pending Review", count: waiting.length, color: "#ffbf16" }, { name: "Draft", count: drafts.length, color: "#b4acc5" }, ...(other ? [{ name: "Other", count: other, color: "#8d55e7" }] : [])];
  let cumulative = 0;
  const gradient = breakdown.map(item => { const start = cumulative; cumulative += records.quizzes.length ? item.count / records.quizzes.length * 100 : 0; return `${item.color} ${start}% ${cumulative}%`; }).join(",");
  const query = search.trim().toLowerCase();
  const filteredPathways = pathways.filter(item => `${item.name} ${item.description}`.toLowerCase().includes(query));
  const filteredQuizzes = (tab === "pending" ? waiting : records.quizzes).filter(item => `${item.title} ${item.description || ""} ${item.advisor_name || ""} ${item.status}`.toLowerCase().includes(query));
  const total = tab === "pathways" ? filteredPathways.length : filteredQuizzes.length;
  const pageCount = Math.max(1, Math.ceil(total / 4));
  const currentPage = Math.min(page, pageCount);
  const start = (currentPage - 1) * 4;
  function changeTab(next: typeof tab) { setTab(next); setSearch(""); setPage(1); }
  function openDetails(item: Pathway | Quiz) { setDetails(item); dialog.current?.showModal(); }
  const selectedPathway = details && "name" in details ? details : null;
  const selectedQuiz = details && "quiz_id" in details ? details : null;
  return <div className="admin-page aum-page apw-page">
    {error && <p className="admin-alert" role="alert">{error}</p>}
    <section className="adh-metrics" aria-label="Academic pathway summary">{([
      { title: "Total Pathways", value: pathways.length, note: "Pathway options on platform", icon: "layers", color: "purple" },
      { title: "Total Quizzes", value: records.quizzes.length, note: "Across all academic advisors", icon: "quiz", color: "amber" },
      { title: "Published Quizzes", value: published.length, note: "Available to students", icon: "graduation", color: "green" },
      { title: "Pending Review", value: waiting.length, note: "Submitted for review", icon: "clock", color: "amber" },
    ] as const).map(item => <article key={item.title} className={`adh-metric ${item.color}`}><span className="adh-icon"><Icon name={item.icon} /></span><div><h2>{item.title}</h2><strong>{loading ? "—" : item.value}</strong><small>{item.note}</small></div></article>)}</section>
    <div className="aum-tabs apw-tabs" role="group" aria-label="Academic pathway views">{([
      { id: "pathways", name: "Pathways", count: pathways.length, icon: "layers" }, { id: "quizzes", name: "Quizzes", count: records.quizzes.length, icon: "quiz" }, { id: "pending", name: "Pending Review", count: waiting.length, icon: "clock" },
    ] as const).map(item => <button type="button" key={item.id} aria-pressed={tab === item.id} onClick={() => changeTab(item.id)}><Icon name={item.icon} />{item.name} ({item.count})</button>)}</div>
    <div className="apw-columns">
      <section className="adh-panel apw-directory"><header className="apw-directory-heading"><div><h2>{tab === "pathways" ? "Academic Pathway Directory" : tab === "pending" ? "Quizzes Pending Review" : "Advisor Quiz Directory"}</h2><p>{tab === "pathways" ? "Academic pathway options and quizzes linked through their answer outcomes." : "Monitor advisor-created quiz content and publication status."}</p></div><label className="aum-search"><Icon name="search" /><input type="search" aria-label="Search pathway directory" placeholder={tab === "pathways" ? "Search pathway name..." : "Search quiz or advisor..."} value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} /></label></header>
        <div className="aum-table-panel"><div className="aum-table-scroll"><table className="aum-table apw-table"><thead><tr>{tab === "pathways" ? <><th>Pathway Name</th><th>Related Quizzes</th><th>Status</th><th>Last Updated</th></> : <><th>Quiz / Advisor</th><th>Questions</th><th>Status</th><th>Created On</th></>}<th>Action</th></tr></thead><tbody>
          {tab === "pathways" ? filteredPathways.slice(start, start + 4).map(item => <tr key={item.id}><td><strong>{item.name}</strong></td><td>{item.quizzes.length}</td><td><span className={`admin-status-badge ${item.status}`}><i />{label(item.status)}</span></td><td className="aum-date">{dateLabel(item.updated)}</td><td><button className="aum-outline apw-details" type="button" aria-label={`View pathway ${item.name}`} onClick={() => openDetails(item)}>View Details</button></td></tr>) : filteredQuizzes.slice(start, start + 4).map(item => <tr key={item.quiz_id}><td><strong>{item.title || "Untitled Quiz"}</strong><small>By {item.advisor_name || "Academic Advisor"}</small></td><td>{item.question_count}</td><td><span className={`admin-status-badge ${normalize(item.status)}`}><i />{label(item.status)}</span></td><td className="aum-date">{dateLabel(item.created_at)}</td><td><button className="aum-outline apw-details" type="button" aria-label={`View quiz ${item.title}`} onClick={() => openDetails(item)}>View Details</button></td></tr>)}
          {(loading || !total) && <tr><td colSpan={5} className="aum-empty">{loading ? "Loading academic records…" : error ? "Academic records could not be loaded." : query ? "No records match your search." : tab === "pending" ? "No quizzes are currently awaiting review." : tab === "pathways" ? "No academic pathways have been added yet." : "No advisor quizzes have been created yet."}</td></tr>}
        </tbody></table></div><footer className="aum-table-footer"><span>Showing {total ? start + 1 : 0}–{Math.min(start + 4, total)} of {total} {tab === "pathways" ? "pathways" : "quizzes"}</span><nav aria-label="Academic pathway pagination"><button type="button" aria-label="Previous page" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>‹</button>{Array.from({ length: pageCount }, (_, i) => i + 1).filter(n => n === 1 || n === pageCount || Math.abs(n - currentPage) <= 1).map((n, i, numbers) => <span key={n}>{i > 0 && n - numbers[i - 1] > 1 && <span className="aum-page-gap">…</span>}<button type="button" aria-label={`Page ${n}`} aria-current={currentPage === n ? "page" : undefined} onClick={() => setPage(n)}>{n}</button></span>)}<button type="button" aria-label="Next page" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}>›</button></nav></footer></div>
      </section>
      <aside className="apw-aside"><section className="adh-panel"><header className="adh-panel-heading"><span className="adh-icon"><Icon name="quiz" /></span><div><h2>Quiz Overview</h2></div></header><div className="adh-chart-content"><div className="adh-donut" style={{ background: records.quizzes.length ? `conic-gradient(${gradient})` : "#eee5ff" }} role="img" aria-label={`${records.quizzes.length} quizzes by publication status`}><div><strong>{records.quizzes.length}</strong><span>Quizzes</span></div></div><div className="adh-breakdown">{breakdown.map(item => <div key={item.name}><i style={{ background: item.color }} /><span>{item.name}</span><strong>{item.count}</strong><small>({records.quizzes.length ? Math.round(item.count / records.quizzes.length * 100) : 0}%)</small></div>)}</div></div></section>
        <section className="adh-panel apw-recent"><header className="adh-panel-heading"><span className="adh-icon"><Icon name="user" /></span><div><h2>Recent Submissions</h2><p>Latest quizzes awaiting review.</p></div></header>{waiting.length ? waiting.slice(0, 3).map(quiz => <button type="button" className="apw-submission" key={quiz.quiz_id} onClick={() => openDetails(quiz)}><Icon name="quiz" /><span><strong>{quiz.title}</strong><small>By {quiz.advisor_name || "Academic Advisor"}</small></span><em>Pending Review</em></button>) : <p className="apw-empty">No pending submissions. Draft quizzes remain with their advisors until published.</p>}<button type="button" className="apw-view-all" onClick={() => changeTab("pending")}>View All Pending Review →</button></section>
      </aside>
    </div>
    <dialog className="aum-dialog apw-dialog" ref={dialog} aria-labelledby="apw-dialog-title"><header><h2 id="apw-dialog-title">{selectedPathway ? "Pathway Details" : "Quiz Details"}</h2><button type="button" aria-label="Close academic details" onClick={() => dialog.current?.close()}><Icon name="close" /></button></header>
      {selectedPathway && <div><h3>{selectedPathway.name}</h3><p className="apw-copy">{selectedPathway.description || "No description recorded."}</p><dl><div><dt>Status</dt><dd>{label(selectedPathway.status)}</dd></div><div><dt>Last Updated</dt><dd>{dateLabel(selectedPathway.updated)}</dd></div></dl><h4>Related Quizzes ({selectedPathway.quizzes.length})</h4><p className="apw-detail-note">Linked by matching this pathway name to quiz answer outcomes.</p>{selectedPathway.quizzes.length ? selectedPathway.quizzes.map(quiz => <button type="button" className="apw-related" key={quiz.quiz_id} onClick={() => setDetails(quiz)}>{quiz.title} <span>{label(quiz.status)} →</span></button>) : <p>No quizzes currently reference this pathway.</p>}</div>}
      {selectedQuiz && <div><h3>{selectedQuiz.title}</h3><p className="apw-copy">{selectedQuiz.description || "No description recorded."}</p><dl><div><dt>Advisor</dt><dd>{selectedQuiz.advisor_name || "Not recorded"}</dd></div><div><dt>Status</dt><dd>{label(selectedQuiz.status)}</dd></div><div><dt>Questions</dt><dd>{selectedQuiz.question_count}</dd></div><div><dt>Student Attempts</dt><dd>{selectedQuiz.attempt_count}</dd></div><div><dt>Created On</dt><dd>{dateLabel(selectedQuiz.created_at)}</dd></div></dl><h4>Pathway Outcomes</h4>{selectedQuiz.pathway_results.length ? <ul>{selectedQuiz.pathway_results.map(result => <li key={result}>{result}</li>)}</ul> : <p>No pathway outcomes recorded.</p>}<p className="apw-detail-note">Quiz content and publication are managed by the academic advisor.</p></div>}
    </dialog>
  </div>;
}
