import { Navigate, Route, Routes } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute";
import AdminLayout from "./layouts/AdminLayout";
import AdvisorLayout from "./layouts/AdvisorLayout";
import SponsorLayout from "./layouts/SponsorLayout";
import StudentLayout from "./layouts/StudentLayout";
import AppointmentsPage from "./pages/AppointmentsPage";
import CalendarPage from "./pages/CalendarPage";
import LoginPage from "./pages/LoginPage";
import MessagesPage from "./pages/MessagesPage";
import PathwayQuizPage from "./pages/PathwayQuizPage";
import ProfilePage from "./pages/ProfilePage";
import RegisterPage from "./pages/RegisterPage";
import RemindersPage from "./pages/RemindersPage";
import ScholarshipsPage from "./pages/ScholarshipsPage";
import SettingsPage from "./pages/SettingsPage";
import StudentDashboard from "./pages/StudentDashboard";
import AdminApplicationsPage from "./pages/admin/AdminApplicationsPage";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminPlaceholderPage from "./pages/admin/AdminPlaceholderPage";
import AdminScholarshipsPage from "./pages/admin/AdminScholarshipsPage";
import AdminUsersPage from "./pages/admin/AdminUsersPage";
import AdvisorAppointmentsPage from "./pages/advisor/AdvisorAppointmentsPage";
import AdvisorDashboard from "./pages/advisor/AdvisorDashboard";
import AdvisorFeedbackPage from "./pages/advisor/AdvisorFeedbackPage";
import AdvisorMessagesPage from "./pages/advisor/AdvisorMessagesPage";
import AdvisorPathwayQuizzesPage from "./pages/advisor/AdvisorPathwayQuizzesPage";
import AdvisorProfilePage from "./pages/advisor/AdvisorProfilePage";
import AdvisorSchedulePage from "./pages/advisor/AdvisorSchedulePage";
import AdvisorSettingsPage from "./pages/advisor/AdvisorSettingsPage";
import AdvisorStudentsPage from "./pages/advisor/AdvisorStudentsPage";
import SponsorAddScholarshipPage from "./pages/sponsor/SponsorAddScholarshipPage";
import SponsorApplicationsPage from "./pages/sponsor/SponsorApplicationsPage";
import SponsorDashboard from "./pages/sponsor/SponsorDashboard";
import SponsorAppealsPage from "./pages/sponsor/SponsorAppealsPage";
import SponsorMessagesPage from "./pages/sponsor/SponsorMessagesPage";
import SponsorScholarshipsPage from "./pages/sponsor/SponsorScholarshipsPage";
import SponsorSettingsPage from "./pages/sponsor/SponsorSettingsPage";
import SponsorStatisticsPage from "./pages/sponsor/SponsorStatisticsPage";
import SponsorSubscriptionsPage from "./pages/sponsor/SponsorSubscriptionsPage";

function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/staff-login" element={<LoginPage audience="staff" />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<StudentLayout />}>
          <Route path="/dashboard" element={<StudentDashboard />} />
          <Route path="/scholarships" element={<ScholarshipsPage />} />
          <Route path="/pathway-quiz" element={<PathwayQuizPage />} />
          <Route path="/appointments" element={<AppointmentsPage />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/reminders" element={<RemindersPage />} />
          <Route path="/messages" element={<MessagesPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
        <Route element={<AdvisorLayout />}>
          <Route path="/advisor/dashboard" element={<AdvisorDashboard />} />
          <Route path="/advisor/profile" element={<AdvisorProfilePage />} />
          <Route path="/advisor/schedule" element={<AdvisorSchedulePage />} />
          <Route path="/advisor/appointments" element={<AdvisorAppointmentsPage />} />
          <Route path="/advisor/students" element={<AdvisorStudentsPage />} />
          <Route path="/advisor/pathway-quizzes" element={<AdvisorPathwayQuizzesPage />} />
          <Route path="/advisor/feedback" element={<AdvisorFeedbackPage />} />
          <Route path="/advisor/messages" element={<AdvisorMessagesPage />} />
          <Route path="/advisor/settings" element={<AdvisorSettingsPage />} />
        </Route>
        <Route element={<SponsorLayout />}>
          <Route path="/sponsor/dashboard" element={<SponsorDashboard />} />
          <Route path="/sponsor/scholarships" element={<SponsorScholarshipsPage />} />
          <Route path="/sponsor/add-scholarship" element={<SponsorAddScholarshipPage />} />
          <Route path="/sponsor/applications" element={<SponsorApplicationsPage />} />
          <Route path="/sponsor/statistics" element={<SponsorStatisticsPage />} />
          <Route path="/sponsor/subscriptions" element={<SponsorSubscriptionsPage />} />
          <Route path="/sponsor/appeals" element={<SponsorAppealsPage />} />
          <Route path="/sponsor/messages" element={<SponsorMessagesPage />} />
          <Route path="/sponsor/settings" element={<SponsorSettingsPage />} />
        </Route>
        <Route element={<AdminLayout />}>
          <Route path="/admin/dashboard" element={<AdminDashboard />} />
          <Route path="/admin/users" element={<AdminUsersPage />} />
          <Route path="/admin/scholarships" element={<AdminScholarshipsPage />} />
          <Route path="/admin/applications" element={<AdminApplicationsPage />} />
          <Route
            path="/admin/pathways"
            element={
              <AdminPlaceholderPage
                eyebrow="Academic Pathway"
                title="Academic Pathways"
                description="Manage academic pathway options and advisor-created pathway quiz content."
                metrics={[
                  { label: "Pathway options", value: "Database", helper: "Academic pathways are stored centrally." },
                  { label: "Quiz content", value: "Advisor-led", helper: "Advisor quizzes can be reviewed here." },
                  { label: "Student guidance", value: "Connected", helper: "Pathway data supports recommendations." },
                ]}
              />
            }
          />
          <Route
            path="/admin/subscriptions"
            element={
              <AdminPlaceholderPage
                eyebrow="Provider Billing"
                title="Subscriptions"
                description="Manage sponsorship provider plans, subscription usage, and payment records."
                metrics={[
                  { label: "Provider plans", value: "Monitored", helper: "Subscription plans connect to providers." },
                  { label: "Usage limits", value: "Tracked", helper: "Listing quota can be managed here." },
                  { label: "Renewals", value: "Pending", helper: "Payment workflow can be added later." },
                ]}
              />
            }
          />
          <Route
            path="/admin/reports"
            element={
              <AdminPlaceholderPage
                eyebrow="System Insight"
                title="Reports & Statistics"
                description="View system-wide activity, user growth, scholarship performance, and generated reports."
                metrics={[
                  { label: "Reports", value: "Database", helper: "Generated admin reports will appear here." },
                  { label: "Analytics", value: "System-wide", helper: "Summaries include all user roles." },
                  { label: "Exports", value: "Planned", helper: "Report downloads can be added next." },
                ]}
              />
            }
          />
          <Route
            path="/admin/settings"
            element={
              <AdminPlaceholderPage
                eyebrow="Configuration"
                title="System Settings"
                description="Manage system preferences, platform rules, and administrative configuration."
                metrics={[
                  { label: "Platform rules", value: "Ready", helper: "Global settings can be edited here." },
                  { label: "Access control", value: "Admin", helper: "Only administrator users can enter." },
                  { label: "System status", value: "Active", helper: "Settings module is connected to admin layout." },
                ]}
              />
            }
          />
          <Route
            path="/admin/audit-logs"
            element={
              <AdminPlaceholderPage
                eyebrow="Activity Tracking"
                title="Audit Logs"
                description="Review important account actions, system changes, and administrative activity."
                metrics={[
                  { label: "Audit trail", value: "Available", helper: "Audit log records can be listed here." },
                  { label: "Security review", value: "Supported", helper: "Track who changed what and when." },
                  { label: "System action", value: "Logged", helper: "Administrative activities stay traceable." },
                ]}
              />
            }
          />
        </Route>
      </Route>
    </Routes>
  );
}

export default App;
