import { useEffect, useMemo, useState } from "react";
import api from "../../api/axios";
import { getApiErrorMessage } from "../../utils/apiError";
import { getStoredUser } from "../../utils/authStorage";

type SponsorMessage = {
  notification_id: number;
  user_id: number;
  message: string;
  notification_type?: string | null;
  is_read: boolean;
  created_at?: string | null;
};

type SponsorMessagesData = {
  sponsor: {
    organization_name: string;
  };
  summary: {
    total: number;
    unread: number;
    read: number;
    latest_sender: string;
    latest_type: string;
  };
  notifications: SponsorMessage[];
};

type MessageFilter = "all" | "unread" | "read";

function formatDate(value?: string | null) {
  if (!value) {
    return "Not set";
  }

  return new Intl.DateTimeFormat("en-MY", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatMessageType(value?: string | null) {
  if (!value) {
    return "General update";
  }

  return value
    .replace(/_/g, " ")
    .split(" ")
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(" ");
}

function SponsorMessagesPage() {
  const user = getStoredUser();
  const [data, setData] = useState<SponsorMessagesData | null>(null);
  const [selectedMessageId, setSelectedMessageId] = useState<number | null>(null);
  const [activeFilter, setActiveFilter] = useState<MessageFilter>("all");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);

  async function loadMessages() {
    if (!user?.user_id) {
      setIsLoading(false);
      return;
    }

    try {
      const response = await api.get<SponsorMessagesData>(`/sponsors/${user.user_id}/messages`);
      setData(response.data);
      setSelectedMessageId((currentId) => {
        if (currentId && response.data.notifications.some((message) => message.notification_id === currentId)) {
          return currentId;
        }

        return response.data.notifications[0]?.notification_id ?? null;
      });
      setError("");
    } catch (error) {
      setError(getApiErrorMessage(error, "Unable to load provider messages."));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadMessages();
  }, [user?.user_id]);

  const filteredMessages = useMemo(() => {
    if (!data) {
      return [];
    }

    if (activeFilter === "unread") {
      return data.notifications.filter((message) => !message.is_read);
    }

    if (activeFilter === "read") {
      return data.notifications.filter((message) => message.is_read);
    }

    return data.notifications;
  }, [activeFilter, data]);

  const selectedMessage = useMemo(() => {
    if (!data || !selectedMessageId) {
      return null;
    }

    return data.notifications.find((message) => message.notification_id === selectedMessageId) || null;
  }, [data, selectedMessageId]);

  async function selectMessage(message: SponsorMessage) {
    setSelectedMessageId(message.notification_id);

    if (!user?.user_id || message.is_read) {
      return;
    }

    setIsUpdating(true);
    try {
      await api.patch(`/sponsors/${user.user_id}/messages/${message.notification_id}`, {
        is_read: true,
      });
      await loadMessages();
    } catch (error) {
      setError(getApiErrorMessage(error, "Unable to update this message."));
    } finally {
      setIsUpdating(false);
    }
  }

  async function markAllAsRead() {
    if (!user?.user_id || !data?.summary.unread) {
      return;
    }

    setIsUpdating(true);
    try {
      await api.patch(`/sponsors/${user.user_id}/messages/read-all`);
      await loadMessages();
    } catch (error) {
      setError(getApiErrorMessage(error, "Unable to mark messages as read."));
    } finally {
      setIsUpdating(false);
    }
  }

  if (isLoading) {
    return (
      <div className="sponsor-page">
        <section className="sponsor-empty-state">Loading provider messages...</section>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="sponsor-page">
        <section className="sponsor-empty-state">{error}</section>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="sponsor-page">
        <section className="sponsor-empty-state">Provider messages are not available.</section>
      </div>
    );
  }

  return (
    <div className="sponsor-page">
      <section className="sponsor-messages-hero">
        <div>
          <p className="sponsor-kicker">Communication</p>
          <h2>Messages</h2>
          <span>
            Review administrator updates for scholarship submissions, subscription records, appeal decisions, and
            provider account notices.
          </span>
        </div>
        {data.summary.unread > 0 && (
          <button className="sponsor-hero-action" type="button" onClick={markAllAsRead} disabled={isUpdating}>
            Mark All Read
          </button>
        )}
      </section>

      <section className="sponsor-stats-grid" aria-label="Provider message summary">
        <article className="sponsor-stat-card purple">
          <span>✉</span>
          <p>Total Messages</p>
          <strong>{data.summary.total}</strong>
          <small>Admin updates received</small>
        </article>
        <article className="sponsor-stat-card blue">
          <span>!</span>
          <p>Unread</p>
          <strong>{data.summary.unread}</strong>
          <small>Messages still needing review</small>
        </article>
        <article className="sponsor-stat-card green">
          <span>✓</span>
          <p>Read</p>
          <strong>{data.summary.read}</strong>
          <small>Messages already opened</small>
        </article>
        <article className="sponsor-stat-card blue">
          <span>□</span>
          <p>Latest Type</p>
          <strong>{formatMessageType(data.summary.latest_type)}</strong>
          <small>{data.summary.latest_sender}</small>
        </article>
      </section>

      {error && <div className="sponsor-form-error">{error}</div>}

      <section className="sponsor-message-layout">
        <article className="sponsor-panel sponsor-message-list-panel">
          <div className="sponsor-panel-header">
            <div>
              <p className="sponsor-kicker">Inbox</p>
              <h2>Administrator updates</h2>
            </div>
          </div>

          <div className="sponsor-message-tabs" aria-label="Message filters">
            {(["all", "unread", "read"] as MessageFilter[]).map((filter) => (
              <button
                key={filter}
                className={activeFilter === filter ? "active" : ""}
                type="button"
                onClick={() => setActiveFilter(filter)}
              >
                {filter.charAt(0).toUpperCase() + filter.slice(1)}
              </button>
            ))}
          </div>

          {filteredMessages.length === 0 ? (
            <div className="sponsor-empty-state compact">
              {data.notifications.length === 0
                ? "No admin messages yet. Submission, subscription, and appeal updates will appear here."
                : "No messages match this filter."}
            </div>
          ) : (
            <div className="sponsor-message-list">
              {filteredMessages.map((message) => (
                <button
                  key={message.notification_id}
                  className={`sponsor-message-card ${message.is_read ? "" : "unread"} ${
                    selectedMessageId === message.notification_id ? "active" : ""
                  }`}
                  type="button"
                  onClick={() => selectMessage(message)}
                >
                  <span className="sponsor-message-dot" aria-hidden="true" />
                  <div>
                    <div className="sponsor-message-meta">
                      <strong>{formatMessageType(message.notification_type)}</strong>
                      <small>{formatDate(message.created_at)}</small>
                    </div>
                    <p>{message.message}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </article>

        <aside className="sponsor-panel sponsor-message-detail-panel">
          {selectedMessage ? (
            <>
              <div className="sponsor-panel-header">
                <div>
                  <p className="sponsor-kicker">Message Details</p>
                  <h2>{formatMessageType(selectedMessage.notification_type)}</h2>
                </div>
                <span className={`sponsor-status-pill ${selectedMessage.is_read ? "active" : "pending"}`}>
                  {selectedMessage.is_read ? "Read" : "Unread"}
                </span>
              </div>

              <div className="sponsor-message-facts">
                <div>
                  <span>From</span>
                  <strong>Administrator</strong>
                </div>
                <div>
                  <span>Sent</span>
                  <strong>{formatDate(selectedMessage.created_at)}</strong>
                </div>
                <div>
                  <span>Organization</span>
                  <strong>{data.sponsor.organization_name}</strong>
                </div>
                <div>
                  <span>Category</span>
                  <strong>{formatMessageType(selectedMessage.notification_type)}</strong>
                </div>
              </div>

              <div className="sponsor-message-body">
                <p>{selectedMessage.message}</p>
              </div>
            </>
          ) : (
            <div className="sponsor-empty-state compact">Select a message to view the full administrator update.</div>
          )}
        </aside>
      </section>
    </div>
  );
}

export default SponsorMessagesPage;
