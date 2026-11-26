import { useEffect, useRef } from "react";
import type { LikertBuilderConfig, LikertDefinition, LikertQuestion } from "../../types/likertAssessment";

export const emptyLikert: LikertDefinition = {
  template: "", code: "", target_group: "", language: "both", scale: "interest", categories: [], questions: [], next_question_number: 1,
};

export default function LikertAssessmentFields({ definition, config, locked, onChange, onTemplate }: {
  definition: LikertDefinition; config: LikertBuilderConfig | null; locked: boolean;
  onChange: (definition: LikertDefinition) => void;
  onTemplate: (template: LikertBuilderConfig["templates"][number]) => void;
}) {
  const templateSelected = Boolean(definition.template);
  const nextOrder = Math.max(0, ...definition.questions.map(question => question.order)) + 1;
  const builder = useRef<HTMLFieldSetElement>(null);
  const pendingQuestion = useRef<string | null>(null);
  useEffect(() => {
    if (!pendingQuestion.current) return;
    const question = builder.current?.querySelector(`[data-question-id="${CSS.escape(pendingQuestion.current)}"]`);
    if (!question) return;
    pendingQuestion.current = null;
    const field = question.querySelector<HTMLTextAreaElement>(`textarea[lang="${definition.language === "ms" ? "ms" : "en"}"]`);
    field?.focus({ preventScroll: true });
    question.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  }, [definition.questions, definition.language]);
  function update(patch: Partial<LikertDefinition>) { onChange({ ...definition, ...patch }); }
  function addQuestion() {
    if (nextOrder > 50) return;
    const number = definition.next_question_number;
    const id = `Q${crypto.randomUUID().toUpperCase()}`;
    pendingQuestion.current = id;
    update({ next_question_number: number + 1, questions: [...definition.questions, {
      id, display_number: number, en: "", ms: "", category: definition.categories[0]?.code ?? "", weight: 1, order: nextOrder,
    }] });
  }
  return <fieldset ref={builder} className="aq-question aq-likert-builder" disabled={locked}>
    <legend>Likert assessment settings</legend>
    {config && <label className="am-label">Question-bank template<select value={definition.template} onChange={event => {
      const selected = config.templates.find(item => item.code === event.target.value);
      if (!selected) { update({ template: "" }); return; }
      if (definition.questions.some(row => row.en || row.ms) && !window.confirm("Replace existing questions with the template’s blank rows?")) return;
      onTemplate(selected);
    }}>
      <option value="">Custom assessment</option>
      {config.templates.map(item => <option key={item.code} value={item.code}>{item.title} ({item.code})</option>)}
    </select></label>}
    {templateSelected && <p className="aq-answer-help">{definition.template === "CIA-001" ? "Five interest dimensions (R, I, A, S, E)." : "Six study fields. Results show the top three."} Enter the original bilingual question text before publishing.</p>}
    <label className="am-label">Language<select disabled={templateSelected} value={definition.language} onChange={event => update({ language: event.target.value as LikertDefinition["language"] })}>
      <option value="en">English</option><option value="ms">Malay</option><option value="both">English and Malay</option>
    </select></label>
    <label className="am-label">Response Scale<select value={definition.scale} onChange={event => update({ scale: event.target.value as LikertDefinition["scale"] })}>
      <option value="interest">Interest Preference (1–5)</option><option value="agreement">Agreement (1–5)</option>
    </select></label>
    {config && <ol className="aq-likert-scale">{config.scales[definition.scale].map(choice => <li key={choice.value}>{choice.en} / {choice.ms}</li>)}</ol>}
    <p className="aq-answer-help">Scoring method: response × question weight, summed by category. {definition.questions.length} questions.</p>
    <h3>Category Definitions</h3>
    {definition.categories.map((row, index) => <div className="aq-likert-row" key={index}>
      <label className="am-label">Code<input readOnly={templateSelected} value={row.code} maxLength={12} onChange={event => {
        const code = event.target.value.toUpperCase();
        update({ categories: definition.categories.map((item, i) => i === index ? { ...item, code } : item),
          questions: definition.questions.map(question => question.category === row.code ? { ...question, category: code } : question) });
      }} /></label>
      <label className="am-label">Label<input readOnly={templateSelected} value={row.label} maxLength={100} onChange={event =>
        update({ categories: definition.categories.map((item, i) => i === index ? { ...item, label: event.target.value } : item) })} /></label>
      {!templateSelected && <button type="button" className="am-outline" onClick={() => update({ categories: definition.categories.filter((_, i) => i !== index) })}>Remove category</button>}
    </div>)}
    {!templateSelected && <button type="button" className="am-outline" disabled={definition.categories.length >= 20} onClick={() => update({ categories: [...definition.categories, { code: "", label: "" }] })}>Add category</button>}
    <h3>Assessment Questions ({definition.questions.length})</h3>
    {[...definition.questions].sort((a, b) => a.order - b.order).map((row, index) => {
      const edit = (patch: Partial<Omit<LikertQuestion, "id" | "display_number">>) => update({ questions: definition.questions.map(item => item.id === row.id ? { ...item, ...patch } : item) });
      return <fieldset className="aq-question" key={row.id} data-question-id={row.id}>
        <legend>Question {index + 1}</legend>
        <div className="aq-likert-row">
          <label className="am-label">Question ID<input value={`SOAQ${String(row.display_number).padStart(2, "0")}`} readOnly /></label>
          <label className="am-label">Question Order<input type="number" min={1} max={50} value={row.order || ""} readOnly={templateSelected} onChange={event => edit({ order: Number(event.target.value) })} /></label>
          <label className="am-label">Score Weight<input type="number" min={1} max={10} value={row.weight || ""} readOnly={templateSelected} onChange={event => edit({ weight: Number(event.target.value) })} /></label>
        </div>
        <label className="am-label">Scoring Category<select value={row.category} disabled={templateSelected} onChange={event => edit({ category: event.target.value })}>
          <option value="">Select category</option>{definition.categories.filter(item => item.code).map((item, i) => <option key={i} value={item.code}>{item.code} — {item.label}</option>)}
        </select></label>
        <label className="am-label">Question Text (English)<textarea lang="en" rows={2} maxLength={2000} value={row.en} onChange={event => edit({ en: event.target.value })} /></label>
        <label className="am-label">Question Text (Malay)<textarea lang="ms" rows={2} maxLength={2000} value={row.ms} onChange={event => edit({ ms: event.target.value })} /></label>
        {!templateSelected && <button type="button" className="am-outline" onClick={() => update({ questions: definition.questions.filter(item => item.id !== row.id) })}>Remove question</button>}
      </fieldset>;
    })}
    {!templateSelected && <div className="aq-question-add">
      <button type="button" className="am-outline" disabled={nextOrder > 50 || definition.questions.length >= 50 || !definition.categories.length} onClick={addQuestion}>+ Add Question</button>
      {nextOrder > 50 && definition.questions.length < 50 && <small>Adjust Question Order to leave room after the last question.</small>}
    </div>}
  </fieldset>;
}
