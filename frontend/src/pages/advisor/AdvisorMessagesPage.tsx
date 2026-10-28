import { useEffect, useMemo, useState, type FormEvent } from "react";
import api from "../../api/axios";
import { getApiErrorMessage } from "../../utils/apiError";
import { getStoredUser } from "../../utils/authStorage";

type AdvisorConversation = {
  conversation_id: number;
  created_at?: string | null;
  student_id?: number | null;
  student_name: string;
  student_email?: string | null;
  education_level?: string | null;
  field_of_study?: string | null;
  latest_message?: string | null;
  latest_message_at?: string | null;
  latest_sender_id?: number | null;
  unread_count: number;
};

type AdvisorMessage = {
  message_id: number;
  conversation_id: number;
  sender_id?: number | null;
  sender_name: string;
  sender_role?: string | null;
  message_text: string;
  sent_at?: string | null;
  is_read: boolean;
};

type AdvisorMessagesData = {
  summary: {
    total_conversations: number;
    unread_messages: number;
    latest_sender?: string | null;
  };
  conversations: AdvisorConversation[];
  messages_by_conversation: Record<string, AdvisorMessage[]>;
};

function formatMessageTime(value?: string | null) {
  if (!value) {
    return "Time not set";
  }

  return new Intl.DateTimeFormat("en-MY", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function AdvisorMessagesPage() {
  const user = getStoredUser();
  const [data, setData] = useState<AdvisorMessagesData | null>(null);
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
  const [reply, setReply] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);

  async function loadMessages() {
    if (!user?.user_id) {
      setIsLoading(false);
      return;
    }

    try {
      const response = await api.get<AdvisorMessagesData>(`/advisors/${user.user_id}/messages`);
      setData(response.data);
      setActiveConversationId((currentId) => currentId ?? response.data.conversations[0]?.conversation_id ?? null);
    } catch (error) {
      setError(getApiErrorMessage(error, "Unable to load advisor messages."));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadMessages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.user_id]);

  const activeConversation = useMemo(
    () => data?.conversations.find((conversation) => conversation.conversation_id === activeConversationId) || null,
    [activeConversationId, data?.conversations],
  );

  const activeMessages = useMemo(() => {
    if (!data || !activeConversationId) {
      return [];
    }

    return data.messages_by_conversation[String(activeConversationId)] || [];
  }, [activeConversationId, data]);

  async function handleSendReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!user?.user_id || !activeConversationId || !reply.trim()) {
      return;
    }

    setError("");
    setSuccess("");
    setIsSending(true);

    try {
      await api.post(`/advisors/${user.user_id}/messages/${activeConversationId}`, {
        message_text: reply.trim(),
      });
      setReply("");
      setSuccess("Reply sent successfully.");
      await loadMessages();
    } catch (error) {
      setError(getApiErrorMessage(error, "Unable to send reply."));
    } finally {
      setIsSending(false);
    }
  }

  if (isLoading) {
    return (
      <div className="advisor-page">
        <section className="advisor-empty-state">Loading messages...</section>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="advisor-page">
        <section className="advisor-empty-state">{error}</section>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="advisor-page">
        <section className="advisor-empty-state">Message data is not available.</section>
      </div>
    );
  }

  return (
    <div className="advisor-page">
      <section className="advisor-messages-hero">
        <div>
          <p className="advisor-kicker">Communication</p>
          <h2>Messages</h2>
          <span>Receive student questions, send consultation follow-ups, and keep guidance conversations organized.</span>
        </div>
      </section>

      <section className="advisor-message-stats">
        <article className="advisor-panel advisor-metric-card">
          <p className="advisor-kicker">Conversations</p>
          <h2>{data.summary.total_conversations}</h2>
          <span className="advisor-muted">Student conversation threads connected to this advisor</span>
        </article>
        <article className="advisor-panel advisor-metric-card">
          <p className="advisor-kicker">Unread</p>
          <h2>{data.summary.unread_messages}</h2>
          <span className="advisor-muted">Messages waiting for advisor attention</span>
        </article>
        <article className="advisor-panel advisor-metric-card">
          <p className="advisor-kicker">Latest Sender</p>
          <h2>{data.summary.latest_sender || "No messages yet"}</h2>
          <span className="advisor-muted">Most recent student conversation</span>
        </article>
      </section>

      {data.conversations.length > 0 ? (
        <section className="advisor-message-workspace">
          <aside className="advisor-panel advisor-conversation-list">
            <div className="advisor-panel-header">
              <div>
                <p className="advisor-kicker">Inbox</p>
                <h2>Students</h2>
              </div>
            </div>

            {data.conversations.map((conversation) => (
              <button
                className={`advisor-conversation-card ${conversation.conversation_id === activeConversationId ? "active" : ""}`}
                key={conversation.conversation_id}
                type="button"
                onClick={() => {
                  setActiveConversationId(conversation.conversation_id);
                  setSuccess("");
                  setError("");
                }}
              >
                <span className="advisor-conversation-avatar">{conversation.student_name.slice(0, 2).toUpperCase()}</span>
                <span>
                  <strong>{conversation.student_name}</strong>
                  <small>{conversation.latest_message || "No messages in this conversation yet."}</small>
                </span>
                {conversation.unread_count > 0 && <em>{conversation.unread_count}</em>}
              </button>
            ))}
          </aside>

          <article className="advisor-panel advisor-chat-panel">
            {activeConversation ? (
              <>
                <header className="advisor-chat-header">
                  <div className="advisor-conversation-avatar large">{activeConversation.student_name.slice(0, 2).toUpperCase()}</div>
                  <div>
                    <p className="advisor-kicker">Student Conversation</p>
                    <h2>{activeConversation.student_name}</h2>
                    <span>
                      {[activeConversation.education_level, activeConversation.field_of_study].filter(Boolean).join(" • ") ||
                        activeConversation.student_email ||
                        "Student"}
                    </span>
                  </div>
                </header>

                <div className="advisor-chat-thread">
                  {activeMessages.length > 0 ? (
                    activeMessages.map((message) => {
                      const isAdvisor = message.sender_id === user?.user_id;

                      return (
                        <div className={`advisor-message-bubble ${isAdvisor ? "sent" : "received"}`} key={message.message_id}>
                          <strong>{isAdvisor ? "You" : message.sender_name}</strong>
                          <p>{message.message_text}</p>
                          <span>{formatMessageTime(message.sent_at)}</span>
                        </div>
                      );
                    })
                  ) : (
                    <div className="advisor-empty-state small">No messages in this conversation yet.</div>
                  )}
                </div>

                <form className="advisor-reply-box" onSubmit={handleSendReply}>
                  <label>
                    Reply to student
                    <textarea
                      placeholder="Write guidance, consultation notes, or follow-up instructions..."
                      value={reply}
                      onChange={(event) => setReply(event.target.value)}
                    />
                  </label>
                  {(error || success) && <p className={error ? "advisor-form-error" : "advisor-form-success"}>{error || success}</p>}
                  <button className="advisor-primary-button" type="submit" disabled={isSending || !reply.trim()}>
                    {isSending ? "Sending..." : "Send Message"}
                  </button>
                </form>
              </>
            ) : (
              <div className="advisor-empty-state">Choose a conversation to read and reply to student messages.</div>
            )}
          </article>
        </section>
      ) : (
        <section className="advisor-empty-state">
          No student conversations yet. When students message this advisor, their conversations will appear here.
        </section>
      )}
    </div>
  );
}

export default AdvisorMessagesPage;
