import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
} from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";

interface ControlCentreData {
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

const SECTION_CONFIG: Array<{
  key: SectionType;
  label: string;
  icon: typeof AlertTriangle;
  severity: "destructive" | "secondary" | "outline";
}> = [
  { key: "overdueActions", label: "Overdue Actions", icon: Clock, severity: "destructive" },
  { key: "missingData", label: "Missing Data", icon: AlertTriangle, severity: "destructive" },
  { key: "lowQuality", label: "Low Data Quality", icon: BarChart3, severity: "secondary" },
  { key: "expiredEvidence", label: "Expired Evidence", icon: FileWarning, severity: "destructive" },
  { key: "pendingApprovals", label: "Pending Approvals", icon: CheckCircle, severity: "secondary" },
  { key: "unapprovedPolicies", label: "Unapproved Policies", icon: FileText, severity: "secondary" },
  { key: "unmetCompliance", label: "Unmet Compliance", icon: Shield, severity: "outline" },
];

function SectionRow({ item, type }: { item: any; type: SectionType }) {
  const name = item.name || item.title || item.code || "Item";
  const owner = item.owner || item.dataOwner || null;
  const dueDate = item.dueDate || item.expiryDate || null;
  const severity = item.score != null
    ? (item.score < 20 ? "Critical" : "Low")
    : item.status === "overdue" || type === "overdueActions"
      ? "Overdue"
      : type === "expiredEvidence"
        ? "Expired"
        : null;
  const linkUrl = item.linkUrl || "/";

  return (
    <div className="flex items-center justify-between gap-2 py-2 px-3 border-b border-border last:border-b-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate" data-testid={`text-item-name-${type}-${item.id}`}>{name}</p>
        <div className="flex items-center gap-2 flex-wrap">
          {owner && <span className="text-xs text-muted-foreground">{owner}</span>}
          {dueDate && (
            <span className="text-xs text-muted-foreground">
              {new Date(dueDate).toLocaleDateString()}
            </span>
          )}
          {item.framework && (
            <span className="text-xs text-muted-foreground">{item.framework}</span>
          )}
          {item.score != null && (
            <Badge variant="secondary" className="text-xs">Score: {item.score}</Badge>
          )}
          {item.period && (
            <span className="text-xs text-muted-foreground">{item.period}</span>
          )}
        </div>
      </div>
      {severity && (
        <Badge
          variant={severity === "Critical" || severity === "Overdue" || severity === "Expired" ? "destructive" : "secondary"}
          className="shrink-0"
        >
          {severity}
        </Badge>
      )}
      <Link href={linkUrl}>
        <Button variant="ghost" size="icon" data-testid={`link-go-to-${type}-${item.id}`}>
          <ExternalLink className="w-4 h-4" />
        </Button>
      </Link>
    </div>
  );
}

function CollapsibleSection({
  sectionKey,
  label,
  icon: Icon,
  count,
  items,
  severity,
}: {
  sectionKey: SectionType;
  label: string;
  icon: typeof AlertTriangle;
  count: number;
  items: any[];
  severity: "destructive" | "secondary" | "outline";
}) {
  const [open, setOpen] = useState(count > 0);

  return (
    <Card data-testid={`section-${sectionKey}`}>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="flex flex-row items-center justify-between gap-2 py-3 px-4 cursor-pointer">
            <div className="flex items-center gap-2 flex-wrap">
              <Icon className="w-4 h-4 text-muted-foreground" />
              <CardTitle className="text-sm font-medium">{label}</CardTitle>
              <Badge
                variant={count > 0 ? severity : "outline"}
                data-testid={`badge-count-${sectionKey}`}
              >
                {count}
              </Badge>
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
            {items.length === 0 ? (
              <p className="text-sm text-muted-foreground px-4 pb-3">No issues found.</p>
            ) : (
              <div className="divide-y divide-border">
                {items.map((item: any) => (
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

export default function ControlCentre() {
  const { data, isLoading } = useQuery<ControlCentreData>({
    queryKey: ["/api/control-centre"],
  });

  const totalIssues = data
    ? Object.values(data.summary).reduce((sum, n) => sum + n, 0)
    : 0;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4" data-testid="page-control-centre">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Control Centre</h1>
          <p className="text-sm text-muted-foreground">
            All outstanding ESG issues in one view
          </p>
        </div>
        {!isLoading && (
          <Badge variant={totalIssues > 0 ? "destructive" : "outline"} data-testid="badge-total-issues">
            {totalIssues} {totalIssues === 1 ? "issue" : "issues"}
          </Badge>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-md" />
          ))}
        </div>
      ) : data ? (
        <div className="space-y-3">
          {SECTION_CONFIG.map(({ key, label, icon, severity }) => (
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
        </div>
      ) : null}
    </div>
  );
}
