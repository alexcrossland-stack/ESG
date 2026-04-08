import { marked } from "marked";
import sanitizeHtml from "sanitize-html";

type CalloutKind = "note" | "disclaimer" | null;

export type GeneratedInlineRun = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
  href?: string;
};

export type GeneratedMarkdownBlock =
  | { type: "heading"; depth: number; runs: GeneratedInlineRun[]; text: string }
  | { type: "paragraph"; runs: GeneratedInlineRun[]; text: string; callout: CalloutKind }
  | { type: "list"; ordered: boolean; items: { runs: GeneratedInlineRun[]; text: string }[] }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "thematicBreak" };

const MARKED_OPTIONS = {
  gfm: true,
  breaks: true,
} as const;

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    ...sanitizeHtml.defaults.allowedTags,
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "hr",
    "table",
    "thead",
    "tbody",
    "tfoot",
    "tr",
    "th",
    "td",
  ],
  allowedAttributes: {
    a: ["href", "name", "target", "rel"],
    td: ["colspan", "rowspan"],
    th: ["colspan", "rowspan"],
  },
  allowedSchemes: ["http", "https", "mailto"],
  transformTags: {
    a: sanitizeHtml.simpleTransform("a", { target: "_blank", rel: "noopener noreferrer" }),
  },
};

export const GENERATED_DOCUMENT_STYLES = `
.generated-document-content {
  color: #1f2937;
  font-family: "Segoe UI", Arial, sans-serif;
  font-size: 15px;
  line-height: 1.7;
}

.generated-document-content h1,
.generated-document-content h2,
.generated-document-content h3,
.generated-document-content h4,
.generated-document-content h5,
.generated-document-content h6 {
  color: #14532d;
  font-weight: 700;
  line-height: 1.25;
  margin: 1.5rem 0 0.75rem;
  page-break-after: avoid;
}

.generated-document-content h1 {
  font-size: 1.9rem;
  margin-top: 0;
}

.generated-document-content h2 {
  font-size: 1.35rem;
  padding-bottom: 0.3rem;
  border-bottom: 1px solid #d1d5db;
}

.generated-document-content h3 {
  font-size: 1.1rem;
}

.generated-document-content p,
.generated-document-content ul,
.generated-document-content ol,
.generated-document-content table,
.generated-document-content blockquote {
  margin: 0.85rem 0;
}

.generated-document-content ul,
.generated-document-content ol {
  padding-left: 1.4rem;
}

.generated-document-content li + li {
  margin-top: 0.35rem;
}

.generated-document-content strong {
  font-weight: 700;
}

.generated-document-content em {
  font-style: italic;
}

.generated-document-content code {
  font-family: "SFMono-Regular", Consolas, monospace;
  background: #f3f4f6;
  border-radius: 4px;
  padding: 0.1rem 0.3rem;
  font-size: 0.92em;
}

.generated-document-content table {
  width: 100%;
  border-collapse: collapse;
  page-break-inside: avoid;
}

.generated-document-content thead {
  display: table-header-group;
}

.generated-document-content th,
.generated-document-content td {
  border: 1px solid #d1d5db;
  padding: 0.65rem 0.75rem;
  text-align: left;
  vertical-align: top;
}

.generated-document-content th {
  background: #f3f4f6;
  font-weight: 700;
}

.generated-document-content tr {
  page-break-inside: avoid;
}

.generated-document-content hr {
  border: 0;
  border-top: 1px solid #d1d5db;
  margin: 1.5rem 0;
}

.generated-document-content .generated-callout {
  border-left: 4px solid #94a3b8;
  border-radius: 8px;
  padding: 0.85rem 1rem;
  background: #f8fafc;
}

.generated-document-content .generated-callout-note {
  border-left-color: #2563eb;
  background: #eff6ff;
}

.generated-document-content .generated-callout-disclaimer {
  border-left-color: #d97706;
  background: #fffbeb;
}

@media print {
  .generated-document-content {
    font-size: 12pt;
  }

  .generated-document-content h1,
  .generated-document-content h2,
  .generated-document-content h3,
  .generated-document-content h4,
  .generated-document-content h5,
  .generated-document-content h6,
  .generated-document-content blockquote {
    page-break-inside: avoid;
  }
}
`;

export function renderGeneratedMarkdownToHtml(markdown: string): string {
  const compiled = String(marked.parse(markdown || "", MARKED_OPTIONS));
  const sanitized = sanitizeHtml(compiled, SANITIZE_OPTIONS);
  return decorateCallouts(sanitized);
}

export function buildGeneratedDocumentHtmlPage(options: {
  title: string;
  bodyHtml: string;
}): string {
  const escapedTitle = escapeHtml(options.title);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapedTitle}</title>
  <style>${GENERATED_DOCUMENT_STYLES}</style>
  <style>
    body {
      margin: 0;
      padding: 40px;
      background: #ffffff;
    }

    .generated-document-shell {
      max-width: 900px;
      margin: 0 auto;
    }
  </style>
</head>
<body>
  <main class="generated-document-shell generated-document-content">${options.bodyHtml}</main>
</body>
</html>`;
}

export function parseGeneratedMarkdownBlocks(markdown: string): GeneratedMarkdownBlock[] {
  const tokens = marked.lexer(markdown || "", MARKED_OPTIONS) as any[];
  return parseBlockTokens(tokens);
}

export function parseGeneratedInlineMarkdown(text: string): GeneratedInlineRun[] {
  const blocks = parseGeneratedMarkdownBlocks(text || "");
  const first = blocks[0];
  if (!first) return [];
  if (first.type === "paragraph" || first.type === "heading") return first.runs;
  if (first.type === "list") return first.items[0]?.runs || [];
  return [{ text: stripMarkdownToText(text) }];
}

export function stripMarkdownToText(markdown: string): string {
  const html = renderGeneratedMarkdownToHtml(markdown || "");
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h1|h2|h3|h4|h5|h6|li|tr|blockquote)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function parseBlockTokens(tokens: any[], inheritedCallout: CalloutKind = null): GeneratedMarkdownBlock[] {
  const blocks: GeneratedMarkdownBlock[] = [];

  for (const token of tokens || []) {
    if (!token) continue;

    if (token.type === "space") {
      continue;
    }

    if (token.type === "heading") {
      const runs = extractInlineRuns(token.tokens || [{ type: "text", text: token.text || "" }]);
      blocks.push({
        type: "heading",
        depth: Math.max(1, Math.min(Number(token.depth) || 1, 6)),
        runs,
        text: runsToText(runs),
      });
      continue;
    }

    if (token.type === "paragraph" || token.type === "text") {
      const paragraphToken = token.tokens ? token : { ...token, tokens: [{ type: "text", text: token.text || token.raw || "" }] };
      const runs = extractInlineRuns(paragraphToken.tokens || []);
      const text = runsToText(runs);
      if (!text.trim()) continue;
      blocks.push({
        type: "paragraph",
        runs,
        text,
        callout: inheritedCallout || classifyCallout(text),
      });
      continue;
    }

    if (token.type === "list") {
      blocks.push({
        type: "list",
        ordered: Boolean(token.ordered),
        items: (token.items || []).map((item: any) => {
          const itemBlocks = parseBlockTokens(item.tokens || [], inheritedCallout);
          const firstItemBlock = itemBlocks.find((block) => block.type === "paragraph" || block.type === "heading" || block.type === "list");
          if (!firstItemBlock) {
            const fallback = stripMarkdownToText(item.text || item.raw || "");
            return { runs: [{ text: fallback }], text: fallback };
          }
          if (firstItemBlock.type === "list") {
            const listText = firstItemBlock.items.map((entry) => entry.text).join(" ");
            return { runs: [{ text: listText }], text: listText };
          }
          return { runs: firstItemBlock.runs, text: firstItemBlock.text };
        }),
      });
      continue;
    }

    if (token.type === "table") {
      blocks.push({
        type: "table",
        headers: (token.header || []).map((cell: any) => parseInlineTextFromToken(cell)),
        rows: (token.rows || []).map((row: any[]) => row.map((cell: any) => parseInlineTextFromToken(cell))),
      });
      continue;
    }

    if (token.type === "blockquote") {
      const blockquoteText = stripMarkdownToText(token.text || token.raw || "");
      const callout = inheritedCallout || classifyCallout(blockquoteText) || "note";
      blocks.push(...parseBlockTokens(token.tokens || [], callout));
      continue;
    }

    if (token.type === "hr") {
      blocks.push({ type: "thematicBreak" });
      continue;
    }
  }

  return blocks;
}

function extractInlineRuns(tokens: any[], style: Partial<GeneratedInlineRun> = {}): GeneratedInlineRun[] {
  const runs: GeneratedInlineRun[] = [];

  for (const token of tokens || []) {
    if (!token) continue;

    if (token.type === "strong") {
      runs.push(...extractInlineRuns(token.tokens || [{ type: "text", text: token.text || "" }], { ...style, bold: true }));
      continue;
    }

    if (token.type === "em") {
      runs.push(...extractInlineRuns(token.tokens || [{ type: "text", text: token.text || "" }], { ...style, italic: true }));
      continue;
    }

    if (token.type === "codespan") {
      runs.push({ text: token.text || "", ...style, code: true });
      continue;
    }

    if (token.type === "link") {
      const linkedRuns = extractInlineRuns(token.tokens || [{ type: "text", text: token.text || token.href || "" }], style);
      linkedRuns.forEach((run) => {
        runs.push({ ...run, href: token.href || run.href });
      });
      continue;
    }

    if (token.type === "br") {
      runs.push({ text: "\n", ...style });
      continue;
    }

    if (token.type === "html") {
      const text = sanitizeHtml(token.raw || token.text || "", { allowedTags: [], allowedAttributes: {} }).trim();
      if (text) runs.push({ text, ...style });
      continue;
    }

    if (token.tokens) {
      runs.push(...extractInlineRuns(token.tokens, style));
      continue;
    }

    const text = token.text ?? token.raw ?? "";
    if (text) runs.push({ text, ...style });
  }

  return runs;
}

function parseInlineTextFromToken(token: any): string {
  if (token == null) return "";
  if (typeof token === "string") return stripMarkdownToText(token);
  if (token.tokens) return runsToText(extractInlineRuns(token.tokens));
  if (token.text) return stripMarkdownToText(token.text);
  if (token.raw) return stripMarkdownToText(token.raw);
  return "";
}

function runsToText(runs: GeneratedInlineRun[]): string {
  return runs.map((run) => run.text).join("");
}

function classifyCallout(text: string): CalloutKind {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized.startsWith("disclaimer:") || normalized.startsWith("warning:") || normalized.startsWith("caution:")) {
    return "disclaimer";
  }
  if (normalized.startsWith("note:")) {
    return "note";
  }
  return null;
}

function decorateCallouts(html: string): string {
  const classifyFromInnerHtml = (inner: string): CalloutKind => {
    const text = inner.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    return classifyCallout(text);
  };

  let decorated = html.replace(/<blockquote>([\s\S]*?)<\/blockquote>/gi, (_match, inner) => {
    const kind = classifyFromInnerHtml(inner) || "note";
    return `<blockquote class="generated-callout generated-callout-${kind}">${inner}</blockquote>`;
  });

  decorated = decorated.replace(/<p>([\s\S]*?)<\/p>/gi, (match, inner) => {
    const kind = classifyFromInnerHtml(inner);
    if (!kind) return match;
    return `<p class="generated-callout generated-callout-${kind}">${inner}</p>`;
  });

  return decorated;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
