import { useEffect, useState } from "react";
import api from "../../api/axios";
import Icon from "../advisor/AdvisorIcon";
import { useLocation, useNavigate } from "react-router-dom";
import { clearStoredUser, getStoredUser } from "../../utils/authStorage";
import { getInitials } from "../../utils/userDisplay";

function SponsorTopbar() {
  const navigate = useNavigate();
  const page = useLocation().pathname.split("/").filter(Boolean).pop() || "dashboard";
  const headings: Record<string, [string, string]> = {
    dashboard: ["Sponsorship Provider Dashboard", "Review your scholarship programs, applications, and subscription usage."],
    scholarships: ["My Scholarships", "Manage your scholarship listings and track their approval status."],
    "add-scholarship": ["Add Scholarship", "Create opportunities and support the next generation of students."],
    applications: ["Applications", "Review submissions and manage scholarship decisions."],
    statistics: ["Statistics", "Understand your scholarship programmes and application activity."],
    subscriptions: ["Subscriptions", "Manage your provider plan and scholarship listing allowance."],
    appeals: ["Appeals", "Track reviews and submit appeals for rejected scholarship listings."],
    messages: ["Messages", "Keep up with administrator updates and provider notices."],
    settings: ["Settings", "Manage your organization’s profile and provider preferences."],
  };
  const [title, subtitle] = headings[page] || headings.dashboard;
  const user = getStoredUser();
  const [unread, setUnread] = useState<number | null>(null);
  const sponsorId = user?.user_id;
  useEffect(() => {
    if (!sponsorId) return;
    const controller = new AbortController();
    api.get<{ summary: { unread: number } }>(`/sponsors/${sponsorId}/messages`, { signal: controller.signal }).then(({data}) => {if (!controller.signal.aborted) setUnread(data.summary.unread);}).catch(() => {});
    return () => controller.abort();
  }, [sponsorId]);
  const displayName = user?.full_name || "Sponsorship Provider";

  function handleLogout() {
    clearStoredUser();
    navigate("/login", { replace: true });
  }

  return (
    <header className="sponsor-topbar">
      <div>
        <h1>{title} <span className="sph-title-spark" aria-hidden="true">✦</span></h1>
        <p>{subtitle}</p>
      </div>

      <div className="sponsor-top-actions">
        <button className="sponsor-icon-button" type="button" aria-label={unread ? `${unread} unread provider updates` : "Open provider updates"} onClick={() => navigate("/sponsor/messages")}>
          {unread !== null && unread > 0 && <span>{unread}</span>}
          <Icon name="bell" />
        </button>
        <div className="sponsor-avatar">{getInitials(displayName)}</div>
        <div className="sponsor-top-user">
          <strong>{displayName}</strong>
          <span>Sponsorship Provider</span>
        </div>
        <button className="sponsor-logout" type="button" onClick={handleLogout}>
          Logout
        </button>
      </div>
    </header>
  );
}

export default SponsorTopbar;
