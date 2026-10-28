import type { StudentProfile } from "../types/student";

export const PROFILE_UPDATED_EVENT = "scholarone-profile-updated";

const requiredProfileFields: Array<keyof StudentProfile> = [
  "full_name",
  "email",
  "phone_number",
  "date_of_birth",
  "gender",
  "nationality",
  "education_level",
  "cgpa",
  "field_of_study",
  "university",
];

export function getProfileCompletion(profile: StudentProfile | null) {
  if (!profile) {
    return 0;
  }

  const completedFields = requiredProfileFields.filter((field) => {
    const value = profile[field];
    return value !== null && value !== undefined && String(value).trim() !== "";
  }).length;

  return Math.round((completedFields / requiredProfileFields.length) * 100);
}

export function isProfileComplete(profile: StudentProfile | null) {
  return getProfileCompletion(profile) === 100;
}
