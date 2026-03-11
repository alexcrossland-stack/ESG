import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  FileWarning,
  Clock,
  CheckCircle,
  FileText,
  Shield,
  BarChart3,
  ExternalLink,
  Upload,
  Send,
  Eye,
  CheckSquare,
  Lightbulb,
  Filter,
  CheckCheck,
  TrendingUp,
} from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";

interface ControlCentreData {
  gapScore: number;
  missingData: Array<{ id: string; name: string; category: string; owner: string; linkUrl: string }>;
  lowQuality: Array<{ id: string; name: string; category: string; score: number; owner: string; linkUrl: string }>;
  expiredEvidence: Array<{ id: string; name: string; expiryDate: string; linkedModule: string; linkUrl: string }>;
  overdueActions: Array<{ id: string; name: string; dueDate: string; owner: string; linkUrl: string }>;
  pendingApprovals: Array<{ id: string; name: string; entityType: string; period?: string; linkUrl: string }>;
  unapprovedPolicies: Array<{ id: string; name: string; status: string; linkUrl: string }>;
  unmetCompliance: Array<{ id: string; code: string; title: string; framework: string; linkUrl: string }>;
  summary: {
    missingData: number;
    lowQuality: number;
    expiredEvidence: number;
    overdueActions: number;
    pendingApprovals: number;
    unapprovedPolicies: number;
    unmetCompliance: number;
  };
}

type SectionType = "missingData" | "lowQuality" | "expiredEvidence" | "overdueActions" | "pendingApprovals" | "unapprovedPolicies" | "unmetCompliance";

type FilterTab = "all" | "data" | "actions" | "compliance" | "approvals";

const SECTION_CONFIG: Array<{
  key: SectionType;
  label: string;
  icon: typeof AlertTriangle;
  severity: "destructive" | "secondary" | "outline";
  filterTab: FilterTab;
  priority: number;
}> = [
  { key: "overdueActions", label: "Overdue Actions", icon: Clock, severity: "destructive", filterTab: "actions", priority: 1 },
  { key: "missingData", label: "Missing Data", icon: AlertTriangle, severity: "destructive", filterTab: "data", priority: 2 },
  { key: "expiredEvidence", label: "Expired Evidence", icon: FileWarning, severity: "destructive", filterTab: "data", priority: 3 },
  { key: "lowQuality", label: "Low Data Quality", icon: BarChart3, severity: "secondary", filterTab: "data", priority: 4 },
  { key: "unmetCompliance", label: "Unmet Compliance", icon: Shield, severity: "destructive", filterTab: "compliance", priority: 5 },
  { key: "pendingApprovals", label: "Pending Approvals", icon: CheckCircle, severity: "secondary", filterTab: "approvals", priority: 6 },
  { key: "unapprovedPolicies", label: "Unapproved Policies", icon: FileText, severity: "secondary", filterTab: "approvals", priority: 7 },
];

function getPriorityLabel(type: SectionType, item: any): { label: string; variant: "destructive" | "secondary" | "outline" } | null {
  if (type === "overdueActions") return { label: "Overdue", variant: "destructive" };
  if (type === "expiredEvidence") return { label: "Expired", variant: "destructive" };
  if (type === "unmetCompliance") return { label: "Non-compliant", variant: "destructive" };
  if (type === "missingData") return { label: "Missing", variant: "destructive" };
  if (type === "lowQuality" && item.score != null) {
    return { label: item.score < 20 ? "Critical" : "Low Quality", variant: item.score < 20 ? "destructive" : "secondary" };
  }
  return null;
}

function SectionRow({ item, type }: { item: any; type: SectionType }) {
  const name = item.name || item.title || item.code || "Item";
  const owner = item.owner || item.dataOwner || null;
  const dueDate = item.dueDate || item.expiryDate || null;
  const priorityInfo = getPriorityLabel(type, item);
  const linkUrl = item.linkUrl || "/";

  const completeAction = useMutation({
    mutationFn: () => apiRequest("PUT", `/api/actions/${item.id}`, { status: "complete" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/control-centre"] }),
  });

  return (
    <div className="flex items-center justify-between gap-2 py-2.5 px-4 border-b border-border last:border-b-0 hover:bg-muted/30 transition-colors">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate" data-testid={`text-item-name-${type}-${item.id}`}>{name}</p>
        <div className="flex items-center gap-2 flex-wrap mt-0.5">
          {owner && <span className="text-xs text-muted-foreground">{owner}</span>}
          {dueDate && (
            <span className="text-xs text-muted-foreground">
              Due: {new Date(dueDate).toLocaleDateString()}
            </span>
          )}
          {item.framework && (
            <span className="text-xs text-muted-foreground">{item.framework}</span>
          )}
          {item.score != null && (
            <span className="text-xs text-muted-foreground">Quality: {item.score}/100</span>
          )}
          {item.period && (
            <span className="text-xs text-muted-foreground">{item.period}</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {priorityInfo && (
          <Badge variant={priorityInfo.variant} className="text-xs">{priorityInfo.label}</Badge>
        )}
        {type === "missingData" && (
          <Link href="/data-entry">
            <Button variant="outline" size="sm" className="h-7 text-xs" data-testid={`button-quick-action-missingData-${item.id}`}>
              <Send className="w-3 h-3 mr-1" />Submit
            </Button>
          </Link>
        )}
        {type === "overdueActions" && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            data-testid={`button-quick-action-overdueActions-${item.id}`}
            disabled={completeAction.isPending}
            onClick={() => completeAction.mutate()}
          >
            <CheckSquare className="w-3 h-3 mr-1" />
            {completeAction.isPending ? "Saving..." : "Complete"}
          </Button>
        )}
        {type === "pendingApprovals" && (
          <Link href="/my-approvals">
            <Button variant="outline" size="sm" className="h-7 text-xs" data-testid={`button-quick-action-pendingApprovals-${item.id}`}>
              <Eye className="w-3 h-3 mr-1" />Review
            </Button>
          </Link>
        )}
        {type === "expiredEvidence" && (
          <Link href="/evidence">
            <Button variant="outline" size="sm" className="h-7 text-xs" data-testid={`button-quick-action-expiredEvidence-${item.id}`}>
              <Upload className="w-3 h-3 mr-1" />Upload
            </Button>
          </Link>
        )}
        {type === "unmetCompliance" && (
          <Link href="/compliance">
            <Button variant="outline" size="sm" className="h-7 text-xs" data-testid={`button-quick-action-unmetCompliance-${item.id}`}>
              <Shield className="w-3 h-3 mr-1" />View
            </Button>
          </Link>
        )}
        {type === "unapprovedPolicies" && (
          <Link href="/policy">
            <Button variant="outline" size="sm" className="h-7 text-xs" data-testid={`button-quick-action-unapprovedPolicies-${item.id}`}>
              <FileText className="w-3 h-3 mr-1" />Review
            </Button>
          </Link>
        )}
        <Link href={linkUrl}>
          <Button variant="ghost" size="icon" className="h-7 w-7" data-testid={`link-go-to-${type}-${item.id}`}>
            <ExternalLink className="w-3.5 h-3.5" />
          </Button>
        </Link>
      </div>
    </div>
  );
}

function CollapsibleSection({
  sectionKey, label, icon: Icon, count, items, severity,
}: {
  sectionKey: SectionType;
  label: string;
  icon: typeof AlertTriangle;
  count: number;
  items: any[];
  severity: "destructive" | "secondary" | "outline";
}) {
  const [open, setOpen] = useState(count > 0);
  const sortedItems = [...items].sort((a, b) => {
    if (sectionKey === "lowQuality") return (a.score ?? 100) - (b.score ?? 100);
    if (sectionKey === "overdueActions" || sectionKey === "expiredEvidence") {
      return new Date(a.dueDate || a.expiryDate || 0).getTime() - new Date(b.dueDate || b.expiryDate || 0).getTime();
    }
    return 0;
  });

  return (
    <Card data-testid={`section-${sectionKey}`}>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="flex flex-row items-center justify-between gap-2 py-3 px-4 cursor-pointer hover:bg-muted/20 transition-colors rounded-t-lg">
            <div className="flex items-center gap-2 flex-wrap">
              <Icon className="w-4 h-4 text-muted-foreground" />
              <CardTitle className="text-sm font-medium">{label}</CardTitle>
              {count > 0 && (
                <Badge variant={severity} data-testid={`badge-count-${sectionKey}`}>{count}</Badge>
              )}
              {count === 0 && (
                <Badge variant="outline" className="text-xs text-green-600 border-green-200" data-testid={`badge-count-${sectionKey}`}>
                  <CheckCircle className="w-3 h-3 mr-1" />Clear
                </Badge>
              )}
            </div>
            {open ? (
              <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
            ) : (
              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
            )}
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 px-0 pb-0">
            {sortedItems.length === 0 ? (
              <div className="flex items-center gap-2 px-4 py-4 text-sm text-muted-foreground">
                <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                <span>No issues in this area — good work.</span>
              </div>
            ) : (
              <div>
                {sortedItems.map((item: any) => (
                  <SectionRow key={item.id} item={item} type={sectionKey} />
                ))}
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

function BulkActionsBar({ overdueActions, onComplete }: { overdueActions: any[]; onComplete: () => void }) {
  const { toast } = useToast();
  const bulkComplete = useMutation({
    mutationFn: async () => {
      for (const action of overdueActions) {
        await apiRequest("PUT", `/api/actions/${action.id}`, { status: "complete" });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/control-centre"] });
      toast({ title: "Actions completed", description: `${overdueActions.length} overdue actions marked complete.` });
      onComplete();
    },
    onError: () => toast({ title: "Error", description: "Could not complete all actions.", variant: "destructive" }),
  });

  if (overdueActions.length === 0) return null;

  return (
    <div className="flex items-center justify-between gap-3 p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg text-sm">
      <div className="flex items-center gap-2">
        <CheckCheck className="w-4 h-4 text-amber-600" />
        <span className="text-amber-800 dark:text-amber-300">
          {overdueActions.length} overdue action{overdueActions.length > 1 ? "s" : ""} need attention
        </span>
      </div>
      <Button
        size="sm"
        variant="outline"
        className="h-7 text-xs border-amber-300 text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/30"
        disabled={bulkComplete.isPending}
        onClick={() => bulkComplete.mutate()}
        data-testid="button-bulk-complete-actions"
      >
        <CheckSquare className="w-3 h-3 mr-1" />
        {bulkComplete.isPending ? "Completing..." : "Complete All"}
      </Button>
    </div>
  );
}

const FILTER_TABS: Array<{ key: FilterTab; label: string; sections: SectionType[] }> = [
  { key: "all", label: "All Issues", sections: ["overdueActions", "missingData", "expiredEvidence", "lowQuality", "unmetCompliance", "pendingApprovals", "unapprovedPolicies"] },
  { key: "data", label: "Data & Evidence", sections: ["missingData", "expiredEvidence", "lowQuality"] },
  { key: "actions", label: "Actions", sections: ["overdueActions"] },
  { key: "compliance", label: "Compliance", sections: ["unmetCompliance"] },
  { key: "approvals", label: "Approvals", sections: ["pendingApprovals", "unapprovedPolicies"] },
];

export default function ControlCentre() {
  const { data, isLoading } = useQuery<ControlCentreData>({ queryKey: ["/api/control-centre"] });
  const [activeFilter, setActiveFilter] = useState<FilterTab>("all");
  const [showBulk, setShowBulk] = useState(true);

  const totalIssues = data ? Object.values(data.summary).reduce((sum, n) => sum + n, 0) : 0;

  const activeTab = FILTER_TABS.find(t => t.key === activeFilter)!;
  const visibleSections = SECTION_CONFIG.filter(s => activeTab.sections.includes(s.key));

  function getTabCount(tab: FilterTab) {
    if (!data) return 0;
    const t = FILTER_TABS.find(f => f.key === tab)!;
    return t.sections.reduce((sum, s) => sum + (data.summary[s] || 0), 0);
  }

  const criticalCount = data ? (data.summary.overdueActions || 0) + (data.summary.missingData || 0) + (data.summary.expiredEvidence || 0) : 0;

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-4" data-testid="page-control-centre">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-lg sm:text-xl font-semibold">ESG Control Centre</h1>
          <p className="text-sm text-muted-foreground">
            All outstanding ESG issues — sorted by priority
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!isLoading && criticalCount > 0 && (
            <Badge variant="destructive" data-testid="badge-critical-count">
              {criticalCount} critical
            </Badge>
          )}
          {!isLoading && (
            <Badge variant={totalIssues > 0 ? "secondary" : "outline"} data-testid="badge-total-issues">
              {totalIssues} total
            </Badge>
          )}
        </div>
      </div>

      {!isLoading && data && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Card className={`p-3 flex items-center gap-3 ${data.gapScore < 20 ? "border-green-200 bg-green-50/50 dark:border-green-800 dark:bg-green-950/10" : data.gapScore <= 50 ? "border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/10" : "border-red-200 bg-red-50/50 dark:border-red-800 dark:bg-red-950/10"}`} data-testid="card-gap-score">
            <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${data.gapScore < 20 ? "bg-green-500" : data.gapScore <= 50 ? "bg-amber-500" : "bg-red-500"}`} />
            <div className="flex-1">
              <p className="text-xs text-muted-foreground">ESG Gap Score</p>
              <p className={`text-xl font-bold ${data.gapScore < 20 ? "text-green-600 dark:text-green-400" : data.gapScore <= 50 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"}`} data-testid="text-gap-score-value">{data.gapScore}</p>
            </div>
          </Card>
          <Card className="p-3 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Critical Issues</p>
              <p className="text-xl font-bold text-red-600 dark:text-red-400">{criticalCount}</p>
            </div>
          </Card>
          <Card className="p-3 flex items-center gap-3">
            <TrendingUp className="w-5 h-5 text-muted-foreground shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Total Issues</p>
              <p className="text-xl font-bold">{totalIssues}</p>
            </div>
          </Card>
        </div>
      )}

      {!isLoading && data && showBulk && (
        <BulkActionsBar overdueActions={data.overdueActions} onComplete={() => setShowBulk(false)} />
      )}

      <div className="flex items-center gap-2 flex-wrap" data-testid="filter-tabs">
        <Filter className="w-4 h-4 text-muted-foreground" />
        {FILTER_TABS.map(tab => {
          const count = getTabCount(tab.key);
          return (
            <button
              key={tab.key}
              onClick={() => setActiveFilter(tab.key)}
              data-testid={`filter-tab-${tab.key}`}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                activeFilter === tab.key
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {tab.label}
              {count > 0 && (
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${activeFilter === tab.key ? "bg-white/20" : "bg-background"}`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-md" />
          ))}
        </div>
      ) : data ? (
        <div className="space-y-3">
          {visibleSections.map(({ key, label, icon, severity }) => (
            <CollapsibleSection
              key={key}
              sectionKey={key}
              label={label}
              icon={icon}
              count={data.summary[key]}
              items={data[key]}
              severity={severity}
            />
          ))}
          {totalIssues === 0 && (
            <Card>
              <CardContent className="py-12 text-center">
                <Lightbulb className="w-10 h-10 text-green-500 mx-auto mb-3" />
                <p className="font-medium">No outstanding issues</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Your ESG programme is in good shape. Keep it up.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      ) : null}
    </div>
  );
}
