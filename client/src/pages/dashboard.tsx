import { lazy, Suspense, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, BarChart3 } from "lucide-react";
import { useReportingMonth } from "@/hooks/use-reporting-month";
import { usePermissions } from "@/lib/permissions";
import { apiGet } from "@/lib/queryClient";
import { overviewPeriodContext, overviewReadinessUrl } from "@/lib/overview-period";
import { PageHeader, PageLayout } from "@/components/page-layout";
import { SmeDashboardOverview } from "@/components/sme-dashboard-overview";
import { SmeNextTasks } from "@/components/sme-next-tasks";
import { ReportingContextStrip } from "@/components/reporting-context-strip";
import { ReportingMonthPicker } from "@/components/reporting-month-picker";
import { QueryFreshness } from "@/components/query-feedback";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";

const DashboardInsights = lazy(() => import("./dashboard-insights"));

export default function Dashboard() {
  const reporting = useReportingMonth();
  const { can } = usePermissions();
  const [advancedInsightsOpen, setAdvancedInsightsOpen] = useState(false);
  const monthContext = overviewPeriodContext(reporting.month);
  const { data: enhanced, isLoading: enhancedLoading, isError: enhancedError, refetch: retryEnhanced, dataUpdatedAt, isFetching } = useQuery<any>({
    queryKey: ["/api/dashboard/enhanced", reporting.month],
    queryFn: () => apiGet(`/api/dashboard/enhanced?period=${reporting.month}`),
  });
  const { data: readiness, isLoading: readinessLoading, isError: readinessError, refetch: retryReadiness } = useQuery<any>({
    queryKey: ["/api/dashboard/readiness", reporting.month],
    queryFn: () => apiGet(overviewReadinessUrl(reporting.month)),
  });
  const { data: authData } = useQuery<any>({ queryKey: ["/api/auth/me"] });
  const refresh = () => { void retryEnhanced(); void retryReadiness(); };
  return <PageLayout className="space-y-4">
    {new URLSearchParams(window.location.search).get("from") === "portfolio" && <Button asChild variant="outline" className="self-start"><Link href="/portfolio">Back to Portfolio Dashboard</Link></Button>}
    <PageHeader title="Overview" eyebrow={authData?.company?.name} titleTestId="text-dashboard-title" description="Know where you stand. Focus on what matters next."
      actions={<ReportingMonthPicker month={reporting.month} onChange={reporting.setMonth} disabled={reporting.isLoading} />} />
    <ReportingContextStrip month={reporting.month} readOnly={!can("metrics_data_entry")} />
    <QueryFreshness updatedAt={dataUpdatedAt} refreshing={isFetching} refresh={refresh} />
    {monthContext.position !== "current" && <div className="flex flex-col gap-2 rounded-xl border bg-muted/30 px-4 py-3 sm:flex-row sm:items-center sm:justify-between" data-testid="overview-period-notice">
      <p className="text-sm text-muted-foreground"><span className="font-medium text-foreground">{monthContext.position === "past" ? "Reviewing" : "Planning for"} {monthContext.label}.</span> {monthContext.position === "past" ? "Your figures relate to this earlier month." : "This is a future reporting month."}</p>
      <Button variant="outline" size="sm" onClick={() => reporting.setMonth(monthContext.currentMonth)} data-testid="button-overview-current-month">Go to current month</Button>
    </div>}
    <SmeDashboardOverview month={reporting.month} showNextAction={false} readiness={readiness} enhanced={enhanced} isLoading={readinessLoading || enhancedLoading} hasError={readinessError || enhancedError}>
      <SmeNextTasks month={reporting.month} />
    </SmeDashboardOverview>
    {(readinessError || enhancedError) && <Button variant="outline" onClick={refresh} data-testid="button-retry-overview">Retry summary</Button>}
    <details open={advancedInsightsOpen} onToggle={event => setAdvancedInsightsOpen(event.currentTarget.open)} className="group overflow-hidden rounded-lg border bg-card" data-testid="disclosure-advanced-insights">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 p-4 [&::-webkit-details-marker]:hidden" data-testid="summary-advanced-insights">
        <span className="flex items-center gap-3"><BarChart3 className="h-4 w-4 text-muted-foreground" /><span><span className="block text-sm font-medium">Advanced insights</span><span className="block text-xs text-muted-foreground">Performance, trends and detailed checks</span></span></span>
        <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
      </summary>
      {advancedInsightsOpen && <Suspense fallback={<Skeleton className="m-4 h-48" />}><DashboardInsights /></Suspense>}
    </details>
  </PageLayout>;
}
