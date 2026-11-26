import type { AcademicPathway } from "../types/pathways";

export default function PathwayProgression({ pathway }: { pathway: AcademicPathway }) {
  const guidance = pathway.guidance;
  return <div className="pathway-progression">
    <p>{pathway.description}</p>
    {guidance?.career_goal && <p><strong>Career goal:</strong> {guidance.career_goal}</p>}
    <p><strong>Starting qualifications:</strong> {guidance?.starting_qualifications?.join(", ") || "Not specified"}</p>
    <h3>Recommended Study Progression</h3>
    {guidance?.stages?.length ? <ol className="pathway-stages">{guidance.stages.map((stage, index) => <li key={index}>
      <span className="pathway-step-number" aria-hidden="true">{index + 1}</span><div><h4>{stage.title}</h4><p><strong>{stage.qualification}</strong> · {stage.duration}</p><p>{stage.description}</p></div>
    </li>)}</ol> : <p>Progression details have not been added yet.</p>}
    <h3>Entry Requirements</h3><p>{guidance?.entry_requirements || "Confirm requirements with the provider."}</p>
    {!!guidance?.career_outcomes?.length && <><h3>Career Directions to Explore</h3><ul>{guidance.career_outcomes.map(value => <li key={value}>{value}</li>)}</ul></>}
    <h3>Your Next Steps</h3><ol>{guidance?.next_steps?.map(value => <li key={value}>{value}</li>)}</ol>
    <h3>Official Sources</h3><ul>{guidance?.sources?.map(source => <li key={source.url}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.label} ↗</a></li>)}</ul>
    <p className="pathway-caution">Progression and interest matching do not guarantee admission, credit transfer, employment or funding. Confirm current requirements with the institution.</p>
  </div>;
}
