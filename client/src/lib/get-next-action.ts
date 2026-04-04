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

  if (state === "DRAFT") {
    if (missingPercent > 0 || missingItems.length > 0) {
      return {
        title: "Complete your data",
        description: "Add missing key metrics to build your ESG score.",
        ctaLabel: "Add missing data",
        href: "/data-entry",
      };
    }
    if (estimatedPct > 20) {
      return {
        title: "Improve your ESG score",
        description: `${estimatedPct}% of your data is estimated. Replace those values with real figures to build confidence.`,
        ctaLabel: "Update your data",
        href: "/data-entry",
      };
    }
    if (evidenceCoverage < 50) {
      return {
        title: "Add supporting documents",
        description: "Upload proof to strengthen your data and improve your score confidence.",
        ctaLabel: "Upload documents",
        href: "/evidence",
      };
    }
    return {
      title: "Complete your data",
      description: "Keep adding data to build your ESG score.",
      ctaLabel: "Enter data",
      href: "/data-entry",
    };
  }

  if (state === "PROVISIONAL") {
    if (missingPercent > 0 || missingItems.length > 0) {
      return {
        title: "Complete your data",
        description: "Add missing key metrics to strengthen your report.",
        ctaLabel: "Add missing data",
        href: "/data-entry",
      };
    }
    if (evidenceCoverage < 60) {
      return {
        title: "Make your report ready to share",
        description: "Upload supporting documents to confirm your data and build credibility.",
        ctaLabel: "Upload documents",
        href: "/evidence",
      };
    }
    if (reportingReadiness && !hasGeneratedReport) {
      return {
        title: "Generate your first report",
        description: "You have enough data to create an ESG report.",
        ctaLabel: "Generate report",
        href: "/reports",
      };
    }
    return {
      title: "Your ESG score is taking shape",
      description: "Keep adding data to reach Confirmed status.",
      ctaLabel: "Update data",
      href: "/data-entry",
    };
  }

  if (state === "CONFIRMED") {
    if (!hasGeneratedReport) {
      return {
        title: "Generate your first report",
        description: "Your score is confirmed. Create your ESG report to share with stakeholders.",
        ctaLabel: "Generate report",
        href: "/reports",
      };
    }
    return {
      title: "Keep your ESG data up to date",
      description: "Add new data and track changes over time to maintain your confirmed status.",
      ctaLabel: "Update data",
      href: "/data-entry",
    };
  }

  return {
    title: "Get started with your ESG data",
    description: "Add your first figures to see your ESG score.",
    ctaLabel: "Add data",
    href: "/data-entry",
  };
}
