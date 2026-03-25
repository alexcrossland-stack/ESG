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
  Database, TrendingDown, BookOpen, Globe, Star, Download,
} from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState, useEffect } from "react";
import { format } from "date-fns";
import { ActivityFeed } from "@/components/activity-feed";
import { Progress } from "@/components/ui/progress";
import { usePermissions } from "@/lib/permissions";
import { useSiteContext } from "@/hooks/use-site-context";
import { SourceBadge } from "@/components/source-badge";
import { EvidenceCoverageCard } from "@/components/evidence-coverage-card";
import { EsgMaturityProgress } from "@/components/esg-maturity-progress";
import { ValueSourceBadge } from "@/components/value-source-badge";
import { Building2, ArrowRight } from "lucide-react";
import { PageGuidance } from "@/components/page-guidance";
import { useActivationState } from "@/hooks/use-activation-state";
import { EsgTooltip } from "@/components/esg-tooltip";
import { ContextualHelpLink } from "@/components/help";

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
  const activation = useActivationState();

  if (activation.isLoading || activation.isError) {
    return (
      <Card className="border-primary/30 bg-primary/5" data-testid="card-activation-checklist">
        <CardHeader className="pb-2">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-1.5 w-full mt-2" />
        </CardHeader>
        <CardContent className="pb-3 space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!activation.activationSteps.length) return null;
  if (activation.activationComplete) return null;

  const { activationSteps, activationPercent, activationNextStep } = activation;

  const progressLabel = activationPercent === 0
    ? "Not started yet — pick step 1 below"
    : activationPercent === 33
    ? "1 of 3 done — keep going"
    : activationPercent === 67
    ? "2 of 3 done — almost there"
    : "All 3 done — you're set up!";

  return (
    <Card className="border-primary/30 bg-primary/5" data-testid="card-activation-checklist">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            Get started — 3 steps to your first ESG report
          </CardTitle>
        </div>
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <CardDescription className="text-xs">{progressLabel}</CardDescription>
            <span className="text-xs font-medium text-primary">{activationPercent}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${activationPercent}%` }} />
          </div>
        </div>
      </CardHeader>
      <CardContent className="pb-3">
        <div className="space-y-1">
          {activationSteps.map((step, idx) => (
            <Link key={step.key} href={step.actionUrl || "/"}>
              <div
                className="flex items-start gap-2.5 p-2 rounded-md hover:bg-background/60 cursor-pointer transition-colors group"
                data-testid={`activation-step-${step.key}`}
              >
                {step.complete ? (
                  <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                ) : (
                  <div className="w-4 h-4 rounded-full border-2 border-muted-foreground/30 shrink-0 mt-0.5 group-hover:border-primary/50 transition-colors flex items-center justify-center">
                    <span className="text-[9px] font-bold text-muted-foreground">{idx + 1}</span>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm leading-snug ${step.complete ? "text-muted-foreground line-through" : "font-medium"}`}>{step.label}</p>
                  {!step.complete && <p className="text-xs text-muted-foreground">{step.description}</p>}
                  {!step.complete && step.why && (
                    <p className="text-xs text-primary/70 mt-0.5 italic">{step.why}</p>
                  )}
                </div>
                {!step.complete && activationNextStep && step.key === activationNextStep.key && (
                  <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded font-medium shrink-0">Next</span>
                )}
              </div>
            </Link>
          ))}
        </div>
        {activationNextStep && (
          <div className="mt-3 pt-3 border-t">
            <Link href={activationNextStep.actionUrl || "/"}>
              <Button size="sm" className="w-full" data-testid="button-activation-primary-cta">
                {activationNextStep.label} <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function NextStepBanner() {
  const activation = useActivationState();

  if (activation.isLoading || activation.isError) {
    return <Skeleton className="h-12 w-full rounded-lg" />;
  }

  if (activation.activationComplete) return null;

  const next = activation.activationNextStep;
  if (!next) return null;

  return (
    <div
      className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg border border-primary/20 bg-primary/5"
      data-testid="banner-next-step"
    >
      <div className="flex items-center gap-2 min-w-0">
        <Zap className="w-4 h-4 text-primary shrink-0" />
        <p className="text-sm text-foreground leading-snug">{next.description}</p>
      </div>
      <Link href={next.actionUrl || "/"}>
        <Button size="sm" className="shrink-0" data-testid="button-next-step-banner">
          {next.label} <ArrowRight className="w-3.5 h-3.5 ml-1" />
        </Button>
      </Link>
    </div>
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

function ConfidencePill({ confidence, label }: { confidence: string; label: string }) {
  const config: Record<string, { cls: string }> = {
    score_in_progress: { cls: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400" },
    draft: { cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" },
    provisional: { cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
    confirmed: { cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" },
  };
  const cls = config[confidence]?.cls || config.draft.cls;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls}`} data-testid="badge-score-confidence">
      {label}
    </span>
  );
}

function DashboardHeroCard({ esgScore, weightedScore }: { esgScore: number; weightedScore: any }) {
  const { data: readiness, isLoading } = useQuery<any>({ queryKey: ["/api/dashboard/readiness"] });

  if (isLoading) return <Skeleton className="h-40 w-full" />;

  const confidence = readiness?.scoreConfidence || "score_in_progress";
  const confidenceLabel = readiness?.scoreConfidenceLabel || "Score in progress";
  const explanation = readiness?.scoreConfidenceExplanation || "";
  const dataCompleteness = readiness?.dataCompletenessPercent ?? 0;
  const evidenceCoverage = readiness?.evidenceCoveragePercent ?? 0;
  const reportingReady = readiness?.reportingReadiness ?? false;
  const estimatedPct = readiness?.estimatedPercent ?? 0;
  const missingPct = readiness?.missingPercent ?? 0;
  const plainSummary = readiness?.plainEnglishSummary || "";

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-background" data-testid="card-dashboard-hero">
      <CardContent className="p-5">
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex flex-col items-center shrink-0">
            {confidence === "score_in_progress" ? (
              <div className="w-24 h-24 rounded-full border-4 border-dashed border-muted flex items-center justify-center">
                <span className="text-xs text-muted-foreground text-center leading-tight">Score<br/>in progress</span>
              </div>
            ) : (
              <ScoreRing score={esgScore} label="ESG Score" />
            )}
            <ConfidencePill confidence={confidence} label={confidenceLabel} />
          </div>

          <div className="flex-1 min-w-0 space-y-3">
            <div>
              <p className="text-sm font-medium text-foreground">{plainSummary}</p>
              {explanation && confidence !== "confirmed" && (
                <p className="text-xs text-muted-foreground mt-1 italic">{explanation}</p>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="flex flex-col gap-1 p-2 rounded-md bg-background/60 border border-border" data-testid="stat-data-completeness">
                <div className="flex items-center gap-1">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Data</p>
                  <ValueSourceBadge source="actual" />
                </div>
                <p className="text-lg font-bold">{dataCompleteness}%</p>
                <Progress value={dataCompleteness} className="h-1" />
              </div>
              <div className="flex flex-col gap-1 p-2 rounded-md bg-background/60 border border-border" data-testid="stat-evidence-strength">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Evidence</p>
                <p className="text-lg font-bold">{evidenceCoverage}%</p>
                <Progress value={evidenceCoverage} className="h-1" />
              </div>
              <div className="flex flex-col gap-1 p-2 rounded-md bg-background/60 border border-border" data-testid="stat-estimated-pct">
                <div className="flex items-center gap-1">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Estimated</p>
                  <ValueSourceBadge source="estimated" />
                </div>
                <p className="text-lg font-bold text-amber-600">{estimatedPct}%</p>
                <Progress value={estimatedPct} className="h-1 [&>div]:bg-amber-500" />
              </div>
              <div className="flex flex-col gap-1 p-2 rounded-md bg-background/60 border border-border" data-testid="stat-reporting-readiness">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Reporting</p>
                <p className={`text-xs font-medium mt-0.5 ${reportingReady ? "text-emerald-600" : "text-amber-600"}`}>
                  {reportingReady ? "Ready" : "Not yet"}
                </p>
                <p className="text-[10px] text-muted-foreground">{reportingReady ? "Draft report available" : `${missingPct}% missing`}</p>
              </div>
            </div>

            {estimatedPct > 20 && (
              <div className="flex items-center gap-2 p-2 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                <Info className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <p className="text-xs text-amber-700 dark:text-amber-300">{estimatedPct}% of your data is estimated. <Link href="/data-entry?highlight=estimated" className="underline font-medium" data-testid="link-replace-estimates">Replace with actual values</Link> to improve your score confidence.</p>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ActionFeedCard() {
  const { data: actions, isLoading } = useQuery<any[]>({ queryKey: ["/api/dashboard/actions"] });

  if (isLoading) return (
    <Card data-testid="card-action-feed">
      <CardHeader className="pb-2">
        <Skeleton className="h-4 w-48" />
      </CardHeader>
      <CardContent className="space-y-2">
        {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
      </CardContent>
    </Card>
  );

  if (!actions || actions.length === 0) return null;

  const effortColors: Record<string, string> = {
    low: "text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 dark:text-emerald-300",
    medium: "text-amber-600 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-300",
    high: "text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-300",
  };
  const impactColors: Record<string, string> = {
    low: "text-gray-500",
    medium: "text-blue-600 dark:text-blue-400",
    high: "text-primary",
  };

  return (
    <Card data-testid="card-action-feed">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Zap className="w-4 h-4 text-primary" />
          What to do next
        </CardTitle>
        <CardDescription className="text-xs">Prioritised actions to improve your ESG performance</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {actions.map((action: any, idx: number) => (
          <div
            key={action.id}
            className="flex items-start gap-3 p-3 rounded-md border border-border hover:bg-muted/30 transition-colors"
            data-testid={`action-card-${action.id}`}
          >
            <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
              {idx + 1}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                <p className="text-sm font-medium">{action.title}</p>
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${effortColors[action.effort]}`}>
                  {action.effort} effort
                </span>
                <span className={`text-[10px] font-medium ${impactColors[action.impact]}`}>
                  {action.impact} impact
                </span>
              </div>
              <p className="text-xs text-muted-foreground leading-snug">{action.explanation}</p>
              <p className="text-xs text-primary/70 italic mt-0.5">{action.whyItMatters}</p>
            </div>
            <Link href={action.ctaUrl}>
              <Button size="sm" variant="outline" className="shrink-0 h-7 text-xs" data-testid={`button-action-cta-${action.id}`}>
                {action.ctaLabel}
                <ArrowRight className="w-3 h-3 ml-1" />
              </Button>
            </Link>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function FirstReportMilestone({ onDismiss }: { onDismiss: () => void }) {
  return (
    <Card className="border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-900/10" data-testid="card-milestone-first-report">
      <CardContent className="p-5">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
            <Star className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">Your first ESG report is ready!</h3>
                <p className="text-xs text-emerald-700/80 dark:text-emerald-400/80 mt-0.5">
                  Your draft score is now available. This is your ESG baseline — keep improving data accuracy to strengthen your score over time.
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="w-6 h-6 shrink-0 text-muted-foreground"
                onClick={onDismiss}
                data-testid="button-dismiss-milestone"
              >
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-2 mt-3">
              <Link href="/reports">
                <Button size="sm" className="h-7 text-xs gap-1.5" data-testid="button-milestone-view-report">
                  <FileText className="w-3 h-3" />
                  View report
                </Button>
              </Link>
              <Link href="/reports">
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" data-testid="button-milestone-download-report">
                  <Download className="w-3 h-3" />
                  Download report
                </Button>
              </Link>
              <Link href="/data-entry">
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" data-testid="button-milestone-improve-accuracy">
                  <TrendingUp className="w-3 h-3" />
                  Improve accuracy
                </Button>
              </Link>
              <Link href="/data-entry?highlight=estimated">
                <Button size="sm" variant="ghost" className="h-7 text-xs gap-1.5" data-testid="button-milestone-review-estimates">
                  <CheckCircle className="w-3 h-3" />
                  Review estimated values
                </Button>
              </Link>
            </div>
          </div>
        </div>
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

function SiteBreakdownCard({ period }: { period?: string }) {
  const periodParam = period ? `?period=${encodeURIComponent(period)}` : "";
  const { data: rawSummary, isLoading } = useQuery<any>({
    queryKey: ["/api/sites/summary", period || ""],
    queryFn: () => authFetch(`/api/sites/summary${periodParam}`).then(r => r.json()),
    staleTime: 60000,
  });
  const summary: any[] = Array.isArray(rawSummary) ? rawSummary : [];
  if (!isLoading && summary.length === 0) return null;
  return (
    <Card data-testid="card-site-breakdown">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Building2 className="w-4 h-4 text-primary" />
          Sites Overview
        </CardTitle>
        <span className="text-xs text-muted-foreground">Data recorded per site</span>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-8" />
            <Skeleton className="h-8" />
          </div>
        ) : (
          <div className="divide-y divide-border">
            {summary.map((row: any) => (
              <div key={row.siteId ?? "__unassigned__"} className="flex items-center justify-between py-2 text-sm" data-testid={`row-site-summary-${row.siteId ?? "unassigned"}`}>
                <div className="flex items-center gap-1.5 min-w-0">
                  <Building2 className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                  {row.siteId ? (
                    <Link href={`/sites/${row.siteId}/dashboard`} className="font-medium truncate hover:underline">{row.siteName}</Link>
                  ) : (
                    <span className="font-medium text-muted-foreground truncate">{row.siteName}</span>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0 text-xs text-muted-foreground">
                  <span data-testid={`text-site-metrics-${row.siteId ?? "unassigned"}`}>{row.metricCount} metrics</span>
                  <span data-testid={`text-site-evidence-${row.siteId ?? "unassigned"}`}>{row.evidenceCount} evidence</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function BackToPortfolioBanner() {
  const fromPortfolio = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("from") === "portfolio";
  if (!fromPortfolio) return null;
  return (
    <div className="flex items-center justify-between px-4 py-2 rounded-lg bg-primary/5 border border-primary/20 mb-2" data-testid="banner-back-to-portfolio">
      <span className="text-sm text-foreground">
        Viewing from <span className="font-medium">Portfolio Dashboard</span>
      </span>
      <Link href="/portfolio">
        <Button size="sm" variant="outline" className="h-7 text-xs" data-testid="link-back-to-portfolio">
          ← Back to Portfolio Dashboard
        </Button>
      </Link>
    </div>
  );
}

export default function Dashboard() {
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>("__latest__");
  const [milestoneDismissed, setMilestoneDismissed] = useState<boolean>(() => {
    try { return localStorage.getItem("milestone_first_report_dismissed") === "true"; } catch { return false; }
  });
  const periodParam = selectedPeriodId !== "__latest__" ? `?reportingPeriodId=${selectedPeriodId}` : "";
  const { data: enhanced, isLoading: enhancedLoading } = useQuery<any>({ queryKey: ["/api/dashboard/enhanced", selectedPeriodId], queryFn: () => authFetch(`/api/dashboard/enhanced${periodParam}`).then(r => r.json()) });
  const { data: oldData, isLoading: oldLoading } = useQuery<any>({ queryKey: ["/api/dashboard"] });
  const { data: authData } = useQuery<any>({ queryKey: ["/api/auth/me"] });
  const { data: carbonCalcs } = useQuery<any>({ queryKey: ["/api/carbon-calculations"] });
  const { data: policyData } = useQuery<any>({ queryKey: ["/api/policy"] });
  const { data: reportingPeriods = [] } = useQuery<any[]>({ queryKey: ["/api/reporting-periods"] });
  const { data: evidenceRequests = [] } = useQuery<any[]>({ queryKey: ["/api/evidence-requests"] });
  const { data: readiness } = useQuery<any>({ queryKey: ["/api/dashboard/readiness"] });
  const { can, isAdmin } = usePermissions();
  const { activeSiteId } = useSiteContext();

  const isLoading = enhancedLoading || oldLoading;
  const activePeriod = reportingPeriods.find((rp: any) => rp.id === selectedPeriodId);
  // Derive a YYYY-MM period string from the selected reporting period for the scoring API
  const scorePeriod = activePeriod?.startDate
    ? (() => { const d = new Date(activePeriod.startDate); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; })()
    : undefined;

  const showMilestone = (() => {
    if (milestoneDismissed || !readiness?.hasGeneratedReport) return false;
    try {
      return localStorage.getItem("milestone_first_report_seen") !== "true";
    } catch { return false; }
  })();

  useEffect(() => {
    if (showMilestone) {
      try { localStorage.setItem("milestone_first_report_seen", "true"); } catch {}
    }
  }, [showMilestone]);

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

  const handleDismissMilestone = () => {
    setMilestoneDismissed(true);
    try { localStorage.setItem("milestone_first_report_dismissed", "true"); } catch {}
  };

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-7xl mx-auto">
      <BackToPortfolioBanner />
      <PageGuidance
        pageKey="dashboard"
        title="ESG Dashboard — what the numbers mean"
        summary="This dashboard shows your overall ESG (Environmental, Social and Governance) performance. The score is calculated from the data you enter and the policies/evidence you have in place. A higher score means better data coverage and performance — it is not a regulatory rating."
        goodLooksLike="ESG score above 60%, all key metrics showing data for the current month, and the activation checklist fully complete."
        steps={[
          "Check the 'Get up and running' checklist if it is visible — complete those steps first",
          "Go to Data Entry to add your monthly/quarterly metric values (energy, headcount, waste, etc.)",
          "Once data is entered, your score and charts will update automatically",
          "Use the Reports page to generate a summary for customers, investors, or your own team",
        ]}
      />
      <ActionPlanBanner company={company} />

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
        </div>
      </div>

      <NextStepBanner />
      <ActivationCard />

      {showMilestone && (
        <FirstReportMilestone onDismiss={handleDismissMilestone} />
      )}

      <DashboardHeroCard esgScore={esgScore} weightedScore={weightedScore} />

      <ActionFeedCard />

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
          <CardContent className="p-4 flex flex-col items-center justify-center h-full gap-1">
            <p className="text-xs font-medium text-muted-foreground text-center flex items-center gap-1 justify-center">ESG Position <EsgTooltip term="esg" /></p>
            <ScoreRing score={esgScore} label="Overall" />
            <p className="text-[10px] text-center text-muted-foreground leading-tight mt-1">See 4-dimension breakdown below</p>
            <ContextualHelpLink slug="what-your-esg-score-means" label="What does this mean?" className="mt-1" />
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

      <MultiDimensionalScoreCards period={scorePeriod} siteId={activeSiteId} />

      <ProgrammeStatusCard />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <EvidenceCoverageCard />
        <EsgMaturityProgress />
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
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Leaf className="w-4 h-4 text-primary" />
              Carbon Emissions
            </CardTitle>
            <CardDescription className="text-xs">Scope 1 & 2 (tCO2e)</CardDescription>
          </CardHeader>
          <CardContent>
            {emissionsChartData.length > 0 ? (
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
            ) : (
              <div className="flex flex-col items-center justify-center h-40 text-center gap-2" data-testid="empty-state-emissions">
                <Leaf className="w-7 h-7 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">No carbon data yet</p>
                <p className="text-xs text-muted-foreground/70 max-w-[180px]">Add electricity or gas usage in Data Entry to see emissions here.</p>
                <Link href="/data-entry"><Button size="sm" variant="outline" className="mt-1 text-xs h-7" data-testid="button-empty-emissions-cta">Add data</Button></Link>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Zap className="w-4 h-4 text-primary" />
              Electricity
            </CardTitle>
            <CardDescription className="text-xs">Monthly kWh</CardDescription>
          </CardHeader>
          <CardContent>
            {electricityChart.length > 0 ? (
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
            ) : (
              <div className="flex flex-col items-center justify-center h-40 text-center gap-2" data-testid="empty-state-electricity">
                <Zap className="w-7 h-7 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">No electricity data yet</p>
                <p className="text-xs text-muted-foreground/70 max-w-[180px]">Enter your monthly kWh from your electricity bill to track usage.</p>
                <Link href="/data-entry"><Button size="sm" variant="outline" className="mt-1 text-xs h-7" data-testid="button-empty-electricity-cta">Add data</Button></Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-500" />
              Workforce
            </CardTitle>
            <CardDescription className="text-xs">Total headcount</CardDescription>
          </CardHeader>
          <CardContent>
            {workforceChart.length > 0 ? (
              <ResponsiveContainer width="100%" height={140}>
                <BarChart data={workforceChart}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="period" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} domain={["auto", "auto"]} width={30} />
                  <Tooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} />
                  <Bar dataKey="value" fill={COLORS.social} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex flex-col items-center justify-center h-36 text-center gap-2" data-testid="empty-state-workforce">
                <Users className="w-7 h-7 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">No headcount data yet</p>
                <p className="text-xs text-muted-foreground/70 max-w-[160px]">Add your total employee count to track workforce trends.</p>
                <Link href="/data-entry"><Button size="sm" variant="outline" className="mt-1 text-xs h-7" data-testid="button-empty-workforce-cta">Add data</Button></Link>
              </div>
            )}
          </CardContent>
        </Card>

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

      <SiteBreakdownCard period={enhanced?.latestPeriod} />

      <RecommendationsWidget />

      <ActivityFeed />

      <NotificationsPanel />
    </div>
  );
}

function ScoreDimensionCard({
  title,
  icon: Icon,
  score,
  description,
  explanation,
  details,
  testId,
  color,
}: {
  title: string;
  icon: any;
  score: number;
  description: string;
  explanation: string;
  details?: React.ReactNode;
  testId: string;
  color: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const scoreColor = score >= 70 ? "text-emerald-600 dark:text-emerald-400"
    : score >= 40 ? "text-amber-600 dark:text-amber-400"
    : "text-red-600 dark:text-red-400";
  const trackColor = score >= 70 ? "bg-emerald-500" : score >= 40 ? "bg-amber-500" : "bg-red-500";

  return (
    <Card data-testid={testId}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${color}`}>
            <Icon className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">{title}</p>
              <span className={`text-xl font-bold shrink-0 ${scoreColor}`} data-testid={`${testId}-score`}>{score}%</span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
            <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
              <div className={`h-full rounded-full transition-all ${trackColor}`} style={{ width: `${score}%` }} />
            </div>
            <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{explanation}</p>
            {details && (
              <>
                <button
                  onClick={() => setExpanded(!expanded)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mt-2 transition-colors"
                  data-testid={`${testId}-toggle`}
                >
                  {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  {expanded ? "Less detail" : "More detail"}
                </button>
                {expanded && <div className="mt-2">{details}</div>}
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function MultiDimensionalScoreCards({ period, siteId }: { period?: string; siteId?: string | null }) {
  // siteId===null means "All Sites" (company-wide) — do NOT send siteId param so backend uses company-wide scope.
  // siteId===string means a specific site is selected — send that site UUID.
  const params = new URLSearchParams();
  if (period) params.set("period", period);
  if (typeof siteId === "string") params.set("siteId", siteId);
  const queryStr = params.toString() ? `?${params.toString()}` : "";

  const { data: scores, isLoading } = useQuery<any>({
    queryKey: ["/api/esg-scores/all", period ?? null, siteId ?? null],
    queryFn: () => authFetch(`/api/esg-scores/all${queryStr}`).then(r => r.json()),
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-5 w-48" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-32" />)}
        </div>
      </div>
    );
  }

  if (!scores) return null;

  const { completeness, performance, maturity, frameworkReadiness } = scores;

  return (
    <div className="space-y-3" data-testid="section-multidimensional-scores">
      <div>
        <h2 className="text-sm font-semibold">ESG Score Breakdown</h2>
        <p className="text-xs text-muted-foreground">Four dimensions of your ESG position</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <ScoreDimensionCard
          title="Data Completeness"
          icon={Database}
          score={completeness?.score ?? 0}
          description="Expected submissions vs actual submissions"
          explanation={completeness?.explanation ?? "Loading..."}
          testId="card-score-completeness"
          color="bg-blue-100 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400"
          details={
            completeness?.byCategory && (
              <div className="space-y-1.5">
                {Object.entries(completeness.byCategory).map(([cat, data]: [string, any]) => (
                  <div key={cat} className="flex items-center gap-2 text-xs">
                    <span className="capitalize w-24 text-muted-foreground">{cat}</span>
                    <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${data.score >= 70 ? "bg-emerald-500" : data.score >= 40 ? "bg-amber-500" : "bg-red-500"}`}
                        style={{ width: `${data.score}%` }}
                      />
                    </div>
                    <span className="w-20 text-right font-medium">{data.submitted}/{data.expected} ({data.score}%)</span>
                  </div>
                ))}
                {completeness.missingMetrics?.length > 0 && (
                  <div className="pt-1 mt-1 border-t border-border">
                    <p className="text-xs text-muted-foreground font-medium mb-1">Missing data:</p>
                    <div className="flex flex-wrap gap-1">
                      {completeness.missingMetrics.slice(0, 6).map((m: any, i: number) => (
                        <Badge key={i} variant="outline" className="text-xs">{m.name}</Badge>
                      ))}
                      {completeness.missingMetrics.length > 6 && (
                        <Badge variant="outline" className="text-xs">+{completeness.missingMetrics.length - 6} more</Badge>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          }
        />

        <ScoreDimensionCard
          title="Performance"
          icon={TrendingUp}
          score={performance?.score ?? 0}
          description="Metric values vs targets and prior trends"
          explanation={performance?.explanation ?? "Loading..."}
          testId="card-score-performance"
          color="bg-emerald-100 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400"
          details={
            performance?.byCategory && (
              <div className="space-y-1.5">
                {Object.entries(performance.byCategory).map(([cat, data]: [string, any]) => (
                  data.total > 0 && (
                    <div key={cat} className="text-xs">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="capitalize text-muted-foreground">{cat}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-emerald-600">{data.greenCount} on track</span>
                          {data.amberCount > 0 && <span className="text-amber-600">{data.amberCount} at risk</span>}
                          {data.redCount > 0 && <span className="text-red-600">{data.redCount} off track</span>}
                        </div>
                      </div>
                    </div>
                  )
                ))}
              </div>
            )
          }
        />

        <ScoreDimensionCard
          title="Management Maturity"
          icon={BookOpen}
          score={maturity?.score ?? 0}
          description="Policy, ownership, targets, evidence & review cycles"
          explanation={maturity?.explanation ?? "Loading..."}
          testId="card-score-maturity"
          color="bg-purple-100 text-purple-600 dark:bg-purple-950/40 dark:text-purple-400"
          details={
            maturity?.dimensions && (
              <div className="space-y-1.5">
                {Object.entries(maturity.dimensions).map(([key, dim]: [string, any]) => {
                  const labels: Record<string, string> = {
                    policiesInPlace: "Policy",
                    governanceOwnership: "Ownership",
                    targetsSet: "Targets",
                    actionsInProgress: "Actions",
                    evidenceAttached: "Evidence",
                    reviewCycles: "Review cycles",
                  };
                  return (
                    <div key={key} className="text-xs">
                      <div className="flex items-center gap-2">
                        <span className="w-24 text-muted-foreground">{labels[key] || key}</span>
                        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${dim.score >= 70 ? "bg-emerald-500" : dim.score >= 40 ? "bg-amber-500" : "bg-red-500"}`}
                            style={{ width: `${dim.score}%` }}
                          />
                        </div>
                        <span className="w-8 text-right font-medium">{dim.score}%</span>
                      </div>
                      <p className="text-muted-foreground pl-[104px] mt-0.5">{dim.detail}</p>
                    </div>
                  );
                })}
                {maturity.gaps?.length > 0 && (
                  <div className="pt-1 mt-1 border-t border-border">
                    <p className="text-xs font-medium text-muted-foreground mb-1">Recommended actions:</p>
                    <ul className="space-y-0.5">
                      {maturity.gaps.slice(0, 4).map((gap: string, i: number) => (
                        <li key={i} className="text-xs text-muted-foreground flex items-start gap-1">
                          <span className="text-amber-500 shrink-0 mt-0.5">•</span>
                          {gap}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )
          }
        />

        <ScoreDimensionCard
          title="Framework Readiness"
          icon={Globe}
          score={frameworkReadiness?.score ?? 0}
          description="Coverage across your selected reporting frameworks"
          explanation={frameworkReadiness?.explanation ?? "Loading..."}
          testId="card-score-framework-readiness"
          color="bg-orange-100 text-orange-600 dark:bg-orange-950/40 dark:text-orange-400"
          details={
            frameworkReadiness?.frameworks && frameworkReadiness.frameworks.length > 0 ? (
              <div className="space-y-2">
                {frameworkReadiness.frameworks.map((fw: any) => (
                  <div key={fw.id} className="text-xs" data-testid={`framework-readiness-${fw.id}`}>
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="font-medium">{fw.name}</span>
                      <span className={`font-semibold ${fw.readinessPercent >= 70 ? "text-emerald-600" : fw.readinessPercent >= 40 ? "text-amber-600" : "text-red-600"}`}>
                        {fw.readinessPercent}%
                      </span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${fw.readinessPercent >= 70 ? "bg-emerald-500" : fw.readinessPercent >= 40 ? "bg-amber-500" : "bg-red-500"}`}
                        style={{ width: `${fw.readinessPercent}%` }}
                      />
                    </div>
                    <div className="flex gap-3 mt-1 text-muted-foreground">
                      <span className="text-emerald-600">{fw.covered} covered</span>
                      <span className="text-amber-600">{fw.partial} partial</span>
                      <span className="text-red-600">{fw.missing} missing</span>
                    </div>
                  </div>
                ))}
                {frameworkReadiness.topGaps?.length > 0 && (
                  <div className="pt-1 mt-1 border-t border-border">
                    <p className="text-xs font-medium text-muted-foreground mb-1">Top gaps to address:</p>
                    <ul className="space-y-0.5">
                      {frameworkReadiness.topGaps.slice(0, 3).map((gap: string, i: number) => (
                        <li key={i} className="text-xs text-muted-foreground flex items-start gap-1">
                          <span className="text-orange-500 shrink-0 mt-0.5">•</span>
                          {gap}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">
                No frameworks selected.{" "}
                <Link href="/framework-settings" className="text-primary hover:underline">
                  Select frameworks
                </Link>{" "}
                to see per-framework readiness.
              </div>
            )
          }
        />
      </div>
    </div>
  );
}

function ActionPlanBanner({ company }: { company: any }) {
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem("action_plan_banner_dismissed") === "true"; } catch { return false; }
  });

  if (dismissed) return null;
  const plan = company?.esgActionPlan;
  if (!plan) return null;

  function dismiss() {
    try { localStorage.setItem("action_plan_banner_dismissed", "true"); } catch {}
    setDismissed(true);
  }

  const MATURITY_LABELS: Record<string, string> = {
    just_starting: "Starter",
    some_policies: "Developing",
    formal_programme: "Established",
  };

  return (
    <div className="flex items-start gap-3 p-4 rounded-lg border border-primary/30 bg-primary/5 relative" data-testid="banner-action-plan">
      <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
        <Sparkles className="w-4 h-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold">Your ESG Action Plan is ready</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Based on your {MATURITY_LABELS[plan.maturityLevel] || plan.maturityLevel} maturity level.
          We've recommended {plan.recommendedPolicies?.length || 0} policies,&nbsp;
          {plan.recommendedMetrics?.length || 0} metrics, and {plan.recommendedEvidence?.length || 0} evidence documents to collect.
        </p>
        <div className="flex gap-2 mt-2 flex-wrap">
          {(plan.recommendedPolicies || []).slice(0, 2).map((p: any, i: number) => (
            <Badge key={i} variant="secondary" className="text-xs">{p.name}</Badge>
          ))}
          {(plan.recommendedPolicies || []).length > 2 && (
            <Badge variant="secondary" className="text-xs">+{(plan.recommendedPolicies || []).length - 2} more</Badge>
          )}
        </div>
        <div className="flex gap-2 mt-2">
          <Link href="/policy-generator">
            <Button size="sm" variant="outline" className="h-7 text-xs" data-testid="button-action-plan-create-policy">
              Create first policy
            </Button>
          </Link>
          <Link href="/metrics">
            <Button size="sm" variant="ghost" className="h-7 text-xs" data-testid="button-action-plan-view-metrics">
              View metrics
            </Button>
          </Link>
        </div>
      </div>
      <button onClick={dismiss} className="text-muted-foreground hover:text-foreground transition-colors shrink-0" data-testid="button-dismiss-action-plan">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

function ProgrammeStatusCard() {
  const { data: status, isLoading } = useQuery<any>({ queryKey: ["/api/programme/status"] });

  if (isLoading) return <Skeleton className="h-44" />;
  if (!status) return null;

  const PRIORITY_COLORS: Record<string, string> = {
    high: "text-red-500 dark:text-red-400",
    medium: "text-amber-500 dark:text-amber-400",
    low: "text-blue-500 dark:text-blue-400",
  };

  const PRIORITY_BG: Record<string, string> = {
    high: "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800",
    medium: "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800",
    low: "bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800",
  };

  return (
    <Card data-testid="card-programme-status">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="w-4 h-4 text-primary" />
            ESG Programme Status
          </CardTitle>
          <div className="text-right">
            <span className="text-2xl font-bold">{status.overallCompletionPercent}%</span>
            <p className="text-xs text-muted-foreground">complete</p>
          </div>
        </div>
        <Progress value={status.overallCompletionPercent} className="h-2 mt-1" />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
          <div className="p-2 rounded-md bg-muted/50">
            <p className="text-lg font-bold text-primary">{status.policiesAdoptedCount}</p>
            <p className="text-xs text-muted-foreground">Policies</p>
          </div>
          <div className="p-2 rounded-md bg-muted/50">
            <p className="text-lg font-bold text-blue-500">{status.metricsWithDataCount}<span className="text-sm font-normal text-muted-foreground">/{status.metricsEnabledCount}</span></p>
            <p className="text-xs text-muted-foreground">Metrics with data</p>
          </div>
          <div className="p-2 rounded-md bg-muted/50">
            <p className="text-lg font-bold text-amber-500">{status.evidenceCoveragePercent}%</p>
            <p className="text-xs text-muted-foreground">Evidence coverage</p>
          </div>
          <div className="p-2 rounded-md bg-muted/50">
            <p className="text-lg font-bold capitalize" data-testid="text-programme-maturity">{status.maturityStage || "starter"}</p>
            <p className="text-xs text-muted-foreground">Maturity</p>
          </div>
        </div>

        {(status.nextBestActions || []).length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Next Best Actions</p>
            {(status.nextBestActions || []).map((action: any, i: number) => (
              <Link key={i} href={action.url}>
                <div
                  className={`flex items-center gap-2 p-2 rounded-md border text-xs cursor-pointer hover:opacity-80 transition-opacity ${PRIORITY_BG[action.priority] || PRIORITY_BG.low}`}
                  data-testid={`next-action-${i}`}
                >
                  <Zap className={`w-3 h-3 shrink-0 ${PRIORITY_COLORS[action.priority] || ""}`} />
                  <span className="flex-1 leading-snug">{action.label}</span>
                  <ChevronDown className="w-3 h-3 text-muted-foreground -rotate-90 shrink-0" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
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
