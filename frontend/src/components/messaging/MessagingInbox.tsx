import { Fragment, useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import MessagingIcon from "./MessagingIcon";
import api from "../../api/axios";
import { getApiErrorMessage } from "../../utils/apiError";
import { getStoredUser } from "../../utils/authStorage";
import "../../styles/messaging.css";

type Contact = { user_id: number; full_name: string; role: string };
type Conversation = {
  conversation_id: number;
  contact_id: number;
  contact_name: string;
  contact_role: string;
  contact_active: boolean;
  latest_message?: string | null;
  latest_message_at?: string | null;
  unread_count: number;
  has_appointment?: boolean;
  contact_specialization?: string | null;
  contact_qualification?: string | null;
  contact_experience_years?: number | null;
  contact_education_level?: string | null;
  contact_field_of_study?: string | null;
  contact_university?: string | null;
};
type Message = {
  message_id: number;
  conversation_id: number;
  sender_id: number | null;
  sender_name: string;
  message_text: string;
  sent_at: string | null;
  is_read: boolean;
};
type Inbox = { conversations: Conversation[]; unread_count: number; appointment_count: number };
type Thread = { conversation: Conversation; messages: Message[]; has_more: boolean };

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}
function messageDate(value: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur" }).format(new Date(value));
}
function formatTime(value?: string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-MY", {
    timeZone: "Asia/Kuala_Lumpur", hour: "numeric", minute: "2-digit", hour12: true,
  }).format(new Date(value));
}
function formatPreviewTime(value?: string | null) {
  if (!value) return "";
  if (messageDate(value) === messageDate(new Date().toISOString())) return formatTime(value);
  return new Intl.DateTimeFormat("en-MY", {
    timeZone: "Asia/Kuala_Lumpur", day: "numeric", month: "short",
  }).format(new Date(value));
}
function formatMessageDate(value: string) {
  return new Intl.DateTimeFormat("en-MY", {
    timeZone: "Asia/Kuala_Lumpur", day: "numeric", month: "short", year: "numeric",
  }).format(new Date(value));
}
function mergeMessages(existing: Message[], incoming: Message[]) {
  const messages = new Map(existing.map((message) => [message.message_id, message]));
  incoming.forEach((message) => messages.set(message.message_id, message));
  return Array.from(messages.values()).sort((a, b) => a.message_id - b.message_id);
}

function MessagingInbox({ role }: { role: "student" | "advisor" }) {
  const [searchParams] = useSearchParams();
  const requestedConversation = Number(searchParams.get("conversation")) || null;
  const user = getStoredUser();
  const userId = user?.user_id;
  const recipientLabel = role === "student" ? "advisor" : "student";
  const [inbox, setInbox] = useState<Inbox | null>(null);
  const [inboxError, setInboxError] = useState("");
  const [inboxRefresh, setInboxRefresh] = useState(0);
  const [activeId, setActiveId] = useState<number | null>(requestedConversation);
  const [thread, setThread] = useState<Thread | null>(null);
  const [threadError, setThreadError] = useState("");
  const [threadRefresh, setThreadRefresh] = useState(0);
  const [loadingThread, setLoadingThread] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [sendStatus, setSendStatus] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [contactId, setContactId] = useState("");
  const [contactError, setContactError] = useState("");
  const [starting, setStarting] = useState(false);
  const [contactRefresh, setContactRefresh] = useState(0);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "unread" | "appointments">("all");
  const [showDetails, setShowDetails] = useState(true);
  const [showEmoji, setShowEmoji] = useState(false);
  const draftInput = useRef<HTMLTextAreaElement>(null);
  const threadArea = useRef<HTMLDivElement>(null);
  const followNewMessages = useRef(true);

  useEffect(() => {
    const controller = new AbortController();
    let loading = false;
    async function loadInbox() {
      if (loading) return;
      loading = true;
      try {
        const response = await api.get<Inbox>("/messages/conversations", { signal: controller.signal });
        if (!controller.signal.aborted) {
          setInbox(response.data);
          setInboxError("");
          setActiveId((current) => current ?? response.data.conversations[0]?.conversation_id ?? null);
        }
      } catch (error) {
        if (!controller.signal.aborted) setInboxError(getApiErrorMessage(error, "Unable to load your inbox."));
      } finally {
        loading = false;
      }
    }
    function refreshVisibleInbox() {
      if (document.visibilityState === "visible") void loadInbox();
    }
    void loadInbox();
    const interval = window.setInterval(refreshVisibleInbox, 5000);
    window.addEventListener("focus", refreshVisibleInbox);
    document.addEventListener("visibilitychange", refreshVisibleInbox);
    return () => {
      controller.abort();
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshVisibleInbox);
      document.removeEventListener("visibilitychange", refreshVisibleInbox);
    };
  }, [userId, inboxRefresh]);

  useEffect(() => {
    if (!activeId) return;
    const controller = new AbortController();
    let loading = false;
    let firstLoad = true;
    async function loadThread() {
      if (loading) return;
      loading = true;
      if (firstLoad) setLoadingThread(true);
      try {
        const response = await api.get<Thread>(`/messages/conversations/${activeId}`, { signal: controller.signal });
        if (controller.signal.aborted) return;
        setThread((current) => {
          if (current?.conversation.conversation_id !== activeId) return response.data;
          const hasOlderMessages = current.messages.length > 0 && response.data.messages.length > 0 && current.messages[0].message_id < response.data.messages[0].message_id;
          return {
            ...response.data,
            messages: mergeMessages(current.messages, response.data.messages),
            has_more: hasOlderMessages ? current.has_more : response.data.has_more,
          };
        });
        setThreadError("");
        const unread = response.data.messages.filter((message) => message.sender_id !== userId && !message.is_read);
        if (unread.length > 0 && document.visibilityState === "visible") {
          await api.patch(`/messages/conversations/${activeId}/read`, {
            up_to_message_id: response.data.messages[response.data.messages.length - 1].message_id,
          }, { signal: controller.signal });
          if (!controller.signal.aborted) setInboxRefresh((value) => value + 1);
        }
      } catch (error) {
        if (!controller.signal.aborted) setThreadError(getApiErrorMessage(error, "Unable to refresh this conversation."));
      } finally {
        if (!controller.signal.aborted) setLoadingThread(false);
        loading = false;
        firstLoad = false;
      }
    }
    function refreshVisibleThread() {
      if (document.visibilityState === "visible") void loadThread();
    }
    void loadThread();
    const interval = window.setInterval(refreshVisibleThread, 5000);
    window.addEventListener("focus", refreshVisibleThread);
    document.addEventListener("visibilitychange", refreshVisibleThread);
    return () => {
      controller.abort();
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshVisibleThread);
      document.removeEventListener("visibilitychange", refreshVisibleThread);
    };
  }, [activeId, userId, threadRefresh]);

  useEffect(() => {
    if (followNewMessages.current && threadArea.current) {
      threadArea.current.scrollTop = threadArea.current.scrollHeight;
    }
  }, [thread?.messages.length, activeId]);

  useEffect(() => {
    if (!showNew) return;
    const controller = new AbortController();
    async function loadContacts() {
      try {
        const response = await api.get<Contact[]>("/messages/contacts", { signal: controller.signal });
        if (!controller.signal.aborted) {
          setContacts(response.data);
          setContactError("");
        }
      } catch (error) {
        if (!controller.signal.aborted) setContactError(getApiErrorMessage(error, "Unable to load recipients."));
      }
    }
    void loadContacts();
    return () => controller.abort();
  }, [showNew, contactRefresh]);

  function selectConversation(conversationId: number) {
    if (conversationId !== activeId) setThread(null);
    setActiveId(conversationId);
    setThreadError("");
    setSendError("");
    setSendStatus("");
    setShowEmoji(false);
    followNewMessages.current = true;
  }

  async function startConversation(event: FormEvent) {
    event.preventDefault();
    if (!contactId || starting) return;
    setStarting(true);
    setContactError("");
    try {
      const response = await api.post<{ conversation_id: number }>("/messages/conversations", { contact_id: Number(contactId) });
      selectConversation(response.data.conversation_id);
      setShowNew(false);
      setContactId("");
      setInboxRefresh((value) => value + 1);
    } catch (error) {
      setContactError(getApiErrorMessage(error, "Unable to start the conversation."));
    } finally {
      setStarting(false);
    }
  }

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    if (!activeId || sending || !drafts[activeId]?.trim()) return;
    setSending(true);
    setSendError("");
    setSendStatus("");
    const conversationId = activeId;
    try {
      const response = await api.post<{ message: Message }>(`/messages/conversations/${conversationId}/messages`, {
        message_text: drafts[conversationId].trim(),
      });
      setDrafts((current) => ({ ...current, [conversationId]: "" }));
      followNewMessages.current = true;
      setThread((current) => current?.conversation.conversation_id === conversationId ? {
        ...current,
        messages: mergeMessages(current.messages, [{ ...response.data.message, sender_name: user?.full_name || "You" }]),
      } : current);
      setSendStatus("Message sent.");
      setInboxRefresh((value) => value + 1);
    } catch (error) {
      setSendError(getApiErrorMessage(error, "Unable to send. Your message is still in the draft box."));
    } finally {
      setSending(false);
    }
  }

  async function loadOlder() {
    if (!thread?.messages.length || loadingOlder) return;
    setLoadingOlder(true);
    setThreadError("");
    const conversationId = thread.conversation.conversation_id;
    try {
      const response = await api.get<Thread>(`/messages/conversations/${conversationId}`, {
        params: { before: thread.messages[0].message_id },
      });
      followNewMessages.current = false;
      setThread((current) => current?.conversation.conversation_id === conversationId ? {
        ...current, messages: mergeMessages(response.data.messages, current.messages), has_more: response.data.has_more,
      } : current);
    } catch (error) {
      setThreadError(getApiErrorMessage(error, "Unable to load older messages."));
    } finally {
      setLoadingOlder(false);
    }
  }

  const activeConversation = thread?.conversation.conversation_id === activeId ? thread.conversation : null;
  const draft = activeId ? drafts[activeId] || "" : "";

  const visibleConversations = inbox?.conversations.filter((conversation) => {
    const matchesSearch = `${conversation.contact_name} ${conversation.latest_message || ""}`.toLowerCase().includes(search.trim().toLowerCase());
    const matchesFilter = filter === "all" || (filter === "unread" && conversation.unread_count > 0) || (filter === "appointments" && conversation.has_appointment);
    return matchesSearch && matchesFilter;
  }) || [];
  const appointmentPath = role === "student" ? `/appointments?advisor=${activeConversation?.contact_id || ""}` : "/advisor/appointments";
  const profileItems = activeConversation?.contact_role === "advisor" ? [
    { icon: "graduation" as const, text: activeConversation.contact_specialization },
    { icon: "award" as const, text: activeConversation.contact_qualification },
    { icon: "book" as const, text: activeConversation.contact_experience_years != null ? `${activeConversation.contact_experience_years} years of advising experience` : null },
  ] : [
    { icon: "graduation" as const, text: activeConversation?.contact_education_level },
    { icon: "book" as const, text: activeConversation?.contact_field_of_study },
    { icon: "award" as const, text: activeConversation?.contact_university },
  ];
  const contactTitle = activeConversation?.contact_role === "advisor" ? "Academic Advisor" : "Student";

  return (
    <section className={`messaging-inbox messaging-${role}`}>
      <header className="messaging-hero">
        <div className="messaging-hero-copy">
          {role === "student" && <p className="messaging-eyebrow"><MessagingIcon name="message" />Communication</p>}
          <h1>Messages<span className={role === "advisor" ? "messaging-title-diamond" : "messaging-title-spark"} aria-hidden="true">{role === "advisor" ? "✦" : null}</span></h1>
          <p>Talk with your {recipientLabel}s, share questions and keep consultation follow-ups in one place.</p>
        </div>
        {role === "student" && <img className="student-messaging-art" src="/images/student-messages-hero.png" alt="" />}
      </header>

      {role === "advisor" && <div className="messaging-stats" aria-label="Messaging summary">
          <article className="messaging-stat-conversations">
            <MessagingIcon name="message" />
            <div><strong>{inbox?.conversations.length ?? "—"}</strong><span>Conversations</span></div>
          </article>
          <article className="messaging-stat-unread">
            <MessagingIcon name="mail" />
            <div><strong>{inbox?.unread_count ?? "—"}</strong><span>Unread</span></div>
          </article>
          <Link to="/advisor/appointments" className="messaging-stat-appointments">
            <MessagingIcon name="calendar" />
            <div><strong>{inbox?.appointment_count ?? "—"}</strong><span>Appointments</span></div>
          </Link>
      </div>}

      {inboxError && (
        <div className="messaging-error" role="alert">
          {inboxError}
          <button type="button" onClick={() => setInboxRefresh((value) => value + 1)}>Retry inbox</button>
        </div>
      )}

      <div className={`messaging-workspace${showDetails ? "" : " without-profile"}`}>
        <aside className="messaging-conversations" aria-label="Conversations">
          <div className="messaging-inbox-heading">
            <h2>Conversations</h2>
            <button type="button" className="messaging-primary messaging-new-button" disabled={sending} aria-expanded={showNew} aria-controls="messaging-new-conversation" onClick={() => setShowNew((current) => !current)}>
              <MessagingIcon name={showNew ? "close" : "plus"} />
              {showNew ? "Close" : "New Message"}
            </button>
          </div>

          {showNew && (
            <form id="messaging-new-conversation" className="messaging-new" onSubmit={startConversation}>
              <label>
                Choose a {recipientLabel}
                <select value={contactId} disabled={starting || !contacts} onChange={(event) => setContactId(event.target.value)}>
                  <option value="">{contacts ? `Select a ${recipientLabel}` : "Loading recipients..."}</option>
                  {contacts?.map((contact) => <option key={contact.user_id} value={contact.user_id}>{contact.full_name}</option>)}
                </select>
              </label>
              <button className="messaging-primary" type="submit" disabled={!contactId || starting}>{starting ? "Opening..." : "Start conversation"}</button>
              {contacts?.length === 0 && <p>No active {recipientLabel}s are available yet.</p>}
              {contactError && (
                <p className="messaging-error" role="alert">
                  {contactError}
                  <button type="button" onClick={() => setContactRefresh((value) => value + 1)}>Retry recipients</button>
                </p>
              )}
            </form>
          )}

          <label className="messaging-search">
            <MessagingIcon name="search" />
            <input type="search" aria-label="Search conversations" placeholder="Search conversations..." value={search} onChange={(event) => setSearch(event.target.value)} />
          </label>
          <div className="messaging-filters" role="group" aria-label="Filter conversations">
            <button type="button" aria-pressed={filter === "all"} onClick={() => setFilter("all")}>All</button>
            <button type="button" aria-pressed={filter === "unread"} onClick={() => setFilter("unread")}>Unread</button>
            <button type="button" aria-pressed={filter === "appointments"} onClick={() => setFilter("appointments")}>Appointments</button>
          </div>

          <div className="messaging-conversation-list">
            {!inbox && !inboxError && <p className="messaging-empty" role="status">Loading your inbox...</p>}
            {inbox && visibleConversations.length === 0 && (
              <div className="messaging-empty">
                <MessagingIcon name="message" />
                <p>{inbox.conversations.length === 0 ? `Start a conversation with a ${recipientLabel} using New Message.` : "No conversations match your search or filter."}</p>
              </div>
            )}
            {visibleConversations.map((conversation, index) => (
              <button type="button" key={conversation.conversation_id} className={`messaging-conversation ${activeId === conversation.conversation_id ? "active" : ""}`} disabled={sending} aria-pressed={activeId === conversation.conversation_id} onClick={() => selectConversation(conversation.conversation_id)}>
                <span className={`messaging-avatar tone-${index % 3}`}>{initials(conversation.contact_name)}</span>
                <span className="messaging-conversation-preview">
                  <strong>{conversation.contact_name}</strong>
                  <small>{conversation.latest_message || "Start your conversation"}</small>
                </span>
                <span className="messaging-conversation-meta">
                  <time>{formatPreviewTime(conversation.latest_message_at)}</time>
                  {conversation.unread_count > 0 && <span className="messaging-unread" aria-label={`${conversation.unread_count} unread messages`}>{conversation.unread_count}</span>}
                </span>
              </button>
            ))}
          </div>
        </aside>

        <article className="messaging-chat" aria-label="Message thread">
          {!activeId ? (
            <div className="messaging-empty messaging-welcome">
              <span className="messaging-welcome-icon"><MessagingIcon name="message" /></span>
              <h2>Your conversations start here</h2>
              <p>Choose a conversation or send a new message to a {recipientLabel}.</p>
              <button type="button" className="messaging-primary" onClick={() => setShowNew(true)}><MessagingIcon name="plus" />New Message</button>
            </div>
          ) : (
            <>
              <header className="messaging-thread-heading">
                <span className="messaging-avatar">{activeConversation ? initials(activeConversation.contact_name) : "…"}</span>
                <div className="messaging-thread-contact">
                  <h2>{activeConversation?.contact_name || "Conversation"}</h2>
                  <p>{activeConversation ? contactTitle : "Loading..."}</p>
                </div>
                <div className="messaging-thread-actions">
                  {activeConversation && <Link to={appointmentPath} title={role === "student" ? "Book an appointment" : "View appointments"} aria-label={role === "student" ? "Book an appointment" : "View appointments"}><MessagingIcon name="calendar" /></Link>}
                  <button type="button" title="Refresh conversation" aria-label="Refresh conversation" onClick={() => { setInboxRefresh((value) => value + 1); setThreadRefresh((value) => value + 1); }}><MessagingIcon name="refresh" /></button>
                  <button type="button" title="Contact details" aria-label="Contact details" aria-expanded={showDetails} aria-controls="messaging-contact-profile" onClick={() => setShowDetails((current) => !current)}><MessagingIcon name="info" /></button>
                </div>
              </header>
              {threadError && (
                <div className="messaging-error" role="alert">
                  {threadError}
                  <button type="button" onClick={() => setThreadRefresh((value) => value + 1)}>Retry conversation</button>
                </div>
              )}
              <div className="messaging-thread" ref={threadArea} onScroll={() => {
                const area = threadArea.current;
                if (area) followNewMessages.current = area.scrollHeight - area.scrollTop - area.clientHeight < 80;
              }}>
                {loadingThread && !activeConversation && <p role="status">Loading messages...</p>}
                {thread?.has_more && activeConversation && <button type="button" className="messaging-older" disabled={loadingOlder} onClick={loadOlder}>{loadingOlder ? "Loading..." : "Load older messages"}</button>}
                {activeConversation && thread?.messages.length === 0 && <p className="messaging-empty">No messages yet. Send the first message below.</p>}
                {activeConversation && thread?.messages.map((message, index, messages) => {
                  const isSent = message.sender_id === userId;
                  const previousDate = messages[index - 1]?.sent_at;
                  const showDate = message.sent_at && (!previousDate || messageDate(message.sent_at) !== messageDate(previousDate));
                  return (
                    <Fragment key={message.message_id}>
                      {showDate && <div className="messaging-date-divider"><span>{formatMessageDate(message.sent_at!)}</span></div>}
                      <div className={`messaging-message-row ${isSent ? "sent" : "received"}`}>
                        {!isSent && <span className="messaging-avatar messaging-message-avatar" title={message.sender_name}>{initials(message.sender_name)}</span>}
                        <div className="messaging-message-content">
                          <div className="messaging-bubble"><p>{message.message_text}</p></div>
                          <div className="messaging-message-time">
                            <time>{formatTime(message.sent_at)}</time>
                            {isSent && <span className={`messaging-receipt ${message.is_read ? "is-read" : ""}`} title={message.is_read ? "Read" : "Sent"} aria-label={message.is_read ? "Read" : "Sent"}><MessagingIcon name="check" /></span>}
                          </div>
                        </div>
                      </div>
                    </Fragment>
                  );
                })}
              </div>
              <form className="messaging-composer" onSubmit={sendMessage}>
                <label className="messaging-sr-only" htmlFor="messaging-draft">Message {activeConversation?.contact_name || recipientLabel}</label>
                <div className="messaging-composer-controls">
                  <div className="messaging-input-wrap">
                    <textarea id="messaging-draft" ref={draftInput} rows={1} maxLength={5000} value={draft} disabled={sending || !activeConversation?.contact_active} placeholder={activeConversation?.contact_active === false ? "Recipient unavailable" : "Type a message..."} onChange={(event) => {
                      setDrafts((current) => ({ ...current, [activeId]: event.target.value }));
                      setSendError("");
                      setSendStatus("");
                    }} onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                        event.preventDefault();
                        event.currentTarget.form?.requestSubmit();
                      }
                    }} />
                    <button className="messaging-emoji-button" type="button" aria-label="Choose an emoji" aria-expanded={showEmoji} disabled={sending || !activeConversation?.contact_active} onClick={() => setShowEmoji((current) => !current)}><MessagingIcon name="smile" /></button>
                  </div>
                  <button className="messaging-primary messaging-send-button" type="submit" title="Send message" aria-label={sending ? "Sending message" : "Send message"} disabled={sending || !draft.trim() || !activeConversation?.contact_active}><MessagingIcon name="send" /></button>
                </div>
                {showEmoji && <div className="messaging-emoji-picker" aria-label="Choose an emoji">{["😊", "👋", "🙏", "👍", "🎓", "📅"].map((emoji) => <button key={emoji} type="button" aria-label={`Insert ${emoji}`} disabled={sending || draft.length + emoji.length > 5000} onClick={() => {
                  setDrafts((current) => ({ ...current, [activeId]: `${current[activeId] || ""}${emoji}` }));
                  setShowEmoji(false);
                  draftInput.current?.focus();
                }}>{emoji}</button>)}</div>}
                {sendError && <p className="messaging-error" role="alert">{sendError}</p>}
                <div className="messaging-composer-hint"><span>Enter to send · Shift + Enter for a new line</span><span role="status">{sendStatus || `${draft.length}/5000`}</span></div>
              </form>
            </>
          )}
        </article>

        {showDetails && (
          <aside id="messaging-contact-profile" className="messaging-contact-profile" aria-label="Contact profile">
            {activeConversation ? (
              <>
                <div className="messaging-profile-heading">
                  <span className="messaging-avatar messaging-profile-avatar">{initials(activeConversation.contact_name)}</span>
                  <div>
                    <h2>{activeConversation.contact_name}</h2>
                    <p>{contactTitle}</p>
                    <span className={`messaging-account-status ${activeConversation.contact_active ? "available" : "unavailable"}`}><i />{activeConversation.contact_active ? "Available to message" : "Unavailable"}</span>
                  </div>
                </div>
                <div className="messaging-profile-about">
                  <h3>About {activeConversation.contact_role === "advisor" ? "Advisor" : "Student"}</h3>
                  <ul>{profileItems.filter((item) => item.text).map((item) => <li key={item.icon}><MessagingIcon name={item.icon} /><span>{item.text}</span></li>)}</ul>
                  {!profileItems.some((item) => item.text) && <p>Academic profile details have not been added yet.</p>}
                  <Link className="messaging-appointment-link" to={appointmentPath}><MessagingIcon name="calendar" />{role === "student" ? "Book an Appointment" : "View Appointments"}</Link>
                </div>
              </>
            ) : (
              <div className="messaging-profile-placeholder">
                <span className="messaging-avatar messaging-profile-avatar"><MessagingIcon name="graduation" /></span>
                <h3>Your {recipientLabel} at a glance</h3>
                <p>Select a conversation to see their profile and appointment options.</p>
              </div>
            )}
            <svg className="messaging-profile-waves" viewBox="0 0 320 270" preserveAspectRatio="none" fill="none" aria-hidden="true">
              <path d="M0 95C70 100 95 10 195 35C250 48 288 30 320 40V270H0Z" fill="#F0E9FF" />
              <path d="M0 80C80 35 115 170 210 125C260 95 290 100 320 115V270H0Z" fill="#E6D9FF" opacity=".8" />
              <path d="M0 190C100 235 138 80 240 100C280 100 310 120 320 130V270H0Z" fill="#D5C2FF" opacity=".65" />
            </svg>
          </aside>
        )}
      </div>
    </section>
  );
}
export default MessagingInbox;
