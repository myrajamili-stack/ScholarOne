/** Presentation only: never infer terms or supplement the API with local seed data. */
export type DetailBlock =
  | { kind: "text"; text: string }
  | { kind: "list"; items: string[]; ordered: boolean }
  | { kind: "table"; headers: string[]; rows: string[][] };
export type DetailSection = { title: string; blocks: DetailBlock[] };
export type DetailInput = {
  description?: string | null;
  eligibility_criteria?: string | null;
  amount_note?: string | null;
  source_url?: string | null;
  application_url?: string | null;
};

export function deadlinePresentation(listing: { deadline?: string | null; deadline_at?: string | null; deadline_note?: string | null; intake_status?: string | null }) {
  const note = listing.deadline_note || "";
  const exact = listing.deadline_at ? new Date(listing.deadline_at) : null;
  if (exact && Number.isFinite(exact.valueOf())) {
    const formatted = new Intl.DateTimeFormat("en-MY", {
      dateStyle: "medium", timeStyle: "medium", timeZone: "Asia/Kuala_Lumpur",
    }).format(exact);
    const deadline = `${formatted} (Malaysia time)`;
    return { label: listing.intake_status === "closed" ? `Closed (${deadline})` : deadline, note };
  }
  if (listing.intake_status === "closed") return { label: listing.deadline ? `Closed (${listing.deadline})` : "Closed", note };
  if (note.trim() === "No Official Information") return { label: "No Official Information", note: "" };
  const explicitlyOpen = listing.intake_status !== "closed" && /^Open\.\s*/i.test(note);
  return {
    label: explicitlyOpen ? "Open" : listing.deadline || "Not confirmed",
    note: explicitlyOpen ? note.replace(/^Open\.\s*/i, "") : note,
  };
}

export function fundingAmountLabel(listing: { amount?: number | string | null; amount_note?: string | null }) {
  const note = listing.amount_note?.trim();
  const hasPublishedAmount = note && /(?:\b(?:RM|MYR|USD|GBP|EUR|SGD)\s*\d|[$£€]\s*\d|\d[\d,.]*\s*(?:%|ringgit\b))/i.test(note);
  if (hasPublishedAmount) return note.length > 70 ? "See funding details" : note;
  if (listing.amount != null && Number.isFinite(Number(listing.amount)) && Number(listing.amount) > 0) return `RM ${listing.amount}`;
  return "(No Data. Visit Official Source for more details.)";
}

const headings: Record<string, string> = {
  "Eligibility Criteria": "Eligibility Criteria",
  "Residency Requirements": "Residency Requirements",
  "Residency Requirement": "Residency Requirements",
  "Definition of Anak Negeri Melaka": "Residency Requirements",
  "Funding Details": "Funding Details",
  "Funding Amount": "Funding Details",
  "Funding Amount by Study Level": "Funding Details",
  "Application Method": "Application Method",
  "Application Method (Offline)": "Application Method (Offline)",
  "Repayment Conditions": "Repayment Conditions",
  "Repayment Reduction": "Repayment Conditions",
  "Additional Information": "Additional Information",
  "Additional Academic Requirements": "Eligibility Criteria",
  "Academic Requirements": "Eligibility Criteria",
  "Eligible Bachelor's Degree Fields at 20 Selected Public Universities": "Eligibility Criteria",
};
const sourceHeading = /^(Official Sources?|Application Portal|Application Websites|Online Application):\s*(.*)$/i;
const linesOf = (text: string) => text.replace(/\r\n?/g, "\n").split("\n").map(line => line.trim()).filter(Boolean);
const join = (lines: string[]) => lines.join(" ");

/** Only sentence endings / explicit list markers establish new requirements.
 * PDF line wraps inside a sentence remain part of the same requirement. */
export function requirementItems(text: string): string[] {
  const items: string[] = [];
  for (const line of linesOf(text)) {
    const marked = /^(?:[•●▪\uF0B7]|[-*]\s|\d+[.)]\s)/.test(line);
    const clean = line.replace(/^(?:[•●▪\uF0B7]\s*|[-*]\s+|\d+[.)]\s+)/, "");
    if (!items.length || marked || /(?:[.!?;]|;\s*OR)$/.test(items.at(-1)!)) items.push(clean);
    else items[items.length - 1] += ` ${clean}`;
  }
  return items;
}

type TableSchema = { header: RegExp; headers: string[]; row: RegExp; starts?: RegExp };
const schemas: TableSchema[] = [
  {
    header: /^Item Penang Scholar Mutiara Scholar$/,
    headers: ["Item", "Penang Scholar", "Mutiara Scholar"],
    row: /^(Tuition fees|Monthly allowance|Study duration|Employment bond) (Up to RM[\d,]+|RM[\d,]+|Normal degree duration|Yes) (Up to RM[\d,]+|RM[\d,]+|Normal degree duration|Yes)$/,
  },
  {
    header: /^Household gross monthly income Financing$/,
    headers: ["Household gross monthly income", "Financing"],
    row: /^((?:RM|Above RM).+?) (\d+%)$/,
  },
  {
    header: /^Institution \/ Programme Maximum annual amount$/,
    headers: ["Institution / Programme", "Maximum annual amount"],
    row: /^(.+?) (RM[\d,]+(?:\.\d+)?)$/,
    starts: /^(?:Public university|Polytechnic|Community College|Multimedia University|Akademi Laut Malaysia)\b/,
  },
  {
    header: /^Study Level \/ Institution Funding Amount$/,
    headers: ["Study Level / Institution", "Funding Amount"],
    row: /^(.+?) ((?:RM|Tuition fees|Depends on).+)$/,
    starts: /^(?:Master's \/ PhD|Bachelor's Degree|Polytechnic Diploma|SKM \/ DKM|Diploma \/ Degree|Studies at UNIQSAAS|Skills Diploma)\b/,
  },
  {
    header: /^Item (?:Amount|Funding)$/,
    headers: ["Item", "Amount / funding"],
    row: /^(Tuition fees|Monthly allowance|Annual allowance|Funding duration|Employment bond) (.+)$/,
  },
];

function tableAt(lines: string[], start: number) {
  for (const schema of schemas) {
    let headerEnd = start + 1;
    if (!schema.header.test(lines[start])) {
      if (!lines[start + 1] || !schema.header.test(join(lines.slice(start, start + 2)))) continue;
      headerEnd++;
    }
    const rows: string[][] = [];
    let index = headerEnd;
    while (index < lines.length) {
      if (schema.starts && !schema.starts.test(lines[index])) break;
      let end = index + 1;
      // Collect PDF wraps only up to a clearly identified next row or prose note.
      if (schema.starts) {
        while (end < lines.length && !schema.starts.test(lines[end]) &&
          !/^(?:Amounts are based|Funding rates are based|Not all study)/.test(lines[end])) end++;
      }
      const match = join(lines.slice(index, end)).match(schema.row);
      if (!match) break;
      rows.push(match.slice(1));
      index = end;
    }
    if (rows.length) return { block: { kind: "table" as const, headers: schema.headers, rows }, end: index };
  }
  return null;
}

function fundingBlocks(text: string): DetailBlock[] {
  const lines = linesOf(text);
  const blocks: DetailBlock[] = [];
  let pending: string[] = [];
  function flush() {
    if (pending.length) blocks.push({ kind: "text", text: pending.join("\n") });
    pending = [];
  }
  for (let index = 0; index < lines.length;) {
    const table = tableAt(lines, index);
    if (table) { flush(); blocks.push(table.block); index = table.end; }
    else { pending.push(lines[index]); index++; }
  }
  flush();
  return blocks;
}

/** Render explicit numbered steps, preserving unnumbered introductory/trailing text. */
function applicationBlocks(text: string): DetailBlock[] {
  const blocks: DetailBlock[] = [];
  let pending: string[] = [];
  let steps: string[] = [];
  const flush = () => {
    if (pending.length) blocks.push({ kind: "text", text: pending.join("\n") });
    if (steps.length) blocks.push({ kind: "list", ordered: true, items: steps });
    pending = []; steps = [];
  };
  for (const line of linesOf(text)) {
    const match = line.match(/^(\d+)[.)]\s+(.+)$/);
    if (match) {
      if (Number(match[1]) !== steps.length + 1) {
        // Irregular numbering cannot be reconstructed safely.
        return [{ kind: "text", text }];
      }
      steps.push(match[2]);
    } else if (steps.length && !/[.!?]$/.test(steps.at(-1)!)) steps[steps.length - 1] += ` ${line}`;
    else { if (steps.length) flush(); pending.push(line); }
  }
  flush();
  return blocks;
}

/** A funding summary with explicit named categories can itself be a readable table. */
export function publishedFundingBlocks(note?: string | null): DetailBlock[] {
  if (!note) return [];
  const markers = [...note.matchAll(/(?:^|\s)(Penang Scholar|Mutiara Scholar):\s*/g)];
  if (!markers.length) return [{ kind: "text", text: note }];
  const first = markers[0].index!;
  const intro = note.slice(0, first).trim();
  const rows = markers.map((match, index) => [match[1], note.slice(match.index! + match[0].length, markers[index + 1]?.index ?? note.length).trim()]);
  return [...(intro ? [{ kind: "text" as const, text: intro }] : []), { kind: "table", headers: ["Scholarship category", "Published funding"], rows }];
}

export function fundingInformationBlocks(note?: string | null, amount?: number | string | null): DetailBlock[] {
  const text = note?.trim();
  const numericAmount = amount != null && Number.isFinite(Number(amount)) && Number(amount) > 0;
  const notProvided = text && /not (?:officially |publicly )?(?:specified|confirmed|provided|available)|requires? confirmation|subject to (?:the applicable assistance rate|individual assessment)|amount (?:subject to|determined by)|^\s*(?:tba|n\/a|no data)\s*$/i.test(text);
  const statedFigures = text && /\d/.test(text.replace(/\b(?:202\d|level \d)\b/gi, ""));
  // Coverage descriptions remain valid funding information even without a price.
  const statedCoverage = text && /tuition fees (?:and|covered)|covers? (?:tuition|fees|living|accommodation)|converted into a scholarship/i.test(text);
  if (text && (!notProvided || statedFigures || statedCoverage)) return publishedFundingBlocks(text);
  if (numericAmount) return [{ kind: "text", text: `RM ${amount}` }];
  return [{ kind: "text", text: "No Data. Visit the provided links for more information." }];
}

/** Suppress only monetary table rows whose category, benefit and every amount
 * are explicitly present in the upper summary. Keep all other rows and notes. */
function alreadyPublished(row: string[], headers: string[], note: string) {
  const benefit = row[0] === "Tuition fees" ? /tuition fees/i : row[0] === "Monthly allowance" ? /monthly (?:living )?allowance/i : null;
  if (!benefit) return false;
  return row.slice(1).every((cell, index) => {
    // Extra qualifiers or periods in a cell must survive; numbers alone do not
    // prove that two funding statements describe the same benefit.
    if (!/^(?:Up to )?RM[\d,]+(?:\.\d+)?$/.test(cell)) return false;
    const amounts = cell.match(/RM[\d,]+(?:\.\d+)?/g);
    if (!amounts?.length) return false;
    const category = headers[index + 1];
    const categoryStart = note.indexOf(`${category}:`);
    const scope = categoryStart >= 0 ? note.slice(categoryStart).split(/\s+(?:Penang Scholar|Mutiara Scholar):/)[0] : headers.length === 2 ? note : "";
    return benefit.test(scope) && scope.toLowerCase().includes(cell.toLowerCase()) && amounts.every(amount => new RegExp(`${amount.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\d,.])`).test(scope));
  });
}

export function buildScholarshipDetails(input: DetailInput): DetailSection[] {
  const sections: DetailSection[] = [];
  const sources: string[] = [];
  function add(title: string, text: string, subheading?: string) {
    if (!text.trim()) return;
    const blocks: DetailBlock[] = [];
    if (subheading) blocks.push({ kind: "text", text: subheading });
    if (title === "Funding Details") blocks.push(...fundingBlocks(text));
    else if (title === "Application Method" || title === "Application Method (Offline)") blocks.push(...applicationBlocks(text));
    else if (["Eligibility Criteria", "Residency Requirements", "Repayment Conditions"].includes(title)) {
      const lines = linesOf(text);
      if (title === "Residency Requirements" && lines[0]?.endsWith(":")) {
        blocks.push({ kind: "text", text: lines.shift()! });
      }
      if (lines.length) blocks.push({ kind: "list", ordered: false, items: subheading === "Eligible Bachelor's Degree Fields at 20 Selected Public Universities" ? lines : requirementItems(lines.join("\n")) });
    }
    else blocks.push({ kind: "text", text });
    const existing = sections.find(section => section.title === title);
    if (existing) existing.blocks.push(...blocks);
    else sections.push({ title, blocks });
  }
  function split(text: string, initial: string) {
    let title = initial;
    let subheading: string | undefined;
    let pending: string[] = [];
    const flush = () => { add(title, pending.join("\n"), subheading); pending = []; };
    for (const line of linesOf(text)) {
      const heading = headings[line.replace(/:$/, "")];
      const source = line.match(sourceHeading);
      if (heading) {
        flush(); title = heading;
        subheading = line.replace(/:$/, "") !== heading ? line : undefined;
      } else if (source) {
        flush(); title = "Official Sources and Application Portal"; subheading = undefined;
        pending.push(line);
      } else pending.push(line);
    }
    flush();
  }
  split(input.description || "", "Scholarship Description");
  split(input.eligibility_criteria || "", "Eligibility Criteria");
  for (const section of sections) {
    if (section.title === "Funding Details" && input.amount_note) {
      section.blocks = section.blocks.flatMap<DetailBlock>(block => {
        if (block.kind !== "table") return [block];
        const rows = block.rows.filter(row => !alreadyPublished(row, block.headers, input.amount_note!));
        return rows.length ? [{ ...block, rows }] : [];
      });
    }
    if (section.title === "Official Sources and Application Portal") {
      for (const block of section.blocks) if (block.kind === "text") sources.push(...linesOf(block.text).filter(line => !/^Official Sources?:$/i.test(line)));
    }
  }
  // Exact duplicate source lines (including the API's primary source URL) appear once.
  for (const [label, url] of [["Official Source", input.source_url], ["Application Portal", input.application_url]]) {
    if (url && !sources.some(line => (line.match(/https?:\/\/[^\s<>"']+/g) || []).some(link => link.replace(/[.,;]+$/, "") === url))) {
      sources.push(`${label}: ${url}`);
    }
  }
  const labelledSources: string[] = [];
  for (const line of sources) {
    if (/^https?:\/\/\S+$/.test(line)) {
      const previous = labelledSources.at(-1);
      if (previous && /^(?:Application Portal|Application Link|Application Websites|Online Application):$/i.test(previous)) {
        labelledSources[labelledSources.length - 1] = `${previous} ${line}`;
      } else labelledSources.push(`Official Source: ${line}`);
    } else labelledSources.push(line);
  }
  const result = sections.filter(section => section.title !== "Official Sources and Application Portal" && section.blocks.length);
  if (labelledSources.length) result.push({ title: "Official Sources and Application Portal", blocks: [{ kind: "text", text: [...new Set(labelledSources)].join("\n") }] });
  const order = ["Scholarship Description", "Eligibility Criteria", "Residency Requirements", "Funding Details", "Application Method", "Application Method (Offline)", "Repayment Conditions", "Additional Information", "Official Sources and Application Portal"];
  return result.sort((a, b) => order.indexOf(a.title) - order.indexOf(b.title));
}
