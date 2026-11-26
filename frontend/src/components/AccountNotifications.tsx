import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { retryRead } from "../utils/retryRead";
import api from "../api/axios";
import { useStoredUser } from "../utils/authStorage";
import type { AuthUser } from "../types/auth";
import "../styles/account-notifications.css";
import Icon from "./advisor/AdvisorIcon";

type Notice = { notification_id: number; message: string; notification_type?: string; is_read: boolean; created_at?: string | null };
type AdvisorActivity = { pending: number; unreadMessages: number };

const noticeTitles = new Map([
  ["appointment", "Appointment update"],
  ["advisor_feedback", "Consultation feedback"],
  ["scholarship_deadline", "Scholarship deadline"],
  ["pathway_update", "Pathway and assessment update"],
  ["application_status", "Application update"],
  ["scholarship_review", "Scholarship review"],
  ["provider_verification", "Provider verification"],
]);
const inboxLinks = {
  student: [{ to: "/appointments", label: "View appointments" }, { to: "/calendar?section=reminders", label: "View scholarship reminders" }],
  advisor: [{ to: "/advisor/appointments", label: "View appointments" }],
  sponsor: [{ to: "/sponsor/messages", label: "View provider updates" }],
  admin: [{ to: "/admin/applications", label: "View applications" }],
};
const noticeTime = new Intl.DateTimeFormat("en-MY", {
  dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kuala_Lumpur",
});

type InboxOptions = { advisorActivity?: AdvisorActivity; disclosureGroup?: string };

export default function AccountNotifications(options: InboxOptions) {
  const user = useStoredUser();
  if (!user) return null;
  return <NotificationInbox key={user.user_id} role={user.role} {...options} />;
}

function NotificationInbox({ role, advisorActivity, disclosureGroup }: InboxOptions & { role: AuthUser["role"] }) {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [updateError, setUpdateError] = useState("");
  const request = useRef<AbortController | null>(null);
  const updating = useRef(false);
  const menu = useRef<HTMLDetailsElement>(null);
  const trigger = useRef<HTMLElement>(null);
  const panel = useRef<HTMLElement>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  const links = inboxLinks[role] ?? [];
  const advisorLinks = role === "advisor" ? [
    { to: "/advisor/appointments?status=pending", label: advisorActivity ? `${advisorActivity.pending} pending ${advisorActivity.pending === 1 ? "request" : "requests"}` : "Review pending requests" },
    { to: "/advisor/messages", label: advisorActivity ? `${advisorActivity.unreadMessages} unread ${advisorActivity.unreadMessages === 1 ? "message" : "messages"}` : "Open messages" },
  ] : [];

  const refresh = useCallback(async () => {
    if (request.current || updating.current) return;
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setLoadError("");
    try {
      const { data } = await retryRead(() => api.get<{ notifications: Notice[]; unread: number }>("/notifications", { signal: controller.signal, timeout: 15000 }), controller.signal);
      if (controller.signal.aborted) return;
      setNotices(data.notifications);
      setUnread(data.unread);
      setLoaded(true);
    } catch {
      if (!controller.signal.aborted) setLoadError("Unable to load notifications. Please retry.");
    } finally {
      if (request.current === controller) {
        request.current = null;
        setLoading(false);
      }
    }
  }, []);

  function close(restoreFocus = false) {
    if (menu.current) menu.current.open = false;
    if (restoreFocus) trigger.current?.focus();
  }

  function fitPanel() {
    if (!menu.current?.open || !trigger.current || !panel.current) return;
    const { right } = trigger.current.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth;
    const panelRight = Math.min(viewportWidth - 12, Math.max(panel.current.offsetWidth + 12, right));
    panel.current.style.setProperty("--notification-offset", `${panelRight - right}px`);
  }

  useEffect(() => {
    const initial = window.setTimeout(() => void refresh(), 0);
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 30000);
    const onFocus = () => void refresh();
    function onOutsidePress(event: PointerEvent) {
      if (menu.current?.open && !menu.current.contains(event.target as Node)) close();
    }
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onFocus);
    window.addEventListener("resize", fitPanel);
    document.addEventListener("pointerdown", onOutsidePress);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onFocus);
      window.removeEventListener("resize", fitPanel);
      document.removeEventListener("pointerdown", onOutsidePress);
      request.current?.abort();
      request.current = null;
    };
  }, [refresh]);

  async function toggleRead(notice: Notice) {
    if (updating.current) return;
    updating.current = true;
    request.current?.abort();
    request.current = null;
    setLoading(false);
    setIsUpdating(true);
    setUpdateError("");
    try {
      const isRead = !notice.is_read;
      await api.patch(`/notifications/${notice.notification_id}`, { is_read: isRead });
      setNotices(current => current.map(item => item.notification_id === notice.notification_id ? { ...item, is_read: isRead } : item));
      setUnread(current => Math.max(0, current + (isRead ? -1 : 1)));
    } catch { setUpdateError("Unable to update this notification. Please retry."); }
    finally {
      updating.current = false;
      setIsUpdating(false);
    }
  }

  return <details ref={menu} name={disclosureGroup} className="account-notifications" onToggle={event => {
    if (!event.currentTarget.open) return;
    fitPanel();
    void refresh();
  }} onKeyDown={event => {
    if (event.key === "Escape" && event.currentTarget.open) {
      event.stopPropagation();
      close(true);
    }
  }} onBlur={event => {
    if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) close();
  }}>
    <summary ref={trigger} aria-label={`Account notifications: ${unread} unread`}>
      <Icon name="bell" />
      {unread > 0 && <b aria-hidden="true">{unread > 99 ? "99+" : unread}</b>}
    </summary>
    <section ref={panel} aria-label="Account notifications">
      <header className="account-notifications-heading">
        <h2>Notifications</h2>
        <button type="button" className="account-notifications-close" aria-label="Close notifications" onClick={() => close(true)}><Icon name="close" /></button>
      </header>
      <button type="button" onClick={() => void refresh()} aria-disabled={loading || isUpdating}>Refresh</button>
      {loading && <p role="status">{loaded ? "Refreshing notifications…" : "Loading notifications…"}</p>}
      {loadError && <p role="alert">{loadError}</p>}
      {updateError && <p role="alert">{updateError}</p>}
      {loaded && !loadError && notices.length === 0 && <p>No notifications yet.</p>}
      {notices.map(notice => {
        const instant = notice.created_at ? new Date(notice.created_at) : null;
        return <article key={notice.notification_id} className={notice.is_read ? "read" : "unread"}>
          <h3>{noticeTitles.get(notice.notification_type ?? "") ?? "Account update"}</h3>
          <p>{notice.message}</p>
          {instant && Number.isFinite(instant.getTime()) && <time dateTime={notice.created_at ?? undefined}>{noticeTime.format(instant)} MYT</time>}
          <button type="button" aria-disabled={isUpdating} onClick={() => void toggleRead(notice)}>
            {notice.is_read ? "Mark as unread" : "Mark as read"}
          </button>
        </article>;
      })}
      <nav className="account-notifications-links" aria-label="Related pages">
        {[...links, ...advisorLinks].map(({ to, label }) => <Link key={to} to={to} onClick={() => close()}>{label} &rarr;</Link>)}
      </nav>
    </section>
  </details>;
}
