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

  const hasResults = (profile.cgpa != null && String(profile.cgpa).trim() !== "") ||
    Object.values(profile.academic_qualifications ?? {}).some(result =>
      (result.cgpa != null && String(result.cgpa).trim() !== "") || Boolean(result.subjects?.length),
    );
  return Math.round(((completedFields + Number(hasResults)) / (requiredProfileFields.length + 1)) * 100);
}

export function isProfileComplete(profile: StudentProfile | null) {
  return getProfileCompletion(profile) === 100;
}
