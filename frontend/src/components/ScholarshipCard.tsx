import type { KeyboardEvent } from "react";
import ReminderBell from "./ReminderBell";

export type Scholarship = {
  scholarship_id: number;
  title: string;
  organization_name?: string | null;
  description?: string | null;
  eligibility_criteria?: string | null;
  deadline?: string | null;
  deadline_date?: string | null;
  amount?: number | string | null;
  status?: string | null;
  funding_type?: string | null;
  category?: string | null;
  study_level?: string | null;
  eligible_state?: string | null;
  study_levels?: string[] | null;
  eligible_states?: string[] | null;
  source_url?: string | null;
  deadline_note?: string | null;
  amount_note?: string | null;
  intake_status?: string | null;
  external_listing?: boolean;
  import_notes?: string[];
  application_id?: number | null;
  application_status?: string | null;
  saved: boolean;
  tags: string[];
};

type ScholarshipCardProps = {
  scholarship: Scholarship;
  isSaving?: boolean;
  onToggleSaved: (scholarship: Scholarship) => void;
  onViewDetails: (scholarship: Scholarship) => void;
  reminderEnabled?: boolean;
  isUpdatingReminder?: boolean;
  onToggleReminder?: (scholarship: Scholarship) => void;
};

function ScholarshipCard({ scholarship, isSaving = false, onToggleSaved, onViewDetails, reminderEnabled = false, isUpdatingReminder = false, onToggleReminder }: ScholarshipCardProps) {
  function handleCardKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onViewDetails(scholarship);
    }
  }

  return (
    <article
      className="scholarship-card"
      role="button"
      tabIndex={0}
      onClick={() => onViewDetails(scholarship)}
      onKeyDown={handleCardKeyDown}
      aria-label={`View details for ${scholarship.title}`}
    >
      <div className="card-top">
        <span className="match listing-status">{scholarship.intake_status === "closed" ? "Closed intake"
          : scholarship.intake_status === "unconfirmed" ? "Check official source" : scholarship.status || "Available"}</span>
        <div className="scholarship-card-actions"><button
          type="button"
          className={`scholarship-save-button${scholarship.saved ? " is-saved" : ""}`}
          aria-label={`${scholarship.saved ? "Remove" : "Save"} ${scholarship.title}`}
          aria-pressed={scholarship.saved}
          disabled={isSaving}
          onClick={(event) => {
            event.stopPropagation();
            onToggleSaved(scholarship);
          }}
        >
          {scholarship.saved ? "♥" : "♡"}
        </button>
        {onToggleReminder && <button type="button"
          className={`scholarship-reminder-button${reminderEnabled ? " is-enabled" : ""}`}
          aria-label={`${reminderEnabled ? "Turn off" : "Enable"} deadline reminder for ${scholarship.title}`}
          aria-pressed={reminderEnabled}
          title={reminderEnabled ? "Reminder on: alerts begin 3 days before the deadline" : "Remind me 3 days before the deadline"}
          disabled={isUpdatingReminder || (!reminderEnabled && (!scholarship.deadline_date || scholarship.intake_status === "closed"))}
          onClick={(event) => { event.stopPropagation(); onToggleReminder(scholarship); }}>
          <ReminderBell />
        </button>}
        </div>
      </div>

      <div className="scholarship-main">
        <div className="crest crest-listing" aria-hidden="true"></div>
        <div>
          <h3>{scholarship.title}</h3>
          <p>{scholarship.organization_name || "ScholarOne Partner"}</p>
        </div>
      </div>

      <div className="pill-row">
        {scholarship.tags.map((tag) => (
          <span key={tag}>{tag}</span>
        ))}
      </div>

      <footer>
        <small>Deadline: {scholarship.deadline || "Not confirmed"}</small>
        <strong>{scholarship.amount_note ? scholarship.amount_note.length > 70 ? "See funding details" : scholarship.amount_note : scholarship.amount ? `RM ${scholarship.amount}` : "Amount TBA"}</strong>
      </footer>
      {scholarship.deadline_note && <p className="scholarship-source-note">{scholarship.deadline_note}</p>}

      <span className="scholarship-card-hint">View full details</span>
    </article>
  );
}

export default ScholarshipCard;
