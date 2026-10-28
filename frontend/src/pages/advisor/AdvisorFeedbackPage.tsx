import { useEffect, useMemo, useState } from "react";
import api from "../../api/axios";
import { getApiErrorMessage } from "../../utils/apiError";
import { getStoredUser } from "../../utils/authStorage";

type FeedbackSummary = {
  total_reviews: number;
  average_rating: number | string;
  satisfaction_rate: number | string;
};

type RatingDistribution = {
  rating: number;
  total: number;
};

type StudentReview = {
  review_id: number;
  rating: number;
  comment?: string | null;
  created_at?: string | null;
  student_name: string;
  education_level?: string | null;
  field_of_study?: string | null;
};

type AdvisorFeedbackData = {
  summary: FeedbackSummary;
  rating_distribution: RatingDistribution[];
  reviews: StudentReview[];
};

function formatReviewDate(value?: string | null) {
  if (!value) {
    return "Date not set";
  }

  return new Intl.DateTimeFormat("en-MY", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function renderStars(rating: number) {
  return Array.from({ length: 5 }, (_, index) => (
    <span className={index < rating ? "filled" : ""} key={index}>
      ★
    </span>
  ));
}

function AdvisorFeedbackPage() {
  const user = getStoredUser();
  const [feedback, setFeedback] = useState<AdvisorFeedbackData | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadFeedback() {
      if (!user?.user_id) {
        setIsLoading(false);
        return;
      }

      try {
        const response = await api.get<AdvisorFeedbackData>(`/advisors/${user.user_id}/feedback`);
        setFeedback(response.data);
      } catch (error) {
        setError(getApiErrorMessage(error, "Unable to load feedback and performance data."));
      } finally {
        setIsLoading(false);
      }
    }

    loadFeedback();
  }, [user?.user_id]);

  const totalReviews = Number(feedback?.summary.total_reviews || 0);
  const averageRating = Number(feedback?.summary.average_rating || 0);
  const satisfactionRate = Number(feedback?.summary.satisfaction_rate || 0);
  const highestRatingTotal = useMemo(() => {
    if (!feedback?.rating_distribution.length) {
      return 0;
    }

    return Math.max(...feedback.rating_distribution.map((item) => Number(item.total || 0)));
  }, [feedback?.rating_distribution]);

  if (isLoading) {
    return (
      <div className="advisor-page">
        <section className="advisor-empty-state">Loading feedback and performance...</section>
      </div>
    );
  }

  if (error || !feedback) {
    return (
      <div className="advisor-page">
        <section className="advisor-empty-state">{error || "Feedback data is not available."}</section>
      </div>
    );
  }

  return (
    <div className="advisor-page">
      <section className="advisor-feedback-hero">
        <div>
          <p className="advisor-kicker">Performance</p>
          <h2>Feedback & Performance</h2>
          <span>Review student ratings, consultation feedback, and areas that may need follow-up.</span>
        </div>
        <div className="advisor-feedback-score">
          <strong>{averageRating.toFixed(1)}</strong>
          <span>Average rating</span>
        </div>
      </section>

      <section className="advisor-feedback-stats">
        <article className="advisor-panel advisor-metric-card">
          <p className="advisor-kicker">Average Rating</p>
          <h2>{averageRating > 0 ? `${averageRating.toFixed(1)} / 5` : "No rating yet"}</h2>
          <span className="advisor-muted">
            {totalReviews > 0 ? `Calculated from ${totalReviews} student reviews` : "Student ratings will appear here after reviews are submitted"}
          </span>
        </article>
        <article className="advisor-panel advisor-metric-card">
          <p className="advisor-kicker">Total Reviews</p>
          <h2>{totalReviews}</h2>
          <span className="advisor-muted">Feedback submitted by students after consultation sessions</span>
        </article>
        <article className="advisor-panel advisor-metric-card">
          <p className="advisor-kicker">Satisfaction</p>
          <h2>{totalReviews > 0 ? `${satisfactionRate.toFixed(0)}%` : "No data yet"}</h2>
          <span className="advisor-muted">Percentage of reviews rated 4 stars and above</span>
        </article>
      </section>

      <section className="advisor-feedback-layout">
        <article className="advisor-panel advisor-rating-panel">
          <div className="advisor-panel-header">
            <div>
              <p className="advisor-kicker">Rating Breakdown</p>
              <h2>Student rating distribution</h2>
            </div>
          </div>

          {totalReviews > 0 ? (
            <div className="advisor-rating-bars">
              {feedback.rating_distribution.map((item) => {
                const total = Number(item.total || 0);
                const width = highestRatingTotal > 0 ? (total / highestRatingTotal) * 100 : 0;

                return (
                  <div className="advisor-rating-row" key={item.rating}>
                    <span>{item.rating} ★</span>
                    <div>
                      <i style={{ width: `${width}%` }} />
                    </div>
                    <strong>{total}</strong>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="advisor-empty-state small">
              No rating distribution yet. Once students submit feedback, the breakdown will be shown here.
            </div>
          )}
        </article>

        <article className="advisor-panel advisor-improvement-panel">
          <div className="advisor-panel-header">
            <div>
              <p className="advisor-kicker">Performance Notes</p>
              <h2>Improvement focus</h2>
            </div>
          </div>
          <div className="advisor-focus-list">
            <div>
              <strong>Consultation quality</strong>
              <span>{totalReviews > 0 ? "Use student comments to improve future guidance sessions." : "Waiting for student review data."}</span>
            </div>
            <div>
              <strong>Response clarity</strong>
              <span>Track whether students understand the recommended academic pathway.</span>
            </div>
            <div>
              <strong>Follow-up planning</strong>
              <span>Use low ratings as a signal to schedule additional guidance.</span>
            </div>
          </div>
        </article>
      </section>

      <section className="advisor-panel advisor-review-panel">
        <div className="advisor-panel-header">
          <div>
            <p className="advisor-kicker">Student Reviews</p>
            <h2>Recent feedback</h2>
          </div>
        </div>

        {feedback.reviews.length > 0 ? (
          <div className="advisor-review-list">
            {feedback.reviews.map((review) => (
              <article className="advisor-review-card" key={review.review_id}>
                <div className="advisor-review-avatar">{review.student_name.slice(0, 2).toUpperCase()}</div>
                <div>
                  <div className="advisor-review-heading">
                    <div>
                      <h3>{review.student_name}</h3>
                      <span>
                        {[review.education_level, review.field_of_study].filter(Boolean).join(" • ") || "Student"}
                      </span>
                    </div>
                    <small>{formatReviewDate(review.created_at)}</small>
                  </div>
                  <div className="advisor-review-stars">{renderStars(Number(review.rating || 0))}</div>
                  <p>{review.comment || "No written comment provided."}</p>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="advisor-empty-state">
            No student feedback has been submitted yet. Reviews will appear here after students complete consultations and rate the advisor.
          </div>
        )}
      </section>
    </div>
  );
}

export default AdvisorFeedbackPage;
