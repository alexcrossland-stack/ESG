import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

interface SourceBadgeProps {
  entityType: string;
  entityId: string | number;
  status?: string;
  owner?: string | null;
  reviewedAt?: string | Date | null;
  dataSourceType?: string | null;
  hasEvidence?: boolean;
}

function formatOwner(owner: string | null | undefined): string {
  if (!owner) return "Unassigned";
  const parts = owner.trim().split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0][0]}.${parts[parts.length - 1]}`;
  }
  return owner;
}

function formatDate(date: string | Date | null | undefined): string | null {
  if (!date) return null;
  try {
    return format(new Date(date), "MMM yyyy");
  } catch {
    return null;
  }
}

function getStatusColor(status: string | undefined, dataSourceType: string | null | undefined): string {
  if (status === "approved") return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800";
  if (status === "submitted") return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border-blue-200 dark:border-blue-800";
  if (status === "flagged" || dataSourceType === "estimated") return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border-amber-200 dark:border-amber-800";
  return "bg-gray-100 text-gray-600 dark:bg-gray-800/50 dark:text-gray-400 border-gray-200 dark:border-gray-700";
}

function getStatusLabel(status: string | undefined, dataSourceType: string | null | undefined): string {
  if (status === "approved") return "Approved";
  if (status === "submitted") return "Submitted";
  if (status === "flagged") return "Flagged";
  if (dataSourceType === "estimated") return "Estimated";
  if (dataSourceType === "evidenced") return "Evidenced";
  return "Draft";
}

export function SourceBadge({ entityType, entityId, status, owner, reviewedAt, dataSourceType, hasEvidence }: SourceBadgeProps) {
  const colorClass = getStatusColor(status, dataSourceType);
  const statusLabel = getStatusLabel(status, dataSourceType);
  const ownerDisplay = formatOwner(owner);
  const dateDisplay = formatDate(reviewedAt);

  const parts = [statusLabel, ownerDisplay];
  if (dateDisplay) parts.push(dateDisplay);
  if (hasEvidence === true) parts.push("Evidence");
  if (hasEvidence === false) parts.push("No Evidence");

  return (
    <Badge
      variant="outline"
      className={`text-[10px] leading-tight py-0 h-4 font-normal gap-0 border ${colorClass}`}
      data-testid={`badge-source-${entityType}-${entityId}`}
    >
      {parts.join(" · ")}
    </Badge>
  );
}
