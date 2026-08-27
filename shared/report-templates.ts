export const REPORT_TEMPLATE_IDS = [
  "management",
  "customer",
  "annual",
  "board",
  "compliance",
  "vsme",
  "ppn006",
] as const;

export type ReportTemplateId = (typeof REPORT_TEMPLATE_IDS)[number];

export const REPORT_TEMPLATE_LABELS: Record<ReportTemplateId, string> = {
  management: "Full ESG Report",
  customer: "Customer Response Pack",
  annual: "Annual ESG Report",
  board: "Board Summary",
  compliance: "Framework Readiness Summary",
  vsme: "VSME Readiness & Draft Pack",
  ppn006: "PPN 006 Readiness Pack",
};

export function isReportTemplateId(value: unknown): value is ReportTemplateId {
  return typeof value === "string" && (REPORT_TEMPLATE_IDS as readonly string[]).includes(value);
}
