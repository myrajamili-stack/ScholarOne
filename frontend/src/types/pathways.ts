export type PathwayStage = { title: string; qualification: string; duration: string; description: string };
export type AcademicPathway = {
  pathway_id: number; title: string; description: string; field: string; level: string; status: string;
  guidance: { starting_qualifications: string[]; stages: PathwayStage[]; career_goal?: string; career_outcomes: string[];
    next_steps: string[]; riasec_codes: string[]; keywords: string[]; entry_requirements: string;
    sources: { label: string; url: string }[] };
  reasons?: string[];
};
