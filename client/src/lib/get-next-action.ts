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
  const filledMetrics: number = readiness?.filledMetrics ?? readiness?.esgStatus?.filledMetrics ?? 0;
  const dataCompleteness: number = readiness?.dataCompletenessPercent ?? 0;

  // Activation precedence: reach a useful, evidenced baseline before asking an SME
  // to complete every optional metric enabled by its sector pack.
  if (filledMetrics === 0 || state === "IN_PROGRESS" && dataCompleteness === 0) {
    return {
      title: "Start your ESG baseline",
      description: "Add a few figures from your bills, payroll or accounts to establish a useful starting point.",
      ctaLabel: "Add your first data",
      href: "/data-entry",
    };
  }

  if (filledMetrics < 3 && dataCompleteness < 30) {
    return {
      title: "Add two or three priority figures",
      description: "A small, balanced starter set is enough to create your first useful baseline.",
      ctaLabel: "Continue measuring",
      href: "/data-entry",
    };
  }

  if (evidenceCoverage === 0) {
    return {
      title: "Support one figure with evidence",
      description: "Attach a bill, invoice or HR record so your baseline has a clear source.",
      ctaLabel: "Add supporting evidence",
      href: "/evidence",
    };
  }

  if (reportingReadiness && !hasGeneratedReport) {
    return {
      title: "Create your first baseline report",
      description: "You now have enough data and source evidence for a practical first report.",
      ctaLabel: "Create baseline report",
      href: "/reports",
    };
  }

  if (estimatedPct > 20) {
    return {
      title: "Replace estimates with measured figures",
      description: `${estimatedPct}% of tracked data is estimated. Measured values improve confidence.`,
      ctaLabel: "Review estimates",
      href: "/data-entry?highlight=estimated",
    };
  }

  if (missingItems.length > 0 || missingPercent > 0) {
    return {
      title: "Strengthen your baseline",
      description: "Add another relevant figure when it becomes available; optional detail can wait.",
      ctaLabel: "Review tracked metrics",
      href: "/data-entry",
    };
  }

  if (evidenceCoverage < 50) {
    return {
      title: "Add more supporting evidence",
      description: "Link documents to important figures to make future reports more credible.",
      ctaLabel: "Review evidence",
      href: "/evidence",
    };
  }

  return {
    title: "Keep your baseline current",
    description: "Add the latest period's figures and track practical improvements over time.",
    ctaLabel: "Review latest data",
    href: "/data-entry",
  };
}
