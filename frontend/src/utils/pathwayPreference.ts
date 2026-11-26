export const PATHWAY_PREFERENCE_CODE = "APPA-001";
export const PREFERENCE_QUESTION_COUNT = 10;
export const PREFERENCE_OPTION_COUNT = 4;

export const PATHWAY_PREFERENCE_CATEGORIES = [
  { code: "F", label: "Foundation / Matriculation" },
  { code: "S", label: "Form Six / STPM" },
  { code: "D", label: "Diploma" },
  { code: "T", label: "TVET" },
] as const;

export function preferenceCategoryLabel(code: string) {
  return PATHWAY_PREFERENCE_CATEGORIES.find(category => category.code === code)?.label;
}
