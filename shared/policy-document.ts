export type PolicyDocumentSection = { key: string; label: string };

// Explicit historical AI labels only: broad substring matching would risk
// deleting a genuine subsection such as "Scope of supplier assessments".
const LEGACY_SECTION_LABELS: Record<string, string[]> = {
  commitments: ["Commitments"],
  controls: ["Operational controls", "Operating controls"],
};
const NON_HEADING_CHARACTERS = new RegExp("[^\\p{L}\\p{N}]+", "gu");

function normalizedHeading(value: string): string {
  return value.trim()
    .replace(/^(?:\d+\.)*\d+[.)]?\s+/, "")
    .replace(/[*_`]/g, "")
    .replace(/&(?:amp;)?/gi, " and ")
    .toLocaleLowerCase("en-GB")
    .replace(NON_HEADING_CHARACTERS, " ")
    .trim();
}

export function getOrderedPolicySections(
  content: Record<string, string>,
  templateSections: readonly PolicyDocumentSection[],
): PolicyDocumentSection[] {
  const sections: PolicyDocumentSection[] = [];
  const seen = new Set<string>();
  for (const section of templateSections) {
    if (!seen.has(section.key)) {
      sections.push(section);
      seen.add(section.key);
    }
  }
  // Never drop content saved under a retired or custom section key.
  for (const key of Object.keys(content)) {
    if (!seen.has(key)) sections.push({ key, label: key });
  }
  return sections;
}

export function normalizePolicySectionContent(value: string, section: PolicyDocumentSection): string {
  const labels = new Set([section.label, section.key, ...(LEGACY_SECTION_LABELS[section.key] ?? [])].map(normalizedHeading));
  const lines = String(value ?? "").replace(/\r\n?/g, "\n").split("\n");
  let start = 0;
  // Remove only matching headings at the beginning. Text, nested headings and
  // headings occurring later in a section are left intact; stored text is never
  // rewritten by this presentation-only normalization.
  while (start < lines.length) {
    if (!lines[start].trim()) { start++; continue; }
    const line = lines[start].trim();
    const atx = /^#{1,6}\s+(.+?)(?:\s+#+)?$/.exec(line);
    if (!atx && /^(?:[-+*]\s|>|`{3}|~{3}|\|)|[<>|]/.test(line)) break;
    const heading = atx ? atx[1] : line;
    if (!labels.has(normalizedHeading(heading))) break;
    start++;
    if (!atx && /^\s*(?:={3,}|-{3,})\s*$/.test(lines[start] ?? "")) start++;
  }
  return lines.slice(start).join("\n");
}

export function buildPolicyDocumentSections(
  content: Record<string, string>,
  templateSections: readonly PolicyDocumentSection[],
): string {
  return getOrderedPolicySections(content, templateSections).map((section) =>
    `## ${section.label}\n\n${normalizePolicySectionContent(content[section.key] ?? "", section)}\n`,
  ).join("\n---\n\n");
}
