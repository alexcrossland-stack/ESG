export const DEFAULT_PUBLIC_PASSPORT_SECTIONS = [
  "passport_summary",
  "evidence_confidence",
  "emissions",
  "policies_actions_targets",
  "report_access",
] as const;

export const LEGACY_PUBLIC_PROFILE_SECTIONS = [
  "esg_scores",
  "key_metrics",
  "policy_status",
  "carbon_summary",
  "compliance_highlights",
  "evidence_coverage",
  "certifications",
] as const;

export const PUBLIC_PROFILE_ALLOWED_SECTIONS = [
  ...DEFAULT_PUBLIC_PASSPORT_SECTIONS,
  ...LEGACY_PUBLIC_PROFILE_SECTIONS,
] as const;

export type PublicProfileSection = typeof PUBLIC_PROFILE_ALLOWED_SECTIONS[number];

export type PassportEvidenceLadderKey =
  | "reported"
  | "measured"
  | "source_linked"
  | "reviewed"
  | "evidence_backed"
  | "independently_assured";

export type PassportEvidenceLadderStep = {
  key: PassportEvidenceLadderKey;
  label: string;
  count: number;
  total: number;
  percentage: number;
};

type PassportEvidenceInput = {
  totalMetrics: number;
  filledMetrics: number;
  measuredCount: number;
  estimatedCount: number;
  sourceLinked: number;
  reviewed: number;
  evidenceBacked: number;
  independentlyAssured: number;
};

function boundedCount(value: unknown, total: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.min(total, Math.max(0, Math.round(numeric)));
}

export function calculatePassportCompletion(totalMetrics: unknown, filledMetrics: unknown) {
  const total = Math.max(0, Math.round(Number(totalMetrics) || 0));
  const reported = boundedCount(filledMetrics, total);
  return {
    reportedMetrics: reported,
    totalMetrics: total,
    missingMetrics: Math.max(0, total - reported),
    percentage: total > 0 ? Math.round((reported / total) * 100) : 0,
  };
}

export function buildPassportEvidenceConfidence(input: PassportEvidenceInput) {
  const total = Math.max(0, Math.round(Number(input.totalMetrics) || 0));
  const reported = boundedCount(input.filledMetrics, total);
  const measured = boundedCount(input.measuredCount, total);
  const estimated = boundedCount(input.estimatedCount, total);
  const sourceLinked = boundedCount(input.sourceLinked, total);
  const reviewed = boundedCount(input.reviewed, total);
  const evidenceBacked = boundedCount(input.evidenceBacked, total);
  const independentlyAssured = boundedCount(input.independentlyAssured, total);
  const percentage = (count: number) => total > 0 ? Math.round((count / total) * 100) : 0;

  const ladder: PassportEvidenceLadderStep[] = [
    { key: "reported", label: "Data reported", count: reported, total, percentage: percentage(reported) },
    { key: "measured", label: "Measured data", count: measured, total, percentage: percentage(measured) },
    { key: "source_linked", label: "Source linked", count: sourceLinked, total, percentage: percentage(sourceLinked) },
    { key: "reviewed", label: "Evidence reviewed", count: reviewed, total, percentage: percentage(reviewed) },
    { key: "evidence_backed", label: "Evidence approved", count: evidenceBacked, total, percentage: percentage(evidenceBacked) },
    {
      key: "independently_assured",
      label: "Independently assured",
      count: independentlyAssured,
      total,
      percentage: percentage(independentlyAssured),
    },
  ];

  let level = "not_started";
  let label = "No data reported";
  let description = "No tracked metrics have a value for this reporting period.";

  if (reported > 0) {
    level = "reported";
    label = "Reported, not yet evidence-backed";
    description = `${reported} of ${total} tracked metrics have data; supporting evidence has not yet been approved.`;
  }
  if (sourceLinked > 0) {
    level = "source_linked";
    label = "Sources linked";
    description = `${sourceLinked} of ${total} tracked metrics have a current source document linked.`;
  }
  if (reviewed > 0) {
    level = "reviewed";
    label = "Evidence reviewed";
    description = `${reviewed} of ${total} tracked metrics have evidence that has been reviewed.`;
  }
  if (evidenceBacked > 0) {
    level = "evidence_backed";
    label = "Evidence-backed";
    description = `${evidenceBacked} of ${total} tracked metrics have current approved evidence.`;
  }
  if (independentlyAssured > 0) {
    level = "independently_assured";
    label = "Independently assured";
    description = `${independentlyAssured} of ${total} tracked metrics are marked as independently assured.`;
  }

  return {
    level,
    label,
    description,
    totalMetrics: total,
    measuredCount: measured,
    estimatedCount: estimated,
    ladder,
  };
}

export function normalizePublicProfileSections(
  value: unknown,
  fallback: readonly PublicProfileSection[] = DEFAULT_PUBLIC_PASSPORT_SECTIONS,
): PublicProfileSection[] {
  if (!Array.isArray(value)) return [...fallback];
  const allowed = new Set<string>(PUBLIC_PROFILE_ALLOWED_SECTIONS);
  return Array.from(new Set(value.filter((item): item is PublicProfileSection =>
    typeof item === "string" && allowed.has(item)
  )));
}

export function passportSectionIsVisible(
  sections: readonly string[],
  key: "completion" | "evidenceConfidence" | "emissions" | "policiesActionsTargets" | "reportAccess",
) {
  const selected = new Set(sections);
  if (key === "completion") {
    return selected.has("passport_summary") || selected.has("key_metrics") || selected.has("esg_scores");
  }
  if (key === "evidenceConfidence") {
    return selected.has("evidence_confidence") || selected.has("evidence_coverage");
  }
  if (key === "emissions") {
    return selected.has("emissions") || selected.has("carbon_summary");
  }
  if (key === "policiesActionsTargets") {
    return selected.has("policies_actions_targets") || selected.has("policy_status");
  }
  return selected.has("report_access");
}

export function selectPublicPassportSections(
  passport: Record<string, any>,
  visibleSections: readonly string[],
) {
  const selected: Record<string, any> = {
    version: passport.version,
    title: passport.title,
    organisation: passport.organisation,
    reportingBoundary: passport.reportingBoundary,
    reportingPeriod: passport.reportingPeriod,
    generatedAt: passport.generatedAt,
    disclaimer: passport.disclaimer,
  };

  if (passportSectionIsVisible(visibleSections, "completion")) selected.completion = passport.completion;
  if (passportSectionIsVisible(visibleSections, "evidenceConfidence")) selected.evidenceConfidence = passport.evidenceConfidence;
  if (passportSectionIsVisible(visibleSections, "emissions")) selected.emissions = passport.emissions;
  if (passportSectionIsVisible(visibleSections, "policiesActionsTargets")) {
    selected.policies = passport.policies;
    selected.actions = passport.actions;
    selected.targets = passport.targets;
  }
  if (passportSectionIsVisible(visibleSections, "reportAccess")) selected.reportAccess = passport.reportAccess;

  return selected;
}
