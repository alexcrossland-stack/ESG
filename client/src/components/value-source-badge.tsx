import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Info } from "lucide-react";

interface ValueSourceBadgeProps {
  source: "actual" | "estimated" | "missing" | "derived";
  explanation?: string;
  className?: string;
  showIcon?: boolean;
}

export function ValueSourceBadge({ source, explanation, className = "", showIcon = true }: ValueSourceBadgeProps) {
  const config = {
    actual: {
      label: "Actual",
      className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
      defaultExplanation: "This value was entered directly from a real source (invoice, report, or measurement).",
    },
    estimated: {
      label: "Estimated",
      className: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border-amber-200 dark:border-amber-800",
      defaultExplanation: "This is an estimate based on your sector and company size. Replace with actual data when available.",
    },
    missing: {
      label: "Missing",
      className: "bg-gray-100 text-gray-500 dark:bg-gray-800/50 dark:text-gray-400 border-gray-200 dark:border-gray-700",
      defaultExplanation: "No value has been recorded for this metric yet.",
    },
    derived: {
      label: "Derived",
      className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 border-blue-200 dark:border-blue-800",
      defaultExplanation: "This value is automatically calculated from other metrics you have entered.",
    },
  };

  const cfg = config[source];
  const tooltipText = explanation || cfg.defaultExplanation;

  const badge = (
    <Badge
      variant="outline"
      className={`text-[10px] font-medium gap-0.5 cursor-default select-none ${cfg.className} ${className}`}
      data-testid={`badge-source-${source}`}
    >
      {cfg.label}
      {showIcon && source !== "actual" && source !== "derived" && (
        <Info className="w-2.5 h-2.5 opacity-70" />
      )}
    </Badge>
  );

  if (!tooltipText || source === "actual") return badge;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{badge}</TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-xs">
        {tooltipText}
      </TooltipContent>
    </Tooltip>
  );
}

export function dataSourceTypeToSource(dataSourceType?: string | null): "actual" | "estimated" | "missing" | "derived" {
  if (!dataSourceType) return "missing";
  switch (dataSourceType) {
    case "evidenced":
    case "manual":
    case "actual":
      return "actual";
    case "estimated":
      return "estimated";
    case "calculated":
    case "derived":
      return "derived";
    default:
      return "actual";
  }
}
