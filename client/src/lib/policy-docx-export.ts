import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, HeadingLevel, WidthType } from "docx";
import { parseGeneratedMarkdownBlocks, stripMarkdownToText, type GeneratedInlineRun } from "@shared/generated-document-markdown";

function sanitizeDocxText(value: unknown): string {
  if (value == null) return "";
  const normalized = String(value).replace(/\r\n?/g, "\n");
  let sanitized = "";

  for (let index = 0; index < normalized.length; index++) {
    const codeUnit = normalized.charCodeAt(index);

    if (codeUnit >= 0xD800 && codeUnit <= 0xDBFF) {
      const nextCodeUnit = normalized.charCodeAt(index + 1);
      if (nextCodeUnit >= 0xDC00 && nextCodeUnit <= 0xDFFF) {
        sanitized += normalized[index] + normalized[index + 1];
        index += 1;
      }
      continue;
    }

    if (codeUnit >= 0xDC00 && codeUnit <= 0xDFFF) continue;

    const isValidXmlChar =
      codeUnit === 0x09 ||
      codeUnit === 0x0A ||
      codeUnit === 0x0D ||
      (codeUnit >= 0x20 && codeUnit <= 0xD7FF) ||
      (codeUnit >= 0xE000 && codeUnit <= 0xFFFD);

    if (isValidXmlChar) sanitized += normalized[index];
  }

  return sanitized;
}

function docxRunsFromMarkdownRuns(runs: GeneratedInlineRun[], size = 22): TextRun[] {
  if (!runs.length) return [new TextRun({ text: "", size })];
  return runs.map((run) => new TextRun({
    text: sanitizeDocxText(run.text),
    size,
    bold: run.bold,
    italics: run.italic,
    font: run.code ? "Courier New" : undefined,
  }));
}

function paragraphFromMarkdownRuns(runs: GeneratedInlineRun[], options: { size?: number; bullet?: boolean } = {}) {
  return new Paragraph({
    children: docxRunsFromMarkdownRuns(runs, options.size ?? 22),
    bullet: options.bullet ? { level: 0 } : undefined,
    spacing: { after: 120 },
  });
}

function buildDocxTable(headers: string[], rows: string[][]) {
  const colPercent = Math.floor(100 / Math.max(headers.length, 1));
  return new Table({
    rows: [
      new TableRow({
        children: headers.map((header) => new TableCell({
          width: { size: colPercent, type: WidthType.PERCENTAGE },
          children: [
            new Paragraph({
              children: [new TextRun({ text: sanitizeDocxText(stripMarkdownToText(header)) || "-", bold: true, size: 20 })],
            }),
          ],
        })),
      }),
      ...rows.map((row) => new TableRow({
        children: row.map((cell) => new TableCell({
          width: { size: colPercent, type: WidthType.PERCENTAGE },
          children: [
            new Paragraph({
              children: [new TextRun({ text: sanitizeDocxText(stripMarkdownToText(cell)) || "-", size: 20 })],
            }),
          ],
        })),
      })),
    ],
    width: { size: 100, type: WidthType.PERCENTAGE },
  });
}

function renderMarkdownToDocx(markdown: string): Array<Paragraph | Table> {
  const blocks = parseGeneratedMarkdownBlocks(markdown);
  const children: Array<Paragraph | Table> = [];

  for (const block of blocks) {
    if (block.type === "heading") {
      const heading = block.depth <= 1
        ? HeadingLevel.HEADING_1
        : block.depth === 2
          ? HeadingLevel.HEADING_2
          : HeadingLevel.HEADING_3;
      children.push(new Paragraph({
        children: docxRunsFromMarkdownRuns(block.runs, 22),
        heading,
        spacing: { before: 160, after: 100 },
      }));
      continue;
    }

    if (block.type === "paragraph") {
      children.push(paragraphFromMarkdownRuns(block.runs));
      continue;
    }

    if (block.type === "list") {
      for (const [index, item] of Array.from(block.items.entries())) {
        if (block.ordered) {
          const runs = item.runs.length ? item.runs : [{ text: stripMarkdownToText(item.text) }];
          children.push(new Paragraph({
            children: docxRunsFromMarkdownRuns([{ text: `${index + 1}. ` }, ...runs], 22),
            spacing: { after: 120 },
          }));
        } else {
          children.push(paragraphFromMarkdownRuns(item.runs.length ? item.runs : [{ text: stripMarkdownToText(item.text) }], { bullet: true }));
        }
      }
      continue;
    }

    if (block.type === "table") {
      children.push(buildDocxTable(block.headers, block.rows));
      continue;
    }

    if (block.type === "thematicBreak") {
      children.push(new Paragraph({ text: "", spacing: { after: 120 } }));
    }
  }

  return children;
}

export async function exportPolicyDocx(markdown: string): Promise<Blob> {
  return Packer.toBlob(new Document({ sections: [{ children: renderMarkdownToDocx(markdown) }] }));
}
