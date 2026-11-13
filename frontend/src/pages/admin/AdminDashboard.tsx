import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Icon from "../../components/advisor/AdvisorIcon";
import api from "../../api/axios";
import { getApiErrorMessage } from "../../utils/apiError";

type CountGroup = {
  [key: string]: number;
};

type AdminDashboardData = {
  checked_at?: string;
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
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [showAllActivities, setShowAllActivities] = useState(false);
  const [showPending, setShowPending] = useState(false);

  useEffect(() => {
    let active = true;
    async function loadDashboard() {
      try {
        const response = await api.get<AdminDashboardData>("/admin/dashboard");
        if (active) {
          setData(response.data);
          setCheckedAt(response.data.checked_at || new Date().toISOString());
        }
      } catch (error) {
        if (active) setError(getApiErrorMessage(error, "Unable to load administrator dashboard."));
      } finally {
        if (active) setIsLoading(false);
      }
    }

    loadDashboard();
    return () => { active = false; };
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
  const appealsAwaitingReview = Number(scholarships.appeals || 0);
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
      path: "/admin/scholarships",
      title: `Scholarship listing: ${scholarship.title}`,
      detail: `Status: ${formatStatus(scholarship.status)}`,
      time: getActivityTime(scholarship.created_at),
    })),
    ...data.recent_users.map((user) => ({
      id: `user-${user.user_id}`,
      icon: "U",
      path: "/admin/users",
      title: `${formatRole(user.role)} account: ${user.full_name}`,
      detail: user.email,
      time: getActivityTime(user.created_at),
    })),
  ].sort((first, second) => second.time - first.time);

  const pendingItems = [
    { label: "Scholarship Submissions", count: Number(scholarships.pending || 0), path: "/admin/scholarships?status=pending", icon: "layers" },
    { label: "Student Applications", count: pendingApplications, path: "/admin/applications?status=pending", icon: "users" },
    { label: "Subscription Requests", count: pendingSubscriptions, path: "/admin/subscriptions", icon: "layers" },
  ] as const;
  const pendingTotal = pendingItems.reduce((total, item) => total + item.count, 0);
  const otherApplications = Math.max(0, totalApplications - approvedApplications - rejectedApplications - pendingApplications);
  const applicationSegments = [
    { label: "Approved", value: approvedApplications, color: "#60ce92" },
    { label: "Rejected", value: rejectedApplications, color: "#ff6b77" },
    { label: "Pending", value: pendingApplications, color: "#ffcf50" },
    { label: "Other statuses", value: otherApplications, color: "#8c43ff" },
  ].filter((segment) => segment.label !== "Other statuses" || segment.value > 0);
  let applicationStop = 0;
  const applicationGradient = applicationSegments.map((segment) => {
    const start = applicationStop;
    applicationStop += totalApplications ? segment.value / totalApplications * 100 : 0;
    return `${segment.color} ${start}% ${applicationStop}%`;
  }).join(", ");
  const roles = [
    { label: "Students", value: users.students, color: "#6047ef" },
    { label: "Sponsorship Providers", value: users.sponsors, color: "#46b781" },
    { label: "Academic Advisors", value: users.advisors, color: "#f6b54b" },
    { label: "Administrators", value: users.admins, color: "#8b78ff" },
  ];

  return (
    <div className="admin-page admin-home-page">
      <section className="adh-hero">
        <div><h2>Welcome back, Administrator! <span aria-hidden="true">👋</span></h2>
          <p>Here's an overview of ScholarOne's activity, approvals, and account records.</p></div>
        <img src="/images/sponsor-dashboard-hero.png" alt="" />
      </section>

      <section className="adh-metrics" aria-label="Platform totals">
        {([
          { label: "Total Users", value: totalUsers, note: `${formatNumber(users.active_users)} active accounts`, path: "/admin/users", icon: "users", color: "purple" },
          { label: "Scholarships", value: scholarships.total_scholarships, note: `${formatNumber(scholarships.pending)} pending approval`, path: "/admin/scholarships", icon: "layers", color: "amber" },
          { label: "Applications", value: totalApplications, note: `${pendingApplications} waiting for review`, path: "/admin/applications", icon: "quiz", color: "blue" },
          { label: "Subscriptions", value: data.summary.subscriptions, note: `${formatNumber(subscriptionSummary.active)} active plan records`, path: "/admin/subscriptions", icon: "layers", color: "green" },
        ] as const).map((metric) => <Link className={`adh-metric ${metric.color}`} to={metric.path} key={metric.label}>
          <span className="adh-icon"><Icon name={metric.icon} /></span>
          <div><h2>{metric.label}</h2><strong>{formatNumber(metric.value)}</strong><small>{metric.note}</small></div>
        </Link>)}
      </section>

      <div className="adh-middle">
        <section className="adh-panel">
          <header className="adh-panel-heading"><span className="adh-icon"><Icon name="chart" /></span><div><h2>Application Overview</h2><p>Approved, rejected, and pending applications.</p></div><span className="adh-period">All time</span></header>
          <div className="adh-chart-content">
            <div className="adh-donut" style={{ background: totalApplications ? `conic-gradient(${applicationGradient})` : "#eee5ff" }} role="img" aria-label={`${totalApplications} total applications`}>
              <div><strong>{formatNumber(totalApplications)}</strong><span>Total</span></div>
            </div>
            <div className="adh-breakdown">{applicationSegments.map((segment) => <div key={segment.label}>
              <i style={{ background: segment.color }} /><span>{segment.label}</span><strong>{segment.value}</strong><small>{getPercent(segment.value, totalApplications)}%</small>
            </div>)}</div>
          </div>
          {totalApplications === 0 && <p className="adh-empty">No applications have been submitted yet.</p>}
        </section>

        <section className="adh-panel" id="admin-pending">
          <header className="adh-panel-heading"><span className="adh-icon"><Icon name="clock" /></span><div><h2>Pending Approvals</h2><p>Items that require review and action.</p></div></header>
          <div className="adh-pending-list">{pendingItems.map((item) => <Link to={item.path} key={item.label}>
            <Icon name={item.icon} /><span>{item.label}</span><strong>{item.count}</strong><Icon name="chevron" />
          </Link>)}</div>
          <button className="adh-primary" type="button" aria-expanded={showPending} aria-controls="adh-pending-summary" onClick={() => setShowPending(!showPending)}>Review All Pending ({pendingTotal}) <Icon name="chevron" /></button>
          {showPending && <div className="adh-pending-summary" id="adh-pending-summary">
            {pendingTotal === 0 ? <p>You're all caught up. There are no pending items.</p> : pendingItems.filter((item) => item.count > 0).map((item) => <Link key={item.label} to={item.path}>{item.label} ({item.count}) <Icon name="chevron" /></Link>)}
          </div>}
        </section>
      </div>

      <div className="adh-bottom">
        <section className="adh-panel adh-roles">
          <header className="adh-panel-heading"><span className="adh-icon"><Icon name="users" /></span><div><h2>Users by Role</h2><p>Current account distribution.</p></div></header>
          <div className="adh-chart-content">
            <div className="adh-donut" style={totalUsers > 0 ? roleDistributionStyle : { background: "#eee5ff" }} role="img" aria-label={`${totalUsers} total users`}><div><strong>{formatNumber(totalUsers)}</strong><span>Users</span></div></div>
            <div className="adh-breakdown">{roles.map((role) => <div key={role.label}><i style={{ background: role.color }} /><span>{role.label}</span><strong>{formatNumber(role.value)}</strong><small>{getPercent(role.value, totalUsers)}%</small></div>)}</div>
          </div>
        </section>

        <section className="adh-panel adh-appeals">
          <header className="adh-panel-heading">
            <span className="adh-icon"><Icon name="shield" /></span>
            <div><h2>Appeals Awaiting Review</h2><p>Provider appeals that need administrator review.</p></div>
          </header>
          <div className="adh-appeal-total">
            <span className="adh-icon"><Icon name="quiz" /></span>
            <strong>{formatNumber(appealsAwaitingReview)}</strong>
            <span>Appeals to Review</span>
          </div>
          <Link className="adh-appeal-link" to="/admin/scholarships?status=appeal_submitted">Review Appeals <Icon name="chevron" /></Link>
        </section>

        <section className="adh-panel adh-activities">
          <header className="adh-panel-heading"><span className="adh-icon"><Icon name="trend" /></span><div><h2>Recent Activities</h2><p>Latest user and scholarship activity.</p></div>{activities.length > 3 && <button type="button" className="adh-text-button" onClick={() => setShowAllActivities(!showAllActivities)} aria-expanded={showAllActivities}>{showAllActivities ? "Show Less" : "View All"}</button>}</header>
          <div className="adh-activity-list">{activities.slice(0, showAllActivities ? activities.length : 3).map((activity) => <Link to={activity.path} key={activity.id}>
            <span className={`adh-activity-icon ${activity.icon === "S" ? "amber" : "purple"}`}>{activity.icon}</span>
            <div><strong>{activity.title}</strong><small>{activity.detail}</small></div>
            <time dateTime={activity.time ? new Date(activity.time).toISOString() : undefined}>{activity.time ? new Date(activity.time).toLocaleDateString("en-MY", { day: "numeric", month: "short" }) : "Date unavailable"}</time>
          </Link>)}</div>
          {activities.length === 0 && <p className="adh-empty">No recent activities yet.</p>}
        </section>
      </div>

      <section className="adh-database-status" aria-label="Database connection status">
        <Icon name="layers" />
        <strong>Database Status</strong>
        <span>Connected</span>
        {checkedAt && <small>Last checked <time dateTime={checkedAt}>{new Intl.DateTimeFormat("en-MY", {
          timeZone: "Asia/Kuala_Lumpur", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
        }).format(new Date(checkedAt))}</time></small>}
      </section>
    </div>
  );
}

export default AdminDashboard;
