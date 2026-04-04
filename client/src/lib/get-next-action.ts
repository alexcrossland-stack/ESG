export type NextAction = {
  title: string;
  description: string;
  ctaLabel: string;
  href: string;
};

export function getNextAction(readiness: any): NextAction {
  const state: string = readiness?.esgStatus?.state ?? "IN_PROGRESS";
  const estimatedPct: number = readiness?.estimatedPercent ?? 0;
  const evidenceCoverage: number = readiness?.evidenceCoveragePercent ?? 0;
  const reportingReadiness: boolean = readiness?.reportingReadiness ?? false;
  const hasGeneratedReport: boolean = readiness?.hasGeneratedReport ?? false;
  const missingItems: string[] = readiness?.esgStatus?.missingItems ?? [];
  const missingPercent: number = readiness?.missingPercent ?? 0;

  if (state === "IN_PROGRESS") {
    return {
      title: "Get your first ESG score",
      description: "Add a few key figures to see your first result.",
      ctaLabel: "Add your first data",
      href: "/data-entry",
    };
  }

  // Strict 5-step precedence for DRAFT, PROVISIONAL, CONFIRMED:

  // Step 1: Missing core data
  if (missingItems.length > 0 || missingPercent > 0) {
    return {
      title: "Complete your ESG data",
      description:
        missingItems.length > 0
          ? `${missingItems.length} key metric${missingItems.length > 1 ? "s are" : " is"} still missing.`
          : "Some required data is still missing.",
      ctaLabel: "Add missing data",
      href: "/data-entry",
    };
  }

  // Step 2: Replace estimated values with real data
  if (estimatedPct > 20) {
    return {
      title: "Replace estimated data with real figures",
      description: `${estimatedPct}% of your data is estimated. Real values improve your score confidence.`,
      ctaLabel: "Update your data",
      href: "/data-entry?highlight=estimated",
    };
  }

  // Step 3: Upload supporting documents
  if (evidenceCoverage < 50) {
    return {
      title: "Add supporting documents",
      description: "Upload proof to strengthen your data and improve score confidence.",
      ctaLabel: "Upload documents",
      href: "/evidence",
    };
  }

  // Step 4: Generate first report (only when system is ready and report not yet created)
  if (reportingReadiness && !hasGeneratedReport) {
    return {
      title: "Generate your first ESG report",
      description: "You have enough data to create an ESG report to share with stakeholders.",
      ctaLabel: "Generate report",
      href: "/reports",
    };
  }

  // Step 5: Keep up to date
  return {
    title: "Keep your ESG data up to date",
    description: "Add new data and track changes over time.",
    ctaLabel: "Review latest data",
    href: "/data-entry",
  };
}
