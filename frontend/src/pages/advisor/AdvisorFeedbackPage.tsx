import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import api from "../../api/axios";
import { getApiErrorMessage } from "../../utils/apiError";
import { getStoredUser } from "../../utils/authStorage";
import AdvisorPageHeader, { ManagementStats } from "../../components/advisor/AdvisorPageHeader";
import AdvisorIcon, { type AdvisorIconName } from "../../components/advisor/AdvisorIcon";
import "../../styles/advisor-feedback.css";

type Review = {
  review_id: number;
  rating: number;
  comment: string | null;
  created_at: string | null;
  student_name: string;
  education_level: string | null;
  field_of_study: string | null;
};
type Month = { month: string; label: string; total_reviews: number; average_rating: number | string | null };
type Feedback = {
  summary: { total_reviews: number; students_reviewed: number; average_rating: number | string; satisfaction_rate: number | string };
  rating_distribution: Array<{ rating: number; total: number }>;
  reviews: Review[];
  trend: Month[];
  pagination: { page: number; page_size: number; total: number; total_pages: number };
};
const ratingColors = ["#7840ff", "#9d73ff", "#bea3ff", "#d6c6ff", "#e9e0ff"];

function reviewDate(value: string | null) {
  if (!value || Number.isNaN(new Date(value).getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat("en-MY", { timeZone: "Asia/Kuala_Lumpur", day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
}
function Stars({ rating }: { rating: number }) {
  return <span className="af-stars" aria-label={`${rating} out of 5 stars`}>
    {Array.from({ length: 5 }, (_, index) => <span key={index} aria-hidden="true" className={index < rating ? "filled" : ""}>★</span>)}
  </span>;
}
function CardHeading({ icon, title, description }: { icon: AdvisorIconName; title: string; description: string }) {
  return <header className="af-card-heading"><AdvisorIcon name={icon} /><div><h2>{title}</h2><p>{description}</p></div></header>;
}
function ReviewCard({ review, showStudent = false }: { review: Review; showStudent?: boolean }) {
  return <article className="af-review">
    <header><Stars rating={Number(review.rating)} /><time dateTime={review.created_at || undefined}>{reviewDate(review.created_at)}</time></header>
    <p>{review.comment?.trim() || "No written comment provided."}</p>
    {showStudent && <footer><strong>{review.student_name}</strong><span>{[review.education_level, review.field_of_study].filter(Boolean).join(" · ")}</span></footer>}
  </article>;
}
function PerformanceTrend({ months }: { months: Month[] }) {
  const hasRatings = months.some(month => month.average_rating !== null);
  const points = months.map((month, index) => ({
    ...month,
    x: 52 + index * 92,
    y: month.average_rating === null ? null : 212 - ((Number(month.average_rating) - 1) / 4) * 176,
  }));
  return <>
    {hasRatings ? <svg className="af-trend-chart" viewBox="0 0 560 253" role="img" aria-label="Monthly average student ratings over the last six months, on a scale of one to five">
      <defs><linearGradient id="af-trend-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#9a6bff" stopOpacity=".25" /><stop offset="100%" stopColor="#9a6bff" stopOpacity=".02" /></linearGradient></defs>
      {[1, 2, 3, 4, 5].map(rating => {
        const y = 212 - ((rating - 1) / 4) * 176;
        return <g key={rating}><line x1="25" x2="540" y1={y} y2={y} className="af-gridline" /><text x="8" y={y + 4}>{rating.toFixed(1)}</text></g>;
      })}
      {points.map((point, index) => {
        const previous = points[index - 1];
        return <g key={point.month}>
          {point.y !== null && previous?.y != null && <>
            <path d={`M ${previous.x} 212 L ${previous.x} ${previous.y} L ${point.x} ${point.y} L ${point.x} 212 Z`} fill="url(#af-trend-fill)" />
            <line x1={previous.x} y1={previous.y} x2={point.x} y2={point.y} className="af-trend-line" />
          </>}
          {point.y !== null && <circle cx={point.x} cy={point.y} r="5" className="af-trend-dot"><title>{point.label} {point.month.slice(0, 4)} · {point.average_rating} / 5 · {point.total_reviews} reviews</title></circle>}
          <text x={point.x} y="241" textAnchor="middle">{point.label}</text>
        </g>;
      })}
    </svg> : <div className="af-empty af-trend-empty"><AdvisorIcon name="trend" /><h3>Your trend starts with student feedback</h3><p>Monthly averages will appear here as students submit ratings.</p></div>}
    <details className="af-trend-data"><summary>View monthly ratings</summary><table><caption>Average ratings over the last six months</caption><thead><tr><th>Month</th><th>Rating</th><th>Reviews</th></tr></thead><tbody>{months.map(month => <tr key={month.month}><td>{month.label} {month.month.slice(0, 4)}</td><td>{month.average_rating === null ? "No ratings" : `${Number(month.average_rating).toFixed(1)} / 5`}</td><td>{month.total_reviews}</td></tr>)}</tbody></table></details>
  </>;
}
function AllReviews({ advisorId, onClose }: { advisorId: number; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Feedback | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => {
    const controller = new AbortController();
    api.get<Feedback>(`/advisors/${advisorId}/feedback`, { params: { page }, signal: controller.signal }).then(response => {
      if (!controller.signal.aborted) setData(response.data);
    }).catch(error => {
      if (!controller.signal.aborted) setError(getApiErrorMessage(error, "Unable to load reviews."));
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [advisorId, page, retry]);
  function changePage(next: number) {
    setLoading(true);
    setError("");
    setPage(next);
    dialog.current?.querySelector("h2")?.focus();
    dialog.current?.scrollTo({ top: 0 });
  }
  return <dialog className="af-reviews-dialog" ref={dialog} aria-labelledby="af-reviews-title" onClose={onClose} onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
    <header><div><p>Student feedback</p><h2 id="af-reviews-title" tabIndex={-1}>All Reviews</h2></div><button type="button" aria-label="Close reviews" onClick={() => dialog.current?.close()}><AdvisorIcon name="close" /></button></header>
    {loading ? <p role="status">Loading reviews…</p> : error ? <p className="am-feedback error" role="alert">{error} <button type="button" onClick={() => { setLoading(true); setError(""); setRetry(value => value + 1); }}>Retry</button></p> : <>
      <div className="af-review-list">{data?.reviews.map(review => <ReviewCard key={review.review_id} review={review} showStudent />)}</div>
      {!data?.reviews.length && <p className="af-empty">No reviews on this page.</p>}
      <nav className="af-pagination" aria-label="Review pages"><button type="button" disabled={page === 1} onClick={() => changePage(page - 1)}>Previous</button><span>Page {page} of {data?.pagination.total_pages || 1}</span><button type="button" disabled={page >= (data?.pagination.total_pages || 1)} onClick={() => changePage(page + 1)}>Next</button></nav>
    </>}
  </dialog>;
}

export default function AdvisorFeedbackPage() {
  const advisorId = getStoredUser()?.user_id;
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [showReviews, setShowReviews] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    if (!advisorId) return;
    api.get<Feedback>(`/advisors/${advisorId}/feedback`, { signal: controller.signal }).then(response => {
      if (!controller.signal.aborted) setFeedback(response.data);
    }).catch(error => {
      if (!controller.signal.aborted) setError(getApiErrorMessage(error, "Unable to load feedback and performance."));
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [advisorId, retry]);
  const total = Number(feedback?.summary.total_reviews || 0);
  const average = Number(feedback?.summary.average_rating || 0);
  let cumulative = 0;
  const ringSegments = feedback?.rating_distribution.map((item, index) => {
    const start = cumulative;
    cumulative += total ? Number(item.total) / total * 100 : 0;
    return `${ratingColors[index]} ${start}% ${cumulative}%`;
  });
  const ringStyle: CSSProperties = { background: total ? `conic-gradient(${ringSegments?.join(",")})` : "#eee6ff" };
  const lowRatings = feedback?.rating_distribution.filter(item => item.rating <= 3).reduce((sum, item) => sum + Number(item.total), 0) || 0;
  return <div className="am-page af-page">
    <AdvisorPageHeader title="Feedback & Performance" description="Review student feedback, your advising performance, and identify areas for improvement." />
    {loading ? <p className="am-empty" role="status">Loading feedback and performance…</p> : error || !feedback ? <p className="am-feedback error" role="alert">{error || "Feedback data is unavailable."} <button type="button" onClick={() => { setError(""); setLoading(true); setRetry(value => value + 1); }}>Retry</button></p> : <>
      <ManagementStats items={[
        { label: "Average Rating", value: total ? `${average.toFixed(1)} / 5` : "— / 5", icon: "star", tone: "purple" },
        { label: "Total Reviews", value: total, icon: "users", tone: "blue" },
        { label: "Students Who Reviewed", value: feedback.summary.students_reviewed, icon: "appointment", tone: "green" },
        { label: "Student Satisfaction", value: total ? `${Number(feedback.summary.satisfaction_rate).toFixed(0)}%` : "—", icon: "heart", tone: "amber" },
      ]} />
      <div className="af-grid">
        <section className="am-card af-rating-card"><CardHeading icon="chart" title="Rating Breakdown" description="Distribution of student ratings from consultation feedback." />
          <div className="af-breakdown"><div className="af-rating-ring" style={ringStyle} role="img" aria-label={total ? `Average rating ${average.toFixed(1)} out of 5 from ${total} reviews` : "No student ratings yet"}><div><strong>{total ? average.toFixed(1) : "—"}</strong><span>{total ? "Average Rating" : "No ratings yet"}</span></div></div>
            <div className="af-rating-bars">{feedback.rating_distribution.map(item => {
              const percent = total ? Number(item.total) / total * 100 : 0;
              return <div className="af-rating-row" key={item.rating}><span>{item.rating} <b aria-hidden="true">★</b></span><meter min="0" max={total || 1} value={Number(item.total)} aria-label={`${item.rating} star ratings`} /><span>{percent.toFixed(0)}% ({item.total})</span></div>;
            })}</div>
          </div><p className="af-metric-note">Satisfaction is the percentage of reviews rated 4 stars or higher.</p>
        </section>
        <section className="am-card af-highlights"><CardHeading icon="message" title="Feedback Highlights" description="What students say about your consultation." />
          {feedback.reviews.length ? <div className="af-review-list">{feedback.reviews.slice(0, 3).map(review => <ReviewCard review={review} key={review.review_id} />)}</div> : <div className="af-empty"><AdvisorIcon name="message" /><h3>No student feedback yet</h3><p>Reviews will appear here when students share their feedback.</p></div>}
          <button className="af-view-reviews" type="button" disabled={!total} onClick={() => setShowReviews(true)}>View All Reviews <span aria-hidden="true">→</span></button>
        </section>
        <section className="am-card af-trend-card"><CardHeading icon="trend" title="Performance Trend" description="Your average rating over the last 6 months." /><PerformanceTrend months={feedback.trend} /></section>
        <section className="am-card af-focus-card"><CardHeading icon="target" title="Improvement Focus" description="Suggested actions for your next consultations." />
          {lowRatings > 0 && <p className="af-focus-note">{lowRatings} {lowRatings === 1 ? "review is" : "reviews are"} rated 3 stars or below. Read the comments to identify what students need.</p>}
          <details className="af-focus"><summary><span className="af-focus-icon"><AdvisorIcon name="quiz" /></span><span><strong>Consultation Depth</strong><small>Explore program and career options during sessions.</small></span><AdvisorIcon name="chevron" /></summary><div><p>Discuss entry requirements, course content, and career goals. Finish with a clear explanation of the student's next steps.</p><Link to="/advisor/appointments">Review your consultations →</Link></div></details>
          <details className="af-focus"><summary><span className="af-focus-icon"><AdvisorIcon name="users" /></span><span><strong>Follow-Up Support</strong><small>Plan check-ins for students who need more guidance.</small></span><AdvisorIcon name="chevron" /></summary><div><p>Check whether students understand their options and offer another consultation when they need support with a decision.</p><Link to="/advisor/students">View your students →</Link></div></details>
        </section>
      </div>
    </>}
    {showReviews && advisorId && <AllReviews advisorId={advisorId} onClose={() => setShowReviews(false)} />}
  </div>;
}
