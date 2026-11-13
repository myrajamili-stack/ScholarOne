import Icon from "../../components/advisor/AdvisorIcon";
import "../../styles/student-scholarships.css";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api from "../../api/axios";
import ScholarshipCard, { type Scholarship } from "../../components/ScholarshipCard";
import { getStoredUser } from "../../utils/authStorage";
import { useScholarshipReminders } from "../../context/ScholarshipRemindersContext";
import { getApiErrorMessage } from "../../utils/apiError";
import { eligibilityStates, financialAidTypes, matchesFinancialAid, studyLevels, type FinancialAidFilter } from "../../utils/financialAid";

type ApiScholarship = {
  scholarship_id: number;
  title: string;
  organization_name?: string | null;
  description?: string | null;
  eligibility_criteria?: string | null;
  deadline?: string | null;
  amount?: number | string | null;
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
  status?: string | null;
  created_at?: string | null;
};

type ApiApplication = {
  application_id: number;
  student_id: number;
  scholarship_id: number;
  application_date?: string | null;
  application_status?: string | null;
  remarks?: string | null;
};

type ApplicationNotice = {
  type: "success" | "error";
  message: string;
};

function formatDate(date?: string | null) {
  if (!date) return null;
  return new Intl.DateTimeFormat("en-MY", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(date));
}

function toScholarshipCard(scholarship: ApiScholarship): Scholarship {
  return {
    scholarship_id: scholarship.scholarship_id,
    created_at: scholarship.created_at,
    title: scholarship.title,
    organization_name: scholarship.organization_name,
    description: scholarship.description,
    eligibility_criteria: scholarship.eligibility_criteria,
    deadline: formatDate(scholarship.deadline),
    deadline_date: scholarship.deadline,
    amount: scholarship.amount,
    status: scholarship.status,
    funding_type: scholarship.funding_type,
    category: scholarship.category,
    study_level: scholarship.study_level,
    eligible_state: scholarship.eligible_state,
    study_levels: scholarship.study_levels,
    eligible_states: scholarship.eligible_states,
    source_url: scholarship.source_url,
    deadline_note: scholarship.deadline_note,
    amount_note: scholarship.amount_note,
    intake_status: scholarship.intake_status,
    external_listing: scholarship.external_listing,
    import_notes: scholarship.import_notes,
    saved: false,
    tags: [...(scholarship.study_levels?.length ? scholarship.study_levels : [scholarship.study_level || scholarship.category || "Study level not specified"]), scholarship.funding_type || "Scholarship"],
  };
}

function getApplicationStatusLabel(status?: string | null) {
  if (!status) return "";
  return status.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function ScholarshipsPage() {
  const [scholarships, setScholarships] = useState<Scholarship[]>([]);
  const [selectedScholarship, setSelectedScholarship] = useState<Scholarship | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get("q") || "";
  const savedView = searchParams.get("view") === "saved";
  const [sort, setSort] = useState("latest");
  const [aidFilter, setAidFilter] = useState<FinancialAidFilter>("all");
  const [levelFilter, setLevelFilter] = useState("all");
  const [stateFilter, setStateFilter] = useState("all");
  const [isLoading, setIsLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [reminderSavingId, setReminderSavingId] = useState<number | null>(null);
  const [reminderNotice, setReminderNotice] = useState("");
  const { reminders, toggleReminder, error: remindersError } = useScholarshipReminders();
  const [applyingId, setApplyingId] = useState<number | null>(null);
  const [applicationNotice, setApplicationNotice] = useState<ApplicationNotice | null>(null);
  const [error, setError] = useState("");
  const storedUser = getStoredUser();
  const studentId = storedUser?.role === "student" ? storedUser.user_id : null;

  useEffect(() => {
    async function loadScholarships() {
      try {
        const [scholarshipsResponse, savedResponse, applicationsResponse] = await Promise.all([
          api.get<ApiScholarship[]>("/scholarships"),
          studentId
            ? api.get<ApiScholarship[]>(`/students/${studentId}/saved-scholarships`)
            : Promise.resolve({ data: [] as ApiScholarship[] }),
          studentId
            ? api.get<ApiApplication[]>(`/applications/student/${studentId}`)
            : Promise.resolve({ data: [] as ApiApplication[] }),
        ]);
        const savedIds = new Set(savedResponse.data.map((scholarship) => scholarship.scholarship_id));
        const applicationsByScholarship = new Map(
          applicationsResponse.data.map((application) => [application.scholarship_id, application]),
        );
        setScholarships(
          scholarshipsResponse.data.map((scholarship) => {
            const application = applicationsByScholarship.get(scholarship.scholarship_id);

            return {
              ...toScholarshipCard(scholarship),
              saved: savedIds.has(scholarship.scholarship_id),
              application_id: application?.application_id ?? null,
              application_status: application?.application_status ?? null,
            };
          }),
        );
      } catch {
        setError("Unable to load scholarships right now.");
      } finally {
        setIsLoading(false);
      }
    }

    loadScholarships();
  }, [studentId]);

  const savedCount = scholarships.filter((scholarship) => scholarship.saved).length;
  const visibleScholarships = savedView ? scholarships.filter((scholarship) => scholarship.saved) : scholarships;
  const filteredScholarships = visibleScholarships.filter((scholarship) =>
    matchesFinancialAid(scholarship, aidFilter, query, levelFilter, stateFilter)
  ).sort((a, b) => {
    if (sort === "title") return a.title.localeCompare(b.title);
    if (sort === "deadline") return (a.deadline_date ? Date.parse(a.deadline_date) : Infinity) - (b.deadline_date ? Date.parse(b.deadline_date) : Infinity);
    return (Date.parse(b.created_at || "") || 0) - (Date.parse(a.created_at || "") || 0) || b.scholarship_id - a.scholarship_id;
  });

  function clearFilters() {
    setAidFilter("all"); setLevelFilter("all"); setStateFilter("all"); setSearchParams(savedView ? { view: "saved" } : {});
  }

  async function handleToggleReminder(scholarship: Scholarship) {
    const enabled = reminders.some((reminder) => reminder.scholarship_id === scholarship.scholarship_id);
    setReminderSavingId(scholarship.scholarship_id);
    setReminderNotice("");
    setError("");
    try {
      await toggleReminder(scholarship.scholarship_id, !enabled);
      setReminderNotice(enabled ? "Reminder turned off and removed from your reminders and calendar."
        : "Reminder enabled. You will receive an in-app alert within 3 days of the deadline. Your calendar and reminders are updated.");
    } catch (error) {
      setError(getApiErrorMessage(error, "Unable to update the deadline reminder. Please try again."));
    } finally {
      setReminderSavingId(null);
    }
  }

  function updateSavedState(scholarshipId: number, saved: boolean) {
    setScholarships((currentScholarships) =>
      currentScholarships.map((scholarship) =>
        scholarship.scholarship_id === scholarshipId ? { ...scholarship, saved } : scholarship,
      ),
    );
    setSelectedScholarship((currentScholarship) =>
      currentScholarship?.scholarship_id === scholarshipId ? { ...currentScholarship, saved } : currentScholarship,
    );
  }

  function updateApplicationState(application: ApiApplication) {
    setScholarships((currentScholarships) =>
      currentScholarships.map((scholarship) =>
        scholarship.scholarship_id === application.scholarship_id
          ? {
              ...scholarship,
              application_id: application.application_id,
              application_status: application.application_status || "pending",
            }
          : scholarship,
      ),
    );
    setSelectedScholarship((currentScholarship) =>
      currentScholarship?.scholarship_id === application.scholarship_id
        ? {
            ...currentScholarship,
            application_id: application.application_id,
            application_status: application.application_status || "pending",
          }
        : currentScholarship,
    );
  }

  async function handleToggleSaved(scholarship: Scholarship) {
    if (!studentId) {
      setError("Please log in as a student to save scholarships.");
      return;
    }

    setError("");
    setSavingId(scholarship.scholarship_id);

    try {
      if (scholarship.saved) {
        await api.delete(`/students/${studentId}/saved-scholarships/${scholarship.scholarship_id}`);
        updateSavedState(scholarship.scholarship_id, false);
      } else {
        await api.post(`/students/${studentId}/saved-scholarships/${scholarship.scholarship_id}`);
        updateSavedState(scholarship.scholarship_id, true);
      }
    } catch {
      setError("Unable to update saved scholarships right now.");
    } finally {
      setSavingId(null);
    }
  }

  async function handleApplyScholarship(scholarship: Scholarship) {
    if (!studentId) {
      setApplicationNotice({
        type: "error",
        message: "Please log in as a student before applying for a scholarship.",
      });
      return;
    }

    setApplicationNotice(null);
    setApplyingId(scholarship.scholarship_id);

    try {
      const response = await api.post<{ message: string; application: ApiApplication }>("/applications", {
        student_id: studentId,
        scholarship_id: scholarship.scholarship_id,
      });
      updateApplicationState(response.data.application);
      setApplicationNotice({
        type: "success",
        message: "Application submitted. Your status is now pending review.",
      });
    } catch (err) {
      const response =
        typeof err === "object" && err !== null && "response" in err
          ? (err as {
              response?: {
                status?: number;
                data?: { message?: string; application?: ApiApplication };
              };
            }).response
          : undefined;

      if (response?.status === 409 && response.data?.application) {
        updateApplicationState(response.data.application);
        setApplicationNotice({
          type: "success",
          message: "You have already applied for this scholarship.",
        });
      } else {
        setApplicationNotice({
          type: "error",
          message: response?.data?.message || "Unable to submit your application right now.",
        });
      }
    } finally {
      setApplyingId(null);
    }
  }

  async function handleViewDetails(scholarship: Scholarship) {
    setError("");
    setApplicationNotice(null);

    try {
      const response = await api.get<ApiScholarship>(`/scholarships/${scholarship.scholarship_id}`);
      setSelectedScholarship({
        ...toScholarshipCard(response.data),
        saved: scholarship.saved,
        application_id: scholarship.application_id,
        application_status: scholarship.application_status,
      });
    } catch {
      setSelectedScholarship(scholarship);
    }
  }

  return (
    <section className="student-scholarships">
      <header className="sh-hero"><div className="sh-hero-copy"><p className="sh-eyebrow"><Icon name="graduation" />Scholarship Search</p><h1>Scholarships<span aria-hidden="true">✦</span></h1><p>Search and filter scholarship opportunities available in ScholarOne based on your eligibility and study goals.</p></div><img className="sh-hero-art" src="/images/student-scholarships-hero.png" alt="" /></header>

      <nav className="sh-views" aria-label="Scholarship collection">
        <button type="button" aria-pressed={!savedView} onClick={() => { const next = new URLSearchParams(searchParams); next.delete("view"); setSearchParams(next); }}><Icon name="graduation" />All Scholarships <span>{isLoading ? "…" : scholarships.length}</span></button>
        <button type="button" aria-pressed={savedView} onClick={() => { const next = new URLSearchParams(searchParams); next.set("view", "saved"); setSearchParams(next); }}><Icon name="heart" />Saved Scholarships <span>{isLoading ? "…" : savedCount}</span></button>
      </nav>
      {savedView && <p className="sh-saved-intro">Your favourites, saved to your account. Select a heart again to remove a scholarship from this list.</p>}

      <div className="financial-aid-filter-bar">
        <div className="financial-aid-dropdowns" role="group" aria-label="Filter financial aid">
          <label><span><Icon name="layers" />Financial Aid Type / Jenis Bantuan</span>
            <select value={aidFilter} onChange={(event) => setAidFilter(event.target.value as FinancialAidFilter)}>
              <option value="all">All Financial Aid / Semua Bantuan</option>
              {financialAidTypes.map((type) => <option key={type.id} value={type.id}>{type.english} / {type.malay}</option>)}
            </select>
          </label>
          <label><span><Icon name="graduation" />Study Level / Peringkat Pengajian</span>
            <select value={levelFilter} onChange={(event) => setLevelFilter(event.target.value)}>
              <option value="all">All Study Levels</option>
              {studyLevels.map((level) => <option key={level} value={level}>{level === 'Postgraduate' ? 'Postgraduate (unspecified)' : level}</option>)}
            </select>
          </label>
          <label><span><Icon name="home" />State / Negeri</span>
            <select value={stateFilter} onChange={(event) => setStateFilter(event.target.value)}>
              <option value="all">All State</option>
              {eligibilityStates.map((state) => <option key={state} value={state}>{state}</option>)}
            </select>
          </label>
          <button className="financial-aid-clear" type="button" onClick={clearFilters}><Icon name="filter" />Clear Filters</button>
        </div>
        {stateFilter !== "all" && <p className="financial-aid-count">Some listings do not specify state eligibility. Select All State to include them.</p>}

      </div>

      <div className="sh-results-bar"><p role="status">{isLoading ? "Loading opportunities…" : `Showing ${filteredScholarships.length} of ${visibleScholarships.length} ${savedView ? "saved scholarships" : "financial aid opportunities"}`}{query && <> matching “{query}” <button type="button" onClick={() => { const next = new URLSearchParams(searchParams); next.delete("q"); setSearchParams(next); }}>Clear search</button></>}</p><label>Sort by:<select value={sort} onChange={event => setSort(event.target.value)}><option value="latest">Latest</option><option value="deadline">Nearest deadline</option><option value="title">Name A–Z</option></select></label></div>
      {reminderNotice && <p className="scholarship-reminder-notice" role="status">{reminderNotice}</p>}
      {remindersError && <p className="dashboard-message error">{remindersError}</p>}
      <section className="scholarship-grid module-scholarship-grid">
        {isLoading && <p className="dashboard-message">Loading scholarships...</p>}
        {error && <p className="dashboard-message error">{error}</p>}
        {filteredScholarships.map((scholarship) => (
          <ScholarshipCard
            variant="search"
            scholarship={scholarship}
            key={scholarship.scholarship_id}
            isSaving={savingId === scholarship.scholarship_id}
            onToggleSaved={handleToggleSaved}
            onViewDetails={handleViewDetails}
            reminderEnabled={reminders.some((reminder) => reminder.scholarship_id === scholarship.scholarship_id)}
            isUpdatingReminder={reminderSavingId !== null}
            onToggleReminder={handleToggleReminder}
          />
        ))}
        {!isLoading && !error && filteredScholarships.length === 0 && (
          <div className="dashboard-message sh-empty">
            <Icon name={savedView ? "heart" : "search"} />
            <h2>{savedView && savedCount === 0 ? "No saved scholarships yet" : "No scholarships found"}</h2>
            <p>{savedView && savedCount === 0 ? "Tap the heart on any scholarship to keep it here for later." : scholarships.length === 0 ? "No financial aid opportunities have been added yet. Approved listings will appear here." : "No scholarships match your selected filters and search."}</p>
            {savedView && savedCount === 0 ? <button type="button" className="ss-button" onClick={() => { setAidFilter("all"); setLevelFilter("all"); setStateFilter("all"); setSearchParams({}); }}>Browse Scholarships</button> : scholarships.length > 0 && <button type="button" className="ss-button" onClick={clearFilters}>Clear Filters</button>}
          </div>
        )}
      </section>

      {selectedScholarship && (
        <div
          className="scholarship-detail-backdrop"
          role="presentation"
          onClick={() => setSelectedScholarship(null)}
        >
          <article
            className="scholarship-detail-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="scholarship-detail-title"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="scholarship-detail-close"
              aria-label="Close scholarship details"
              onClick={() => setSelectedScholarship(null)}
            >
              ×
            </button>

            <div className="scholarship-detail-header">
              <span className="match listing-status">{selectedScholarship.intake_status === "closed" ? "Closed intake" : selectedScholarship.intake_status === "unconfirmed" ? "Check official source" : selectedScholarship.status || "Available"}</span>
              <h2 id="scholarship-detail-title">{selectedScholarship.title}</h2>
              <p>{selectedScholarship.organization_name || "ScholarOne Partner"}</p>
              <div className="pill-row">
                {selectedScholarship.tags.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
            </div>

            <div className="scholarship-detail-grid">
              <div>
                <span>Deadline</span>
                <strong>{selectedScholarship.deadline || "Not confirmed"}</strong>
                {selectedScholarship.deadline_note && <p>{selectedScholarship.deadline_note}</p>}
              </div>
              <div>
                <span>Funding amount</span>
                <strong>{selectedScholarship.amount_note ? selectedScholarship.amount_note.length > 70 ? "See funding details" : selectedScholarship.amount_note : selectedScholarship.amount ? `RM ${selectedScholarship.amount}` : "Amount TBA"}</strong>
              </div>
              <div>
                <span>Funding type</span>
                <strong>{selectedScholarship.funding_type || "Scholarship"}</strong>
              </div>
            </div>

            {selectedScholarship.external_listing && <section className="scholarship-detail-section">
              <h3>Published Funding Information</h3><p>{selectedScholarship.amount_note || "Funding amount not specified in the supplied document."}</p>
              <p>Imported from the supplied scholarship document. Confirm current availability and requirements with the official provider.</p>
              {selectedScholarship.import_notes?.map((note) => <p key={note}>{note}</p>)}
            </section>}

            <section className="scholarship-detail-section">
              <h3>Scholarship Description</h3>
              <p>
                {selectedScholarship.description ||
                  "No description has been added by the sponsorship provider yet."}
              </p>
            </section>

            <section className="scholarship-detail-section">
              <h3>Eligibility Criteria</h3>
              <p>
                {selectedScholarship.eligibility_criteria ||
                  "Eligibility criteria will be shown here once the provider adds it."}
              </p>
            </section>

            <div className="scholarship-detail-actions">
              {selectedScholarship.external_listing ? selectedScholarship.source_url
                ? <a className="scholarship-official-link" href={selectedScholarship.source_url} target="_blank" rel="noreferrer">Visit official source ↗</a>
                : <p>No source URL was supplied. Check with the programme provider.</p>
                : <button
                type="button"
                className={`scholarship-detail-apply${
                  selectedScholarship.application_status ? " is-applied" : ""
                }`}
                disabled={
                  Boolean(selectedScholarship.application_status) ||
                  applyingId === selectedScholarship.scholarship_id
                }
                onClick={() => handleApplyScholarship(selectedScholarship)}
              >
                {selectedScholarship.application_status
                  ? `Applied: ${getApplicationStatusLabel(selectedScholarship.application_status)}`
                  : applyingId === selectedScholarship.scholarship_id
                    ? "Submitting..."
                    : "Apply for Scholarship"}
              </button>}
              <button
                type="button"
                className={`scholarship-detail-save${selectedScholarship.saved ? " is-saved" : ""}`}
                disabled={savingId === selectedScholarship.scholarship_id}
                onClick={() => handleToggleSaved(selectedScholarship)}
              >
                {selectedScholarship.saved ? "Saved to Favourites" : "Save to Favourites"}
              </button>
            </div>
            {applicationNotice && (
              <p className={`scholarship-application-notice ${applicationNotice.type}`}>
                {applicationNotice.message}
              </p>
            )}
          </article>
        </div>
      )}
    </section>
  );
}

export default ScholarshipsPage;
