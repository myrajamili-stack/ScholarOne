import type { AcademicResult, Qualification } from "../types/student";

export const qualificationLabels: Record<Qualification, string> = {
  spm: "SPM",
  igcse_o_level: "IGCSE / O-Level",
  stpm: "STPM",
  matriculation: "Matriculation (Matrikulasi)",
  foundation: "Foundation / Asasi",
  diploma: "Diploma",
  a_level: "A-Level",
  bachelors: "Bachelor’s Degree",
};

export const gradeScales: Record<string, string[]> = {
  spm: "A+ A A- B+ B C+ C D E G".split(" "),
  igcse_letters: "A* A B C D E F G U".split(" "),
  igcse_numeric: "9 8 7 6 5 4 3 2 1 U".split(" "),
  o_level: "A* A B C D E U".split(" "),
  stpm: "A A- B+ B B- C+ C C- D+ D F".split(" "),
  a_level: "A* A B C D E U".split(" "),
};
const programmeTypes = new Set<Qualification>(["matriculation", "foundation", "diploma", "bachelors"]);

export function emptyAcademicResult(qualification: Qualification): AcademicResult {
  const programme = programmeTypes.has(qualification);
  const hasSubjects = !programme;
  return {
    ...(hasSubjects ? { grading_scale: qualification === "igcse_o_level" ? "" : qualification, subjects: [] } : {}),
    ...(programme || qualification === "stpm" ? { cgpa: "" } : {}),
    ...(programme || qualification === "a_level" ? { institution: "" } : {}),
    ...(programme ? { field_of_study: "" } : {}),
    ...(qualification === "diploma" || qualification === "bachelors" ? { programme_name: "" } : {}),
    ...(qualification === "stpm" ? { muet_band: "" } : {}),
  };
}

export function academicResultError(result: AcademicResult) {
  if (result.cgpa != null && result.cgpa !== "" && (!Number.isFinite(Number(result.cgpa)) || Number(result.cgpa) < 0 || Number(result.cgpa) > 4)) {
    return "Enter a CGPA between 0.00 and 4.00.";
  }
  if (result.subjects && !result.grading_scale) return "Select the grading format shown on your certificate.";
  const seen = new Set<string>();
  for (const [index, { subject, grade }] of (result.subjects ?? []).entries()) {
    const key = subject.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
    if (!key || !gradeScales[result.grading_scale ?? ""]?.includes(grade)) return `Enter a subject and a grade from the selected scale for result ${index + 1}.`;
    if (seen.has(key)) return `Enter ${subject.trim()} only once for this qualification.`;
    seen.add(key);
  }
  return "";
}
