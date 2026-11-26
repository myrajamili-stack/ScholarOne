import { useEffect, useRef, useState, type FormEvent } from "react";
import api from "../../api/axios";
import { getApiErrorMessage } from "../../utils/apiError";
import type { AcademicPathway, PathwayStage } from "../../types/pathways";
import "../../styles/academic-pathways.css";

const blankStage = (): PathwayStage => ({ title: "", qualification: "", duration: "Refer to provider", description: "" });
const empty = (): AcademicPathway => ({ pathway_id: 0, title: "", description: "", field: "", level: "", status: "draft", guidance: {
  starting_qualifications: ["SPM"], stages: [blankStage(), blankStage()], career_outcomes: [], next_steps: [],
  riasec_codes: [], keywords: [], entry_requirements: "", sources: [{ label: "Official source", url: "" }],
} });

export default function AdminPathwayEditor({ pathwayId, onClose, onSaved }: { pathwayId: number | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState(empty);
  const [loading, setLoading] = useState(pathwayId !== null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
    if (pathwayId === null) return;
    let active = true;
    api.get<{ pathway: AcademicPathway }>(`/admin/pathways/${pathwayId}`).then(({ data }) => {
      if (active) setForm({ ...empty(), ...data.pathway, guidance: { ...empty().guidance, ...data.pathway.guidance } });
    }).catch(err => { if (active) { setError(getApiErrorMessage(err, "Unable to load pathway.")); setLoadFailed(true); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [pathwayId]);
  function stage(index: number, field: keyof PathwayStage, value: string) {
    setForm(current => ({ ...current, guidance: { ...current.guidance, stages: current.guidance.stages.map((item, i) => i === index ? { ...item, [field]: value } : item) } }));
  }
  async function save(event: FormEvent) {
    event.preventDefault(); if (busy || loading || loadFailed) return;
    setBusy(true); setError("");
    const guidance = { ...form.guidance };
    for (const key of ["starting_qualifications", "career_outcomes", "next_steps", "riasec_codes", "keywords"] as const) guidance[key] = guidance[key].map(value => value.trim()).filter(Boolean);
    const payload = { title: form.title, description: form.description, field: form.field, level: form.level, status: form.status, guidance };
    try {
      if (pathwayId === null) await api.post("/admin/pathways", payload);
      else await api.put(`/admin/pathways/${pathwayId}`, payload);
      onSaved();
    } catch (err) { setError(getApiErrorMessage(err, "Unable to save pathway.")); }
    finally { setBusy(false); }
  }
  return <dialog ref={dialog} className="aum-dialog academic-pathway-dialog" aria-labelledby="pathway-editor-title" onCancel={event => { if (busy) event.preventDefault(); else onClose(); }}>
    <header><h2 id="pathway-editor-title">{pathwayId === null ? "Create Academic Pathway" : "Edit Academic Pathway"}</h2><button aria-label="Close pathway editor" disabled={busy} onClick={onClose}>×</button></header>
    {error && <p className="aum-form-error" role="alert">{error}</p>}{loading && <p role="status">Loading pathway…</p>}
    <form onSubmit={save}><fieldset disabled={loading || busy || loadFailed} style={{ border: 0, padding: 0, minWidth: 0, display: "grid", gap: 16 }}>
      {([['title', 'Pathway Title'], ['field', 'Field / Discipline'], ['level', 'Destination Level']] as const).map(([key, label]) => <label key={key}>{label}<input required maxLength={key === 'title' ? 200 : 100} value={form[key]} onChange={event => setForm({ ...form, [key]: event.target.value })} /></label>)}
      <label>Description<textarea required maxLength={5000} value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} /></label>
      <label>Publication Status<select value={form.status} onChange={event => setForm({ ...form, status: event.target.value })}><option value="draft">Draft — hidden from students</option><option value="active">Published</option></select></label>
      <label>Career goal<textarea maxLength={500} value={form.guidance.career_goal ?? ""} onChange={event => setForm({ ...form, guidance: { ...form.guidance, career_goal: event.target.value } })} /></label>
      <label>Starting Qualifications (one per line)<textarea required value={form.guidance.starting_qualifications.join('\n')} onChange={event => setForm({ ...form, guidance: { ...form.guidance, starting_qualifications: event.target.value.split('\n') } })} /><small>Use profile levels such as SPM, Secondary School, STPM, Matriculation, Foundation, Certificate, Diploma, Undergraduate or Master's.</small></label>
      <h3>Study Progression</h3>{form.guidance.stages.map((item, index) => <section key={index} className="pathway-editor-stage"><h4>Stage {index + 1}</h4>{(['title', 'qualification', 'duration', 'description'] as const).map(key => <label key={key}>{key.charAt(0).toUpperCase() + key.slice(1)}<input required maxLength={1500} value={item[key]} onChange={event => stage(index, key, event.target.value)} /></label>)}<button type="button" className="aum-outline" disabled={form.guidance.stages.length <= 2} onClick={() => setForm({ ...form, guidance: { ...form.guidance, stages: form.guidance.stages.filter((_, i) => i !== index) } })}>Remove Stage</button></section>)}
      <button type="button" className="aum-outline" disabled={form.guidance.stages.length >= 12} onClick={() => setForm({ ...form, guidance: { ...form.guidance, stages: [...form.guidance.stages, blankStage()] } })}>Add Stage</button>
      <label>Entry Requirements and Conditions<textarea required maxLength={5000} value={form.guidance.entry_requirements} onChange={event => setForm({ ...form, guidance: { ...form.guidance, entry_requirements: event.target.value } })} /></label>
      {([['next_steps', 'Next Steps'], ['career_outcomes', 'Career Directions to Explore'], ['keywords', 'Field Matching Keywords']] as const).map(([key, label]) => <label key={key}>{label} (one per line)<textarea required={key === 'next_steps'} value={form.guidance[key].join('\n')} onChange={event => setForm({ ...form, guidance: { ...form.guidance, [key]: event.target.value.split('\n') } })} /></label>)}
      <label>Related RIASEC Interests (editorial guidance)<select multiple value={form.guidance.riasec_codes} onChange={event => setForm({ ...form, guidance: { ...form.guidance, riasec_codes: [...event.target.selectedOptions].map(option => option.value) } })}>{[['R', 'Realistic'], ['I', 'Investigative'], ['A', 'Artistic'], ['S', 'Social'], ['E', 'Enterprising'], ['C', 'Conventional']].map(([code, label]) => <option key={code} value={code}>{code} — {label}</option>)}</select></label>
      <h3>Official Sources</h3>{form.guidance.sources.map((source, index) => <section key={index} className="pathway-editor-stage">{(['label', 'url'] as const).map(key => <label key={key}>{key === 'label' ? 'Source Label' : 'Official URL'}<input type={key === 'url' ? 'url' : 'text'} required value={source[key]} onChange={event => setForm({ ...form, guidance: { ...form.guidance, sources: form.guidance.sources.map((value, i) => i === index ? { ...value, [key]: event.target.value } : value) } })} /></label>)}<button type="button" className="aum-outline" disabled={form.guidance.sources.length === 1} onClick={() => setForm({ ...form, guidance: { ...form.guidance, sources: form.guidance.sources.filter((_, i) => i !== index) } })}>Remove Source</button></section>)}
      <button type="button" className="aum-outline" disabled={form.guidance.sources.length >= 10} onClick={() => setForm({ ...form, guidance: { ...form.guidance, sources: [...form.guidance.sources, { label: '', url: '' }] } })}>Add Official Source</button>
      <button type="submit" className="aum-primary">{busy ? "Saving…" : "Save Pathway"}</button>
    </fieldset></form>
  </dialog>;
}
