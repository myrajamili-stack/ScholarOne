import type { AuthUser } from "./auth";

export type Qualification = "spm" | "igcse_o_level" | "stpm" | "matriculation" | "foundation" | "diploma" | "a_level" | "bachelors";

export type AcademicResult = {
  cgpa?: string | number | null;
  subjects?: { subject: string; grade: string }[];
  grading_scale?: string;
  muet_band?: string;
  institution?: string;
  field_of_study?: string;
  programme_name?: string;
};

export type AcademicQualifications = Partial<Record<Qualification, AcademicResult>>;

export type StudentProfile = AuthUser & {
  date_of_birth?: string | null;
  gender?: string | null;
  nationality?: string | null;
  education_level?: string | null;
  cgpa?: number | string | null;
  field_of_study?: string | null;
  university?: string | null;
  academic_qualifications?: AcademicQualifications;
};
