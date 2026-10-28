import { useEffect, useMemo, useState } from "react";
import api from "../../api/axios";
import { getApiErrorMessage } from "../../utils/apiError";
import { getStoredUser } from "../../utils/authStorage";

type AdvisorAppointment = {
  appointment_id: number;
  appointment_datetime: string | null;
  appointment_status: string | null;
  student_name: string;
};

type AdvisorDashboardData = {
  advisor: {
    advisor_id: number;
    full_name: string;
    email: string;
    specialization?: string | null;
    qualification?: string | null;
    experience_years?: number | null;
    average_rating?: number | string | null;
  };
  summary: {
    today_appointments: number;
    pending_requests: number;
    total_students: number;
    average_rating: number | string;
  };
  today_schedule: AdvisorAppointment[];
  upcoming_appointments: AdvisorAppointment[];
  recent_booking_requests: AdvisorAppointment[];
  student_insights: Array<{
    label: string;
    value: number;
    percent: string;
    color: string;
  }>;
  quiz_overview: {
    total_quizzes: number;
    total_attempts: number;
    average_score: number | string;
  };
  feedback: {
    average_rating: number | string;
    total_reviews: number;
    rating_distribution: Array<{
      rating: number;
      percentage: number;
    }>;
  };
};

function formatDate(value?: string | null) {
  if (!value) {
    return "Date not set";
  }

  return new Intl.DateTimeFormat("en-MY", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function formatTime(value?: string | null) {
  if (!value) {
    return "--:--";
  }

  return new Intl.DateTimeFormat("en-MY", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return "Date not set";
  }

  return `${formatDate(value)}, ${formatTime(value)}`;
}

function getStatusTone(status?: string | null) {
  return status?.toLowerCase() === "confirmed" ? "confirmed" : "pending";
}

function getStatusLabel(status?: string | null) {
  if (!status) {
    return "Pending";
  }

  return `${status.charAt(0).toUpperCase()}${status.slice(1)}`;
}

function AdvisorDashboard() {
  const user = getStoredUser();
  const [dashboard, setDashboard] = useState<AdvisorDashboardData | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadDashboard() {
      if (!user?.user_id) {
        setIsLoading(false);
        return;
      }

      try {
        const response = await api.get<AdvisorDashboardData>(`/advisors/${user.user_id}/dashboard`);
        setDashboard(response.data);
      } catch (error) {
        setError(getApiErrorMessage(error, "Unable to load advisor dashboard."));
      } finally {
        setIsLoading(false);
      }
    }

    loadDashboard();
  }, [user?.user_id]);

  const ratingRows = useMemo(() => {
    if (!dashboard?.feedback.rating_distribution.length) {
      return [5, 4, 3, 2, 1].map((rating) => ({ rating, percentage: 0 }));
    }

    return dashboard.feedback.rating_distribution;
  }, [dashboard?.feedback.rating_distribution]);

  if (isLoading) {
    return (
      <div className="advisor-page">
        <section className="advisor-empty-state">Loading advisor dashboard...</section>
      </div>
    );
  }

  if (error || !dashboard) {
    return (
      <div className="advisor-page">
        <section className="advisor-empty-state">{error || "Advisor dashboard data is not available."}</section>
      </div>
    );
  }

  return (
    <div className="advisor-page">
      <section className="advisor-stats-grid" aria-label="Advisor activity summary">
        <article className="advisor-stat-card purple">
          <span className="advisor-stat-icon">▣</span>
          <p>Today's Appointments</p>
          <strong>{dashboard.summary.today_appointments}</strong>
        </article>
        <article className="advisor-stat-card orange">
          <span className="advisor-stat-icon">⌛</span>
          <p>Pending Requests</p>
          <strong>{dashboard.summary.pending_requests}</strong>
        </article>
        <article className="advisor-stat-card teal">
          <span className="advisor-stat-icon">◎</span>
          <p>Total Students</p>
          <strong>{dashboard.summary.total_students}</strong>
        </article>
        <article className="advisor-stat-card gold">
          <span className="advisor-stat-icon">★</span>
          <p>Average Rating</p>
          <strong>{Number(dashboard.summary.average_rating).toFixed(1)} / 5</strong>
        </article>
      </section>

      <section className="advisor-dashboard-grid">
        <article className="advisor-panel schedule-panel">
          <div className="advisor-panel-header">
            <div>
              <p className="advisor-kicker">Today</p>
              <h2>Schedule</h2>
            </div>
            <span>{formatDate(new Date().toISOString())}</span>
          </div>

          {dashboard.today_schedule.length > 0 ? (
            <div className="advisor-timeline">
              {dashboard.today_schedule.map((item) => {
                const tone = getStatusTone(item.appointment_status);

                return (
                  <div className="advisor-timeline-row" key={item.appointment_id}>
                    <time>{formatTime(item.appointment_datetime)}</time>
                    <span className={`advisor-dot ${tone}`} />
                    <div>
                      <strong>Consultation Session</strong>
                      <p>with {item.student_name}</p>
                    </div>
                    <span className={`advisor-status ${tone}`}>{getStatusLabel(item.appointment_status)}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="advisor-empty-state small">
              No schedule for today. Confirmed and pending appointments will appear here once students make bookings.
            </div>
          )}

          <button className="advisor-secondary-button" type="button">
            View Full Schedule
          </button>
        </article>

        <article className="advisor-panel">
          <div className="advisor-panel-header">
            <div>
              <p className="advisor-kicker">Next</p>
              <h2>Upcoming Appointments</h2>
            </div>
            <button type="button">View All</button>
          </div>

          {dashboard.upcoming_appointments.length > 0 ? (
            <div className="advisor-list compact">
              {dashboard.upcoming_appointments.map((item) => (
                <div className="advisor-list-row" key={item.appointment_id}>
                  <span className="advisor-list-icon">✦</span>
                  <div>
                    <strong>{formatDateTime(item.appointment_datetime)}</strong>
                    <p>Consultation Session</p>
                    <small>with {item.student_name}</small>
                  </div>
                  <span className={`advisor-status ${getStatusTone(item.appointment_status)}`}>{getStatusLabel(item.appointment_status)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="advisor-empty-state small">No upcoming appointments yet.</div>
          )}
        </article>

        <article className="advisor-panel">
          <div className="advisor-panel-header">
            <div>
              <p className="advisor-kicker">Requests</p>
              <h2>Recent Booking Requests</h2>
            </div>
            <button type="button">View All</button>
          </div>

          {dashboard.recent_booking_requests.length > 0 ? (
            <div className="advisor-list">
              {dashboard.recent_booking_requests.map((request) => (
                <div className="advisor-request-row" key={request.appointment_id}>
                  <div className="advisor-avatar mini">{request.student_name.slice(0, 2).toUpperCase()}</div>
                  <div>
                    <strong>{request.student_name}</strong>
                    <p>Consultation Session</p>
                    <small>{formatDateTime(request.appointment_datetime)}</small>
                  </div>
                  <div className="advisor-request-actions">
                    <button className="accept" type="button" aria-label={`Accept ${request.student_name}`}>
                      ✓
                    </button>
                    <button className="reject" type="button" aria-label={`Reject ${request.student_name}`}>
                      ×
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="advisor-empty-state small">No booking requests yet.</div>
          )}
        </article>

        <article className="advisor-panel insights-panel">
          <div className="advisor-panel-header">
            <div>
              <p className="advisor-kicker">Students</p>
              <h2>Student Insights</h2>
            </div>
          </div>

          {dashboard.student_insights.length > 0 ? (
            <div className="advisor-insights-content">
              <div className="advisor-donut" aria-hidden="true" />
              <div className="advisor-legend">
                {dashboard.student_insights.map((item) => (
                  <div className="advisor-legend-row" key={item.label}>
                    <span style={{ backgroundColor: item.color }} />
                    <p>{item.label}</p>
                    <strong>
                      {item.value} <small>({item.percent})</small>
                    </strong>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="advisor-empty-state small">
              Student insight categories are not available yet. They will appear after student pathway tracking is added.
            </div>
          )}
        </article>

        <article className="advisor-panel quiz-overview">
          <div className="advisor-panel-header">
            <div>
              <p className="advisor-kicker">Academic Pathway</p>
              <h2>Pathway Quiz Overview</h2>
            </div>
          </div>

          <div className="advisor-mini-stats">
            <div>
              <span>▱</span>
              <p>Total Quizzes Created</p>
              <strong>{dashboard.quiz_overview.total_quizzes}</strong>
            </div>
            <div>
              <span>□</span>
              <p>Total Attempts</p>
              <strong>{dashboard.quiz_overview.total_attempts}</strong>
            </div>
            <div>
              <span>☆</span>
              <p>Average Score</p>
              <strong>{Number(dashboard.quiz_overview.average_score).toFixed(0)}%</strong>
            </div>
          </div>

          {dashboard.quiz_overview.total_quizzes === 0 && (
            <div className="advisor-empty-state small">No pathway quizzes have been created yet.</div>
          )}

          <button className="advisor-primary-button" type="button">
            Manage Quizzes
          </button>
        </article>

        <article className="advisor-panel feedback-panel">
          <div className="advisor-panel-header">
            <div>
              <p className="advisor-kicker">Performance</p>
              <h2>Student Feedback</h2>
            </div>
            <button type="button">View All</button>
          </div>

          <div className="advisor-rating">
            <strong>{Number(dashboard.feedback.average_rating).toFixed(1)}</strong>
            <span>★★★★★</span>
            <p>Based on {dashboard.feedback.total_reviews} reviews</p>
          </div>

          {dashboard.feedback.total_reviews > 0 ? (
            <div className="advisor-rating-bars">
              {ratingRows.map((row) => (
                <div className="advisor-rating-row" key={row.rating}>
                  <span>{row.rating}★</span>
                  <div>
                    <i style={{ width: `${row.percentage}%` }} />
                  </div>
                  <small>{row.percentage}%</small>
                </div>
              ))}
            </div>
          ) : (
            <div className="advisor-empty-state small">No student feedback has been submitted yet.</div>
          )}
        </article>

        <article className="advisor-panel create-quiz-card">
          <div>
            <p className="advisor-kicker">Create New Pathway Quiz</p>
            <h2>Build guided questions for student pathways.</h2>
            <button className="advisor-primary-button" type="button">
              Create Quiz
            </button>
          </div>
          <div className="advisor-quiz-illustration">
            <span />
            <span />
            <span />
          </div>
        </article>

        <article className="advisor-panel tip-card">
          <p className="advisor-kicker">Tip for Today</p>
          <h2>Small check-ins can help students choose their next step with confidence.</h2>
        </article>
      </section>
    </div>
  );
}

export default AdvisorDashboard;
