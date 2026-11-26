import Icon from "../../components/advisor/AdvisorIcon";
import { useEffect, useRef, useState } from "react";
import "../../styles/sponsor-submission.css";
import type { FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import api from "../../api/axios";
import { getApiErrorMessage } from "../../utils/apiError";
import { getStoredUser } from "../../utils/authStorage";
import { eligibilityStates, studyLevels, financialAidTypes } from "../../utils/financialAid";

type ScholarshipForm = {
  title: string;
  category: string;
  study_level: string;
  eligible_state: string;
  funding_type: string;
  amount: string;
  deadline: string;
  opening_date: string;
  deadline_time: string;
  source_url: string;
  description: string;
  eligibility_criteria: string;
  minimum_cgpa: string;
  maximum_income: string;
  amount_note: string;
  deadline_status: string;
  deadline_note: string;
  application_url: string;
  residency_requirements: string;
  funding_details: string;
  application_method: string;
  repayment_conditions: string;
  additional_information: string;
};

const initialForm: ScholarshipForm = {
  title: "",
  category: "",
  study_level: "",
  eligible_state: "",
  funding_type: "",
  amount: "",
  deadline: "",
  opening_date: "",
  deadline_time: "",
  source_url: "",
  description: "",
  eligibility_criteria: "",
  minimum_cgpa: "",
  maximum_income: "",
  amount_note: "", deadline_status: "dated", deadline_note: "", application_url: "",
  residency_requirements: "", funding_details: "", application_method: "",
  repayment_conditions: "", additional_information: "",
};

const optionalDetails = [
  { name: "funding_details", label: "Funding breakdown", hint: "List amounts, study levels, or payment frequency as published." },
  { name: "residency_requirements", label: "Residency requirements", hint: "Include any state or residency conditions." },
  { name: "application_method", label: "Application method", hint: "Describe the online or offline steps applicants should follow." },
  { name: "repayment_conditions", label: "Repayment conditions", hint: "For education loans, include published repayment terms." },
  { name: "additional_information", label: "Additional information", hint: "Include supporting details such as required documents." },
] as const;

const scholarshipCategories = [
  "Foundation",
  "Diploma",
  "Undergraduate",
  "Postgraduate",
  "Professional Certification",
  "General",
  "Computer Science",
  "Engineering",
  "Business and Management",
  "Medicine and Health Sciences",
  "Education",
  "Law",
  "Accounting and Finance",
  "Arts and Humanities",
  "Social Sciences",
  "STEM",
  "Technical and Vocational",
];

const legacyFundingTypes = [
  "Scholarship",
  "Education Loan",
  "Financial Assistance",
  "Special Assistance",
  "One-off Assistance",
  "Full Scholarship",
  "Partial Funding",
  "Tuition Fee Waiver",
  "Living Allowance",
  "Merit-based",
  "Need-based",
  "Research Grant",
];

const sampleScholarships: Array<Pick<ScholarshipForm, 'title' | 'category' | 'funding_type' | 'amount' | 'deadline' | 'source_url' | 'description' | 'eligibility_criteria'>> = [
  {
    title: "IJM Scholarship Programme 2026",
    category: "Undergraduate",
    funding_type: "Full Scholarship",
    amount: "0",
    deadline: "2026-06-30",
    source_url: "https://www.ijm.com/careers/scholarship",
    description:
      "Scholarship programme by IJM Corporation Berhad for eligible Malaysian students pursuing undergraduate studies. The award supports students in relevant fields such as engineering, quantity surveying, construction management, accounting, finance, business, and information technology. Fixed scholarship value is not publicly stated, so enter 0 if the amount will be reviewed manually.",
    eligibility_criteria:
      "Open to Malaysian students who meet IJM scholarship requirements and are pursuing eligible undergraduate programmes. Applicants should review the official IJM scholarship page for updated academic requirements, supported fields, and submission instructions.",
  },
  {
    title: "APU Malaysian Scholarships & Merit Awards 2026",
    category: "Foundation",
    funding_type: "Partial Funding",
    amount: "0",
    deadline: "2026-05-31",
    source_url: "https://new.apu.edu.my/apu-malaysian-scholarships-merit-awards",
    description:
      "Scholarship and merit award by Asia Pacific University of Technology & Innovation for Malaysian students entering eligible APU programmes. The award supports students across areas such as computing, engineering, business, accounting, finance, design, media, and technology.",
    eligibility_criteria:
      "Open to Malaysian students with strong academic results such as SPM, IGCSE, or equivalent qualifications. Award value depends on academic achievement and APU scholarship assessment.",
  },
  {
    title: "Wakalah PayNet-Yayasan Khazanah Scholarship Programme",
    category: "Undergraduate",
    funding_type: "Full Scholarship",
    amount: "0",
    deadline: "2026-07-31",
    source_url:
      "https://www.yayasankhazanah.com.my/scholarship-programmes/wakalah-paynet-yayasan-khazanah-scholarship-programme",
    description:
      "Scholarship programme under Yayasan Khazanah and PayNet that supports eligible students pursuing approved undergraduate studies in Malaysia.",
    eligibility_criteria:
      "Open to Malaysian Muslim B40 students who meet Yayasan Khazanah academic and programme requirements. Applicants should review the official programme page for the latest approved fields, income criteria, and application instructions.",
  },
  {
    title: "MTCP Scholarship 2026",
    category: "Postgraduate",
    funding_type: "Full Scholarship",
    amount: "0",
    deadline: "2026-06-12",
    source_url:
      "https://mtcp.kln.gov.my/storage/scholarship/admin/1777383818_APPLICATION%20GUIDELINES%20FOR%20MTCP%20SCHOLARSHIP%202026.pdf",
    description:
      "Scholarship by the Malaysian Technical Cooperation Programme for eligible international candidates pursuing Master's degree programmes at Malaysian public universities.",
    eligibility_criteria:
      "Applicants must meet MTCP Scholarship 2026 requirements, including eligible recipient country status, age requirement, academic achievement requirement, and admission requirements for Malaysian public universities.",
  },
];

function SponsorAddScholarshipPage() {
  const user = getStoredUser();
  const [searchParams] = useSearchParams();
  const editId = searchParams.get("edit");
  const descriptionLimit = editId ? 20000 : 500;
  const [isLoadingEdit, setIsLoadingEdit] = useState(Boolean(editId));
  const [editLoaded, setEditLoaded] = useState(false);
  const draftKey = `scholarone-scholarship-draft-${user?.user_id ?? "guest"}${editId ? `-edit-${editId}` : ""}`;
  const [form, setForm] = useState<ScholarshipForm>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(draftKey) || "null");
      const restored = { ...initialForm };
      for (const field of Object.keys(initialForm) as Array<keyof ScholarshipForm>) {
        if (typeof saved?.[field] === "string") restored[field] = saved[field];
      }
      return restored;
    } catch {
      return { ...initialForm };
    }
  });
  const [errors, setErrors] = useState<Partial<Record<keyof ScholarshipForm, string>>>({});
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [reviewing, setReviewing] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const reviewRef = useRef<HTMLElement>(null);
  const [originalForm, setOriginalForm] = useState<ScholarshipForm | null>(null);
  const requiresSource = !editId || Boolean(originalForm?.source_url);

  useEffect(() => {
    if (!editId || !user?.user_id) return;
    let active = true;
    api.get<{ scholarship: Record<string, unknown> }>(`/sponsors/${user.user_id}/scholarships/${encodeURIComponent(editId)}`).then(response => {
      if (!active) return;
      const record = response.data.scholarship;
      const restored = { ...initialForm };
      for (const field of Object.keys(initialForm) as Array<keyof ScholarshipForm>) {
        if (record[field] != null) restored[field] = String(record[field]);
      }
      restored.study_level = (record.study_levels as string[] || []).join("|");
      restored.eligible_state = (record.eligible_states as string[] || []).join("|");
      setOriginalForm(restored);
      setForm(restored); setEditLoaded(true);
    }).catch(err => { if (active) setError(getApiErrorMessage(err, "Unable to load this listing for editing.")); })
      .finally(() => { if (active) setIsLoadingEdit(false); });
    return () => { active = false; };
  }, [editId, user?.user_id]);

  function updateField(field: keyof ScholarshipForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setSuccess("");
    setReviewing(false);
  }

  function validateForm() {
    const nextErrors: Partial<Record<keyof ScholarshipForm, string>> = {};
    for (const field of ["title", "category", "funding_type", "study_level", "source_url", "description"] as const) {
      if (field === "source_url" && !requiresSource) continue;
      if (!form[field].trim()) nextErrors[field] = "This field is required.";
    }
    if (form.deadline_status === "dated" && !form.deadline) nextErrors.deadline = "Enter a deadline or select another deadline status.";
    if (form.amount && (!Number.isFinite(Number(form.amount)) || Number(form.amount) < 0)) {
      nextErrors.amount = "Enter a valid amount of 0 or more.";
    }
    if (form.minimum_cgpa && (!Number.isFinite(Number(form.minimum_cgpa)) || Number(form.minimum_cgpa) < 0 || Number(form.minimum_cgpa) > 4)) {
      nextErrors.minimum_cgpa = "Enter a CGPA between 0.00 and 4.00.";
    }
    if (form.maximum_income && (!Number.isFinite(Number(form.maximum_income)) || Number(form.maximum_income) < 0)) {
      nextErrors.maximum_income = "Enter a valid income of 0 or more.";
    }
    if (form.description.length > descriptionLimit) nextErrors.description = `Keep the description within ${descriptionLimit} characters.`;
    for (const field of ["source_url", "application_url"] as const) if (form[field].trim()) {
      try {
        const url = new URL(form[field].trim());
        if (!["https:", "http:"].includes(url.protocol)) throw new Error();
      } catch {
        nextErrors[field] = "Enter a complete http:// or https:// link.";
      }
    }
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    if (form.deadline && (!/^\d{4}-\d{2}-\d{2}$/.test(form.deadline) || (form.deadline < today && form.deadline_status !== "closed"))) {
      nextErrors.deadline = "Past deadlines must be marked Closed.";
    }
    if (form.deadline_time && !form.deadline) nextErrors.deadline = "Enter the date for this closing time.";
    if (form.opening_date && form.deadline && form.opening_date > form.deadline) {
      nextErrors.opening_date = "Application opening date cannot be after the closing date.";
    }
    setErrors(nextErrors);
    const firstField = Object.keys(nextErrors)[0];
    if (firstField) {
      formRef.current?.querySelector<HTMLElement>(`[name="${firstField}"]`)?.focus();
      return false;
    }
    return true;
  }

  function saveDraft() {
    setError("");
    setSuccess("");
    try {
      localStorage.setItem(draftKey, JSON.stringify(form));
      setSuccess("Draft saved in this browser. Return to Add Scholarship to continue editing.");
    } catch {
      setError("Unable to save the draft. Check that browser storage is available and try again.");
    }
  }

  function openReview() {
    setError("");
    setSuccess("");
    if (!validateForm()) return;
    setReviewing(true);
    setActiveStep(3);
    requestAnimationFrame(() => reviewRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }));
  }

  function goToStep(index: number) {
    if (index === 3) {
      openReview();
      return;
    }
    setActiveStep(index);
    document.getElementById(`submission-section-${index}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;
    if (editId && !editLoaded) return;
    if (!reviewing) {
      openReview();
      return;
    }
    if (!validateForm()) return;
    setError("");
    setSuccess("");
    if (!user?.user_id) {
      setError("Please log in as a sponsorship provider before adding a scholarship.");
      return;
    }
    setIsSubmitting(true);
    const eligibility = [
      `Eligible study level: ${form.study_level.replaceAll('|', ', ')}`,
      `Eligible state: ${(form.eligible_state || "All States").replaceAll('|', ', ')}`,
      form.minimum_cgpa ? `Minimum CGPA: ${form.minimum_cgpa}` : "",
      form.maximum_income ? `Maximum household income (MYR): ${form.maximum_income}` : "",
      form.eligibility_criteria.trim(),
    ].filter(Boolean).flatMap(value => value.split(/\r?\n/)).filter(value => value.trim())
      .map(value => /^\s*[-•]\s/.test(value) ? value : `- ${value}`).join("\n");
    try {
      const payload = {
        ...form,
        amount: form.amount || (editId ? null : "0"),
        study_levels: form.study_level.split("|").filter(Boolean),
        eligible_states: editId ? form.eligible_state.split("|").filter(Boolean) : (form.eligible_state || "All States").split("|"),
        study_level: form.study_level.split("|")[0],
        title: form.title.trim(),
        eligible_state: (form.eligible_state || (editId ? "" : "All States")).split("|")[0],
        description: form.description.trim(),
        eligibility_criteria: editId ? form.eligibility_criteria : eligibility,
        minimum_cgpa: originalForm?.minimum_cgpa === form.minimum_cgpa ? undefined : form.minimum_cgpa,
        maximum_income: originalForm?.maximum_income === form.maximum_income ? undefined : form.maximum_income,
      };
      const response = editId
        ? await api.put(`/sponsors/${user.user_id}/scholarships/${encodeURIComponent(editId)}`, payload)
        : await api.post(`/sponsors/${user.user_id}/scholarships`, payload);
      setSuccess(response.data.message || "Scholarship submitted for administrator review.");
      if (!editId) setForm({ ...initialForm });
      setReviewing(false);
      setActiveStep(0);
      // Submission has already succeeded, even if browser storage is unavailable.
      try { localStorage.removeItem(draftKey); } catch { /* Keep the successful submission visible. */ }
    } catch (submitError) {
      setError(getApiErrorMessage(submitError, "Unable to submit this scholarship listing."));
    } finally {
      setIsSubmitting(false);
    }
  }

  function fieldError(field: keyof ScholarshipForm) {
    return errors[field] && <small className="submission-field-error" id={`error-${field}`}>{errors[field]}</small>;
  }

  function fieldProps(field: keyof ScholarshipForm) {
    return { name: field, "aria-invalid": Boolean(errors[field]), "aria-describedby": errors[field] ? `error-${field}` : undefined };
  }

  return (
    <div className="sponsor-page sponsor-submission-page">
      <section className="sponsor-add-hero sponsor-hero sponsor-workspace-hero sponsor-learning-banner">
        <div>
          <p className="sponsor-kicker"><Icon name="graduation" />New Advertisement</p>
          <h2>{editId ? "Edit Scholarship Listing" : "Create a New Scholarship Opportunity"}</h2>
          <span>{editId ? "Saving changes returns this listing to Pending. Students can see it again after administrator approval." : "Submit a scholarship listing with complete details for administrator review."}</span>
          <Link className="sponsor-hero-action" to="/sponsor/scholarships">View My Scholarships</Link>
        </div>
      </section>

      <nav className="submission-steps" aria-label="Scholarship submission sections">
        {["Details", "Eligibility", "Application", "Review"].map((step, index) => (
          <button key={step} type="button" disabled={isSubmitting} aria-current={activeStep === index ? "step" : undefined} onClick={() => goToStep(index)}>
            <span>{index + 1}</span>{step}
          </button>
        ))}
      </nav>

      <div className="submission-layout">
        <form ref={formRef} className="sponsor-panel submission-form" onSubmit={handleSubmit} noValidate>
          {isLoadingEdit && <p role="status">Loading listing information…</p>}
          <fieldset disabled={isSubmitting || isLoadingEdit || Boolean(editId && !editLoaded)}>
            <section className="submission-section" id="submission-section-0" onFocusCapture={() => setActiveStep(0)}>
              <h3><Icon name="layers" />Basic Information</h3>
              <div className="submission-fields">
                <label>Scholarship Title <b>*</b>
                  <input {...fieldProps("title")} required placeholder="e.g. Future Leaders Scholarship 2026" value={form.title} onChange={(event) => updateField("title", event.target.value)} />
                  {fieldError("title")}
                </label>
                <label>Category <b>*</b>
                  <select {...fieldProps("category")} required value={form.category} onChange={(event) => updateField("category", event.target.value)}>
                    <option value="">Select category</option>
                    {scholarshipCategories.map((category) => <option key={category}>{category}</option>)}
                    {form.category && !scholarshipCategories.includes(form.category) && <option>{form.category}</option>}
                  </select>{fieldError("category")}
                </label>
                <label>Funding Type <b>*</b>
                  <select {...fieldProps("funding_type")} required value={form.funding_type} onChange={(event) => updateField("funding_type", event.target.value)}>
                    <option value="">Select funding type</option>
                    {financialAidTypes.map((type) => <option key={type.id} value={type.value}>{type.english} / {type.malay}</option>)}
                    {legacyFundingTypes.includes(form.funding_type) && !financialAidTypes.some(type => type.value === form.funding_type) && <option>{form.funding_type}</option>}
                  </select>{fieldError("funding_type")}
                </label>
                <label>Fixed Amount (MYR, optional)
                  <input {...fieldProps("amount")} type="number" min="0" step="0.01" placeholder="Leave blank if no fixed amount is published" value={form.amount} onChange={(event) => updateField("amount", event.target.value)} />
                  {fieldError("amount")}
                </label>
              </div>
              <label>Funding Information<textarea {...fieldProps("amount_note")} rows={4} maxLength={5000} placeholder="e.g. RM800 per year. Paid in August. List amounts by study level or financing percentages on separate lines." value={form.amount_note} onChange={event => updateField("amount_note", event.target.value)} /></label>
            </section>

            <section className="submission-section" id="submission-section-1" onFocusCapture={() => setActiveStep(1)}>
              <h3><Icon name="users" />Eligibility Requirements</h3>
              <div className="submission-fields">
                <label>Eligible Study Level <b>*</b>
                  <select {...fieldProps("study_level")} required multiple size={4} value={form.study_level.split("|").filter(Boolean)} onChange={(event) => updateField("study_level", [...event.target.selectedOptions].map(option => option.value).join("|"))}>
                    <option>All Study Levels</option>
                    {studyLevels.map((level) => <option key={level}>{level}</option>)}
                  </select>{fieldError("study_level")}
                </label>
                <label>Eligible State
                  <select {...fieldProps("eligible_state")} multiple size={4} value={(form.eligible_state || (editId ? "" : "All States")).split("|").filter(Boolean)} onChange={(event) => updateField("eligible_state", [...event.target.selectedOptions].map(option => option.value).join("|"))}>
                    <option value="All States">All States / Nationwide</option>
                    {eligibilityStates.map((state) => <option key={state}>{state}</option>)}
                  </select>
                </label>
                <label>Minimum CGPA
                  <input {...fieldProps("minimum_cgpa")} type="number" min="0" max="4" step="0.01" placeholder="e.g. 3.00" value={form.minimum_cgpa} onChange={(event) => updateField("minimum_cgpa", event.target.value)} />{fieldError("minimum_cgpa")}
                </label>
                <label>Maximum Household Income (MYR)
                  <input {...fieldProps("maximum_income")} type="number" min="0" step="0.01" placeholder="e.g. 50,000" value={form.maximum_income} onChange={(event) => updateField("maximum_income", event.target.value)} />{fieldError("maximum_income")}
                </label>
              </div>
              <small>Select more than one study level or state using Ctrl (Windows) or Command (Mac).</small>
              <details className="submission-extra">
                <summary>{editId ? "Existing eligibility criteria" : "Additional eligibility criteria"}</summary>
                <label>{editId ? "Published requirements" : "Other requirements"}
                  <textarea name="eligibility_criteria" rows={3} placeholder="Citizenship, supported fields of study, or required documents…" value={form.eligibility_criteria} onChange={(event) => updateField("eligibility_criteria", event.target.value)} />
                </label>
              </details>
            </section>

            <section className="submission-section" id="submission-section-2" onFocusCapture={() => setActiveStep(2)}>
              <h3><Icon name="calendar" />Application Information</h3>
              <div className="submission-fields">
                <label>Application opening date (optional)<input {...fieldProps("opening_date")} type="date" value={form.opening_date} onChange={event => updateField("opening_date", event.target.value)} />{fieldError("opening_date")}</label>
                <label>Deadline Status <b>*</b><select name="deadline_status" value={form.deadline_status} onChange={event => updateField("deadline_status", event.target.value)}><option value="dated">Fixed closing date</option><option value="open">Open / rolling applications</option><option value="closed">Closed</option><option value="unconfirmed">No Official Information</option></select></label>
                <label>Application Deadline {form.deadline_status === "dated" && <b>*</b>}
                  <input {...fieldProps("deadline")} required={form.deadline_status === "dated"} type="date" value={form.deadline} onChange={(event) => updateField("deadline", event.target.value)} />{fieldError("deadline")}
                </label>
                <label>Closing time (Malaysia, optional)<input type="time" name="deadline_time" step="1" value={form.deadline_time} onChange={event => updateField("deadline_time", event.target.value)} /></label>
                <label>Official Source {requiresSource && <b>*</b>}
                  <input {...fieldProps("source_url")} required={requiresSource} type="url" placeholder="https://www.official-scholarship-page.com" value={form.source_url} onChange={(event) => updateField("source_url", event.target.value)} />{fieldError("source_url")}
                </label>
                <label>Application Portal (optional)<input {...fieldProps("application_url")} type="url" placeholder="https://application-portal.example.com" value={form.application_url} onChange={event => updateField("application_url", event.target.value)} />{fieldError("application_url")}</label>
              </div>
              <label>Deadline Description<textarea name="deadline_note" rows={3} maxLength={2000} placeholder="e.g. Closed for 2026. Next intake: July–August 2027; or apply within six months of registration." value={form.deadline_note} onChange={event => updateField("deadline_note", event.target.value)} /></label>
            </section>

            <section className="submission-section submission-description">
              <h3><Icon name="quiz" />Scholarship Description</h3>
              <label className="submission-description-label">Description <b>*</b>
                <textarea {...fieldProps("description")} required rows={4} maxLength={descriptionLimit} placeholder="Provide a brief description of the scholarship, its benefits, and key information…" value={form.description} onChange={(event) => updateField("description", event.target.value)} />
              </label>
              {fieldError("description")}
              <small className="submission-counter">{form.description.length} / {descriptionLimit}</small>
              {editId && <small>Keep any funding, application, or repayment sections in the existing description unless you intend to update them.</small>}
            </section>
            {!editId && <section className="submission-section">
              <details className="submission-extra">
                <summary>Optional listing details</summary>
                {optionalDetails.map(({ name, label, hint }) => (
                  <label key={name}>{label}
                    <textarea name={name} rows={3} maxLength={name === "residency_requirements" ? 3000 : 5000}
                      placeholder={hint} value={form[name]} onChange={event => updateField(name, event.target.value)} />
                  </label>
                ))}
              </details>
            </section>}
          </fieldset>

          {reviewing && <section ref={reviewRef} className="submission-review" aria-label="Review scholarship">
            <h3><Icon name="eye" />Review Your Scholarship</h3>
            <dl>
              <div><dt>Title</dt><dd>{form.title}</dd></div>
              <div><dt>Category / Funding</dt><dd>{form.category} · {form.funding_type}</dd></div>
              <div><dt>Funding Information</dt><dd>{form.amount_note || (Number(form.amount) > 0 ? `MYR ${Number(form.amount).toLocaleString("en-MY", { minimumFractionDigits: 2 })}` : "No Data. Visit the provided links for more information.")}</dd></div>
              <div><dt>Eligibility</dt><dd>{form.study_level.replaceAll('|', ', ')} · {(form.eligible_state || "All States").replaceAll('|', ', ')}{form.minimum_cgpa && ` · Minimum CGPA ${form.minimum_cgpa}`}{form.maximum_income && ` · Maximum household income MYR ${form.maximum_income}`}</dd></div>
              {form.eligibility_criteria && <div><dt>Other requirements</dt><dd>{form.eligibility_criteria}</dd></div>}
              {!editId && optionalDetails.map(({ name, label }) => form[name].trim() && <div key={name}><dt>{label}</dt><dd>{form[name]}</dd></div>)}
              <div><dt>Deadline</dt><dd>{form.deadline_status === 'dated' ? form.deadline : form.deadline_status === 'open' ? 'Open' : form.deadline_status === 'closed' ? 'Closed' : 'No Official Information'} {form.deadline_status !== 'dated' && form.deadline}<br />{form.deadline_note}</dd></div>
              {form.opening_date && <div><dt>Application opening date</dt><dd>{form.opening_date}</dd></div>}
              {form.application_url && <div><dt>Application Portal</dt><dd>{form.application_url}</dd></div>}
              <div><dt>Official source</dt><dd><a href={form.source_url.trim()} target="_blank" rel="noreferrer">{form.source_url}</a></dd></div>
              <div><dt>Description</dt><dd>{form.description}</dd></div>
            </dl>
            <button className="sponsor-secondary-link" type="button" disabled={isSubmitting} onClick={() => { setReviewing(false); goToStep(0); }}>Continue Editing</button>
          </section>}
          {error && <div role="alert" className="sponsor-form-error">{error}</div>}
          {success && <div role="status" className="sponsor-form-success">{success} <Link to="/sponsor/scholarships">View My Scholarships</Link></div>}
          <div className="submission-actions">
            <button className="sponsor-secondary-link" type="button" disabled={isSubmitting} onClick={saveDraft}><Icon name="quiz" />Save as Draft</button>
            <button className="sponsor-primary-button" disabled={isSubmitting || isLoadingEdit || Boolean(editId && !editLoaded)} type="submit"><Icon name="send" />{isSubmitting ? "Submitting…" : reviewing ? "Confirm Submission" : editId ? "Submit Changes for Review" : "Submit for Review"}</button>
          </div>
        </form>

        <aside className="submission-sidebar">
          <div className="submission-illustration"><img src="/images/student-scholarships-hero.png" alt="Graduation cap, books, and scholarship checklist" /></div>
          <section className="sponsor-panel submission-guide">
            <h3><Icon name="quiz" />Submission Guide</h3>
            <ul>
              {["Use a clear and recognizable title.", "Include the correct funding amount and deadline.", "Add the official source link for verification.", "Make sure eligibility requirements are complete and accurate.", "Provide a short and clear description (2–3 sentences)."].map((tip) => <li key={tip}><span aria-hidden="true">✓</span>{tip}</li>)}
            </ul>
          </section>
          <section className="sponsor-panel submission-note">
            <h3><Icon name="shield" />Note</h3>
            <p>Your submission will be reviewed by the administrator before it is published on ScholarOne.</p>
            <p>Drafts are saved in this browser. Leave the fixed amount blank when it is not published, and describe the benefits under Funding Information.</p>
          </section>
          <details className="sponsor-panel submission-samples">
            <summary>Prefill from an existing scholarship</summary>
            <p>Verify all sample details and update the deadline before submitting.</p>
            <select aria-label="Prefill scholarship form" defaultValue="" disabled={isSubmitting} onChange={(event) => {
              const selected = sampleScholarships.find((scholarship) => scholarship.title === event.target.value);
              if (selected) { setForm({ ...initialForm, ...selected }); setErrors({}); setReviewing(false); setSuccess(""); }
            }}>
              <option value="">Choose sample record</option>
              {sampleScholarships.map((scholarship) => <option key={scholarship.title}>{scholarship.title}</option>)}
            </select>
          </details>
        </aside>
      </div>
    </div>
  );
}

export default SponsorAddScholarshipPage;
