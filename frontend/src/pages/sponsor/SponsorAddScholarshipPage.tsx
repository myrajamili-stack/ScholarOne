import { useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import api from "../../api/axios";
import { getApiErrorMessage } from "../../utils/apiError";
import { getStoredUser } from "../../utils/authStorage";

type ScholarshipForm = {
  title: string;
  category: string;
  funding_type: string;
  amount: string;
  deadline: string;
  source_url: string;
  description: string;
  eligibility_criteria: string;
};

const initialForm: ScholarshipForm = {
  title: "",
  category: "",
  funding_type: "",
  amount: "",
  deadline: "",
  source_url: "",
  description: "",
  eligibility_criteria: "",
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
  "Full Scholarship",
  "Partial Funding",
  "Tuition Fee Waiver",
  "Living Allowance",
  "Merit-based",
  "Need-based",
  "Research Grant",
];

const sampleScholarships: ScholarshipForm[] = [
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
  const [form, setForm] = useState<ScholarshipForm>(initialForm);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  function updateField(field: keyof ScholarshipForm, value: string) {
    setForm((currentForm) => ({
      ...currentForm,
      [field]: value,
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!user?.user_id) {
      setError("Please log in as a sponsorship provider before adding a scholarship.");
      return;
    }

    setIsSubmitting(true);

    try {
      const payload = {
        ...form,
        description: form.source_url
          ? `${form.description.trim()}\n\nOfficial source: ${form.source_url.trim()}`
          : form.description.trim(),
      };
      const response = await api.post(`/sponsors/${user.user_id}/scholarships`, payload);
      setSuccess(response.data.message || "Scholarship submitted for administrator review.");
      setForm(initialForm);
    } catch (error) {
      setError(getApiErrorMessage(error, "Unable to submit this scholarship listing."));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="sponsor-page">
      <section className="sponsor-add-hero">
        <div>
          <p className="sponsor-kicker">New Advertisement</p>
          <h2>Add Scholarship</h2>
          <span>Submit a scholarship listing with complete details for administrator review.</span>
        </div>
        <Link className="sponsor-hero-action" to="/sponsor/scholarships">
          View My Scholarships
        </Link>
      </section>

      <section className="sponsor-add-layout">
        <form className="sponsor-panel sponsor-form-panel" onSubmit={handleSubmit}>
          <div className="sponsor-panel-header">
            <div>
              <p className="sponsor-kicker">Scholarship Details</p>
              <h2>Listing application form</h2>
            </div>
            <span className="sponsor-status pending">Pending after submission</span>
          </div>

          <div className="sponsor-example-box">
            <div>
              <p className="sponsor-kicker">Use Real Scholarship Data</p>
              <h3>Prefill from an existing scholarship</h3>
              <span>
                Pick one of the official scholarship records we discussed, then review the details before submitting.
              </span>
            </div>
            <select
              aria-label="Prefill scholarship form"
              defaultValue=""
              onChange={(event) => {
                const selectedScholarship = sampleScholarships.find(
                  (scholarship) => scholarship.title === event.target.value,
                );
                if (selectedScholarship) {
                  setForm(selectedScholarship);
                }
              }}
            >
              <option value="">Choose sample record</option>
              {sampleScholarships.map((scholarship) => (
                <option key={scholarship.title} value={scholarship.title}>
                  {scholarship.title}
                </option>
              ))}
            </select>
          </div>

          <div className="sponsor-form-section">
            <h3>Basic information</h3>
            <div className="sponsor-form-grid">
              <label>
                Scholarship title
                <input
                  required
                  placeholder="Future Leaders Scholarship 2026"
                  value={form.title}
                  onChange={(event) => updateField("title", event.target.value)}
                />
              </label>

              <label>
                Category
                <select
                  required
                  value={form.category}
                  onChange={(event) => updateField("category", event.target.value)}
                >
                  <option value="">Select category</option>
                  {scholarshipCategories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Funding type
                <select
                  required
                  value={form.funding_type}
                  onChange={(event) => updateField("funding_type", event.target.value)}
                >
                  <option value="">Select funding type</option>
                  {fundingTypes.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Amount (MYR)
                <input
                  required
                  min="0"
                  placeholder="5000"
                  type="number"
                  value={form.amount}
                  onChange={(event) => updateField("amount", event.target.value)}
                />
              </label>

              <label>
                Application deadline
                <input
                  required
                  type="date"
                  value={form.deadline}
                  onChange={(event) => updateField("deadline", event.target.value)}
                />
              </label>

              <label>
                Official source / application link
                <input
                  placeholder="https://www.official-scholarship-page.com"
                  type="url"
                  value={form.source_url}
                  onChange={(event) => updateField("source_url", event.target.value)}
                />
              </label>
            </div>
          </div>

          <div className="sponsor-form-section">
            <h3>Application information</h3>
            <label>
              Scholarship description
              <textarea
                required
                placeholder="Describe what this scholarship covers, who it supports, fields of study, education level, and the purpose of the award."
                rows={5}
                value={form.description}
                onChange={(event) => updateField("description", event.target.value)}
              />
            </label>

            <label>
              Eligibility criteria
              <textarea
                required
                placeholder="Example: Malaysian citizen, undergraduate student, eligible field of study, academic requirement, financial requirement, and any required documents."
                rows={5}
                value={form.eligibility_criteria}
                onChange={(event) => updateField("eligibility_criteria", event.target.value)}
              />
            </label>
          </div>

          {error && <div className="sponsor-form-error">{error}</div>}
          {success && (
            <div className="sponsor-form-success">
              {success} <Link to="/sponsor/scholarships">View listing</Link>
            </div>
          )}

          <div className="sponsor-submit-row">
            <Link className="sponsor-secondary-link" to="/sponsor/scholarships">
              Cancel
            </Link>
            <button className="sponsor-primary-button" disabled={isSubmitting} type="submit">
              {isSubmitting ? "Submitting..." : "Submit Scholarship"}
            </button>
          </div>
        </form>

        <aside className="sponsor-panel sponsor-guidance-panel">
          <p className="sponsor-kicker">Before You Submit</p>
          <h2>Approval checklist</h2>
          <ul>
            <li>Use a clear scholarship title students can recognize.</li>
            <li>Include accurate funding amount and deadline.</li>
            <li>Use 0 for amount if the official page does not publish a fixed MYR value.</li>
            <li>Add the official source link so administrators can verify the record.</li>
            <li>Explain eligibility requirements in complete sentences.</li>
            <li>New listings stay pending until an administrator reviews them.</li>
          </ul>
          <div className="sponsor-review-note">
            <strong>Status flow</strong>
            <span>Draft form → Pending review → Approved or rejected by administrator.</span>
          </div>
        </aside>
      </section>
    </div>
  );
}

export default SponsorAddScholarshipPage;
