import { ArrowRight, ChevronDown, FileCheck2, ListChecks, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { getNextAction } from "@/lib/get-next-action";
import { overviewCategoryCompletion, overviewCompletion, overviewMonthLabel, overviewPercentage, overviewPolicyReviews, overviewTrend } from "@/lib/sme-overview-summary";

type SmeDashboardOverviewProps = {
  readiness?: any;
  enhanced?: any;
  isLoading?: boolean;
  showNextAction?: boolean;
  month?: string;
  hasError?: boolean;
  children?: ReactNode;
};

const STATUS_COPY: Record<string, { label: string; fallback: string; className: string }> = {
  IN_PROGRESS: { label: "Building your baseline", fallback: "Add a few key figures to build a useful starting point.", className: "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200" },
  DRAFT: { label: "Draft baseline", fallback: "Your first ESG baseline is taking shape. Fill the remaining gaps as information becomes available.", className: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200" },
  PROVISIONAL: { label: "Building confidence", fallback: "Add supporting evidence to make your baseline more credible and useful.", className: "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200" },
  CONFIRMED: { label: "Evidence-backed baseline", fallback: "Keep your evidence-backed baseline current and use it to guide improvement.", className: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200" },
};

const CATEGORIES = [
  { key: "environmental", label: "Environmental", barClassName: "[&>div]:bg-emerald-500" },
  { key: "social", label: "Social", barClassName: "[&>div]:bg-blue-500" },
  { key: "governance", label: "Governance", barClassName: "[&>div]:bg-violet-500" },
];

function formatValue(value: number, unit?: string | null) {
  return value.toLocaleString("en-GB", { maximumFractionDigits: 2 }) + (unit ? " " + unit : "");
}

export function SmeDashboardOverview({ readiness, enhanced, isLoading = false, showNextAction = true, month, hasError = false, children }: SmeDashboardOverviewProps) {
  if (isLoading) return <><section aria-label="Loading your ESG summary" aria-busy="true" data-testid="section-sme-dashboard-overview"><Skeleton className="h-64 rounded-xl" /></section>{children}</>;
  if (hasError) return (
    <><section className="rounded-xl border bg-card p-5" aria-labelledby="sme-overview-heading" data-testid="section-sme-dashboard-overview">
      <h2 id="sme-overview-heading" className="text-base font-semibold">Your ESG at a glance</h2>
      <p role="alert" className="mt-2 text-sm text-muted-foreground">Your summary could not be loaded. Figures are unavailable, not zero. Try loading the overview again.</p>
    </section>{children}</>
  );

  const completion = overviewCompletion(readiness);
  const status = STATUS_COPY[readiness?.esgStatus?.state];
  const monthLabel = overviewMonthLabel(month);
  const evidenceCoverage = overviewPercentage(readiness?.evidenceCoveragePercent);
  const evidenceConfidence = readiness?.esgStatus?.evidenceConfidence;
  const estimatedPercent = overviewPercentage(readiness?.estimatedPercent);
  const policyReviews = overviewPolicyReviews(enhanced?.upcomingPolicyReviews);
  const overdueActions = Array.isArray(enhanced?.overdueActions) ? enhanced.overdueActions.length : null;
  const trend = overviewTrend(enhanced?.trendSummary, month);
  const reportReady = typeof readiness?.reportingReadiness === "boolean" ? readiness.reportingReadiness : null;
  const periodQuery = month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? "?period=" + encodeURIComponent(month) : "";
  const nextAction = getNextAction(readiness);

  return (
    <section className="space-y-4" aria-labelledby="sme-overview-heading" data-testid="section-sme-dashboard-overview">
      <Card className="overflow-hidden border-primary/20" data-testid="card-sme-baseline-status">
        <CardHeader className="p-5 pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="sme-overview-heading" className="text-base font-semibold">Your ESG at a glance</h2>
            <Badge variant="outline" className={status?.className} data-testid="badge-sme-baseline-status">{status?.label || "Status unavailable"}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 p-5 pt-0">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] lg:items-start">
            <div className="space-y-2" data-testid="progress-sme-data-confidence">
              <p className="text-xs text-muted-foreground">Figures due in {monthLabel}</p>
              <p className="text-2xl font-semibold tracking-tight sm:text-3xl" data-testid="text-sme-figures-complete">
                {completion ? completion.total === 0 ? "No figures due" : <><span className="tabular-nums">{completion.filled} of {completion.total}</span> recorded</> : "Figures unavailable"}
              </p>
              {completion?.percent !== null && completion?.percent !== undefined && (
                <div className="flex items-center gap-3">
                  <Progress value={completion.percent} aria-label="Data coverage for the selected month" className="h-2 flex-1" />
                  <span className="text-xs tabular-nums text-muted-foreground">{completion.percent}%</span>
                </div>
              )}
              <p className="text-sm leading-relaxed text-muted-foreground" data-testid="text-sme-baseline-summary">
                {completion?.total === 0 ? "No enabled metrics are due in this month. Review your reporting schedule or choose another month."
                  : readiness?.esgStatus?.plainMeaning || status?.fallback || "We do not yet have a reliable summary for this month."}
              </p>
              <Link href={"/data-entry" + periodQuery} className="inline-flex min-h-10 items-center gap-1.5 rounded text-sm font-medium text-primary underline-offset-4 hover:underline" data-testid="link-sme-review-figures">Review figures <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" /></Link>
            </div>
            <div className="rounded-lg bg-muted/35 p-4" data-testid="card-sme-highlight">
              {trend ? (
                <>
                  <p className="text-xs font-medium text-muted-foreground">What changed</p>
                  <h3 className="mt-2 break-words text-sm font-semibold">{trend.name} · {formatValue(trend.current, trend.unit)}</h3>
                  <p className={"mt-1 text-sm font-medium " + (trend.direction === "improved" ? "text-emerald-700 dark:text-emerald-300" : trend.direction === "worsened" ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground")} data-testid="text-sme-trend-change">{trend.directionLabel}{trend.percentageDelta !== null && trend.delta !== 0 ? " · " + Math.abs(trend.percentageDelta).toLocaleString("en-GB", { maximumFractionDigits: 1 }) + "% change" : ""}</p>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{trend.currentPeriodLabel} vs {trend.previousPeriodLabel}. Previous: {formatValue(trend.previous, trend.unit)}. Based on {trend.metricCount} comparable metric, not an overall ESG rating.</p>
                </>
              ) : readiness?.hasGeneratedReport === true ? (
                <>
                  <p className="text-xs font-medium text-muted-foreground">Milestone reached</p>
                  <h3 className="mt-2 text-sm font-semibold">Your first report has been created</h3>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">A company milestone across all reporting periods; it does not mean a report exists for {monthLabel} or is approved.</p>
                  <Link href="/reports" className="mt-1 inline-flex min-h-10 items-center rounded text-sm font-medium text-primary hover:underline">Open Reports</Link>
                </>
              ) : (
                <>
                  <p className="text-xs font-medium text-muted-foreground">Building a useful baseline</p>
                  <h3 className="mt-2 text-sm font-semibold">Progress starts with reliable figures</h3>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">A comparison will appear when a metric has numeric values in both this month and the previous comparable period. Missing history is not a zero result.</p>
                </>
              )}
            </div>
          </div>

          <div className="grid gap-2 border-t pt-3 sm:grid-cols-3" data-testid="sme-status-strip">
            <Link href="/control-centre" className="min-w-0 rounded-lg p-2 text-foreground transition-colors hover:bg-muted/50" data-testid="sme-status-actions">
              <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><ListChecks aria-hidden="true" className="h-4 w-4" />Actions</span>
              <p className="mt-1.5 text-sm font-semibold">{overdueActions === null ? "Unavailable" : overdueActions + " overdue"}</p>
              <p className="mt-1 text-xs text-muted-foreground">Company-wide · as of today</p>
            </Link>
            <Link href="/policies?tab=register" className="min-w-0 rounded-lg p-2 text-foreground transition-colors hover:bg-muted/50" data-testid="sme-status-policies">
              <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><ShieldCheck aria-hidden="true" className="h-4 w-4" />Policy reviews</span>
              <p className="mt-1.5 text-sm font-semibold">{policyReviews ? policyReviews.overdue + " overdue · " + policyReviews.dueWithin90Days + " due soon" : "Unavailable"}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{policyReviews ? "Next 90 days (" + policyReviews.dueWithin30Days + " within 30 days). Company-wide, from today." : "Company-wide · next 90 days and overdue"}</p>
            </Link>
            <Link href={"/reports" + periodQuery} className="min-w-0 rounded-lg p-2 text-foreground transition-colors hover:bg-muted/50" data-testid="sme-status-report">
              <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><FileCheck2 aria-hidden="true" className="h-4 w-4" />Draft reporting</span>
              <p className="mt-1.5 text-sm font-semibold">{completion?.total === 0 ? "No figures due" : reportReady === null ? "Unavailable" : reportReady ? "Baseline threshold met" : "More data needed"}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">For {monthLabel}; not approval or a compliance assessment.</p>
            </Link>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">Data completion, not an ESG rating or compliance assessment. Monthly figures exclude quarterly and annual items not due this month.</p>
        </CardContent>
      </Card>

      {showNextAction && completion && <Card className="border-primary/20 bg-primary/5" data-testid="card-sme-next-action"><CardContent className="flex flex-wrap items-center justify-between gap-4 p-5"><div><h3 className="text-sm font-semibold">{nextAction.title}</h3><p className="mt-1 text-sm text-muted-foreground">{nextAction.description}</p></div><Button asChild data-testid="button-sme-next-action"><Link href={nextAction.href}>{nextAction.ctaLabel}<ArrowRight aria-hidden="true" className="ml-2 h-4 w-4" /></Link></Button></CardContent></Card>}

      {children}

      <details className="group rounded-xl border bg-card" data-testid="disclosure-sme-confidence">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-xl p-4 text-sm font-medium [&::-webkit-details-marker]:hidden">Data quality and completion details<ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" /></summary>
        <div className="grid gap-6 border-t p-5 lg:grid-cols-2">
          <div className="space-y-4" data-testid="card-sme-confidence">
            <h3 className="text-sm font-semibold">Data and evidence confidence</h3>
            <div className="space-y-2" data-testid="progress-sme-evidence-confidence">
              <div className="flex items-center justify-between gap-2 text-sm"><span>Supporting evidence</span><span className="tabular-nums">{evidenceCoverage === null ? "Unavailable" : evidenceCoverage + "%"}</span></div>
              {evidenceCoverage !== null && <Progress value={evidenceCoverage} aria-label="Supporting evidence coverage" className="h-2" />}
            </div>
            <div className="grid grid-cols-3 gap-3 rounded-lg bg-muted/40 p-3" data-testid="summary-sme-evidence-ladder">
              {[{ label: "Source linked", value: evidenceConfidence?.sourceLinkedCoverage }, { label: "Reviewed", value: evidenceConfidence?.reviewedCoverage }, { label: "Evidence-backed", value: evidenceConfidence?.evidenceBackedCoverage }].map(item => <div key={item.label}><p className="text-sm font-semibold tabular-nums">{overviewPercentage(item.value) === null ? "—" : overviewPercentage(item.value) + "%"}</p><p className="mt-1 text-xs text-muted-foreground">{item.label}</p></div>)}
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">Evidence stages describe supporting records, not independent assurance. A dash means the figure is unavailable.</p>
            {estimatedPercent !== null && <p className="text-xs leading-relaxed text-muted-foreground" data-testid="text-sme-estimated-data">{estimatedPercent}% of metrics due in {monthLabel} have estimated figures. Replace estimates with measured figures when available.</p>}
          </div>
          <div className="space-y-4" data-testid="card-sme-esg-progress">
            <h3 className="text-sm font-semibold">Data completion by ESG area</h3>
            {CATEGORIES.map(category => {
              const counts = overviewCategoryCompletion(enhanced?.categorySummary?.[category.key]);
              return <div key={category.key} className="space-y-2" data-testid={"progress-sme-" + category.key}><div className="flex flex-wrap justify-between gap-2 text-sm"><span>{category.label}</span><span className="text-xs tabular-nums text-muted-foreground">{counts ? counts.total === 0 ? "No figures due" : counts.filled + " of " + counts.total + " recorded" : "Unavailable"}</span></div>{counts?.percent !== null && counts?.percent !== undefined && <Progress value={counts.percent} aria-label={category.label + " data completion"} className={"h-2 " + category.barClassName} />}</div>;
            })}
            <p className="text-xs leading-relaxed text-muted-foreground">These counts show data completion for active metrics due in the selected month, not ESG performance. Performance needs sufficiently reliable, comparable data.</p>
          </div>
        </div>
      </details>
    </section>
  );
}
