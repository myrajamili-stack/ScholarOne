import type { KeyboardEvent } from "react";

export type Scholarship = {
  scholarship_id: number;
  title: string;
  organization_name?: string | null;
  description?: string | null;
  eligibility_criteria?: string | null;
  deadline?: string | null;
  amount?: number | string | null;
  status?: string | null;
  funding_type?: string | null;
  category?: string | null;
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
};

function ScholarshipCard({ scholarship, isSaving = false, onToggleSaved, onViewDetails }: ScholarshipCardProps) {
  function handleCardKeyDown(event: KeyboardEvent<HTMLElement>) {
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
        <span className="match listing-status">{scholarship.status || "Available"}</span>
        <button
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
        <small>Deadline: {scholarship.deadline || "To be announced"}</small>
        <strong>{scholarship.amount ? `RM ${scholarship.amount}` : "Amount TBA"}</strong>
      </footer>

      <span className="scholarship-card-hint">View full details</span>
    </article>
  );
}

export default ScholarshipCard;
