import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  UserPlus, ArrowRightLeft, CheckCircle, Plus, Trash2,
  Activity, ChevronDown, ChevronUp,
} from "lucide-react";
import { useState } from "react";

type AuditLogEntry = {
  id: string;
  userId: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  details: any;
  createdAt: string;
  performedBy: string | null;
};

type FilterType = "all" | "assignments" | "approvals" | "data_changes";

const ACTION_ICON_MAP: Record<string, typeof UserPlus> = {
  assign: UserPlus,
  assigned: UserPlus,
  reassign: UserPlus,
  bulk_assign: UserPlus,
  status_change: ArrowRightLeft,
  workflow_status_change: ArrowRightLeft,
  submit_for_approval: ArrowRightLeft,
  approve: CheckCircle,
  approved: CheckCircle,
  reject: ArrowRightLeft,
  rejected: ArrowRightLeft,
  bulk_approve: CheckCircle,
  bulk_reject: ArrowRightLeft,
  create: Plus,
  created: Plus,
  delete: Trash2,
  deleted: Trash2,
};

function getActionIcon(action: string) {
  const normalized = action.toLowerCase().replace(/\s+/g, "_");
  for (const [key, Icon] of Object.entries(ACTION_ICON_MAP)) {
    if (normalized.includes(key)) return Icon;
  }
  return Activity;
}

function getActionColor(action: string): string {
  const normalized = action.toLowerCase();
  if (normalized.includes("assign")) return "text-blue-500";
  if (normalized.includes("approve") || normalized.includes("approved")) return "text-emerald-500";
  if (normalized.includes("reject")) return "text-red-500";
  if (normalized.includes("delete") || normalized.includes("removed")) return "text-red-500";
  if (normalized.includes("create") || normalized.includes("created")) return "text-emerald-500";
  if (normalized.includes("status") || normalized.includes("submit")) return "text-amber-500";
  return "text-muted-foreground";
}

function formatDescription(entry: AuditLogEntry): string {
  const actor = entry.performedBy || "System";
  const action = entry.action.replace(/_/g, " ");
  const entity = entry.entityType?.replace(/_/g, " ") || "";
  const details = entry.details as any;

  if (details?.description) return `${actor} ${details.description}`;

  if (entry.action.includes("assign") && details?.assignedTo) {
    return `${actor} assigned ${entity} to ${details.assignedTo}`;
  }
  if (entry.action.includes("approve")) {
    return `${actor} approved ${entity}${entry.entityId ? ` #${entry.entityId.slice(0, 8)}` : ""}`;
  }
  if (entry.action.includes("reject")) {
    return `${actor} rejected ${entity}${details?.comment ? `: ${details.comment}` : ""}`;
  }
  if (entry.action.includes("create")) {
    return `${actor} created ${entity}${details?.name ? ` "${details.name}"` : ""}`;
  }
  if (entry.action.includes("delete")) {
    return `${actor} deleted ${entity}${details?.name ? ` "${details.name}"` : ""}`;
  }
  if (entry.action.includes("status")) {
    const from = details?.from || details?.oldStatus;
    const to = details?.to || details?.newStatus;
    if (from && to) return `${actor} changed ${entity} status from ${from} to ${to}`;
    return `${actor} changed ${entity} status${to ? ` to ${to}` : ""}`;
  }

  return `${actor} ${action}${entity ? ` on ${entity}` : ""}`;
}

function getRelativeTime(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin} minute${diffMin > 1 ? "s" : ""} ago`;
  if (diffHr < 24) return `${diffHr} hour${diffHr > 1 ? "s" : ""} ago`;
  if (diffDay < 7) return `${diffDay} day${diffDay > 1 ? "s" : ""} ago`;
  if (diffDay < 30) return `${Math.floor(diffDay / 7)} week${Math.floor(diffDay / 7) > 1 ? "s" : ""} ago`;
  return `${Math.floor(diffDay / 30)} month${Math.floor(diffDay / 30) > 1 ? "s" : ""} ago`;
}

function matchesFilter(entry: AuditLogEntry, filter: FilterType): boolean {
  if (filter === "all") return true;
  const action = entry.action.toLowerCase();
  if (filter === "assignments") {
    return action.includes("assign") || action.includes("reassign");
  }
  if (filter === "approvals") {
    return action.includes("approve") || action.includes("reject") || action.includes("submit");
  }
  if (filter === "data_changes") {
    return action.includes("create") || action.includes("update") || action.includes("delete") ||
      action.includes("save") || action.includes("edit");
  }
  return true;
}

const FILTERS: { key: FilterType; label: string }[] = [
  { key: "all", label: "All" },
  { key: "assignments", label: "Assignments" },
  { key: "approvals", label: "Approvals" },
  { key: "data_changes", label: "Data Changes" },
];

export function ActivityFeed() {
  const [collapsed, setCollapsed] = useState(true);
  const [filter, setFilter] = useState<FilterType>("all");

  const { data: logs = [], isLoading } = useQuery<AuditLogEntry[]>({
    queryKey: ["/api/audit-logs"],
  });

  const filtered = logs.filter(entry => matchesFilter(entry, filter));

  return (
    <Card data-testid="card-activity-feed">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" />
            Activity Feed
            {logs.length > 0 && (
              <Badge variant="secondary" className="text-xs">
                {logs.length}
              </Badge>
            )}
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs h-7"
            onClick={() => setCollapsed(!collapsed)}
            data-testid="button-toggle-activity-feed"
          >
            {collapsed ? (
              <><ChevronDown className="w-3 h-3 mr-1" /> Expand</>
            ) : (
              <><ChevronUp className="w-3 h-3 mr-1" /> Collapse</>
            )}
          </Button>
        </div>
      </CardHeader>
      {!collapsed && (
        <CardContent>
          <div className="flex items-center gap-1 mb-3 flex-wrap">
            {FILTERS.map(f => (
              <Button
                key={f.key}
                variant={filter === f.key ? "default" : "outline"}
                size="sm"
                className="text-xs"
                onClick={() => setFilter(f.key)}
                data-testid={`button-filter-${f.key}`}
              >
                {f.label}
              </Button>
            ))}
          </div>

          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">
              No activity to show{filter !== "all" ? " for this filter" : ""}.
            </p>
          ) : (
            <div className="space-y-0">
              {filtered.slice(0, 20).map((entry) => {
                const Icon = getActionIcon(entry.action);
                const color = getActionColor(entry.action);
                return (
                  <div
                    key={entry.id}
                    className="flex items-start gap-3 py-2.5 border-b border-border last:border-0"
                    data-testid={`feed-item-${entry.id}`}
                  >
                    <div className={`mt-0.5 shrink-0 ${color}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs leading-relaxed">
                        {formatDescription(entry)}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {getRelativeTime(entry.createdAt)}
                      </p>
                    </div>
                  </div>
                );
              })}
              {filtered.length > 20 && (
                <p className="text-xs text-muted-foreground text-center pt-2">
                  Showing 20 of {filtered.length} entries
                </p>
              )}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
