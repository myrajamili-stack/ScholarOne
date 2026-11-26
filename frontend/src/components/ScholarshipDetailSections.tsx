import { Fragment } from "react";
import { buildScholarshipDetails, fundingInformationBlocks, requirementItems, type DetailBlock, type DetailInput } from "../utils/scholarshipDetails";

/** Only literal HTTP(S) URLs become links. Reference names remain readable text. */
function LinkedText({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s<>"']+)/g);
  return <>{parts.map((part, index) => {
    if (!/^https?:\/\//.test(part)) return <Fragment key={index}>{part}</Fragment>;
    const url = part.replace(/[.,;]+$/, "");
    return <Fragment key={index}><a href={url} target="_blank" rel="noopener noreferrer">{url}</a>{part.slice(url.length)}</Fragment>;
  })}</>;
}

function Blocks({ blocks, bulletText = false }: { blocks: DetailBlock[]; bulletText?: boolean }) {
  return <>{blocks.map((block, index) => {
    if (block.kind === "table") return <div className="scholarship-detail-table-wrap" key={index} role="region" aria-label={block.headers.join(" / ")} tabIndex={0}>
      <table className="scholarship-detail-table">
        <thead><tr>{block.headers.map(header => <th scope="col" key={header}>{header}</th>)}</tr></thead>
        <tbody>{block.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => cellIndex === 0
          ? <th scope="row" key={cellIndex}><LinkedText text={cell} /></th>
          : <td key={cellIndex}><LinkedText text={cell} /></td>)}</tr>)}</tbody>
      </table>
    </div>;
    if (block.kind === "list") {
      const List = block.ordered ? "ol" : "ul";
      return <List className="scholarship-detail-list" key={index}>{block.items.map((item, itemIndex) => <li key={itemIndex}><LinkedText text={item} /></li>)}</List>;
    }
    if (bulletText) {
      const lines = block.text.split("\n");
      const introduction = lines[0].trim().endsWith(":") ? lines.shift() : undefined;
      const items = requirementItems(lines.join("\n"));
      return <Fragment key={index}>
        {introduction && <p className="scholarship-detail-copy"><LinkedText text={introduction} /></p>}
        {items.length > 0 && <ul className="scholarship-detail-list">{items.map((item, itemIndex) => <li key={itemIndex}><LinkedText text={item} /></li>)}</ul>}
      </Fragment>;
    }
    return <p className="scholarship-detail-copy" key={index}><LinkedText text={block.text} /></p>;
  })}</>;
}

export function PublishedFunding({ note, amount }: { note?: string | null; amount?: number | string | null }) {
  return <Blocks blocks={fundingInformationBlocks(note, amount)} />;
}

export default function ScholarshipDetailSections({ scholarship }: { scholarship: DetailInput }) {
  const sections = buildScholarshipDetails(scholarship);
  const offline = sections.find(section => section.title === "Application Method (Offline)");
  const visibleSections = sections.filter(section => section !== offline);
  if (offline && !visibleSections.some(section => section.title === "Additional Information")) {
    const sourcesIndex = visibleSections.findIndex(section => section.title === "Official Sources and Application Portal");
    visibleSections.splice(sourcesIndex < 0 ? visibleSections.length : sourcesIndex, 0, { title: "Additional Information", blocks: [] });
  }
  return <>{visibleSections.map(section => <section className="scholarship-detail-section" key={section.title}>
    <h3>{section.title}</h3>
    <Blocks blocks={section.blocks} bulletText={section.title === "Funding Details" || section.title === "Additional Information"} />
    {section.title === "Additional Information" && offline && <>
      <h4 className="scholarship-detail-subheading">{offline.title}</h4>
      <Blocks blocks={offline.blocks} />
    </>}
  </section>)}</>;
}
