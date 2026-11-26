import { useEffect, useState, type FormEvent } from "react";
import api from "../api/axios";
import { getApiErrorMessage } from "../utils/apiError";

type Review = { review_id: number; rating: number; comment?: string | null };
export default function StudentAppointmentReview({ appointmentId, onSaved }: { appointmentId: number; onSaved: () => void }) {
  const [review, setReview] = useState<Review | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    api.get<{ review: Review | null }>(`/appointments/${appointmentId}/review`, { signal: controller.signal }).then(({ data }) => { if (!controller.signal.aborted) setReview(data.review); })
      .catch(err => { if (!controller.signal.aborted) setError(getApiErrorMessage(err, "Unable to load your review.")); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [appointmentId, reload]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const data = new FormData(event.currentTarget); setBusy(true); setError("");
    try {
      const response = await api.post<{ review: Review }>(`/appointments/${appointmentId}/review`, { rating: Number(data.get('rating')), comment: data.get('comment') || '' });
      setReview(response.data.review); onSaved();
    } catch (err) { setError(getApiErrorMessage(err, "Unable to submit your review.")); }
    finally { setBusy(false); }
  }
  if (loading) return <p role="status">Loading your feedback…</p>;
  return <section><h3>Your Consultation Feedback</h3>{error && <p role="alert">{error} <button type="button" onClick={() => { setLoading(true); setError(""); setReload(value => value + 1); }}>Reload Review</button></p>}
    {review ? <><p role="status">Your rating: {review.rating} / 5</p><p>{review.comment}</p></> : <form onSubmit={submit} className="appointment-review-form"><p>Your advisor can view your rating and feedback. One review is allowed per completed consultation.</p>
      <label>Rating<select name="rating" required defaultValue="" disabled={busy}><option value="">Choose a rating</option>{[1,2,3,4,5].map(value => <option key={value} value={value}>{value} / 5</option>)}</select></label>
      <label>Review (optional)<textarea name="comment" rows={3} maxLength={2000} disabled={busy} /></label><button className="ss-button" disabled={busy || !!error}>{busy ? "Submitting…" : "Submit Review"}</button>
    </form>}
  </section>;
}
