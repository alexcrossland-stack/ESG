import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, Clock, AlertCircle, TrendingUp, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export type EsgState = "IN_PROGRESS" | "DRAFT" | "PROVISIONAL" | "CONFIRMED";

export interface EsgStatusData {
  state: EsgState;
  label: string;
  explanation: string;
  completenessPercentage: number;
  missingItems?: string[];
  evidenceCoverage?: number;
  estimateCount?: number;
  measuredCount?: number;
  totalMetrics?: number;
  filledMetrics?: number;
  missingMetrics?: number;
  nextRecommendedAction?: string;
  minViableThresholdMet?: boolean;
}

const STATE_CONFIG: Record<EsgState, {
  icon: typeof CheckCircle2;
  badgeVariant: "default" | "secondary" | "outline" | "destructive";
  colorClass: string;
  bgClass: string;
  shortLabel: string;
}> = {
  IN_PROGRESS: {
    icon: Clock,
    badgeVariant: "secondary",
    colorClass: "text-muted-foreground",
    bgClass: "bg-muted/50",
    shortLabel: "In progress",
  },
  DRAFT: {
    icon: AlertCircle,
    badgeVariant: "outline",
    colorClass: "text-amber-600 dark:text-amber-400",
    bgClass: "bg-amber-50 dark:bg-amber-950/30",
    shortLabel: "Draft",
  },
  PROVISIONAL: {
    icon: TrendingUp,
    badgeVariant: "outline",
    colorClass: "text-blue-600 dark:text-blue-400",
    bgClass: "bg-blue-50 dark:bg-blue-950/30",
    shortLabel: "Provisional",
  },
  CONFIRMED: {
    icon: CheckCircle2,
    badgeVariant: "outline",
    colorClass: "text-green-600 dark:text-green-500",
    bgClass: "bg-green-50 dark:bg-green-950/30",
    shortLabel: "Confirmed",
  },
};

interface EsgStatusBadgeProps {
  status: EsgStatusData | null | undefined;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  showTooltip?: boolean;
  className?: string;
  "data-testid"?: string;
}

export function EsgStatusBadge({
  status,
  size = "md",
  showLabel = true,
  showTooltip = true,
  className,
  "data-testid": testId,
}: EsgStatusBadgeProps) {
  if (!status) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 text-muted-foreground text-xs",
          className
        )}
        data-testid={testId}
      >
        <HelpCircle className="h-3 w-3" />
        {showLabel && "Loading..."}
      </span>
    );
  }

  const config = STATE_CONFIG[status.state];
  const Icon = config.icon;

  const iconSize = size === "sm" ? "h-3 w-3" : size === "lg" ? "h-5 w-5" : "h-4 w-4";
  const textSize = size === "sm" ? "text-xs" : size === "lg" ? "text-sm font-medium" : "text-xs";

  const badge = (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-medium border",
        textSize,
        config.colorClass,
        config.bgClass,
        "border-current/20",
        className
      )}
      data-testid={testId ?? "badge-esg-status"}
    >
      <Icon className={cn(iconSize, "shrink-0")} aria-hidden />
      {showLabel && <span>{config.shortLabel}</span>}
    </span>
  );

  if (!showTooltip) return badge;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{badge}</TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs" data-testid="tooltip-esg-status">
          <div className="space-y-2 text-sm">
            <p className="font-semibold">{status.label}</p>
            <p className="text-muted-foreground">{status.explanation}</p>
            {status.nextRecommendedAction && (
              <p className="text-foreground">
                <span className="font-medium">Next: </span>
                {status.nextRecommendedAction}
              </p>
            )}
            {status.missingItems && status.missingItems.length > 0 && (
              <div>
                <p className="font-medium text-muted-foreground">Missing metrics:</p>
                <ul className="mt-1 space-y-0.5">
                  {status.missingItems.slice(0, 4).map((item, i) => (
                    <li key={i} className="text-xs text-muted-foreground">• {item}</li>
                  ))}
                  {status.missingItems.length > 4 && (
                    <li className="text-xs text-muted-foreground">
                      • and {status.missingItems.length - 4} more...
                    </li>
                  )}
                </ul>
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

interface EsgStatusCardProps {
  status: EsgStatusData | null | undefined;
  className?: string;
  "data-testid"?: string;
}

export function EsgStatusCard({ status, className, "data-testid": testId }: EsgStatusCardProps) {
  if (!status) return null;

  const config = STATE_CONFIG[status.state];

  return (
    <div
      className={cn("rounded-lg border p-4 space-y-3", config.bgClass, className)}
      data-testid={testId ?? "card-esg-status"}
    >
      <div className="flex items-center justify-between">
        <EsgStatusBadge status={status} size="md" showTooltip={false} />
        <span className="text-2xl font-bold tabular-nums" data-testid="text-completeness-percent">
          {status.completenessPercentage}%
        </span>
      </div>

      <Progress
        value={status.completenessPercentage}
        className="h-2"
        data-testid="progress-completeness"
      />

      <p className="text-sm text-muted-foreground" data-testid="text-esg-status-explanation">
        {status.explanation}
      </p>

      {status.nextRecommendedAction && (
        <div className="text-sm rounded-md bg-background/60 border px-3 py-2" data-testid="text-next-action">
          <span className="font-medium">Next: </span>
          {status.nextRecommendedAction}
        </div>
      )}
    </div>
  );
}
