import Icon from "../../components/advisor/AdvisorIcon";
import { useRef, useState } from "react";
import "../../styles/sponsor-submission.css";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import api from "../../api/axios";
import { getApiErrorMessage } from "../../utils/apiError";
import { getStoredUser } from "../../utils/authStorage";
import { eligibilityStates, studyLevels } from "../../utils/financialAid";

type ScholarshipForm = {
  title: string;
  category: string;
  study_level: string;
  eligible_state: string;
  funding_type: string;
  amount: string;
  deadline: string;
  source_url: string;
  description: string;
  eligibility_criteria: string;
  minimum_cgpa: string;
  maximum_income: string;
};

const initialForm: ScholarshipForm = {
  title: "",
  category: "",
  study_level: "",
  eligible_state: "",
  funding_type: "",
  amount: "",
  deadline: "",
  source_url: "",
  description: "",
  eligibility_criteria: "",
  minimum_cgpa: "",
  maximum_income: "",
};

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

const fundingTypes = [
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

const sampleScholarships: Array<Omit<ScholarshipForm, 'study_level' | 'eligible_state' | 'minimum_cgpa' | 'maximum_income'>> = [
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
  const draftKey = `scholarone-scholarship-draft-${user?.user_id ?? "guest"}`;
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

  function updateField(field: keyof ScholarshipForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setSuccess("");
    setReviewing(false);
  }

  function validateForm() {
    const nextErrors: Partial<Record<keyof ScholarshipForm, string>> = {};
    for (const field of ["title", "category", "funding_type", "amount", "study_level", "deadline", "source_url", "description"] as const) {
      if (!form[field].trim()) nextErrors[field] = "This field is required.";
    }
    if (form.amount && (!Number.isFinite(Number(form.amount)) || Number(form.amount) < 0)) {
      nextErrors.amount = "Enter a valid amount of 0 or more.";
    }
    if (form.minimum_cgpa && (!Number.isFinite(Number(form.minimum_cgpa)) || Number(form.minimum_cgpa) < 0 || Number(form.minimum_cgpa) > 4)) {
      nextErrors.minimum_cgpa = "Enter a CGPA between 0.00 and 4.00.";
    }
    if (form.maximum_income && (!Number.isFinite(Number(form.maximum_income)) || Number(form.maximum_income) < 0)) {
      nextErrors.maximum_income = "Enter a valid income of 0 or more.";
    }
    if (form.description.length > 500) nextErrors.description = "Keep the description within 500 characters.";
    if (form.source_url.trim()) {
      try {
        const url = new URL(form.source_url.trim());
        if (!["https:", "http:"].includes(url.protocol)) throw new Error();
      } catch {
        nextErrors.source_url = "Enter a complete http:// or https:// link.";
      }
    }
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    if (form.deadline && (!/^\d{4}-\d{2}-\d{2}$/.test(form.deadline) || form.deadline < today)) {
      nextErrors.deadline = "Choose today or a future deadline.";
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
      `Eligible study level: ${form.study_level}`,
      `Eligible state: ${form.eligible_state || "All States"}`,
      form.minimum_cgpa ? `Minimum CGPA: ${form.minimum_cgpa}` : "",
      form.maximum_income ? `Maximum household income (MYR): ${form.maximum_income}` : "",
      form.eligibility_criteria.trim(),
    ].filter(Boolean).join("\n");
    try {
      const response = await api.post(`/sponsors/${user.user_id}/scholarships`, {
        ...form,
        title: form.title.trim(),
        eligible_state: form.eligible_state || "All States",
        description: `${form.description.trim()}\n\nOfficial source: ${form.source_url.trim()}`,
        eligibility_criteria: eligibility,
      });
      setSuccess(response.data.message || "Scholarship submitted for administrator review.");
      setForm({ ...initialForm });
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
          <h2>Create a New Scholarship Opportunity</h2>
          <span>Submit a scholarship listing with complete details for administrator review.</span>
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
          <fieldset disabled={isSubmitting}>
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
                  </select>{fieldError("category")}
                </label>
                <label>Funding Type <b>*</b>
                  <select {...fieldProps("funding_type")} required value={form.funding_type} onChange={(event) => updateField("funding_type", event.target.value)}>
                    <option value="">Select funding type</option>
                    {fundingTypes.map((type) => <option key={type}>{type}</option>)}
                  </select>{fieldError("funding_type")}
                </label>
                <label>Amount (MYR) <b>*</b>
                  <input {...fieldProps("amount")} required type="number" min="0" step="0.01" placeholder="e.g. 5,000" value={form.amount} onChange={(event) => updateField("amount", event.target.value)} />
                  {fieldError("amount")}
                </label>
              </div>
            </section>

            <section className="submission-section" id="submission-section-1" onFocusCapture={() => setActiveStep(1)}>
              <h3><Icon name="users" />Eligibility Requirements</h3>
              <div className="submission-fields">
                <label>Eligible Study Level <b>*</b>
                  <select {...fieldProps("study_level")} required value={form.study_level} onChange={(event) => updateField("study_level", event.target.value)}>
                    <option value="">Select study level</option><option>All Study Levels</option>
                    {studyLevels.map((level) => <option key={level}>{level}</option>)}
                  </select>{fieldError("study_level")}
                </label>
                <label>Eligible State
                  <select {...fieldProps("eligible_state")} value={form.eligible_state} onChange={(event) => updateField("eligible_state", event.target.value)}>
                    <option value="">All States / Nationwide</option>
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
              <details className="submission-extra">
                <summary>Additional eligibility criteria</summary>
                <label>Other requirements
                  <textarea name="eligibility_criteria" rows={3} placeholder="Citizenship, supported fields of study, or required documents…" value={form.eligibility_criteria} onChange={(event) => updateField("eligibility_criteria", event.target.value)} />
                </label>
              </details>
            </section>

            <section className="submission-section" id="submission-section-2" onFocusCapture={() => setActiveStep(2)}>
              <h3><Icon name="calendar" />Application Information</h3>
              <div className="submission-fields">
                <label>Application Deadline <b>*</b>
                  <input {...fieldProps("deadline")} required type="date" value={form.deadline} onChange={(event) => updateField("deadline", event.target.value)} />{fieldError("deadline")}
                </label>
                <label>Official Source / Application Link <b>*</b>
                  <input {...fieldProps("source_url")} required type="url" placeholder="https://www.official-scholarship-page.com" value={form.source_url} onChange={(event) => updateField("source_url", event.target.value)} />{fieldError("source_url")}
                </label>
              </div>
            </section>

            <section className="submission-section submission-description">
              <h3><Icon name="quiz" />Scholarship Description</h3>
              <label className="submission-description-label">Description <b>*</b>
                <textarea {...fieldProps("description")} required rows={4} maxLength={500} placeholder="Provide a brief description of the scholarship, its benefits, and key information…" value={form.description} onChange={(event) => updateField("description", event.target.value)} />
              </label>
              {fieldError("description")}
              <small className="submission-counter">{form.description.length} / 500</small>
            </section>
          </fieldset>

          {reviewing && <section ref={reviewRef} className="submission-review" aria-label="Review scholarship">
            <h3><Icon name="eye" />Review Your Scholarship</h3>
            <dl>
              <div><dt>Title</dt><dd>{form.title}</dd></div>
              <div><dt>Category / Funding</dt><dd>{form.category} · {form.funding_type}</dd></div>
              <div><dt>Amount</dt><dd>MYR {Number(form.amount).toLocaleString("en-MY", { minimumFractionDigits: 2 })}</dd></div>
              <div><dt>Eligibility</dt><dd>{form.study_level} · {form.eligible_state || "All States"}{form.minimum_cgpa && ` · Minimum CGPA ${form.minimum_cgpa}`}{form.maximum_income && ` · Maximum household income MYR ${form.maximum_income}`}</dd></div>
              {form.eligibility_criteria && <div><dt>Other requirements</dt><dd>{form.eligibility_criteria}</dd></div>}
              <div><dt>Deadline</dt><dd>{form.deadline}</dd></div>
              <div><dt>Official source</dt><dd><a href={form.source_url.trim()} target="_blank" rel="noreferrer">{form.source_url}</a></dd></div>
              <div><dt>Description</dt><dd>{form.description}</dd></div>
            </dl>
            <button className="sponsor-secondary-link" type="button" disabled={isSubmitting} onClick={() => { setReviewing(false); goToStep(0); }}>Continue Editing</button>
          </section>}
          {error && <div role="alert" className="sponsor-form-error">{error}</div>}
          {success && <div role="status" className="sponsor-form-success">{success} <Link to="/sponsor/scholarships">View My Scholarships</Link></div>}
          <div className="submission-actions">
            <button className="sponsor-secondary-link" type="button" disabled={isSubmitting} onClick={saveDraft}><Icon name="quiz" />Save as Draft</button>
            <button className="sponsor-primary-button" disabled={isSubmitting} type="submit"><Icon name="send" />{isSubmitting ? "Submitting…" : reviewing ? "Confirm Submission" : "Submit for Review"}</button>
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
            <p>Drafts are saved in this browser. Use 0 for an amount without a fixed published value.</p>
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
