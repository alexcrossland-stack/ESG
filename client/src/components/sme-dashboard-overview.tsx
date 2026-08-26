import { ArrowRight, BarChart3, Database, FileCheck2 } from "lucide-react";
import { Link } from "wouter";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { getNextAction } from "@/lib/get-next-action";

type CategoryKey = "environmental" | "social" | "governance";

type CategoryCounts = {
  green?: number;
  amber?: number;
  red?: number;
  missing?: number;
  total?: number;
};

type SmeDashboardOverviewProps = {
  readiness?: any;
  enhanced?: any;
  isLoading?: boolean;
};

const STATUS_COPY: Record<string, { label: string; fallback: string; className: string }> = {
  IN_PROGRESS: {
    label: "Building your baseline",
    fallback: "Your ESG baseline is taking shape. Add a few key figures to see where you stand.",
    className: "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200",
  },
  DRAFT: {
    label: "Draft baseline",
    fallback: "You have enough information for a first ESG baseline. Strengthen it by filling the remaining gaps.",
    className: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200",
  },
  PROVISIONAL: {
    label: "Building confidence",
    fallback: "Your ESG baseline has strong data coverage. Add supporting evidence to make it more credible and useful.",
    className: "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200",
  },
  CONFIRMED: {
    label: "Evidence-backed baseline",
    fallback: "Your ESG baseline is backed by supporting evidence. Keep it current and use it to guide improvement.",
    className: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200",
  },
};

const CATEGORIES: Array<{ key: CategoryKey; shortLabel: string; label: string; barClassName: string }> = [
  { key: "environmental", shortLabel: "E", label: "Environmental", barClassName: "[&>div]:bg-emerald-500" },
  { key: "social", shortLabel: "S", label: "Social", barClassName: "[&>div]:bg-blue-500" },
  { key: "governance", shortLabel: "G", label: "Governance", barClassName: "[&>div]:bg-violet-500" },
];

function percentage(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(100, Math.round(parsed)));
}

function categoryProgress(enhanced: any, key: CategoryKey): number {
  const score = enhanced?.weightedScore?.categoryScores?.[key]?.score;
  if (score !== undefined && score !== null) return percentage(score);

  const counts: CategoryCounts | undefined = enhanced?.categorySummary?.[key];
  const total = Number(counts?.total ?? 0);
  if (total <= 0) return 0;

  return percentage(((total - Number(counts?.missing ?? 0)) / total) * 100);
}

function strengthLabel(value: number): string {
  if (value >= 75) return "Strong";
  if (value >= 40) return "Developing";
  return "Starting";
}

export function SmeDashboardOverview({ readiness, enhanced, isLoading = false }: SmeDashboardOverviewProps) {
  if (isLoading) {
    return (
      <section className="grid gap-4 lg:grid-cols-2" data-testid="section-sme-dashboard-overview">
        {[...Array(4)].map((_, index) => <Skeleton key={index} className="h-44" />)}
      </section>
    );
  }

  const state = readiness?.esgStatus?.state ?? "IN_PROGRESS";
  const status = STATUS_COPY[state] ?? STATUS_COPY.IN_PROGRESS;
  const summary = readiness?.esgStatus?.plainMeaning || readiness?.plainEnglishSummary || status.fallback;
  const dataCompleteness = percentage(readiness?.dataCompletenessPercent, percentage(enhanced?.submissionRate));
  const evidenceCoverage = percentage(readiness?.evidenceCoveragePercent, percentage(enhanced?.evidenceCoverage));
  const estimatedPercent = percentage(readiness?.estimatedPercent);
  const nextAction = getNextAction(readiness);

  return (
    <section className="grid gap-4 lg:grid-cols-2" data-testid="section-sme-dashboard-overview">
      <Card className="border-primary/20" data-testid="card-sme-baseline-status">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">Your ESG baseline</CardTitle>
            <Badge variant="outline" className={status.className} data-testid="badge-sme-baseline-status">
              {status.label}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm font-medium leading-relaxed" data-testid="text-sme-baseline-summary">{summary}</p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            This is a practical view of your current information, not a regulatory rating. It becomes more useful as your data and supporting documents improve.
          </p>
        </CardContent>
      </Card>

      <Card className="flex flex-col border-primary/30 bg-primary/5" data-testid="card-sme-next-action">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2 text-primary">
            <BarChart3 className="h-4 w-4" />
            <CardTitle className="text-base">Best next step</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col justify-between gap-4">
          <div>
            <p className="text-sm font-semibold">{nextAction.title}</p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{nextAction.description}</p>
          </div>
          <Button asChild className="self-start" data-testid="button-sme-next-action">
            <Link href={nextAction.href}>
              {nextAction.ctaLabel}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>

      <Card data-testid="card-sme-confidence">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Data and evidence confidence</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5" data-testid="progress-sme-data-confidence">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 font-medium"><Database className="h-4 w-4 text-blue-600" />Full metric coverage</span>
              <span><span className="text-muted-foreground">{strengthLabel(dataCompleteness)}</span> · {dataCompleteness}%</span>
            </div>
            <Progress value={dataCompleteness} aria-label="Full metric data coverage" className="h-2 [&>div]:bg-blue-500" />
          </div>
          <div className="space-y-1.5" data-testid="progress-sme-evidence-confidence">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 font-medium"><FileCheck2 className="h-4 w-4 text-emerald-600" />Supporting evidence</span>
              <span><span className="text-muted-foreground">{strengthLabel(evidenceCoverage)}</span> · {evidenceCoverage}%</span>
            </div>
            <Progress value={evidenceCoverage} aria-label="Supporting evidence coverage" className="h-2 [&>div]:bg-emerald-500" />
          </div>
          {estimatedPercent > 0 && (
            <p className="text-xs text-muted-foreground" data-testid="text-sme-estimated-data">
              {estimatedPercent}% of entered data is estimated. Replace estimates over time to strengthen confidence.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Coverage includes every active metric. The focused guided set in Measure is the quickest first step, not the full checklist.
          </p>
        </CardContent>
      </Card>

      <Card data-testid="card-sme-esg-progress">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">E, S and G progress</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {CATEGORIES.map(category => {
            const value = categoryProgress(enhanced, category.key);
            return (
              <div key={category.key} className="grid grid-cols-[2rem_1fr_auto] items-center gap-3" data-testid={`progress-sme-${category.key}`}>
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-sm font-semibold" aria-hidden="true">
                  {category.shortLabel}
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium">{category.label}</p>
                  <Progress value={value} aria-label={`${category.label} progress`} className={`h-2 ${category.barClassName}`} />
                </div>
                <span className="w-10 text-right text-sm font-semibold">{value}%</span>
              </div>
            );
          })}
          <p className="text-xs text-muted-foreground">Progress uses the category score where available, with data coverage as a fallback.</p>
        </CardContent>
      </Card>
    </section>
  );
}
