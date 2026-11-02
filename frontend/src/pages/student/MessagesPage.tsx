function MessagesPage() {
  return (
    <section className="messages-page">
      <header className="messages-hero">
        <div>
          <p className="module-eyebrow">Communication</p>
          <h1>Messages</h1>
          <span>Receive advisor guidance, consultation updates, and scholarship-related conversations.</span>
        </div>
        <button type="button" disabled>
          New Message
        </button>
      </header>

      <section className="message-summary-grid">
        <article>
          <span>Unread messages</span>
          <strong>0</strong>
        </article>
        <article>
          <span>Advisor conversations</span>
          <strong>Not active</strong>
        </article>
        <article>
          <span>Inbox status</span>
          <strong>Waiting setup</strong>
        </article>
      </section>

      <section className="messages-layout">
        <aside className="conversation-panel">
          <div className="message-panel-heading">
            <h2>Inbox</h2>
            <p>Advisor messages will appear here once the Academic Advisor module is available.</p>
          </div>

          <article className="conversation-item active">
            <div className="conversation-avatar">AO</div>
            <div>
              <h3>Advisor Office</h3>
              <p>Messaging setup pending</p>
            </div>
            <span>System</span>
          </article>
        </aside>

        <article className="message-thread-panel">
          <div className="thread-header">
            <div className="conversation-avatar large">AO</div>
            <div>
              <h2>Academic Advisor Messages</h2>
              <p>Future advisor communication channel</p>
            </div>
          </div>

          <div className="message-empty-state">
            <div aria-hidden="true">✉</div>
            <h3>Advisor messaging is not active yet</h3>
            <p>
              Messages will be connected to Academic Advisor profiles and consultation bookings after the advisor module
              is built. For now, this page is prepared as the student inbox interface.
            </p>
          </div>

          <div className="message-composer disabled">
            <input disabled placeholder="You can reply here once advisor messaging is enabled." />
            <button type="button" disabled>
              Send
            </button>
          </div>
        </article>
      </section>
    </section>
  );
}

export default MessagesPage;
