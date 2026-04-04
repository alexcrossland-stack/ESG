import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CheckCircle2, AlertTriangle, XCircle, ChevronDown, ChevronUp,
  TrendingUp, FileCheck, BarChart3, ArrowRight, Info, Sparkles, Target,
} from "lucide-react";
import { useState } from "react";
import { EsgStatusBadge } from "@/components/esg-status-badge";

type EsgState = "IN_PROGRESS" | "DRAFT" | "PROVISIONAL" | "CONFIRMED";

export interface ReadinessDetail {
  esgState: EsgState;
  stateLabel: string;
  stateExplanation: string;
  completenessPercent: number;
  evidenceCoveragePercent: number;
  measuredCount: number;
  estimateCount: number;
  missingCount: number;
  totalMetrics: number;
  filledMetrics: number;
  nextAction: string;
  minViableThresholdMet: boolean;
  blockingFactors: string[];
  missingCategories: {
    missingMetrics: string[];
    missingEvidenceCount: number;
    highEstimateLoad: boolean;
    estimatedPercent: number;
    policyNotPublished: boolean;
    overdueActions: number;
  };
  canGenerateConfirmed: boolean;
}

function ProgressBar({ value, color = "emerald" }: { value: number; color?: "emerald" | "blue" | "amber" | "red" }) {
  const colorMap = {
    emerald: "bg-emerald-500",
    blue: "bg-blue-500",
    amber: "bg-amber-500",
    red: "bg-red-500",
  };
  return (
    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-500 ${colorMap[color]}`}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

const STATE_CONFIG: Record<EsgState, {
  icon: any;
  borderClass: string;
  headerBg: string;
  iconColor: string;
  reportLabel: string;
}> = {
  IN_PROGRESS: {
    icon: XCircle,
    borderClass: "border-red-200 dark:border-red-800",
    headerBg: "bg-red-50 dark:bg-red-950/20",
    iconColor: "text-red-500",
    reportLabel: "Not yet ready to generate",
  },
  DRAFT: {
    icon: AlertTriangle,
    borderClass: "border-amber-200 dark:border-amber-800",
    headerBg: "bg-amber-50 dark:bg-amber-950/20",
    iconColor: "text-amber-500",
    reportLabel: "Draft Report",
  },
  PROVISIONAL: {
    icon: TrendingUp,
    borderClass: "border-blue-200 dark:border-blue-800",
    headerBg: "bg-blue-50 dark:bg-blue-950/20",
    iconColor: "text-blue-500",
    reportLabel: "Provisional Report",
  },
  CONFIRMED: {
    icon: CheckCircle2,
    borderClass: "border-emerald-200 dark:border-emerald-800",
    headerBg: "bg-emerald-50 dark:bg-emerald-950/20",
    iconColor: "text-emerald-500",
    reportLabel: "Confirmed Report",
  },
};

function MissingItem({ text, href, linkLabel }: { text: string; href?: string; linkLabel?: string }) {
  return (
    <li className="flex items-center justify-between gap-2 text-xs py-1 border-b border-border/40 last:border-0">
      <span className="text-muted-foreground">{text}</span>
      {href && (
        <Link href={href}>
          <span className="text-primary hover:underline font-medium whitespace-nowrap flex items-center gap-0.5">
            {linkLabel || "Fix"} <ArrowRight className="w-3 h-3" />
          </span>
        </Link>
      )}
    </li>
  );
}

export function ReportReadinessPanel() {
  const [showMissing, setShowMissing] = useState(false);

  const { data, isLoading } = useQuery<ReadinessDetail>({
    queryKey: ["/api/reports/readiness-detail"],
    staleTime: 30_000,
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-28 w-full" />
      </div>
    );
  }

  if (!data) return null;

  const cfg = STATE_CONFIG[data.esgState];
  const Icon = cfg.icon;
  const { missingCategories } = data;

  const barColor = data.esgState === "CONFIRMED" ? "emerald"
    : data.esgState === "PROVISIONAL" ? "blue"
    : data.esgState === "DRAFT" ? "amber"
    : "red";

  const hasAnyMissing =
    missingCategories.missingMetrics.length > 0 ||
    missingCategories.missingEvidenceCount > 0 ||
    missingCategories.highEstimateLoad ||
    missingCategories.policyNotPublished ||
    missingCategories.overdueActions > 0;

  return (
    <Card className={`${cfg.borderClass}`} data-testid="card-report-readiness-panel">
      <div className={`${cfg.headerBg} px-4 py-3 rounded-t-lg border-b border-border/50`}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Icon className={`w-4.5 h-4.5 ${cfg.iconColor} shrink-0`} />
            <div>
              <p className="text-sm font-semibold" data-testid="text-readiness-state-label">
                {cfg.reportLabel}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5" data-testid="text-readiness-explanation">
                {data.stateExplanation}
              </p>
            </div>
          </div>
          <EsgStatusBadge
            status={{
              state: data.esgState,
              label: data.stateLabel,
              explanation: data.stateExplanation,
              completenessPercentage: data.completenessPercent,
              evidenceCoverage: data.evidenceCoveragePercent,
              estimateCount: data.estimateCount,
              measuredCount: data.measuredCount,
              totalMetrics: data.totalMetrics,
              filledMetrics: data.filledMetrics,
              missingMetrics: data.missingCount,
              nextRecommendedAction: data.nextAction,
              minViableThresholdMet: data.minViableThresholdMet,
            }}
            size="sm"
            showTooltip={false}
          />
        </div>
      </div>

      <CardContent className="p-4 space-y-3">
        <div className="grid grid-cols-2 gap-x-6 gap-y-2.5">
          <div>
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span className="flex items-center gap-1">
                <BarChart3 className="w-3 h-3" /> Data completeness
              </span>
              <span className="font-medium text-foreground" data-testid="text-completeness-percent">
                {data.completenessPercent}%
              </span>
            </div>
            <ProgressBar value={data.completenessPercent} color={barColor} />
          </div>
          <div>
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span className="flex items-center gap-1">
                <FileCheck className="w-3 h-3" /> Evidence coverage
              </span>
              <span className="font-medium text-foreground" data-testid="text-evidence-percent">
                {data.evidenceCoveragePercent}%
              </span>
            </div>
            <ProgressBar value={data.evidenceCoveragePercent} color={data.evidenceCoveragePercent >= 50 ? "emerald" : data.evidenceCoveragePercent >= 25 ? "amber" : "red"} />
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs text-muted-foreground pt-0.5">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
            <span data-testid="text-measured-count">{data.measuredCount} measured</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
            <span data-testid="text-estimated-count">{data.estimateCount} estimated</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-muted-foreground/30 inline-block" />
            <span data-testid="text-missing-count">{data.missingCount} missing</span>
          </span>
        </div>

        {data.esgState === "CONFIRMED" && (
          <div className="flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-300">
            <Sparkles className="w-3.5 h-3.5 shrink-0" />
            <span>Your data is strong enough for a <strong>Confirmed report</strong>. Generate now to produce a credible standalone document.</span>
          </div>
        )}

        {data.esgState === "IN_PROGRESS" && (
          <div className="flex items-center gap-2 text-xs text-red-700 dark:text-red-300">
            <Info className="w-3.5 h-3.5 shrink-0" />
            <span>No data has been added yet. <Link href="/data-entry"><span className="underline font-medium">Go to Data Entry →</span></Link></span>
          </div>
        )}

        {data.nextAction && data.esgState !== "CONFIRMED" && data.esgState !== "IN_PROGRESS" && (
          <div className="flex items-start gap-2 text-xs text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/20 rounded-md px-2.5 py-2">
            <Target className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span data-testid="text-next-action">{data.nextAction}</span>
          </div>
        )}

        {hasAnyMissing && (
          <button
            onClick={() => setShowMissing(!showMissing)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors w-full pt-1"
            data-testid="button-toggle-missing"
          >
            {showMissing ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            {showMissing ? "Hide" : "Show"} what's missing
          </button>
        )}

        {showMissing && hasAnyMissing && (
          <div className="pt-1 border-t border-border/50" data-testid="section-whats-missing">
            <ul className="space-y-0">
              {missingCategories.missingMetrics.slice(0, 5).map((name) => (
                <MissingItem
                  key={name}
                  text={`No data: ${name}`}
                  href="/data-entry"
                  linkLabel="Enter data"
                />
              ))}
              {missingCategories.missingMetrics.length > 5 && (
                <MissingItem
                  text={`+${missingCategories.missingMetrics.length - 5} more metrics with no data`}
                  href="/data-entry"
                  linkLabel="View all"
                />
              )}
              {missingCategories.highEstimateLoad && (
                <MissingItem
                  text={`${missingCategories.estimatedPercent}% of values are estimated — replace with measured data`}
                  href="/data-entry"
                  linkLabel="Update data"
                />
              )}
              {missingCategories.missingEvidenceCount > 0 && (
                <MissingItem
                  text={`${missingCategories.missingEvidenceCount} metrics lack supporting evidence documents`}
                  href="/evidence"
                  linkLabel="Upload evidence"
                />
              )}
              {missingCategories.policyNotPublished && (
                <MissingItem
                  text="ESG policy is not published — draft exists but hasn't been approved"
                  href="/policy"
                  linkLabel="Review policy"
                />
              )}
              {missingCategories.overdueActions > 0 && (
                <MissingItem
                  text={`${missingCategories.overdueActions} overdue action${missingCategories.overdueActions === 1 ? "" : "s"} need attention`}
                  href="/actions"
                  linkLabel="View actions"
                />
              )}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
