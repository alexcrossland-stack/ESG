import PDFDocument from "pdfkit";
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, HeadingLevel, WidthType, AlignmentType, BorderStyle } from "docx";
import {
  parseGeneratedInlineMarkdown,
  parseGeneratedMarkdownBlocks,
  stripMarkdownToText,
  type GeneratedInlineRun,
} from "@shared/generated-document-markdown";

interface ReportSection {
  title: string;
  type: "text" | "table" | "metrics" | "list";
  content?: string;
  items?: string[];
  rows?: { label: string; value: string; status?: string }[];
  tableHeaders?: string[];
  tableRows?: string[][];
}

interface ReportData {
  title: string;
  period?: string;
  sections: ReportSection[];
  summary?: string;
  // Standalone report quality fields — make the exported document credible without the app open
  statusLabel?: string;   // e.g. "Draft", "Provisional", "Confirmed"
  scopeStatement?: string;
  confidenceStatement?: string;
  caveats?: string[];
  nextSteps?: string[];
}

const PDF_CONTENT_WIDTH = 495;
const PDF_PAGE_BREAK_Y = 720;

function ensurePdfSpace(doc: any, minHeight = 36) {
  if (doc.y > PDF_PAGE_BREAK_Y - minHeight) doc.addPage();
}

function pdfFontForRun(run: GeneratedInlineRun): string {
  if (run.bold && run.italic) return "Helvetica-BoldOblique";
  if (run.bold) return "Helvetica-Bold";
  if (run.italic) return "Helvetica-Oblique";
  return "Helvetica";
}

function splitRunsOnNewlines(runs: GeneratedInlineRun[]): GeneratedInlineRun[][] {
  const lines: GeneratedInlineRun[][] = [[]];

  for (const run of runs) {
    const parts = (run.text || "").split("\n");
    parts.forEach((part, index) => {
      if (part) lines[lines.length - 1].push({ ...run, text: part });
      if (index < parts.length - 1) lines.push([]);
    });
  }

  return lines;
}

function renderPdfInlineParagraph(
  doc: any,
  runs: GeneratedInlineRun[],
  options: { fontSize: number; color?: string; indent?: number; after?: number } = { fontSize: 10 },
) {
  const lines = splitRunsOnNewlines(runs);
  const width = PDF_CONTENT_WIDTH - (options.indent || 0);
  const color = options.color || "#333";

  for (const line of lines) {
    ensurePdfSpace(doc, 24);
    if (line.length === 0) {
      doc.moveDown(0.4);
      continue;
    }

    line.forEach((run, index) => {
      doc
        .font(pdfFontForRun(run))
        .fontSize(options.fontSize)
        .fillColor(color)
        .text(run.text || "", {
          width,
          indent: options.indent || 0,
          continued: index < line.length - 1,
        });
    });
  }

  doc.moveDown(options.after ?? 0.55);
}

function renderPdfTable(doc: any, headers: string[], rows: string[][]) {
  if (!headers.length) return;

  const colW = Math.floor(PDF_CONTENT_WIDTH / headers.length);
  const startX = 50;

  ensurePdfSpace(doc, 48);
  doc.fontSize(9).fillColor("#666");
  headers.forEach((header, index) => {
    doc.text(stripMarkdownToText(header) || "-", startX + index * colW, doc.y, {
      width: colW - 5,
      continued: index < headers.length - 1,
    });
  });
  doc.moveDown(0.3);
  doc.strokeColor("#ccc").lineWidth(0.5).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
  doc.moveDown(0.3);

  for (const row of rows) {
    ensurePdfSpace(doc, 28);
    doc.fontSize(9).fillColor("#333");
    row.forEach((cell, index) => {
      doc.text(stripMarkdownToText(cell) || "-", startX + index * colW, doc.y, {
        width: colW - 5,
        continued: index < row.length - 1,
      });
    });
    doc.moveDown(0.2);
  }

  doc.moveDown(0.8);
}

function renderMarkdownToPdf(doc: any, markdown: string) {
  const blocks = parseGeneratedMarkdownBlocks(markdown);

  for (const block of blocks) {
    if (block.type === "heading") {
      const fontSize = block.depth <= 1 ? 12 : block.depth === 2 ? 11 : 10;
      renderPdfInlineParagraph(doc, block.runs, { fontSize, color: "#14532d", after: 0.25 });
      continue;
    }

    if (block.type === "paragraph") {
      const color = block.callout === "disclaimer" ? "#92400e" : block.callout === "note" ? "#1d4ed8" : "#333";
      const indent = block.callout ? 12 : 0;
      renderPdfInlineParagraph(doc, block.runs, { fontSize: 10, color, indent, after: 0.6 });
      continue;
    }

    if (block.type === "list") {
      block.items.forEach((item, index) => {
        const prefix = block.ordered ? `${index + 1}. ` : "• ";
        renderPdfInlineParagraph(doc, [{ text: prefix, bold: true }, ...item.runs], { fontSize: 10, indent: 8, after: 0.2 });
      });
      doc.moveDown(0.3);
      continue;
    }

    if (block.type === "table") {
      renderPdfTable(doc, block.headers, block.rows);
      continue;
    }

    if (block.type === "thematicBreak") {
      ensurePdfSpace(doc, 12);
      doc.strokeColor("#ddd").lineWidth(0.5).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      doc.moveDown(0.7);
    }
  }
}

function docxRunsFromMarkdownRuns(runs: GeneratedInlineRun[], size = 22): TextRun[] {
  if (!runs.length) return [new TextRun({ text: "", size })];

  return runs.map((run) => new TextRun({
    text: run.text,
    size,
    bold: run.bold,
    italics: run.italic,
    font: run.code ? "Courier New" : undefined,
    style: run.code ? "Code" : undefined,
  }));
}

function paragraphFromMarkdownRuns(
  runs: GeneratedInlineRun[],
  options: { size?: number; bullet?: boolean; numbering?: { reference: string; level: number }; color?: string; indent?: number } = {},
) {
  return new Paragraph({
    children: runs.length > 0
      ? runs.map((run) => new TextRun({
          text: run.text,
          size: options.size ?? 22,
          bold: run.bold,
          italics: run.italic,
          color: options.color,
          font: run.code ? "Courier New" : undefined,
          style: run.code ? "Code" : undefined,
        }))
      : [new TextRun({ text: "", size: options.size ?? 22, color: options.color })],
    bullet: options.bullet ? { level: 0 } : undefined,
    numbering: options.numbering,
    indent: options.indent ? { left: options.indent } : undefined,
    spacing: { after: 120 },
  });
}

function buildDocxTable(headers: string[], rows: string[][]) {
  const colPercent = Math.floor(100 / Math.max(headers.length, 1));
  const headerRow = new TableRow({
    children: headers.map((header) => new TableCell({
      children: [new Paragraph({ children: [new TextRun({ text: stripMarkdownToText(header) || "-", bold: true, size: 20 })] })],
      width: { size: colPercent, type: WidthType.PERCENTAGE },
    })),
  });
  const dataRows = rows.map((row) => new TableRow({
    children: row.map((cell) => new TableCell({
      children: [new Paragraph({ children: [new TextRun({ text: stripMarkdownToText(cell) || "-", size: 20 })] })],
      width: { size: colPercent, type: WidthType.PERCENTAGE },
    })),
  }));

  return new Table({
    rows: [headerRow, ...dataRows],
    width: { size: 100, type: WidthType.PERCENTAGE },
  });
}

function renderMarkdownToDocx(markdown: string): Array<Paragraph | Table> {
  const blocks = parseGeneratedMarkdownBlocks(markdown);
  const children: Array<Paragraph | Table> = [];

  blocks.forEach((block) => {
    if (block.type === "heading") {
      const heading = block.depth <= 1
        ? HeadingLevel.HEADING_3
        : block.depth === 2
          ? HeadingLevel.HEADING_4
          : HeadingLevel.HEADING_5;
      children.push(new Paragraph({
        children: docxRunsFromMarkdownRuns(block.runs, 22),
        heading,
        spacing: { before: 120, after: 80 },
      }));
      return;
    }

    if (block.type === "paragraph") {
      const color = block.callout === "disclaimer" ? "92400E" : block.callout === "note" ? "1D4ED8" : undefined;
      children.push(paragraphFromMarkdownRuns(block.runs, { size: 22, color, indent: block.callout ? 240 : undefined }));
      return;
    }

    if (block.type === "list") {
      block.items.forEach((item, index) => {
        if (block.ordered) {
          children.push(paragraphFromMarkdownRuns([{ text: `${index + 1}. ` }, ...item.runs], { size: 22, indent: 240 }));
        } else {
          children.push(paragraphFromMarkdownRuns(item.runs, { size: 22, bullet: true }));
        }
      });
      return;
    }

    if (block.type === "table") {
      children.push(buildDocxTable(block.headers, block.rows));
      return;
    }

    if (block.type === "thematicBreak") {
      children.push(new Paragraph({
        border: { bottom: { color: "D1D5DB", style: BorderStyle.SINGLE, size: 1 } },
        spacing: { after: 120 },
      }));
    }
  });

  return children;
}

/**
 * Build standalone metadata sections (scope, confidence, status, caveats, next steps)
 * These are prepended to any exported report to make it self-standing.
 * Source of truth: shared evaluateEsgStatus() via the readiness-detail endpoint.
 */
export function buildStandaloneMetaSections(opts: {
  companyName: string;
  reportingPeriod: string;
  esgState?: "IN_PROGRESS" | "DRAFT" | "PROVISIONAL" | "CONFIRMED";
  completenessPercent?: number;
  evidenceCoveragePercent?: number;
  estimatedPercent?: number;
  scopeStatement?: string;
  caveats?: string[];
  nextSteps?: string[];
}): ReportSection[] {
  const {
    companyName, reportingPeriod, esgState = "DRAFT",
    completenessPercent = 0, evidenceCoveragePercent = 0,
    estimatedPercent = 0,
  } = opts;

  const statusLabelMap: Record<string, string> = {
    IN_PROGRESS: "Baseline — In Progress",
    DRAFT: "Baseline — Draft",
    PROVISIONAL: "Provisional",
    CONFIRMED: "Confirmed",
  };
  const statusLabel = statusLabelMap[esgState] || "Draft";

  const confidenceStatement = esgState === "CONFIRMED"
    ? `This report is based on ${completenessPercent}% measured data with ${evidenceCoveragePercent}% evidence coverage. Data quality is sufficient for stakeholder reporting.`
    : esgState === "PROVISIONAL"
    ? `This report covers ${completenessPercent}% of tracked metrics. ${estimatedPercent > 0 ? `${estimatedPercent}% of values are estimated. ` : ""}Evidence coverage is ${evidenceCoveragePercent}%. Results should be treated as indicative pending further data collection.`
    : esgState === "DRAFT"
    ? `This is a draft baseline report. ${estimatedPercent}% of values are estimated and ${100 - completenessPercent}% of metrics have no data. This report should not be used for external disclosure without further data improvement.`
    : `Data collection is in progress. This report should not be used for external reporting or regulatory disclosure.`;

  const scopeStatement = opts.scopeStatement ||
    `This report covers the ESG performance of ${companyName} for the reporting period ${reportingPeriod}. It includes data from all active sites and organisational-level metric entries. The reporting boundary is the legal entity of ${companyName}.`;

  const defaultCaveats: string[] = [];
  if (estimatedPercent > 20) {
    defaultCaveats.push(`${estimatedPercent}% of metric values are estimated using proxies or benchmarks rather than measured actuals. These values should be replaced with direct measurements as data collection matures.`);
  }
  if (evidenceCoveragePercent < 30) {
    defaultCaveats.push("Supporting evidence documents (invoices, meter readings, certificates) are available for fewer than 30% of reported metrics. Evidence should be uploaded to strengthen report credibility.");
  }
  if (esgState === "DRAFT" || esgState === "IN_PROGRESS") {
    defaultCaveats.push("This report is a baseline document intended to establish a starting point for ESG performance tracking. It does not constitute a formal ESG audit or regulatory compliance certificate.");
  }
  if (completenessPercent < 60) {
    defaultCaveats.push(`Data completeness is ${completenessPercent}%. Metrics without data are excluded from score calculations, which may not fully represent the organisation's ESG position.`);
  }

  const caveats = opts.caveats ?? defaultCaveats;

  const defaultNextSteps: string[] = [];
  if (estimatedPercent > 20) defaultNextSteps.push("Replace estimated values with actual measured data (utility bills, meter readings, payroll records).");
  if (evidenceCoveragePercent < 50) defaultNextSteps.push("Upload evidence documents to support reported metric values and improve report credibility.");
  if (completenessPercent < 80) defaultNextSteps.push("Enter data for missing metrics to increase data completeness above 80%.");
  if (esgState !== "CONFIRMED") defaultNextSteps.push("Work towards Confirmed report status by measuring all material metrics and evidencing key values.");
  defaultNextSteps.push("Review this report with your Company Admin and Approver before sharing with third parties.");

  const nextSteps = opts.nextSteps ?? defaultNextSteps;

  const sections: ReportSection[] = [];

  sections.push({
    title: "Report Status & Scope",
    type: "metrics",
    rows: [
      { label: "Report Status", value: statusLabel, status: esgState === "CONFIRMED" ? "green" : esgState === "PROVISIONAL" ? undefined : "amber" },
      { label: "Organisation", value: companyName },
      { label: "Reporting Period", value: reportingPeriod },
      { label: "Data Completeness", value: `${completenessPercent}%`, status: completenessPercent >= 80 ? "green" : completenessPercent >= 50 ? "amber" : "red" },
      { label: "Evidence Coverage", value: `${evidenceCoveragePercent}%`, status: evidenceCoveragePercent >= 50 ? "green" : evidenceCoveragePercent >= 25 ? "amber" : "red" },
      { label: "Estimated Values", value: `${estimatedPercent}%`, status: estimatedPercent <= 20 ? "green" : estimatedPercent <= 50 ? "amber" : "red" },
    ],
  });

  sections.push({
    title: "Reporting Scope",
    type: "text",
    content: scopeStatement,
  });

  sections.push({
    title: "Confidence & Data Quality",
    type: "text",
    content: confidenceStatement,
  });

  if (caveats.length > 0) {
    sections.push({
      title: "Material Caveats",
      type: "list",
      items: caveats,
    });
  }

  if (nextSteps.length > 0) {
    sections.push({
      title: "Recommended Next Steps",
      type: "list",
      items: nextSteps,
    });
  }

  return sections;
}

// ============================================================
// EXTENDED REPORT DATA BUILDERS
// These functions transform raw ESG data into ReportData structures
// ============================================================

/**
 * Classify a metric value into exactly one of the four required source categories:
 * Measured | Derived | Estimated | Missing
 *
 * Mapping rationale:
 *   "evidenced"  → Measured   (directly measured with supporting evidence/documents)
 *   "calculated" → Derived    (derived mathematically from other metrics/fields)
 *   "estimated"  → Estimated  (approximated via proxies, benchmarks, or extrapolation)
 *   "manual"     → Measured   (manually entered measured value, no derived/estimation involved)
 *   absent/null  → Missing
 */
function labelDataSource(v: { dataSourceType?: string | null; isDerived?: boolean }): "Measured" | "Derived" | "Estimated" | "Missing" {
  if (v.isDerived) return "Derived";
  switch (v.dataSourceType) {
    case "evidenced":
    case "manual":
      return "Measured";
    case "calculated":
      return "Derived";
    case "estimated":
      return "Estimated";
    default:
      return "Missing";
  }
}

/**
 * Build ESG Metrics Summary report data
 * Clearly distinguishes: measured, derived, estimated, missing
 */
export function buildEsgMetricsSummaryReport(data: {
  company: any;
  metrics: any[];
  values: any[];
  period?: string;
  siteName?: string;
  dateFrom?: string | null;
  dateTo?: string | null;
  reportedCount?: number;
  missingCount?: number;
}): ReportData {
  const { company, metrics, values, period, siteName, dateFrom, dateTo } = data;

  const metricsByCategory: Record<string, { metric: any; value: any }[]> = {};
  for (const m of metrics) {
    const v = values.find((val: any) => val.metricId === m.id || val.metricName === m.name);
    const cat = m.category || "other";
    if (!metricsByCategory[cat]) metricsByCategory[cat] = [];
    metricsByCategory[cat].push({ metric: m, value: v });
  }

  const sections: ReportSection[] = [];

  // Summary stats — use pre-computed counts (unique metric IDs) if provided
  const totalMetrics = metrics.length;
  const reportedMetricIds = new Set(values.map((v: any) => v.metricId || v.id).filter(Boolean));
  const reportedCount = data.reportedCount !== undefined ? data.reportedCount : reportedMetricIds.size;
  const missingCount = data.missingCount !== undefined ? data.missingCount : Math.max(0, totalMetrics - reportedCount);
  const measuredCount = values.filter((v: any) => v.dataSourceType === "evidenced" || v.dataSourceLabel === "Evidenced").length;
  const estimatedCount = values.filter((v: any) => v.dataSourceType === "estimated" || v.dataSourceLabel === "Estimated").length;
  const derivedCount = values.filter((v: any) => v.dataSourceType === "calculated" || (v.metric?.metricType === "derived" || v.metric?.metricType === "calculated")).length;

  sections.push({
    title: "Data Quality Overview",
    type: "metrics",
    rows: [
      { label: "Total Metrics Tracked", value: String(totalMetrics) },
      { label: "Reported / Populated", value: String(reportedCount), status: reportedCount > 0 ? "green" : "red" },
      { label: "Measured (evidence-backed)", value: String(measuredCount), status: measuredCount > 0 ? "green" : "amber" },
      { label: "Derived (calculated from inputs)", value: String(derivedCount) },
      { label: "Estimated (no evidence)", value: String(estimatedCount), status: estimatedCount > 0 ? "amber" : "green" },
      { label: "Missing (no data)", value: String(missingCount), status: missingCount > 0 ? "red" : "green" },
    ],
  });

  for (const [category, entries] of Object.entries(metricsByCategory)) {
    sections.push({
      title: `${capitalize(category)} Metrics`,
      type: "table",
      tableHeaders: ["Metric", "Value", "Unit", "Source Type", "Status"],
      tableRows: entries.map(({ metric, value }) => [
        metric.name,
        value ? String(parseFloat(value.value ?? "0").toLocaleString()) : "—",
        metric.unit || "—",
        value ? labelDataSource(value) : "Missing",
        value?.workflowLabel || (value ? "Draft" : "Not reported"),
      ]),
    });
  }

  return {
    title: "ESG Metrics Summary",
    period,
    summary: `This report summarises all ESG metric data${siteName ? ` for ${siteName}` : ""} for the reporting period${period ? ` ${period}` : ""}. Values are labelled as Measured (evidenced), Derived (calculated from inputs), Estimated (unverified), or Missing (not reported). This report does not imply certification or audit sign-off.`,
    sections,
  };
}

/**
 * Build Framework Readiness Summary report
 * Uses "alignment/readiness" language only — no certification language
 */
export function buildFrameworkReadinessSummaryReport(data: {
  company: any;
  frameworkReadiness: any;
  selectedFrameworks: any[];
  period?: string;
  dateFrom?: string | null;
  dateTo?: string | null;
}): ReportData {
  const { company, frameworkReadiness, selectedFrameworks, period } = data;

  const sections: ReportSection[] = [];

  sections.push({
    title: "Framework Readiness Overview",
    type: "text",
    content: `This section summarises the organisation's current readiness alignment against selected ESG frameworks. Readiness indicates the degree to which available data and policies align with framework requirements. It does not constitute certification, assurance, or regulatory compliance confirmation.`,
  });

  if (selectedFrameworks.length === 0) {
    sections.push({
      title: "Selected Frameworks",
      type: "text",
      content: "No frameworks have been selected for alignment tracking. Visit Framework Settings to enable frameworks.",
    });
  } else {
    const overallReadiness = frameworkReadiness?.overallReadiness ?? {};
    const frameworkRows = selectedFrameworks.map((fw: any) => {
      const readiness = overallReadiness[fw.code] ?? frameworkReadiness?.[fw.code] ?? {};
      const score = readiness.readinessScore ?? readiness.score ?? "—";
      const met = readiness.metRequirements ?? readiness.met ?? "—";
      const total = readiness.totalRequirements ?? readiness.total ?? "—";
      return [
        fw.name || fw.code,
        typeof score === "number" ? `${score}%` : String(score),
        `${met} / ${total}`,
        readiness.status || (typeof score === "number" && score >= 80 ? "Strong alignment" : score >= 50 ? "Partial alignment" : "Early stage"),
      ];
    });

    sections.push({
      title: "Framework Alignment Status",
      type: "table",
      tableHeaders: ["Framework", "Readiness Score", "Requirements Met", "Alignment Status"],
      tableRows: frameworkRows,
    });
  }

  if (frameworkReadiness?.requirementGaps?.length > 0) {
    sections.push({
      title: "Readiness Gaps",
      type: "list",
      items: frameworkReadiness.requirementGaps.slice(0, 20).map((g: any) =>
        `${g.frameworkCode || ""} ${g.code || ""}: ${g.title || g.description || "Requirement not yet met"}`
      ),
    });
  }

  sections.push({
    title: "Methodology Note",
    type: "text",
    content: `Readiness alignment is assessed by mapping available metric data and policy records to framework requirement categories. A requirement is considered "aligned" when the corresponding metric has reported data for the period or when a relevant policy is in active status. This is an indicative assessment only and does not constitute formal certification or regulatory confirmation.`,
  });

  return {
    title: "Framework Readiness Summary",
    period,
    summary: `Indicative alignment readiness assessment for ${company?.name || "your organisation"} against selected ESG reporting frameworks. Alignment/readiness language is used throughout. No certification is implied.`,
    sections,
  };
}

/**
 * Build Target Progress Summary report
 */
export function buildTargetProgressSummaryReport(data: {
  company: any;
  targets: any[];
  period?: string;
  dateFrom?: string | null;
  dateTo?: string | null;
}): ReportData {
  const { company, targets, period } = data;
  const sections: ReportSection[] = [];

  const byStatus: Record<string, any[]> = {};
  for (const t of targets) {
    const s = t.status || "not_started";
    if (!byStatus[s]) byStatus[s] = [];
    byStatus[s].push(t);
  }

  const total = targets.length;
  const achieved = (byStatus.achieved || []).length;
  const inProgress = (byStatus.in_progress || []).length;
  const notStarted = (byStatus.not_started || []).length;
  const missed = (byStatus.missed || []).length;

  sections.push({
    title: "Target Progress Overview",
    type: "metrics",
    rows: [
      { label: "Total Targets", value: String(total) },
      { label: "Achieved", value: String(achieved), status: achieved > 0 ? "green" : "amber" },
      { label: "In Progress", value: String(inProgress), status: inProgress > 0 ? "amber" : undefined },
      { label: "Not Started", value: String(notStarted), status: notStarted > 0 ? "red" : "green" },
      { label: "Missed", value: String(missed), status: missed > 0 ? "red" : "green" },
      { label: "Completion Rate", value: total > 0 ? `${Math.round((achieved / total) * 100)}%` : "—", status: achieved / (total || 1) >= 0.5 ? "green" : "amber" },
    ],
  });

  const byPillar: Record<string, any[]> = {};
  for (const t of targets) {
    const p = t.pillar || "other";
    if (!byPillar[p]) byPillar[p] = [];
    byPillar[p].push(t);
  }

  for (const [pillar, pillarTargets] of Object.entries(byPillar)) {
    sections.push({
      title: `${capitalize(pillar)} Targets`,
      type: "table",
      tableHeaders: ["Target", "Baseline", "Target Value", "Target Year", "Progress", "Status"],
      tableRows: pillarTargets.map((t: any) => [
        t.title || "—",
        t.baselineValue ? `${t.baselineValue}` : "—",
        t.targetValue ? `${t.targetValue}` : "—",
        t.targetYear ? String(t.targetYear) : "—",
        t.progressPercent != null ? `${t.progressPercent}%` : "—",
        formatStatus(t.status),
      ]),
    });
  }

  return {
    title: "Target Progress Summary",
    period,
    summary: `Progress report on ESG targets for ${company?.name || "your organisation"}. Targets are categorised by ESG pillar and shown with current progress status.`,
    sections,
  };
}

/**
 * Build Policy Register Summary report
 */
export function buildPolicyRegisterSummaryReport(data: {
  company: any;
  policyRecords: any[];
  period?: string;
  dateFrom?: string | null;
  dateTo?: string | null;
}): ReportData {
  const { company, policyRecords, period } = data;
  const sections: ReportSection[] = [];

  const total = policyRecords.length;
  const active = policyRecords.filter((p: any) => p.status === "active").length;
  const draft = policyRecords.filter((p: any) => p.status === "draft").length;
  const underReview = policyRecords.filter((p: any) => p.status === "under_review").length;
  const retired = policyRecords.filter((p: any) => p.status === "retired").length;

  sections.push({
    title: "Policy Register Overview",
    type: "metrics",
    rows: [
      { label: "Total Policies", value: String(total) },
      { label: "Active", value: String(active), status: active > 0 ? "green" : "amber" },
      { label: "Draft", value: String(draft), status: draft > 0 ? "amber" : "green" },
      { label: "Under Review", value: String(underReview) },
      { label: "Retired / Superseded", value: String(retired) },
    ],
  });

  const byType: Record<string, any[]> = {};
  for (const p of policyRecords) {
    const t = p.policyType || "other";
    if (!byType[t]) byType[t] = [];
    byType[t].push(p);
  }

  sections.push({
    title: "Policy Register",
    type: "table",
    tableHeaders: ["Policy Title", "Type", "Owner", "Status", "Effective Date", "Review Date"],
    tableRows: policyRecords.map((p: any) => [
      p.title || "—",
      formatPolicyType(p.policyType),
      p.owner || "—",
      formatStatus(p.status),
      p.effectiveDate ? new Date(p.effectiveDate).toLocaleDateString("en-GB") : "—",
      p.reviewDate ? new Date(p.reviewDate).toLocaleDateString("en-GB") : "—",
    ]),
  });

  sections.push({
    title: "Methodology Note",
    type: "text",
    content: "This policy register summarises ESG-related policies tracked in the system. Policy status reflects the current recorded state. Active policies are those marked as in-force. This register does not represent a legal compliance assessment.",
  });

  return {
    title: "Policy Register Summary",
    period,
    summary: `Policy register for ${company?.name || "your organisation"} as at ${new Date().toLocaleDateString("en-GB")}. Covers all ESG-related policy records tracked in the system.`,
    sections,
  };
}

/**
 * Build Risk Register Summary report
 */
export function buildRiskRegisterSummaryReport(data: {
  company: any;
  risks: any[];
  period?: string;
  dateFrom?: string | null;
  dateTo?: string | null;
}): ReportData {
  const { company, risks, period } = data;
  const sections: ReportSection[] = [];

  const total = risks.length;
  const open = risks.filter((r: any) => r.status === "open").length;
  const mitigated = risks.filter((r: any) => r.status === "mitigated").length;
  const accepted = risks.filter((r: any) => r.status === "accepted").length;

  const highRisk = risks.filter((r: any) => (r.riskScore || 0) >= 16).length;
  const medRisk = risks.filter((r: any) => (r.riskScore || 0) >= 9 && (r.riskScore || 0) < 16).length;
  const lowRisk = risks.filter((r: any) => (r.riskScore || 0) < 9).length;

  sections.push({
    title: "Risk Register Overview",
    type: "metrics",
    rows: [
      { label: "Total Risks Identified", value: String(total) },
      { label: "Open Risks", value: String(open), status: open > 0 ? "amber" : "green" },
      { label: "Mitigated", value: String(mitigated), status: mitigated > 0 ? "green" : undefined },
      { label: "Accepted", value: String(accepted) },
      { label: "High Risk (Score ≥16)", value: String(highRisk), status: highRisk > 0 ? "red" : "green" },
      { label: "Medium Risk (Score 9–15)", value: String(medRisk), status: medRisk > 0 ? "amber" : "green" },
      { label: "Low Risk (Score <9)", value: String(lowRisk), status: "green" },
    ],
  });

  const byPillar: Record<string, any[]> = {};
  for (const r of risks) {
    const p = r.pillar || "other";
    if (!byPillar[p]) byPillar[p] = [];
    byPillar[p].push(r);
  }

  for (const [pillar, pillarRisks] of Object.entries(byPillar)) {
    sections.push({
      title: `${capitalize(pillar)} Risks`,
      type: "table",
      tableHeaders: ["Risk", "Type", "Likelihood", "Impact", "Score", "Status", "Owner"],
      tableRows: pillarRisks.map((r: any) => [
        r.title || "—",
        formatRiskType(r.riskType),
        formatLevel(r.likelihood),
        formatLevel(r.impact),
        r.riskScore ? String(r.riskScore) : "—",
        formatStatus(r.status),
        r.owner || "—",
      ]),
    });
  }

  return {
    title: "Risk Register Summary",
    period,
    summary: `ESG risk register for ${company?.name || "your organisation"} as at ${new Date().toLocaleDateString("en-GB")}. Risks are rated by likelihood × impact score. This summary is for internal management purposes.`,
    sections,
  };
}

/**
 * Build Site Comparison Summary report
 */
export function buildSiteComparisonSummaryReport(data: {
  company: any;
  sites: any[];
  sitesSummary: any[];
  metricsBySite?: Record<string, any[]>;
  period?: string;
  dateFrom?: string | null;
  dateTo?: string | null;
}): ReportData {
  const { company, sites, sitesSummary, metricsBySite, period } = data;
  const sections: ReportSection[] = [];

  sections.push({
    title: "Site Overview",
    type: "table",
    tableHeaders: ["Site", "Type", "Country", "Status", "Metrics Reported", "Evidence Count", "Questionnaires"],
    tableRows: sitesSummary.map((s: any) => {
      const site = sites.find((st: any) => st.id === s.siteId);
      return [
        s.siteName || "—",
        site?.type ? capitalize(site.type) : "—",
        site?.country || "—",
        formatStatus(s.status),
        String(s.metricCount || 0),
        String(s.evidenceCount || 0),
        String(s.questionnaireCount || 0),
      ];
    }),
  });

  if (metricsBySite && Object.keys(metricsBySite).length > 0) {
    sections.push({
      title: "Metric Comparison by Site",
      type: "text",
      content: "The following table compares key reported metric values across sites for the selected period. Values labelled as Measured are evidenced; Estimated values lack supporting documentation.",
    });

    for (const [siteId, siteMetrics] of Object.entries(metricsBySite)) {
      const siteInfo = sites.find((s: any) => s.id === siteId);
      const siteSummary = sitesSummary.find((s: any) => s.siteId === siteId);
      sections.push({
        title: `Site: ${siteInfo?.name || siteSummary?.siteName || siteId}`,
        type: "table",
        tableHeaders: ["Metric", "Value", "Unit", "Source"],
        tableRows: siteMetrics.map((m: any) => [
          m.metricName || m.name || "—",
          m.value ? String(parseFloat(m.value).toLocaleString()) : "—",
          m.unit || "—",
          labelDataSource(m),
        ]),
      });
    }
  }

  sections.push({
    title: "Methodology Note",
    type: "text",
    content: "Site comparison data is based on reported metric values for the selected period. Sites with no metric data entered may appear with zero values. Comparison is indicative only and does not account for differences in site size, operations, or reporting scope.",
  });

  return {
    title: "Site Comparison Summary",
    period,
    summary: `Multi-site ESG data comparison for ${company?.name || "your organisation"}${period ? ` — ${period}` : ""}. Data is sourced from site-level metric entries. Source type labels (Measured/Estimated/Derived/Missing) are applied to all values.`,
    sections,
  };
}

// ============================================================
// PDF and DOCX generation
// ============================================================

export async function generatePdf(reportData: ReportData, reportType: string, companyName: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50, bufferPages: true });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(20).fillColor("#1a7a52").text(companyName, { align: "center" });
    doc.moveDown(0.3);
    doc.fontSize(14).fillColor("#333").text(formatReportType(reportType), { align: "center" });
    doc.moveDown(0.2);
    doc.fontSize(10).fillColor("#666").text(
      `Generated: ${new Date().toLocaleDateString("en-GB")}${reportData.period ? ` | Period: ${reportData.period}` : ""}`,
      { align: "center" }
    );
    doc.moveDown(0.3);
    doc.strokeColor("#1a7a52").lineWidth(1).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(1);

    if (reportData.summary) {
      renderMarkdownToPdf(doc, reportData.summary);
      doc.moveDown(0.2);
    }

    for (const section of reportData.sections) {
      if (doc.y > 700) doc.addPage();

      doc.fontSize(13).fillColor("#1a7a52").text(section.title);
      doc.moveDown(0.3);
      doc.strokeColor("#ddd").lineWidth(0.5).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      doc.moveDown(0.5);

      if (section.type === "text" && section.content) {
        renderMarkdownToPdf(doc, section.content);
      }

      if (section.type === "list" && section.items) {
        for (const item of section.items) {
          const runs = parseGeneratedInlineMarkdown(item);
          renderPdfInlineParagraph(doc, [{ text: "• ", bold: true }, ...(runs.length > 0 ? runs : [{ text: stripMarkdownToText(item) }])], {
            fontSize: 10,
            indent: 8,
            after: 0.2,
          });
        }
        doc.moveDown(0.3);
      }

      if (section.type === "metrics" && section.rows) {
        const tableTop = doc.y;
        const colWidths = [250, 120, 120];
        const startX = 50;

        doc.fontSize(9).fillColor("#666");
        doc.text("Metric", startX, tableTop);
        doc.text("Value", startX + colWidths[0], tableTop);
        doc.text("Status", startX + colWidths[0] + colWidths[1], tableTop);
        doc.moveDown(0.3);
        doc.strokeColor("#ccc").lineWidth(0.5).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
        doc.moveDown(0.3);

        for (const row of section.rows) {
          if (doc.y > 720) doc.addPage();
          const y = doc.y;
          doc.fontSize(9).fillColor("#333");
          doc.text(stripMarkdownToText(row.label) || "-", startX, y, { width: colWidths[0] - 10 });
          doc.text(stripMarkdownToText(row.value) || "-", startX + colWidths[0], y, { width: colWidths[1] - 10 });
          const statusColor = row.status === "green" ? "#16a34a" : row.status === "amber" ? "#d97706" : row.status === "red" ? "#dc2626" : "#666";
          doc.fillColor(statusColor).text(stripMarkdownToText(row.status || "-") || "-", startX + colWidths[0] + colWidths[1], y);
          doc.moveDown(0.2);
        }
        doc.moveDown(0.8);
      }

      if (section.type === "table" && section.tableHeaders && section.tableRows) {
        renderPdfTable(doc, section.tableHeaders, section.tableRows);
      }
    }

    const pages = doc.bufferedPageRange();
    for (let i = pages.start; i < pages.start + pages.count; i++) {
      doc.switchToPage(i);
      doc.fontSize(8).fillColor("#999").text(
        `${companyName} | ${formatReportType(reportType)} | Page ${i + 1} of ${pages.count}`,
        50, 780, { align: "center", width: 495 }
      );
    }

    doc.end();
  });
}

export async function generateDocx(reportData: ReportData, reportType: string, companyName: string): Promise<Buffer> {
  const children: any[] = [];

  children.push(
    new Paragraph({
      children: [new TextRun({ text: companyName, bold: true, size: 36, color: "1a7a52" })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
    }),
    new Paragraph({
      children: [new TextRun({ text: formatReportType(reportType), size: 28, color: "333333" })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
    }),
    new Paragraph({
      children: [new TextRun({
        text: `Generated: ${new Date().toLocaleDateString("en-GB")}${reportData.period ? ` | Period: ${reportData.period}` : ""}`,
        size: 20, color: "666666", italics: true,
      })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 300 },
    })
  );

  if (reportData.summary) {
    children.push(...renderMarkdownToDocx(reportData.summary));
  }

  for (const section of reportData.sections) {
    children.push(new Paragraph({
      text: section.title,
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 300, after: 150 },
    }));

    if (section.type === "text" && section.content) {
      children.push(...renderMarkdownToDocx(section.content));
    }

    if (section.type === "list" && section.items) {
      for (const item of section.items) {
        const runs = parseGeneratedInlineMarkdown(item);
        children.push(paragraphFromMarkdownRuns(runs.length > 0 ? runs : [{ text: stripMarkdownToText(item) }], { size: 22, bullet: true }));
      }
    }

    if (section.type === "metrics" && section.rows) {
      children.push(buildDocxTable(
        ["Metric", "Value", "Status"],
        section.rows.map((row) => [row.label, row.value, row.status || "-"]),
      ));
    }

    if (section.type === "table" && section.tableHeaders && section.tableRows) {
      children.push(buildDocxTable(section.tableHeaders, section.tableRows));
    }
  }

  const doc = new Document({
    sections: [{ children }],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}

function formatReportType(type: string): string {
  const labels: Record<string, string> = {
    board_pack: "Board Pack Report",
    customer_pack: "Customer Response Pack",
    compliance_summary: "Compliance Summary Report",
    assurance_pack: "Assurance Pack",
    register: "ESG Register",
    management: "Internal Management Report",
    customer: "Customer / Supplier Response Pack",
    annual: "Annual ESG Summary",
    esg_metrics_summary: "ESG Metrics Summary",
    framework_readiness_summary: "Framework Readiness Summary",
    target_progress_summary: "Target Progress Summary",
    policy_register_summary: "Policy Register Summary",
    risk_register_summary: "Risk Register Summary",
    site_comparison_summary: "Site Comparison Summary",
  };
  return labels[type] || type.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatStatus(status: string | undefined): string {
  if (!status) return "—";
  const map: Record<string, string> = {
    not_started: "Not Started",
    in_progress: "In Progress",
    achieved: "Achieved",
    missed: "Missed",
    cancelled: "Cancelled",
    open: "Open",
    mitigated: "Mitigated",
    accepted: "Accepted",
    closed: "Closed",
    active: "Active",
    draft: "Draft",
    under_review: "Under Review",
    retired: "Retired",
  };
  return map[status] || status.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
}

function formatPolicyType(t: string | undefined): string {
  if (!t) return "—";
  const map: Record<string, string> = {
    environmental: "Environmental",
    social: "Social",
    governance: "Governance",
    health_safety: "Health & Safety",
    data_privacy: "Data Privacy",
    anti_bribery: "Anti-Bribery",
    whistleblowing: "Whistleblowing",
    cybersecurity: "Cybersecurity",
    supplier: "Supplier",
    climate: "Climate",
    other: "Other",
  };
  return map[t] || capitalize(t);
}

function formatRiskType(t: string | undefined): string {
  if (!t) return "—";
  const map: Record<string, string> = {
    physical: "Physical",
    transition: "Transition",
    regulatory: "Regulatory",
    reputational: "Reputational",
    supply_chain: "Supply Chain",
    operational: "Operational",
    financial: "Financial",
    social: "Social",
    governance: "Governance",
    other: "Other",
  };
  return map[t] || capitalize(t);
}

function formatLevel(l: string | undefined): string {
  if (!l) return "—";
  const map: Record<string, string> = {
    very_low: "Very Low",
    low: "Low",
    medium: "Medium",
    high: "High",
    very_high: "Very High",
  };
  return map[l] || capitalize(l);
}
