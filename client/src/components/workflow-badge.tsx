import { Badge } from "@/components/ui/badge";
import { CheckCircle, Clock, XCircle, Send, Archive, Sparkles } from "lucide-react";

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: any; className: string }> = {
  draft: { label: "Draft", variant: "secondary", icon: Clock, className: "bg-muted text-muted-foreground" },
  submitted: { label: "Submitted", variant: "default", icon: Send, className: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" },
  approved: { label: "Approved", variant: "default", icon: CheckCircle, className: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" },
  rejected: { label: "Rejected", variant: "destructive", icon: XCircle, className: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300" },
  archived: { label: "Archived", variant: "outline", icon: Archive, className: "bg-muted/50 text-muted-foreground" },
};

export function WorkflowBadge({ status, size = "default" }: { status?: string | null; size?: "default" | "sm" }) {
  const config = STATUS_CONFIG[status || "draft"] || STATUS_CONFIG.draft;
  const Icon = config.icon;
  const sizeClass = size === "sm" ? "text-xs py-0 h-5 px-1.5" : "text-xs py-0.5 h-6 px-2";

  return (
    <Badge variant="outline" className={`${config.className} ${sizeClass} gap-1 font-medium border-0`} data-testid={`badge-workflow-${status || "draft"}`}>
      <Icon className="w-3 h-3" />
      {config.label}
    </Badge>
  );
}

export function AiDraftBadge() {
  return (
    <Badge variant="outline" className="bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300 text-xs py-0.5 h-6 px-2 gap-1 font-medium border-0" data-testid="badge-ai-draft">
      <Sparkles className="w-3 h-3" />
      Draft - Review Required
    </Badge>
  );
}

export function ConfidenceBadge({ level }: { level?: string | null }) {
  const config: Record<string, { label: string; className: string }> = {
    high: { label: "High Confidence", className: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" },
    medium: { label: "Medium Confidence", className: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300" },
    low: { label: "Low Confidence", className: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300" },
  };
  const c = config[level || "low"] || config.low;

  return (
    <Badge variant="outline" className={`${c.className} text-xs py-0 h-5 px-1.5 font-medium border-0`} data-testid={`badge-confidence-${level || "low"}`}>
      {c.label}
    </Badge>
  );
}
