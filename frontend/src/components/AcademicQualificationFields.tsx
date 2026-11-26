import type { AcademicResult, Qualification } from "../types/student";

import { gradeScales } from "../utils/academicQualifications";

const subjectSuggestions = ["Bahasa Melayu", "English", "Mathematics", "Additional Mathematics", "Science", "Physics", "Chemistry", "Biology", "History", "Geography", "Economics", "Accounting", "Computer Science"];

type Props = {
  qualification: Qualification;
  result: AcademicResult;
  onChange: (result: AcademicResult) => void;
};

export default function AcademicQualificationFields({ qualification, result, onChange }: Props) {
  const subjects = result.subjects ?? [];
  const grades = gradeScales[result.grading_scale ?? ""] ?? [];
  function updateSubject(index: number, changes: Partial<(typeof subjects)[number]>) {
    onChange({ ...result, subjects: subjects.map((row, i) => i === index ? { ...row, ...changes } : row) });
  }

  return <div className="sp-qualification-results">
    <div className="profile-form-grid">
      {qualification === "igcse_o_level" && <label>Examination grading format
        <select value={result.grading_scale ?? ""} onChange={event => onChange({ ...result, grading_scale: event.target.value })}>
          <option value="">Select the scale on your certificate</option>
          <option value="igcse_letters">IGCSE A*–G / U</option>
          <option value="igcse_numeric">IGCSE 9–1 / U</option>
          <option value="o_level">Cambridge O-Level A*–E / U</option>
        </select>
      </label>}
      {result.cgpa !== undefined && <label>{qualification === "stpm" ? "Overall CGPA / PNGK" : "CGPA"}
        <input type="number" min="0" max="4" step="0.01" value={result.cgpa ?? ""} onChange={event => onChange({ ...result, cgpa: event.target.value })} />
      </label>}
      {result.muet_band !== undefined && <label>MUET band (optional)
        <select value={result.muet_band} onChange={event => onChange({ ...result, muet_band: event.target.value })}>
          <option value="">Not provided</option>
          {"1.0 2.0 2.5 3.0 3.5 4.0 4.5 5.0 5+".split(" ").map(band => <option key={band}>{band}</option>)}
        </select>
      </label>}
      {result.field_of_study !== undefined && <label>Field of Study / Programme
        <input maxLength={150} value={result.field_of_study} onChange={event => onChange({ ...result, field_of_study: event.target.value })} />
      </label>}
      {result.institution !== undefined && <label>{qualification === "diploma" || qualification === "bachelors" ? "Institution / University" : "Institution Name"}
        <input maxLength={150} value={result.institution} onChange={event => onChange({ ...result, institution: event.target.value })} />
      </label>}
      {result.programme_name !== undefined && <label>Programme Name (optional)
        <input maxLength={150} value={result.programme_name} onChange={event => onChange({ ...result, programme_name: event.target.value })} />
      </label>}
    </div>
    {result.subjects && <section aria-labelledby="sp-subject-results">
      <h3 id="sp-subject-results">Subject Results</h3>
      <p className="sp-description">Add the subjects on your certificate. You can choose a suggestion or enter a custom name.</p>
      <datalist id="sp-subject-suggestions">{subjectSuggestions.map(name => <option value={name} key={name} />)}</datalist>
      {subjects.map(({ subject, grade }, index) => <div className="sp-subject-row" key={index}>
        <label>Subject {index + 1}<input value={subject} maxLength={100} list="sp-subject-suggestions" onChange={event => updateSubject(index, { subject: event.target.value })} /></label>
        <label>Grade {index + 1}<select value={grade} onChange={event => updateSubject(index, { grade: event.target.value })}>
          <option value="">Select grade</option>
          {grade && !grades.includes(grade) && <option value={grade} disabled>{grade} (change scale or grade)</option>}
          {grades.map(value => <option key={value}>{value}</option>)}
        </select></label>
        <button type="button" className="sp-discard" aria-label={`Remove subject ${index + 1}`} onClick={() => onChange({ ...result, subjects: subjects.filter((_, i) => i !== index) })}>Remove</button>
      </div>)}
      <button type="button" className="sp-discard" disabled={!grades.length || subjects.length >= 30} onClick={() => onChange({ ...result, subjects: [...subjects, { subject: "", grade: "" }] })}>Add Subject</button>
    </section>}
  </div>;
}
