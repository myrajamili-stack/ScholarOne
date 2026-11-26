import type { LikertDefinition } from "../types/likertAssessment";

type SavedDefinition = Omit<LikertDefinition, "questions" | "next_question_number"> & {
  next_question_number?: number;
  questions: (Omit<LikertDefinition["questions"][number], "display_number"> & { display_number?: number })[];
};

function positiveNumber(value: number | undefined): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

export function restoreLikertNumbering(definition: SavedDefinition): LikertDefinition {
  const savedNumbers = definition.questions.map(question => question.display_number).filter(positiveNumber);
  const used = new Set<number>();
  let next = Math.max(positiveNumber(definition.next_question_number) ? definition.next_question_number : 1,
    Math.max(0, ...savedNumbers) + 1);
  const questions = definition.questions.map(question => {
    const saved = question.display_number;
    const number = positiveNumber(saved) && !used.has(saved) ? saved : next++;
    used.add(number);
    return { ...question, display_number: number };
  });
  return { ...definition, questions, next_question_number: next };
}
