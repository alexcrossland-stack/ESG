import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, authFetch } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts";
import {
  AlertTriangle, CheckCircle, CheckCircle2, Clock, Zap, Users, Shield,
  Activity, Leaf, ArrowUp, ArrowDown, ClipboardList, FileText, Info,
  Calendar, FileCheck, AlertCircle, TrendingUp, CircleDot,
  Bell, X, ChevronDown, ChevronUp, Sparkles, Target, BarChart3,
} from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { format } from "date-fns";
import { ActivityFeed } from "@/components/activity-feed";
import { Progress } from "@/components/ui/progress";
import { usePermissions } from "@/lib/permissions";
import { ProductTour } from "@/components/product-tour";
import { SourceBadge } from "@/components/source-badge";

const COLORS = {
  environmental: "hsl(158, 64%, 32%)",
  social: "hsl(210, 85%, 38%)",
  governance: "hsl(280, 65%, 42%)",
};

function StatusDot({ status, size = "sm" }: { status: string; size?: "sm" | "md" }) {
  const colors: Record<string, string> = {
    green: "bg-emerald-500",
    amber: "bg-amber-500",
    red: "bg-red-500",
    missing: "bg-gray-300",
  };
  const sizeClass = size === "md" ? "w-3 h-3" : "w-2 h-2";
  return <div className={`${sizeClass} rounded-full shrink-0 ${colors[status] || colors.missing}`} />;
}

function ScoreRing({ score, label }: { score: number; label: string }) {
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;
  const color = score >= 70 ? "text-emerald-500" : score >= 40 ? "text-amber-500" : "text-red-500";
  const strokeColor = score >= 70 ? "stroke-emerald-500" : score >= 40 ? "stroke-amber-500" : "stroke-red-500";

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-24 h-24">
        <svg className="w-24 h-24 -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r={radius} fill="none" className="stroke-muted" strokeWidth="8" />
          <circle
            cx="50" cy="50" r={radius} fill="none"
            className={strokeColor}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={`text-xl font-bold ${color}`} data-testid="text-esg-score">{score}%</span>
        </div>
      </div>
      <p className="text-xs text-muted-foreground mt-1">{label}</p>
    </div>
  );
}

function MiniRing({ value, size = 32, strokeWidth = 3, color = "stroke-primary" }: { value: number; size?: number; strokeWidth?: number; color?: string }) {
  const r = (size - strokeWidth * 2) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (Math.min(value, 100) / 100) * circ;
  return (
    <svg width={size} height={size} className="-rotate-90" viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" className="stroke-muted" strokeWidth={strokeWidth} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" className={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset} />
    </svg>
  );
}

function CategoryBar({ label, counts, score }: {
  label: string;
  counts: { green: number; amber: number; red: number; missing: number; total: number };
  score?: number;
}) {
  const total = counts.total || 1;
  const greenPct = (counts.green / total) * 100;
  const amberPct = (counts.amber / total) * 100;
  const redPct = (counts.red / total) * 100;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium">{label}</p>
          {score !== undefined && <span className="text-xs font-semibold text-muted-foreground">{score}%</span>}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><StatusDot status="green" /> {counts.green}</span>
          <span className="flex items-center gap-1"><StatusDot status="amber" /> {counts.amber}</span>
          <span className="flex items-center gap-1"><StatusDot status="red" /> {counts.red}</span>
          {counts.missing > 0 && <span className="flex items-center gap-1"><StatusDot status="missing" /> {counts.missing}</span>}
        </div>
      </div>
      <div className="flex h-2 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-800">
        {greenPct > 0 && <div className="bg-emerald-500 transition-all" style={{ width: `${greenPct}%` }} />}
        {amberPct > 0 && <div className="bg-amber-500 transition-all" style={{ width: `${amberPct}%` }} />}
        {redPct > 0 && <div className="bg-red-500 transition-all" style={{ width: `${redPct}%` }} />}
      </div>
    </div>
  );
}

function ActivationCard() {
  const queryClient = useQueryClient();
  const { data: status, isLoading } = useQuery<any>({
    queryKey: ["/api/onboarding/status"],
    refetchOnWindowFocus: true,
  });

  const dismissMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/onboarding/dismiss-card", { dismiss: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/onboarding/status"] });
    },
  });

  if (isLoading || !status || status.complete) return null;
  if (status.dismissedAt) return null;

  const completedCount = status.completedCount ?? 0;
  const totalSteps = status.totalSteps ?? 6;
  const overallPercent = status.overallPercent ?? 0;
  const steps: any[] = status.steps ?? [];
  const nextStep = status.nextStep;
  const allDone = completedCount >= totalSteps;
  if (allDone) return null;

  return (
    <Card className="border-primary/30 bg-primary/5" data-testid="card-activation-checklist">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            Get up and running
          </CardTitle>
          <button
            className="text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => dismissMutation.mutate()}
            disabled={dismissMutation.isPending}
            data-testid="button-dismiss-activation-card"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <CardDescription className="text-xs">{completedCount} of {totalSteps} steps complete</CardDescription>
            <span className="text-xs font-medium text-primary">{overallPercent}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${overallPercent}%` }} />
          </div>
        </div>
      </CardHeader>
      <CardContent className="pb-3">
        <div className="space-y-1">
          {steps.map((step: any) => (
            <Link key={step.key} href={step.actionUrl || "/"}>
              <div
                className="flex items-start gap-2.5 p-2 rounded-md hover:bg-background/60 cursor-pointer transition-colors group"
                data-testid={`activation-step-${step.key}`}
              >
                {step.complete ? (
                  <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                ) : (
                  <div className="w-4 h-4 rounded-full border-2 border-muted-foreground/30 shrink-0 mt-0.5 group-hover:border-primary/50 transition-colors" />
                )}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm leading-snug ${step.complete ? "text-muted-foreground line-through" : "font-medium"}`}>{step.label}</p>
                  {!step.complete && <p className="text-xs text-muted-foreground">{step.description}</p>}
                </div>
                {!step.complete && step.key === nextStep?.key && (
                  <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded font-medium shrink-0">Next</span>
                )}
              </div>
            </Link>
          ))}
        </div>
        {nextStep && (
          <div className="mt-3 pt-3 border-t">
            <Link href={nextStep.actionUrl || "/"}>
              <Button size="sm" className="w-full" data-testid="button-activation-primary-cta">
                Start: {nextStep.label}
              </Button>
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ScoreMethodology({ weightedScore }: { weightedScore: any }) {
  const [open, setOpen] = useState(false);
  if (!weightedScore) return null;

  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        data-testid="button-score-methodology"
      >
        <Info className="w-3.5 h-3.5" />
        {open ? "Hide" : "How is this scored?"}
      </button>
      {open && (
        <div className="mt-2 p-3 rounded-md bg-muted/50 space-y-2" data-testid="panel-score-methodology">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-muted-foreground">Metrics scored</span>
              <p className="font-medium">{weightedScore.scoredMetrics} of {weightedScore.totalMetrics}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Missing data</span>
              <p className="font-medium">{weightedScore.missingCount} metrics</p>
            </div>
            {weightedScore.complianceCount > 0 && (
              <div>
                <span className="text-muted-foreground">Compliance score</span>
                <p className="font-medium">{weightedScore.complianceScore}%</p>
              </div>
            )}
            {weightedScore.continuousCount > 0 && (
              <div>
                <span className="text-muted-foreground">Continuous score</span>
                <p className="font-medium">{weightedScore.continuousScore}%</p>
              </div>
            )}
          </div>
          {weightedScore.categoryScores && (
            <div className="space-y-1 pt-1 border-t border-border">
              <p className="text-xs font-medium text-muted-foreground">Category breakdown</p>
              {Object.entries(weightedScore.categoryScores).map(([cat, data]: [string, any]) => (
                <div key={cat} className="flex items-center justify-between text-xs">
                  <span className="capitalize">{cat}</span>
                  <span className="font-medium">{data.score}% ({data.scoredCount}/{data.metricCount} scored, weight: {data.weight.toFixed(2)}x)</span>
                </div>
              ))}
            </div>
          )}
          <div className="space-y-0.5 pt-1 border-t border-border">
            <p className="text-xs font-medium text-muted-foreground">Methodology</p>
            {(weightedScore.methodology || []).map((line: string, i: number) => (
              <p key={i} className="text-xs text-muted-foreground">{line}</p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DataQualityCard() {
  const { data: quality, isLoading } = useQuery<any>({ queryKey: ["/api/data-quality"] });

  if (isLoading) return <Skeleton className="h-48" />;
  if (!quality || quality.totalMetrics === 0) return null;

  const score = quality.overallScore || 0;
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;
  const ringColor = score >= 70 ? "stroke-emerald-500" : score >= 40 ? "stroke-amber-500" : "stroke-red-500";
  const textColor = score >= 70 ? "text-emerald-500" : score >= 40 ? "text-amber-500" : "text-red-500";

  const criteria = [
    { label: "Has value", count: quality.perMetric.filter((m: any) => m.hasValue).length, pts: 30 },
    { label: "Has evidence", count: quality.perMetric.filter((m: any) => m.hasEvidence).length, pts: 20 },
    { label: "Approved", count: quality.perMetric.filter((m: any) => m.isApproved).length, pts: 20 },
    { label: "Actual data", count: quality.perMetric.filter((m: any) => m.isActual).length, pts: 15 },
    { label: "Has notes", count: quality.perMetric.filter((m: any) => m.hasNotes).length, pts: 15 },
  ];

  return (
    <Card data-testid="card-data-quality">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          Data Quality
        </CardTitle>
        <CardDescription className="text-xs">Score based on 5 quality criteria</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-start gap-4">
          <div className="flex flex-col items-center shrink-0">
            <div className="relative w-20 h-20">
              <svg className="w-20 h-20 -rotate-90" viewBox="0 0 90 90">
                <circle cx="45" cy="45" r={radius} fill="none" className="stroke-muted" strokeWidth="7" />
                <circle
                  cx="45" cy="45" r={radius} fill="none"
                  className={ringColor}
                  strokeWidth="7"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className={`text-lg font-bold ${textColor}`} data-testid="text-quality-score">{score}%</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Overall</p>
          </div>
          <div className="flex-1 space-y-1.5">
            {criteria.map(c => {
              const pct = quality.totalMetrics > 0 ? Math.round((c.count / quality.totalMetrics) * 100) : 0;
              return (
                <div key={c.label} className="flex items-center gap-2 text-xs">
                  <span className="w-20 text-muted-foreground truncate">{c.label}</span>
                  <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${pct >= 70 ? "bg-emerald-500" : pct >= 40 ? "bg-amber-500" : "bg-red-500"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-14 text-right font-medium">{c.count}/{quality.totalMetrics}</span>
                </div>
              );
            })}
          </div>
        </div>
        {quality.categoryBreakdown && (
          <div className="flex items-center gap-3 mt-3 pt-2 border-t border-border">
            {Object.entries(quality.categoryBreakdown).map(([cat, catScore]: [string, any]) => (
              <div key={cat} className="flex items-center gap-1.5 text-xs">
                <span className="capitalize text-muted-foreground">{cat}:</span>
                <Badge variant={catScore >= 70 ? "default" : catScore >= 40 ? "secondary" : "outline"} className="text-xs">
                  {catScore}%
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function BenchmarkSummaryCard() {
  const { data: comparison, isLoading } = useQuery<any[]>({
    queryKey: ["/api/benchmarks/comparison"],
  });

  if (isLoading) return <Skeleton className="h-48" />;
  if (!comparison || comparison.length === 0) return null;

  const topMetrics = comparison.slice(0, 4);

  const ratingColor = (r: string) => r === "within_range" ? "text-emerald-600 dark:text-emerald-400" : r === "above_range" ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400";
  const ratingDot = (r: string) => r === "within_range" ? "bg-emerald-500" : r === "above_range" ? "bg-amber-500" : "bg-red-500";
  const ratingLabel = (r: string) => r === "within_range" ? "In Range" : r === "above_range" ? "Above" : "Below";

  return (
    <Card data-testid="card-benchmark-summary">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-primary" />
            Benchmark Comparison
          </CardTitle>
          <Link href="/benchmarks">
            <Button variant="ghost" size="sm" className="text-xs h-6" data-testid="link-view-benchmarks">View all</Button>
          </Link>
        </div>
        <CardDescription className="text-xs">vs SME reference ranges</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2.5">
          {topMetrics.map((m: any) => (
            <div key={m.metricKey} className="flex items-center justify-between text-sm" data-testid={`benchmark-summary-${m.metricKey}`}>
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <div className={`w-2 h-2 rounded-full shrink-0 ${ratingDot(m.rating)}`} />
                <span className="text-xs truncate">{m.label}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs font-medium">{m.companyValue?.toFixed(1)} {m.unit}</span>
                <Badge variant="outline" className={`text-[10px] ${ratingColor(m.rating)}`}>{ratingLabel(m.rating)}</Badge>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>("__latest__");
  const [showTour, setShowTour] = useState(false);
  const periodParam = selectedPeriodId !== "__latest__" ? `?reportingPeriodId=${selectedPeriodId}` : "";
  const { data: enhanced, isLoading: enhancedLoading } = useQuery<any>({ queryKey: ["/api/dashboard/enhanced", selectedPeriodId], queryFn: () => authFetch(`/api/dashboard/enhanced${periodParam}`).then(r => r.json()) });
  const { data: oldData, isLoading: oldLoading } = useQuery<any>({ queryKey: ["/api/dashboard"] });
  const { data: authData } = useQuery<any>({ queryKey: ["/api/auth/me"] });
  const { data: carbonCalcs } = useQuery<any>({ queryKey: ["/api/carbon-calculations"] });
  const { data: policyData } = useQuery<any>({ queryKey: ["/api/policy"] });
  const { data: reportingPeriods = [] } = useQuery<any[]>({ queryKey: ["/api/reporting-periods"] });
  const { data: evidenceRequests = [] } = useQuery<any[]>({ queryKey: ["/api/evidence-requests"] });
  const { data: demoStatus } = useQuery<any>({ queryKey: ["/api/company/demo-status"] });
  const { can, isAdmin } = usePermissions();

  const isLoading = enhancedLoading || oldLoading;
  const activePeriod = reportingPeriods.find((rp: any) => rp.id === selectedPeriodId);

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[...Array(2)].map((_, i) => <Skeleton key={i} className="h-48" />)}
        </div>
      </div>
    );
  }

  const company = authData?.company;
  const actions = oldData?.actions || [];
  const actionSummary = oldData?.actionSummary || {};
  const statusCounts = enhanced?.statusCounts || { green: 0, amber: 0, red: 0, missing: 0 };
  const categorySummary = enhanced?.categorySummary || {};
  const esgScore = enhanced?.esgScore || 0;
  const metricSummaries = enhanced?.metricSummaries || [];
  const weightedScore = enhanced?.weightedScore;
  const missingDataAlerts = enhanced?.missingDataAlerts || [];
  const overdueActions = enhanced?.overdueActions || [];
  const upcomingPolicyReviews = enhanced?.upcomingPolicyReviews || [];
  const evidenceCoverage = enhanced?.evidenceCoverage || 0;
  const submissionRate = enhanced?.submissionRate || 0;

  const envMetrics = metricSummaries.filter((m: any) => m.category === "environmental");
  const socialMetrics = metricSummaries.filter((m: any) => m.category === "social");

  const periodEmissions: Record<string, any> = {};
  envMetrics
    .filter((m: any) => ["Scope 1 Emissions", "Scope 2 Emissions"].includes(m.name))
    .flatMap((m: any) => (m.trend || []).map((t: any) => ({ ...t, metric: m.name })))
    .forEach((t: any) => {
      if (!periodEmissions[t.period]) periodEmissions[t.period] = { period: t.period.replace(/^\d{4}-/, "") };
      if (t.metric === "Scope 1 Emissions") periodEmissions[t.period].scope1 = t.value;
      if (t.metric === "Scope 2 Emissions") periodEmissions[t.period].scope2 = t.value;
    });
  const emissionsChartData = Object.values(periodEmissions);

  const electricityMetric = envMetrics.find((m: any) => m.name === "Electricity Consumption");
  const electricityChart = (electricityMetric?.trend || []).map((t: any) => ({
    period: t.period?.replace(/^\d{4}-/, ""),
    value: t.value,
  }));

  const workforceMetric = socialMetrics.find((m: any) => m.name === "Total Employees");
  const workforceChart = (workforceMetric?.trend || []).map((t: any) => ({
    period: t.period?.replace(/^\d{4}-/, ""),
    value: t.value,
  }));

  const attentionMetrics = metricSummaries
    .filter((m: any) => m.status === "red" || m.status === "amber")
    .slice(0, 5);

  const hasAlerts = missingDataAlerts.length > 0 || overdueActions.length > 0 || upcomingPolicyReviews.length > 0;

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-7xl mx-auto">
      {demoStatus?.isDemo && (
        <div className="flex items-center gap-3 p-3 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 text-sm" data-testid="banner-demo">
          <Sparkles className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
          <p className="text-amber-800 dark:text-amber-300 flex-1">
            You're exploring the demo account — pre-loaded with sample data. <Link href="/auth"><span className="underline cursor-pointer font-medium">Create your own account</span></Link> to get started.
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-lg sm:text-xl font-semibold" data-testid="text-dashboard-title">
            {company?.name ? `${company.name} — ESG Dashboard` : "ESG Dashboard"}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Your ESG performance at a glance
          </p>
        </div>
        <div className="flex items-center gap-2">
          {reportingPeriods.length > 0 && (
            <Select value={selectedPeriodId} onValueChange={setSelectedPeriodId}>
              <SelectTrigger className="w-44" data-testid="select-dashboard-period">
                <SelectValue placeholder="Latest Data" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__latest__">Latest Data</SelectItem>
                {reportingPeriods.map((rp: any) => (
                  <SelectItem key={rp.id} value={rp.id}>{rp.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {enhanced?.latestPeriod && (
            <Badge variant="secondary" className="text-xs" data-testid="badge-latest-period">
              {activePeriod ? activePeriod.name : `Latest: ${enhanced.latestPeriod}`}
            </Badge>
          )}
          {demoStatus?.demoMode && (
            <Button variant="outline" size="sm" onClick={() => setShowTour(true)} data-testid="button-start-tour">
              <Info className="w-3.5 h-3.5 mr-1" />
              Tour
            </Button>
          )}
        </div>
      </div>
      {showTour && <ProductTour onComplete={() => setShowTour(false)} />}

      <ActivationCard />

      {hasAlerts && (
        <div className="space-y-2" data-testid="section-alerts">
          {overdueActions.length > 0 && (
            <Alert variant="destructive" data-testid="alert-overdue-actions">
              <AlertTriangle className="w-4 h-4" />
              <AlertDescription className="flex items-center justify-between">
                <span>
                  {overdueActions.length} action{overdueActions.length > 1 ? "s" : ""} overdue
                  {overdueActions.length <= 3 && `: ${overdueActions.map((a: any) => a.title).join(", ")}`}
                </span>
                <Link href="/actions"><Button variant="ghost" size="sm" className="text-xs h-6 ml-2" data-testid="link-review-overdue">Review</Button></Link>
              </AlertDescription>
            </Alert>
          )}
          {missingDataAlerts.length > 0 && (
            <Alert data-testid="alert-missing-data">
              <AlertCircle className="w-4 h-4" />
              <AlertDescription className="flex items-center justify-between">
                <span>
                  {missingDataAlerts.length} metric{missingDataAlerts.length > 1 ? "s" : ""} missing data for {enhanced?.latestPeriod}
                </span>
                <Link href="/data-entry"><Button variant="ghost" size="sm" className="text-xs h-6 ml-2" data-testid="link-enter-missing">Enter data</Button></Link>
              </AlertDescription>
            </Alert>
          )}
          {upcomingPolicyReviews.map((pr: any, i: number) => (
            <Alert key={i} variant={pr.status === "overdue" ? "destructive" : undefined} data-testid={`alert-policy-review-${i}`}>
              <Calendar className="w-4 h-4" />
              <AlertDescription className="flex items-center justify-between">
                <span>
                  Policy review {pr.status === "overdue" ? "overdue" : pr.status === "urgent" ? "due within 30 days" : "upcoming"} ({new Date(pr.reviewDate).toLocaleDateString()})
                </span>
                <Link href="/policy"><Button variant="ghost" size="sm" className="text-xs h-6 ml-2" data-testid="link-review-policy">Review</Button></Link>
              </AlertDescription>
            </Alert>
          ))}
        </div>
      )}


      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card data-testid="stat-esg-score" className="col-span-2 sm:col-span-1 row-span-2">
          <CardContent className="p-4 flex flex-col items-center justify-center h-full">
            <ScoreRing score={esgScore} label="ESG Score" />
            <ScoreMethodology weightedScore={weightedScore} />
          </CardContent>
        </Card>

        <Card data-testid="stat-submission-rate">
          <CardContent className="p-3 flex items-center gap-3">
            <MiniRing value={submissionRate} color={submissionRate >= 80 ? "stroke-emerald-500" : submissionRate >= 50 ? "stroke-amber-500" : "stroke-red-500"} />
            <div>
              <p className="text-xs text-muted-foreground">Submitted</p>
              <p className="text-lg font-bold" data-testid="text-submission-rate">{submissionRate}%</p>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="stat-evidence-coverage">
          <CardContent className="p-3 flex items-center gap-3">
            <MiniRing value={evidenceCoverage} color={evidenceCoverage >= 60 ? "stroke-emerald-500" : evidenceCoverage >= 30 ? "stroke-amber-500" : "stroke-muted-foreground"} />
            <div>
              <p className="text-xs text-muted-foreground">Evidence</p>
              <p className="text-lg font-bold" data-testid="text-evidence-coverage">{evidenceCoverage}%</p>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="stat-on-track" className="border-emerald-200 dark:border-emerald-800">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground mb-0.5">On Track</p>
            <p className="text-2xl font-bold text-emerald-600">{statusCounts.green}</p>
          </CardContent>
        </Card>

        <Card data-testid="stat-at-risk" className="border-amber-200 dark:border-amber-800">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground mb-0.5">At Risk</p>
            <p className="text-2xl font-bold text-amber-600">{statusCounts.amber}</p>
          </CardContent>
        </Card>

        <Card data-testid="stat-off-track" className="border-red-200 dark:border-red-800">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground mb-0.5">Off Track</p>
            <p className="text-2xl font-bold text-red-600">{statusCounts.red}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="md:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Category Performance</CardTitle>
            <CardDescription className="text-xs">Weighted scores by ESG category</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <CategoryBar
              label="Environmental"
              counts={categorySummary.environmental || { green: 0, amber: 0, red: 0, missing: 0, total: 0 }}
              score={weightedScore?.categoryScores?.environmental?.score}
            />
            <CategoryBar
              label="Social"
              counts={categorySummary.social || { green: 0, amber: 0, red: 0, missing: 0, total: 0 }}
              score={weightedScore?.categoryScores?.social?.score}
            />
            <CategoryBar
              label="Governance"
              counts={categorySummary.governance || { green: 0, amber: 0, red: 0, missing: 0, total: 0 }}
              score={weightedScore?.categoryScores?.governance?.score}
            />
            <div className="flex items-center justify-between pt-2 border-t border-border text-xs text-muted-foreground">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1"><CircleDot className="w-3 h-3" /> {enhanced?.totalMetrics || 0} metrics</span>
                <span className="flex items-center gap-1"><TrendingUp className="w-3 h-3" /> {enhanced?.calculatedMetrics || 0} calculated</span>
                <span className="flex items-center gap-1"><FileText className="w-3 h-3" /> {enhanced?.manualMetrics || 0} manual</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              Needs Attention
            </CardTitle>
            <CardDescription className="text-xs">Metrics at risk or off track</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {attentionMetrics.map((m: any) => (
                <div key={m.id} className="flex items-center gap-2 py-1.5 border-b border-border last:border-0" data-testid={`row-attention-${m.id}`}>
                  <StatusDot status={m.status} size="md" />
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1">
                      <p className="text-xs font-medium truncate">{m.name}</p>
                      <SourceBadge
                        entityType="metric"
                        entityId={m.id}
                        status={m.workflowStatus}
                        owner={m.owner}
                        reviewedAt={m.approvedAt || m.lastReviewedAt}
                        dataSourceType={m.dataSourceType}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {m.latestValue !== null ? `${m.latestValue} ${m.unit || ""}` : "No data"}
                    </p>
                  </div>
                  {m.percentChange !== null && (
                    <span className={`text-xs flex items-center gap-0.5 ${
                      (m.direction === "lower_is_better" ? m.percentChange < 0 : m.percentChange > 0) ? "text-emerald-600" : "text-red-500"
                    }`}>
                      {m.percentChange > 0 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                      {Math.abs(m.percentChange).toFixed(1)}%
                    </span>
                  )}
                </div>
              ))}
              {attentionMetrics.length === 0 && (
                <div className="text-center py-6">
                  <CheckCircle className="w-6 h-6 text-emerald-400 mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">All metrics on track</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {emissionsChartData.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Leaf className="w-4 h-4 text-primary" />
                Carbon Emissions
              </CardTitle>
              <CardDescription className="text-xs">Scope 1 & 2 (tCO2e)</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={emissionsChartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="period" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} width={35} />
                  <Tooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} />
                  <Bar dataKey="scope1" name="Scope 1" fill={COLORS.environmental} radius={[3, 3, 0, 0]} stackId="a" />
                  <Bar dataKey="scope2" name="Scope 2" fill="hsl(158, 44%, 52%)" radius={[3, 3, 0, 0]} stackId="a" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {electricityChart.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Zap className="w-4 h-4 text-primary" />
                Electricity
              </CardTitle>
              <CardDescription className="text-xs">Monthly kWh</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={electricityChart}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="period" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} width={40} />
                  <Tooltip
                    contentStyle={{ fontSize: 11, borderRadius: 6 }}
                    formatter={(v: any) => [`${v?.toLocaleString()} kWh`, "Electricity"]}
                  />
                  <Line type="monotone" dataKey="value" stroke={COLORS.environmental} strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {workforceChart.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-500" />
                Workforce
              </CardTitle>
              <CardDescription className="text-xs">Total headcount</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={140}>
                <BarChart data={workforceChart}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="period" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} domain={["auto", "auto"]} width={30} />
                  <Tooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} />
                  <Bar dataKey="value" fill={COLORS.social} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Shield className="w-4 h-4 text-purple-500" />
                Recent Actions
              </CardTitle>
              <Link href="/actions">
                <Button variant="ghost" size="sm" className="text-xs h-6 px-2" data-testid="link-view-actions">View all</Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {actions.slice(0, 4).map((action: any) => (
                <div key={action.id} className="flex items-start gap-2 py-1.5 border-b border-border last:border-0">
                  <div className={`mt-0.5 w-1.5 h-1.5 rounded-full shrink-0 ${
                    action.status === "complete" ? "bg-primary" :
                    action.status === "in_progress" ? "bg-blue-500" :
                    "bg-muted-foreground"
                  }`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium truncate">{action.title}</p>
                    <p className="text-xs text-muted-foreground">{action.owner}</p>
                  </div>
                  <Badge variant={
                    action.status === "complete" ? "default" :
                    action.status === "in_progress" ? "secondary" : "outline"
                  } className="text-xs shrink-0">
                    {action.status?.replace(/_/g, " ")}
                  </Badge>
                </div>
              ))}
              {actions.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">No actions yet</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" />
              Platform Status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              {[
                { label: "Data submitted", value: `${submissionRate}%`, icon: FileCheck, color: submissionRate >= 80 ? "text-emerald-500" : "text-amber-500" },
                { label: "Evidence coverage", value: `${evidenceCoverage}%`, icon: FileText, color: evidenceCoverage >= 60 ? "text-emerald-500" : "text-muted-foreground" },
                { label: "Actions open", value: (actionSummary.total || 0) - (actionSummary.complete || 0), icon: CheckCircle, color: "text-blue-500" },
                { label: "Overdue actions", value: overdueActions.length, icon: AlertTriangle, color: overdueActions.length > 0 ? "text-red-500" : "text-emerald-500" },
                { label: "Missing data", value: statusCounts.missing || 0, icon: AlertCircle, color: statusCounts.missing > 0 ? "text-amber-500" : "text-emerald-500" },
              ].map(item => (
                <div key={item.label} className="flex items-center gap-2 text-sm">
                  <item.icon className={`w-3.5 h-3.5 ${item.color}`} />
                  <span className="flex-1 text-muted-foreground">{item.label}</span>
                  <span className="font-medium">{item.value}</span>
                </div>
              ))}
            </div>
            <div className="pt-2 border-t border-border">
              <Link href="/data-entry">
                <Button size="sm" variant="outline" className="w-full text-xs" data-testid="link-enter-data">
                  Enter Data
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card data-testid="card-data-completeness">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Target className="w-4 h-4 text-primary" />
              Data Completeness
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(() => {
              const totalEnabled = metricSummaries.length;
              const withData = metricSummaries.filter((m: any) => m.status !== "missing").length;
              const withEvidence = Math.round((evidenceCoverage / 100) * totalEnabled);
              const submitted = metricSummaries.filter((m: any) => m.workflowStatus === "submitted" || m.workflowStatus === "approved").length;
              const approved = metricSummaries.filter((m: any) => m.workflowStatus === "approved").length;
              const metricsPercent = totalEnabled > 0 ? Math.round((withData / totalEnabled) * 100) : 0;
              const evidencePercent = Math.round(evidenceCoverage);
              const approvalPercent = submitted > 0 ? Math.round((approved / submitted) * 100) : 0;
              return (
                <>
                  <div data-testid="progress-metrics-entered">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-muted-foreground">Metrics with data</span>
                      <span className="font-medium">{withData}/{totalEnabled} ({metricsPercent}%)</span>
                    </div>
                    <Progress value={metricsPercent} className="h-2" />
                  </div>
                  <div data-testid="progress-evidence-coverage">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-muted-foreground">Evidence coverage</span>
                      <span className="font-medium">{withEvidence}/{totalEnabled} ({evidencePercent}%)</span>
                    </div>
                    <Progress value={evidencePercent} className="h-2" />
                  </div>
                  <div data-testid="progress-approval-rate">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-muted-foreground">Approved / submitted</span>
                      <span className="font-medium">{approved}/{submitted} ({approvalPercent}%)</span>
                    </div>
                    <Progress value={approvalPercent} className="h-2" />
                  </div>
                </>
              );
            })()}
          </CardContent>
        </Card>

        <Card data-testid="card-quick-actions">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Zap className="w-4 h-4 text-primary" />
              Quick Actions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {(() => {
              const needData = metricSummaries.filter((m: any) => m.status === "missing").length;
              const pendingApprovals = metricSummaries.filter((m: any) => m.workflowStatus === "submitted").length;
              const pendingEvidence = Array.isArray(evidenceRequests) ? evidenceRequests.filter((er: any) => er.status === "requested").length : 0;
              const overdueCount = actions.filter((a: any) => a.status !== "complete" && a.dueDate && new Date(a.dueDate) < new Date()).length;
              return (
                <>
                  <Link href="/data-entry">
                    <div className="flex items-center justify-between p-2 rounded hover:bg-muted/50 cursor-pointer" data-testid="link-quick-action-data-entry">
                      <div className="flex items-center gap-2 text-sm">
                        <ClipboardList className="w-3.5 h-3.5 text-muted-foreground" />
                        <span>{needData} metrics need data</span>
                      </div>
                      {needData > 0 && <Badge variant="secondary" className="text-xs">{needData}</Badge>}
                    </div>
                  </Link>
                  {(isAdmin || can("report_generation")) && (
                    <Link href="/my-approvals">
                      <div className="flex items-center justify-between p-2 rounded hover:bg-muted/50 cursor-pointer" data-testid="link-quick-action-approvals">
                        <div className="flex items-center gap-2 text-sm">
                          <CheckCircle className="w-3.5 h-3.5 text-muted-foreground" />
                          <span>{pendingApprovals} items awaiting approval</span>
                        </div>
                        {pendingApprovals > 0 && <Badge variant="secondary" className="text-xs">{pendingApprovals}</Badge>}
                      </div>
                    </Link>
                  )}
                  <Link href="/evidence">
                    <div className="flex items-center justify-between p-2 rounded hover:bg-muted/50 cursor-pointer" data-testid="link-quick-action-evidence">
                      <div className="flex items-center gap-2 text-sm">
                        <FileCheck className="w-3.5 h-3.5 text-muted-foreground" />
                        <span>{pendingEvidence} evidence requests pending</span>
                      </div>
                      {pendingEvidence > 0 && <Badge variant="secondary" className="text-xs">{pendingEvidence}</Badge>}
                    </div>
                  </Link>
                  <Link href="/actions">
                    <div className="flex items-center justify-between p-2 rounded hover:bg-muted/50 cursor-pointer" data-testid="link-quick-action-overdue">
                      <div className="flex items-center gap-2 text-sm">
                        <AlertCircle className="w-3.5 h-3.5 text-muted-foreground" />
                        <span>{overdueCount} actions overdue</span>
                      </div>
                      {overdueCount > 0 && <Badge variant="destructive" className="text-xs">{overdueCount}</Badge>}
                    </div>
                  </Link>
                </>
              );
            })()}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <DataQualityCard />
        <BenchmarkSummaryCard />
      </div>

      <RecommendationsWidget />

      <ActivityFeed />

      <NotificationsPanel />
    </div>
  );
}

function RecommendationsWidget() {
  const { data, isLoading } = useQuery<{ recommendations: Array<{ id: string; title: string; description: string; impact: string; actionUrl: string }>; total: number }>({
    queryKey: ["/api/recommendations"],
  });

  const high = data?.recommendations.filter(r => r.impact === "high") || [];
  const topItems = data?.recommendations.slice(0, 3) || [];

  if (isLoading) return null;
  if (!data || data.total === 0) return null;

  return (
    <Card data-testid="card-recommendations-widget">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            ESG Recommendations
            {high.length > 0 && (
              <Badge variant="destructive" className="text-xs ml-1">{high.length} high impact</Badge>
            )}
          </CardTitle>
          <Link href="/recommendations">
            <button className="text-xs text-primary hover:underline" data-testid="link-view-all-recommendations">
              View all {data.total}
            </button>
          </Link>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-2">
        {topItems.map(rec => (
          <div key={rec.id} className="flex items-start gap-2.5 p-2.5 rounded-lg bg-muted/40" data-testid={`recommendation-${rec.id}`}>
            <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${rec.impact === "high" ? "bg-red-500" : rec.impact === "medium" ? "bg-amber-500" : "bg-muted-foreground"}`} />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium">{rec.title}</p>
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{rec.description}</p>
            </div>
          </div>
        ))}
        {data.total > 3 && (
          <Link href="/recommendations">
            <p className="text-xs text-muted-foreground text-center pt-1 hover:text-primary cursor-pointer">
              +{data.total - 3} more recommendations
            </p>
          </Link>
        )}
      </CardContent>
    </Card>
  );
}

function NotificationsPanel() {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);

  const { data: notifications = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/notifications"],
  });

  const refreshMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/notifications/refresh"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/count"] });
    },
  });

  const dismissMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/notifications/${id}/dismiss`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/count"] });
    },
  });

  const dismissAllMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/notifications/dismiss-all"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/count"] });
    },
  });

  const severityIcon = (sev: string) => {
    if (sev === "critical") return <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />;
    if (sev === "warning") return <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />;
    return <Info className="w-3.5 h-3.5 text-blue-500 shrink-0" />;
  };

  const severityBg = (sev: string) => {
    if (sev === "critical") return "border-l-red-500";
    if (sev === "warning") return "border-l-amber-500";
    return "border-l-blue-500";
  };

  const displayed = expanded ? notifications : notifications.slice(0, 5);

  return (
    <Card data-testid="section-notifications">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Bell className="w-4 h-4 text-primary" />
            Notifications & Reminders
            {notifications.length > 0 && (
              <Badge variant="secondary" className="text-xs" data-testid="badge-notification-total">
                {notifications.length}
              </Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost" size="sm" className="text-xs h-7"
              onClick={() => refreshMutation.mutate()}
              disabled={refreshMutation.isPending}
              data-testid="button-refresh-notifications"
            >
              {refreshMutation.isPending ? "Scanning..." : "Refresh"}
            </Button>
            {notifications.length > 0 && (
              <Button
                variant="ghost" size="sm" className="text-xs h-7"
                onClick={() => dismissAllMutation.mutate()}
                disabled={dismissAllMutation.isPending}
                data-testid="button-dismiss-all-notifications"
              >
                Dismiss all
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        ) : notifications.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4" data-testid="text-no-notifications">
            No active notifications. Click Refresh to scan for reminders.
          </p>
        ) : (
          <div className="space-y-1.5">
            {displayed.map((n: any) => (
              <div
                key={n.id}
                className={`flex items-start gap-2 p-2 rounded border-l-2 bg-muted/30 ${severityBg(n.severity)}`}
                data-testid={`notification-item-${n.id}`}
              >
                {severityIcon(n.severity)}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium leading-tight" data-testid={`text-notification-title-${n.id}`}>{n.title}</p>
                  <p className="text-xs text-muted-foreground leading-tight mt-0.5">{n.message}</p>
                  <div className="flex items-center gap-2 mt-1">
                    {n.linkUrl && (
                      <Link href={n.linkUrl}>
                        <Button variant="link" size="sm" className="text-xs h-5 p-0" data-testid={`link-notification-${n.id}`}>
                          View
                        </Button>
                      </Link>
                    )}
                    {n.dueDate && (
                      <span className="text-[10px] text-muted-foreground">
                        {format(new Date(n.dueDate), "MMM d, yyyy")}
                      </span>
                    )}
                  </div>
                </div>
                <Button
                  variant="ghost" size="icon" className="w-5 h-5 shrink-0"
                  onClick={() => dismissMutation.mutate(n.id)}
                  data-testid={`button-dismiss-notification-${n.id}`}
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>
            ))}
            {notifications.length > 5 && (
              <Button
                variant="ghost" size="sm" className="w-full text-xs h-7 mt-1"
                onClick={() => setExpanded(!expanded)}
                data-testid="button-toggle-notifications"
              >
                {expanded ? (
                  <><ChevronUp className="w-3 h-3 mr-1" /> Show less</>
                ) : (
                  <><ChevronDown className="w-3 h-3 mr-1" /> Show {notifications.length - 5} more</>
                )}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
