import { useEffect, useState } from "react";
import api from "../../api/axios";
import { getApiErrorMessage } from "../../utils/apiError";

type CountGroup = {
  [key: string]: number;
};

type AdminDashboardData = {
  summary: {
    users: CountGroup;
    scholarships: CountGroup;
    applications: CountGroup;
    subscriptions: number;
    subscription_summary?: CountGroup;
    academic_pathways: number;
    quizzes: number;
    reports: number;
  };
  recent_users: Array<{
    user_id: number;
    full_name: string;
    email: string;
    role: string;
    status: string;
    created_at?: string | null;
  }>;
  recent_scholarships: Array<{
    scholarship_id: number;
    title: string;
    status?: string | null;
    created_at?: string | null;
  }>;
};

const emptyDashboard: AdminDashboardData = {
  summary: {
    users: {},
    scholarships: {},
    applications: {},
    subscriptions: 0,
    academic_pathways: 0,
    quizzes: 0,
    reports: 0,
  },
  recent_users: [],
  recent_scholarships: [],
};

function formatNumber(value: number | undefined) {
  return Number(value || 0).toLocaleString();
}

function getPercent(value: number | undefined, total: number | undefined) {
  if (!value || !total) {
    return 0;
  }

  return Math.round((value / total) * 100);
}

function formatRole(role: string) {
  const labels: Record<string, string> = {
    admin: "Administrator",
    advisor: "Academic advisor",
    sponsor: "Sponsorship provider",
    student: "Student",
  };

  return labels[role] || role;
}

function formatStatus(status?: string | null) {
  if (!status) {
    return "submitted";
  }

  return status.replace(/_/g, " ");
}

function getActivityTime(value?: string | null) {
  if (!value) {
    return 0;
  }

  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function AdminDashboard() {
  const [data, setData] = useState<AdminDashboardData>(emptyDashboard);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadDashboard() {
      try {
        const response = await api.get<AdminDashboardData>("/admin/dashboard");
        setData(response.data);
      } catch (error) {
        setError(getApiErrorMessage(error, "Unable to load administrator dashboard."));
      } finally {
        setIsLoading(false);
      }
    }

    loadDashboard();
  }, []);

  if (isLoading) {
    return <section className="admin-empty-state">Loading administrator dashboard...</section>;
  }

  if (error) {
    return <section className="admin-empty-state">{error}</section>;
  }

  const users = data.summary.users;
  const scholarships = data.summary.scholarships;
  const applications = data.summary.applications;
  const subscriptionSummary = data.summary.subscription_summary || {};
  const totalApplications = Number(applications.total_applications || 0);
  const approvedApplications = Number(applications.approved || 0);
  const pendingApplications = Number(applications.pending || 0);
  const rejectedApplications = Number(applications.rejected || 0);
  const pendingSubscriptions = Number(subscriptionSummary.pending || 0);
  const totalUsers = Number(users.total_users || 0);
  const roleDistributionStyle = {
    background: `conic-gradient(
      #6047ef 0 ${getPercent(users.students, totalUsers)}%,
      #46b781 ${getPercent(users.students, totalUsers)}% ${getPercent(Number(users.students || 0) + Number(users.sponsors || 0), totalUsers)}%,
      #f6b54b ${getPercent(Number(users.students || 0) + Number(users.sponsors || 0), totalUsers)}% ${getPercent(Number(users.students || 0) + Number(users.sponsors || 0) + Number(users.advisors || 0), totalUsers)}%,
      #8b78ff ${getPercent(Number(users.students || 0) + Number(users.sponsors || 0) + Number(users.advisors || 0), totalUsers)}% 100%
    )`,
  };
  const activities = [
    ...data.recent_scholarships.map((scholarship) => ({
      id: `scholarship-${scholarship.scholarship_id}`,
      icon: "S",
      title: `Scholarship listing: ${scholarship.title}`,
      detail: `Status: ${formatStatus(scholarship.status)}`,
      time: getActivityTime(scholarship.created_at),
    })),
    ...data.recent_users.map((user) => ({
      id: `user-${user.user_id}`,
      icon: "U",
      title: `${formatRole(user.role)} account: ${user.full_name}`,
      detail: user.email,
      time: getActivityTime(user.created_at),
    })),
  ].sort((first, second) => second.time - first.time).slice(0, 5);

  return (
    <div className="admin-page">
      <section className="admin-overview-row">
        <article className="admin-metric-card purple">
          <div>
            <span>Total Users</span>
            <strong>{formatNumber(users.total_users)}</strong>
            <small>{formatNumber(users.active_users)} active accounts</small>
          </div>
          <span className="admin-metric-icon">U</span>
        </article>
        <article className="admin-metric-card amber">
          <div>
            <span>Scholarships</span>
            <strong>{formatNumber(scholarships.total_scholarships)}</strong>
            <small>{formatNumber(scholarships.pending)} pending approval</small>
          </div>
          <span className="admin-metric-icon">S</span>
        </article>
        <article className="admin-metric-card red">
          <div>
            <span>Applications</span>
            <strong>{formatNumber(applications.total_applications)}</strong>
            <small>{formatNumber(applications.pending)} waiting for review</small>
          </div>
          <span className="admin-metric-icon">A</span>
        </article>
        <article className="admin-metric-card green">
          <div>
            <span>Subscriptions</span>
            <strong>{formatNumber(data.summary.subscriptions)}</strong>
            <small>provider plan records</small>
          </div>
          <span className="admin-metric-icon">P</span>
        </article>
      </section>

      <section className="admin-analytics-grid">
        <article className="admin-panel admin-application-panel">
          <div className="admin-panel-header">
            <div>
              <h2>Application Overview</h2>
              <p>Received, approved, and rejected applications based on database records.</p>
            </div>
            <span className="admin-period-chip">This Month</span>
          </div>

          {totalApplications > 0 ? (
            <>
              <div className="admin-chart-legend">
                <span><i className="received" />Received</span>
                <span><i className="approved" />Approved</span>
                <span><i className="rejected" />Rejected</span>
              </div>
              <div className="admin-application-chart">
                <div className="admin-chart-row">
                  <span>Received</span>
                  <div><i style={{ width: "100%" }} /></div>
                  <strong>{formatNumber(totalApplications)}</strong>
                </div>
                <div className="admin-chart-row approved">
                  <span>Approved</span>
                  <div><i style={{ width: `${getPercent(approvedApplications, totalApplications)}%` }} /></div>
                  <strong>{formatNumber(approvedApplications)}</strong>
                </div>
                <div className="admin-chart-row rejected">
                  <span>Rejected</span>
                  <div><i style={{ width: `${getPercent(rejectedApplications, totalApplications)}%` }} /></div>
                  <strong>{formatNumber(rejectedApplications)}</strong>
                </div>
                <div className="admin-chart-row pending">
                  <span>Pending</span>
                  <div><i style={{ width: `${getPercent(pendingApplications, totalApplications)}%` }} /></div>
                  <strong>{formatNumber(pendingApplications)}</strong>
                </div>
              </div>
            </>
          ) : (
            <p className="admin-empty-copy">No student applications have been submitted yet.</p>
          )}
        </article>

        <article className="admin-panel admin-activities-panel">
          <div className="admin-panel-header">
            <div>
              <h2>Recent Activities</h2>
              <p>Latest user and scholarship activity from the system.</p>
            </div>
          </div>
          {activities.length > 0 ? (
            <div className="admin-recent-list">
              {activities.map((activity) => (
                <div key={activity.id}>
                  <span className="admin-activity-icon">{activity.icon}</span>
                  <p>
                    <strong>{activity.title}</strong>
                    <small>{activity.detail}</small>
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="admin-empty-copy">No recent activities yet.</p>
          )}
        </article>
      </section>

      <section className="admin-bottom-grid">
        <article className="admin-panel admin-approvals-card">
          <div className="admin-panel-header">
            <div>
              <h2>Pending Approvals</h2>
              <p>Items waiting for administrator action.</p>
            </div>
          </div>
          <div className="admin-approval-stack">
            <div><span>Scholarship Submissions</span><strong>{formatNumber(scholarships.pending)}</strong></div>
            <div><span>Student Applications</span><strong>{formatNumber(applications.pending)}</strong></div>
            <div><span>Subscription Requests</span><strong>{formatNumber(pendingSubscriptions)}</strong></div>
          </div>
          <button className="admin-primary-button" type="button">Review Now</button>
        </article>

        <article className="admin-panel admin-role-panel">
          <div className="admin-panel-header">
            <div>
              <h2>Users by Role</h2>
              <p>Current account distribution.</p>
            </div>
          </div>
          <div className="admin-role-content">
            <div className="admin-donut" style={totalUsers > 0 ? roleDistributionStyle : undefined}>
              <span>{formatNumber(totalUsers)}</span>
            </div>
            <div className="admin-role-breakdown">
              <div><i className="students" /><span>Students</span><strong>{formatNumber(users.students)}</strong></div>
              <div><i className="sponsors" /><span>Sponsorship Providers</span><strong>{formatNumber(users.sponsors)}</strong></div>
              <div><i className="advisors" /><span>Academic Advisors</span><strong>{formatNumber(users.advisors)}</strong></div>
              <div><i className="admins" /><span>Administrators</span><strong>{formatNumber(users.admins)}</strong></div>
            </div>
          </div>
        </article>

        <article className="admin-panel admin-health-card">
          <div className="admin-panel-header">
            <div>
              <h2>System Health</h2>
              <p>Platform status for the current database connection.</p>
            </div>
          </div>
          <div className="admin-health-icon">✓</div>
          <p>All available system modules are responding.</p>
          <div className="admin-health-bar"><span /></div>
          <small>Last checked just now</small>
        </article>
      </section>
    </div>
  );
}

export default AdminDashboard;
