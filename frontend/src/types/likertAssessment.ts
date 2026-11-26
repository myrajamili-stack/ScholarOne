export type LikertLanguage = "en" | "ms" | "both";
export type LikertCategory = { code: string; label: string };
export type LikertQuestion = { id: string; display_number: number; en: string; ms: string; category: string; weight: number; order: number };
export type LikertDefinition = {
  template: string; code: string; target_group: string; language: LikertLanguage;
  scale: "interest" | "agreement"; categories: LikertCategory[]; questions: LikertQuestion[]; next_question_number: number;
};
export type LikertChoice = { value: number; en: string; ms: string };
export type PublicLikert = {
  code: string; target_group: string; language: LikertLanguage; scale: LikertChoice[];
  questions: Pick<LikertQuestion, "id" | "en" | "ms" | "order">[];
};
export type LikertBuilderConfig = {
  scales: Record<LikertDefinition["scale"], LikertChoice[]>;
  templates: { code: string; title: string; categories: LikertCategory[]; question_categories: string[] }[];
};
