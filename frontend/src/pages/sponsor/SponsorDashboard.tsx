import SubscriptionBilling from "../../components/sponsor/SubscriptionBilling";
import Icon from "../../components/advisor/AdvisorIcon";
import AppointmentArtwork from "../../components/student/AppointmentArtwork";
import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import api from "../../api/axios";
import { getApiErrorMessage } from "../../utils/apiError";
import { getStoredUser } from "../../utils/authStorage";

type SponsorScholarship = {
  scholarship_id: number;
  title: string;
  status?: string | null;
  deadline?: string | null;
  funding_type?: string | null;
  application_count: number;
};

type SponsorNotification = {
  notification_id: number;
  message: string;
  notification_type?: string | null;
  is_read: boolean;
  created_at?: string | null;
};

type ApplicationTrendItem = {
  application_date: string;
  total: number;
};

type SponsorDashboardData = {
  sponsor: {
    organization_name: string;
    subscription_status: string;
  };
  summary: {
    total_scholarships: number;
    active_scholarships: number;
    pending_scholarships: number;
    rejected_scholarships: number;
    total_applications: number;
    total_views: number;
  };
  subscription: {
    plan_name: string;
    scholarship_limit: number;
    used_scholarships: number;
    status: string;
    end_date?: string | null;
  };
  scholarships: SponsorScholarship[];
  application_trend: ApplicationTrendItem[];
  notifications: SponsorNotification[];
};

function formatDate(value?: string | null) {
  if (!value) {
    return "Not set";
  }

  return new Intl.DateTimeFormat("en-MY", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function getStatusTone(status?: string | null) {
  const normalizedStatus = (status || "pending").toLowerCase();

  if (["active", "approved"].includes(normalizedStatus)) {
    return "active";
  }

  if (normalizedStatus === "rejected") {
    return "rejected";
  }

  return "pending";
}

function SponsorDashboard() {
  const user = getStoredUser();
  const sponsorId = user?.user_id;
  const [retry, setRetry] = useState(0);
  const [dashboard, setDashboard] = useState<SponsorDashboardData | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadDashboard() {
      if (!sponsorId) {
        setIsLoading(false);
        return;
      }

      try {
        const response = await api.get<SponsorDashboardData>(`/sponsors/${sponsorId}/dashboard`);
        setDashboard(response.data);
      } catch (error) {
        setError(getApiErrorMessage(error, "Unable to load sponsorship provider dashboard."));
      } finally {
        setIsLoading(false);
      }
    }

    loadDashboard();
  }, [sponsorId, retry]);

  useEffect(() => {
    const refresh = () => setRetry(value => value + 1);
    window.addEventListener("scholarone-billing-updated", refresh);
    return () => window.removeEventListener("scholarone-billing-updated", refresh);
  }, []);

  const maxTrendValue = Math.max(0, ...(dashboard?.application_trend || []).map((item) => Number(item.total || 0)));

  if (isLoading) {
    return (
      <div className="sponsor-page">
        <section className="sponsor-empty-state">Loading sponsorship provider dashboard...</section>
      </div>
    );
  }

  if (error || !dashboard) {
    return (
      <div className="sponsor-page">
        <section className="sponsor-empty-state" role="alert"><p>{error || "Sponsor dashboard data is not available."}</p><button type="button" className="sponsor-add-button" onClick={() => {setIsLoading(true);setError("");setRetry(value => value + 1);}}>Try again</button></section>
      </div>
    );
  }

  const scholarshipLimit = Number(dashboard.subscription.scholarship_limit || 3);
  const usedScholarships = Number(dashboard.subscription.used_scholarships || 0);
  const usagePercentage = scholarshipLimit > 0 ? Math.min((usedScholarships / scholarshipLimit) * 100, 100) : 0;

  return (
    <div className="sponsor-page">
      <section className="sponsor-hero">
        <div>
          <p className="sponsor-kicker"><Icon name="home" />Provider Workspace</p>
          <h2>Manage Your Scholarship Programs</h2>
          <span>Track scholarship listings, student applications, subscription usage, and provider updates in one place.</span>
        </div>
        <img className="sph-hero-art" src="/images/sponsor-dashboard-hero.png" alt="" />
        <Link className="sponsor-hero-action" to="/sponsor/add-scholarship">
          <span aria-hidden="true">＋</span> Add Scholarship
        </Link>
      </section>

      <section className="sponsor-stats-grid" aria-label="Sponsorship provider summary">
        <article className="sponsor-stat-card purple">
          <span><Icon name="graduation" /></span>
          <p>Total Scholarships</p>
          <strong>{dashboard.summary.total_scholarships}</strong>
          <small>{dashboard.summary.active_scholarships} active listings</small>
        </article>
        <article className="sponsor-stat-card amber">
          <span><Icon name="users" /></span>
          <p>Total Applications</p>
          <strong>{dashboard.summary.total_applications}</strong>
          <small>Applications from student submissions</small>
        </article>
        <article className="sponsor-stat-card blue">
          <span><Icon name="eye" /></span>
          <p>Total Views</p>
          <strong>{dashboard.summary.total_views}</strong>
          <small>Views tracking is not available yet</small>
        </article>
        <article className="sponsor-stat-card pink">
          <span><Icon name="layers" /></span>
          <p>Plan</p>
          <strong>{dashboard.subscription.plan_name || dashboard.sponsor.subscription_status}</strong>
          <small>Renewal: {formatDate(dashboard.subscription.end_date)}</small>
        </article>
      </section>

      <section className="sponsor-dashboard-grid">
        <article className="sponsor-panel applications-chart">
          <div className="sponsor-panel-header">
            <div>
              <h2><Icon name="chart" />Applications Overview</h2>
              <p className="sph-panel-subtitle">Application activity</p>
            </div>
            <Link to="/sponsor/applications">View applications <Icon name="chevron" /></Link>
          </div>

          {dashboard.application_trend.length > 0 ? (
            <div className="sponsor-bars" aria-label="Application overview bar chart">
              {dashboard.application_trend.map((item) => (
                <span
                  role="img" aria-label={`${formatDate(item.application_date)}: ${item.total} applications`}
                  key={item.application_date}
                  title={`${formatDate(item.application_date)}: ${item.total} applications`}
                  style={{ height: `${maxTrendValue > 0 ? Math.max((Number(item.total) / maxTrendValue) * 100, 8) : 0}%` }}
                />
              ))}
            </div>
          ) : (
            <div className="sponsor-empty-state chart">
              <div className="sph-application-art" aria-hidden="true"><Icon name="users" /><Icon name="search" /></div>
              <h3>No application activity yet.</h3><p>Student applications will appear here after students apply to your scholarships.</p>
            </div>
          )}
        </article>

        <aside className="sponsor-side-stack">
          <Link className="sponsor-add-button" to="/sponsor/add-scholarship">
            + Add New Scholarship
          </Link>

          <article className="sponsor-panel subscription-panel">
            <div className="sponsor-panel-header">
              <div>
                <p className="sponsor-kicker"><Icon name="layers" />Subscription Usage</p>
                <h2>
                  {usedScholarships} / {scholarshipLimit} Scholarships Used
                </h2>
              </div>
            </div>
            <div className="sponsor-progress" role="progressbar" aria-label="Scholarship slots used" aria-valuemin={0} aria-valuemax={scholarshipLimit} aria-valuenow={Math.min(usedScholarships, scholarshipLimit)}>
              <span style={{ width: `${usagePercentage}%` }} />
            </div>
            <div className="sponsor-upgrade-box">
              <AppointmentArtwork name="calendar" className="sph-slots-art" />
              <strong>{usedScholarships >= scholarshipLimit ? "Limit reached" : "Available slots"}</strong>
              <p>
                {usedScholarships >= scholarshipLimit
                  ? "Upgrade your plan to advertise more scholarships."
                  : `${Math.max(scholarshipLimit - usedScholarships, 0)} scholarship slot(s) remaining on this plan.`}
              </p>
              <Link to="/sponsor/subscriptions">Manage Plan <Icon name="chevron" /></Link>
            </div>
          </article>
        </aside>

        {dashboard.scholarships.length > 0 && <article className="sponsor-panel program-panel">
          <div className="sponsor-panel-header">
            <div>
              <p className="sponsor-kicker">My Scholarships</p>
              <h2>Listing performance</h2>
            </div>
            <Link to="/sponsor/scholarships">View All</Link>
          </div>

          {dashboard.scholarships.length > 0 ? (
            <div className="sponsor-program-list">
              {dashboard.scholarships.map((program) => (
                <div className="sponsor-program-row" key={program.scholarship_id}>
                  <div>
                    <strong>{program.title}</strong>
                    <span className={`sponsor-status ${getStatusTone(program.status)}`}>{program.status || "Pending"}</span>
                  </div>
                  <p>
                    <strong>{program.application_count}</strong>
                    Applications
                  </p>
                  <p>
                    <strong>{formatDate(program.deadline)}</strong>
                    Deadline
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="sponsor-empty-state">
              No scholarship listings yet. Create your first scholarship advertisement to start receiving student applications.
            </div>
          )}
        </article>}

        {dashboard.notifications.length > 0 && <aside className="sponsor-side-stack">
          <article className="sponsor-panel">
            <div className="sponsor-panel-header">
              <div>
                <p className="sponsor-kicker">Recent Notifications</p>
                <h2>Provider updates</h2>
              </div>
              <Link to="/sponsor/messages">View All</Link>
            </div>
            {dashboard.notifications.length > 0 ? (
              <div className="sponsor-notification-list">
                {dashboard.notifications.map((notification, index) => (
                  <div className="sponsor-notification-row" key={notification.notification_id}>
                    <span>{index + 1}</span>
                    <p>{notification.message}</p>
                    <small>{formatDate(notification.created_at)}</small>
                  </div>
                ))}
              </div>
            ) : (
              <div className="sponsor-empty-state small">No provider notifications yet.</div>
            )}
          </article>

          <article className="sponsor-panel help-card">
            <p className="sponsor-kicker">Next Step</p>
            <h2>
              {dashboard.summary.total_scholarships > 0
                ? "Review applications once students start applying."
                : "Add your first scholarship to make it visible after approval."}
            </h2>
            <Link to="/sponsor/add-scholarship">Continue</Link>
          </article>
        </aside>}
      </section>
      <SubscriptionBilling />
    </div>
  );
}

export default SponsorDashboard;
