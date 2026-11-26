import Icon from "../../components/advisor/AdvisorIcon";
import "../../styles/student-scholarships.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import api from "../../api/axios";
import ScholarshipCard, { type Scholarship } from "../../components/ScholarshipCard";
import ScholarshipDetailSections, { PublishedFunding } from "../../components/ScholarshipDetailSections";
import ScholarshipEligibility from "../../components/ScholarshipEligibility";
import { deadlinePresentation } from "../../utils/scholarshipDetails";
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
  opening_date?: string | null;
  deadline_at?: string | null;
  amount?: number | string | null;
  funding_type?: string | null;
  category?: string | null;
  study_level?: string | null;
  eligible_state?: string | null;
  study_levels?: string[] | null;
  eligible_states?: string[] | null;
  source_url?: string | null;
  application_url?: string | null;
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
  scholarship_title?: string | null;
  organization_name?: string | null;
  listing_published?: boolean;
};

type ApplicationNotice = {
  type: "success" | "error";
  message: string;
};

function formatDate(date?: string | null) {
  if (!date) return null;
  return new Intl.DateTimeFormat("en-MY", {
    day: "numeric",
    timeZone: "Asia/Kuala_Lumpur",
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
    opening_date: scholarship.opening_date,
    deadline_date: scholarship.deadline,
    deadline_at: scholarship.deadline_at,
    amount: scholarship.amount,
    status: scholarship.status,
    funding_type: scholarship.funding_type,
    category: scholarship.category,
    study_level: scholarship.study_level,
    eligible_state: scholarship.eligible_state,
    study_levels: scholarship.study_levels,
    eligible_states: scholarship.eligible_states,
    source_url: scholarship.source_url,
    application_url: scholarship.application_url,
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
  const [catalogue, setCatalogue] = useState<Scholarship[]>([]);
  const [selectedListing, setSelectedListing] = useState<Scholarship | null>(null);
  const [savedIds, setSavedIds] = useState<Set<number> | null>(null);
  const [applications, setApplications] = useState<ApiApplication[] | null>(null);
  const [savedError, setSavedError] = useState(false);
  const [applicationsError, setApplicationsError] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const detailsRequest = useRef(0);
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get("q") || "";
  const listingId = Number(searchParams.get("listing"));
  const savedView = searchParams.get("view") === "saved";
  const applicationsView = searchParams.get("view") === "applications";
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

  useEffect(() => () => { detailsRequest.current += 1; }, []);

  useEffect(() => {
    const controller = new AbortController();
    const options = { signal: controller.signal, timeout: 15000 };
    api.get<ApiScholarship[]>("/scholarships", options)
      .then(({ data }) => { if (!controller.signal.aborted) setCatalogue(data.map(toScholarshipCard)); })
      .catch(() => { if (!controller.signal.aborted) setError("Unable to load scholarships right now."); })
      .finally(() => { if (!controller.signal.aborted) setIsLoading(false); });

    if (studentId) {
      api.get<ApiScholarship[]>(`/students/${studentId}/saved-scholarships`, options)
        .then(({ data }) => { if (!controller.signal.aborted) setSavedIds(new Set(data.map(item => item.scholarship_id))); })
        .catch(() => { if (!controller.signal.aborted) setSavedError(true); });
      api.get<ApiApplication[]>(`/applications/student/${studentId}`, options)
        .then(({ data }) => {
          if (!controller.signal.aborted) setApplications(data);
        })
        .catch(() => { if (!controller.signal.aborted) setApplicationsError(true); });
    }
    return () => controller.abort();
  }, [studentId]);

  const latestApplications = new Map<number, ApiApplication>();
  for (const application of applications ?? []) {
    if (!latestApplications.has(application.scholarship_id)) latestApplications.set(application.scholarship_id, application);
  }
  function withStudentState(listing: Scholarship): Scholarship {
    const application = latestApplications.get(listing.scholarship_id);
    return {
      ...listing,
      saved: savedIds?.has(listing.scholarship_id) ?? false,
      application_id: application?.application_id ?? null,
      application_status: application?.application_status ?? (application ? "pending" : null),
    };
  }

  const scholarships = catalogue.map(withStudentState);
  const selectedScholarship = selectedListing ? withStudentState(selectedListing) : null;

  const savedCount = scholarships.filter((scholarship) => scholarship.saved).length;
  const waitingForFavourites = savedView && !savedIds && !savedError;
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
    setSavedIds(current => {
      const next = new Set(current);
      if (saved) next.add(scholarshipId);
      else next.delete(scholarshipId);
      return next;
    });
  }

  function updateApplicationState(application: ApiApplication, listing: Scholarship) {
    setApplications(current => [{
      scholarship_title: listing.title, organization_name: listing.organization_name, listing_published: true, ...application,
    }, ...(current ?? []).filter(item => item.application_id !== application.application_id)]);
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
      updateApplicationState(response.data.application, scholarship);
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
        updateApplicationState(response.data.application, scholarship);
        setApplicationNotice({
          type: "success",
          message: "You have already applied for this scholarship.",
        });
      } else {
        setApplicationNotice({
          type: "error",
          message: getApiErrorMessage(err, "Unable to submit your application right now."),
        });
      }
    } finally {
      setApplyingId(null);
    }
  }

  const openDetails = useCallback(async (scholarshipId: number) => {
    const requestId = ++detailsRequest.current;
    setSelectedListing(null);
    setDetailsLoading(true);
    setError("");
    setApplicationNotice(null);

    try {
      const response = await api.get<ApiScholarship>(`/scholarships/${scholarshipId}`);
      if (requestId !== detailsRequest.current) return;
      const fresh = toScholarshipCard(response.data);
      setSelectedListing(fresh);
      void api.post(`/scholarships/${fresh.scholarship_id}/view`).catch(() => {});
      setCatalogue(current => current.map(item => item.scholarship_id === fresh.scholarship_id ? fresh : item));
    } catch (err) {
      if (requestId !== detailsRequest.current) return;
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 404 || status === 410) {
        setCatalogue(current => current.filter(item => item.scholarship_id !== scholarshipId));
        setError("This scholarship is no longer available. The listing has been removed from your results.");
        try {
          const response = await api.get<ApiScholarship[]>("/scholarships");
          if (requestId !== detailsRequest.current) return;
          setCatalogue(response.data.filter(item => item.scholarship_id !== scholarshipId).map(toScholarshipCard));
        } catch {
          // Keep the unavailable record removed even when refreshing fails.
        }
      } else {
        setError("Unable to load current scholarship details. Please try again. Previously loaded details will not be shown.");
      }
    } finally {
      if (requestId === detailsRequest.current) setDetailsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (Number.isSafeInteger(listingId) && listingId > 0) void openDetails(listingId);
  }, [listingId, openDetails]);

  function clearDetails() {
    detailsRequest.current += 1;
    setSelectedListing(null);
    setDetailsLoading(false);
  }

  function closeDetails() {
    clearDetails();
    if (searchParams.has("listing")) {
      const next = new URLSearchParams(searchParams);
      next.delete("listing");
      setSearchParams(next, { replace: true });
    }
  }

  return (
    <section className="student-scholarships">
      <header className="sh-hero"><div className="sh-hero-copy"><p className="sh-eyebrow"><Icon name="graduation" />Scholarship Search</p><h1>Scholarships<span aria-hidden="true">✦</span></h1><p>Search and filter scholarship opportunities available in ScholarOne based on your eligibility and study goals.</p></div><img className="sh-hero-art" src="/images/student-scholarships-hero.png" alt="" /></header>

      <nav className="sh-views" aria-label="Scholarship collection">
        <button type="button" aria-pressed={!savedView && !applicationsView} onClick={() => { const next = new URLSearchParams(searchParams); next.delete("view"); setSearchParams(next); }}><Icon name="graduation" />All Scholarships <span>{isLoading ? "…" : scholarships.length}</span></button>
        <button type="button" aria-pressed={savedView} onClick={() => { const next = new URLSearchParams(searchParams); next.set("view", "saved"); setSearchParams(next); }}><Icon name="heart" />Saved Scholarships {!savedError && <span>{isLoading || !savedIds ? "…" : savedCount}</span>}</button>
        <button type="button" aria-pressed={applicationsView} onClick={() => { clearDetails(); setSearchParams({ view: "applications" }); }}>Application History</button>
      </nav>
      {applicationsView ? (
        <section aria-labelledby="scholarship-history-heading">
          <h2 id="scholarship-history-heading">Application History</h2>
          {applicationsError ? <p role="alert">Unable to load your application history. Refresh the page to try again.</p>
            : !applications ? <p role="status">Loading application history…</p>
            : !applications.length ? <p>You haven’t submitted any applications yet.</p>
            : <div className="scholarship-grid module-scholarship-grid">
              {applications.map(application => (
                <article className="dashboard-message" key={application.application_id}>
                  <h3>{application.scholarship_title || `Scholarship #${application.scholarship_id}`}</h3>
                  {application.organization_name && <p>{application.organization_name}</p>}
                  <p>{getApplicationStatusLabel(application.application_status || "pending")} · Application #{application.application_id}</p>
                  {application.application_date && <p>Submitted {formatDate(application.application_date)}</p>}
                  {application.remarks && <p>{application.remarks}</p>}
                  {application.listing_published
                    ? <Link to={`/scholarships?q=${encodeURIComponent(application.scholarship_title || "")}`}>Find listing</Link>
                    : <p>Listing currently unavailable</p>}
                </article>
              ))}
            </div>}
        </section>
      ) : <>
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

      <div className="sh-results-bar"><p role="status">{isLoading ? "Loading opportunities…" : waitingForFavourites ? "Loading favourites…" : savedView && savedError ? "Saved scholarships unavailable" : `Showing ${filteredScholarships.length} of ${visibleScholarships.length} ${savedView ? "saved scholarships" : "financial aid opportunities"}`}{query && <> matching “{query}” <button type="button" onClick={() => { const next = new URLSearchParams(searchParams); next.delete("q"); setSearchParams(next); }}>Clear search</button></>}</p><label>Sort by:<select value={sort} onChange={event => setSort(event.target.value)}><option value="latest">Latest</option><option value="deadline">Nearest deadline</option><option value="title">Name A–Z</option></select></label></div>
      {savedError && <p className="dashboard-message error" role="status">Unable to load your favourites. Refresh the page to try again.</p>}
      {applicationsError && <p className="dashboard-message error" role="status">Unable to load your application history. Refresh the page to try again.</p>}
      {reminderNotice && <p className="scholarship-reminder-notice" role="status">{reminderNotice}</p>}
      {detailsLoading && <p className="dashboard-message" role="status">Checking current scholarship details…</p>}
      {remindersError && <p className="dashboard-message error">{remindersError}</p>}
      <section className="scholarship-grid module-scholarship-grid">
        {isLoading && <p className="dashboard-message">Loading scholarships...</p>}
        {error && <p className="dashboard-message error">{error}</p>}
        {filteredScholarships.map((scholarship) => (
          <ScholarshipCard
            variant="search"
            scholarship={scholarship}
            key={scholarship.scholarship_id}
            isSaving={!savedIds || savingId !== null}
            onToggleSaved={handleToggleSaved}
            onViewDetails={scholarship => { void openDetails(scholarship.scholarship_id); }}
            reminderEnabled={reminders.some((reminder) => reminder.scholarship_id === scholarship.scholarship_id)}
            isUpdatingReminder={reminderSavingId !== null}
            onToggleReminder={handleToggleReminder}
          />
        ))}
        {!isLoading && !error && (!savedView || savedIds) && filteredScholarships.length === 0 && (
          <div className="dashboard-message sh-empty">
            <Icon name={savedView ? "heart" : "search"} />
            <h2>{savedView && savedCount === 0 ? "No saved scholarships yet" : "No scholarships found"}</h2>
            <p>{savedView && savedCount === 0 ? "Tap the heart on any scholarship to keep it here for later." : scholarships.length === 0 ? "No financial aid opportunities have been added yet. Approved listings will appear here." : "No scholarships match your selected filters and search."}</p>
            {savedView && savedCount === 0 ? <button type="button" className="ss-button" onClick={() => { setAidFilter("all"); setLevelFilter("all"); setStateFilter("all"); setSearchParams({}); }}>Browse Scholarships</button> : scholarships.length > 0 && <button type="button" className="ss-button" onClick={clearFilters}>Clear Filters</button>}
          </div>
        )}
      </section>

      </>}
      {!applicationsView && selectedScholarship && (
        <div
          className="scholarship-detail-backdrop"
          role="presentation"
          onClick={closeDetails}
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
              onClick={closeDetails}
            >
              ×
            </button>

            <div className="scholarship-detail-header">
              <span className={`match listing-status${selectedScholarship.intake_status === "closed" ? " is-closed" : ""}`}>{selectedScholarship.intake_status === "closed" ? "Closed" : selectedScholarship.intake_status === "unconfirmed" ? "Check official source" : selectedScholarship.status || "Available"}</span>
              <h2 id="scholarship-detail-title">{selectedScholarship.title}</h2>
              <p>{selectedScholarship.organization_name || "ScholarOne Partner"}</p>
              <div className="pill-row">
                {selectedScholarship.tags.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
            </div>

            <div className="scholarship-detail-grid">
              {selectedScholarship.opening_date && <div>
                <span>Application opening date</span>
                <strong>{formatDate(selectedScholarship.opening_date)}</strong>
              </div>}
              <div>
                <span>Deadline</span>
                <strong>{deadlinePresentation(selectedScholarship).label}</strong>
                {selectedScholarship.deadline_note && <p>{deadlinePresentation(selectedScholarship).note}</p>}
              </div>
              <div>
                <span>Funding type</span>
                <strong>{selectedScholarship.funding_type || "Scholarship"}</strong>
              </div>
            </div>

            <section className="scholarship-detail-section">
              <h3>Funding Information</h3>
              <PublishedFunding note={selectedScholarship.amount_note} amount={selectedScholarship.amount} />
              {selectedScholarship.import_notes?.map((note) => <p key={note}>{note}</p>)}
            </section>

            <ScholarshipDetailSections scholarship={selectedScholarship} />
            <ScholarshipEligibility key={selectedScholarship.scholarship_id} scholarshipId={selectedScholarship.scholarship_id} />

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
                  selectedScholarship.intake_status === "closed" ||
                  Boolean(selectedScholarship.application_status) ||
                  (!applications && !applicationsError) ||
                  applyingId !== null
                }
                onClick={() => handleApplyScholarship(selectedScholarship)}
              >
                {selectedScholarship.intake_status === "closed" ? "Applications Closed" : selectedScholarship.application_status
                  ? `Applied: ${getApplicationStatusLabel(selectedScholarship.application_status)}`
                  : applyingId === selectedScholarship.scholarship_id
                    ? "Submitting..."
                    : "Apply for Scholarship"}
              </button>}
              <button
                type="button"
                className={`scholarship-detail-save${selectedScholarship.saved ? " is-saved" : ""}`}
                disabled={!savedIds || savingId !== null}
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
