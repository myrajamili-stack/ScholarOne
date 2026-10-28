import type { AuthUser } from "./auth";

export type StudentProfile = AuthUser & {
  date_of_birth?: string | null;
  gender?: string | null;
  nationality?: string | null;
  education_level?: string | null;
  cgpa?: number | string | null;
  field_of_study?: string | null;
  university?: string | null;
};
