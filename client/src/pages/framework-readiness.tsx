import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CheckCircle2, AlertCircle, XCircle, ChevronDown, ChevronUp,
  Globe, Building2, Shield, Leaf, BookOpen, Flag,
  ArrowRight, Settings, ClipboardList, Info,
} from "lucide-react";

const FRAMEWORK_META: Record<string, { icon: any; color: string; bg: string }> = {
  GRI: { icon: Globe, color: "text-green-600 dark:text-green-400", bg: "bg-green-100 dark:bg-green-900/30" },
  ISSB: { icon: Building2, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-100 dark:bg-blue-900/30" },
  TCFD: { icon: Shield, color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-100 dark:bg-amber-900/30" },
  ESRS: { icon: Flag, color: "text-purple-600 dark:text-purple-400", bg: "bg-purple-100 dark:bg-purple-900/30" },
  CDP: { icon: Leaf, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-100 dark:bg-emerald-900/30" },
  UNGC: { icon: BookOpen, color: "text-rose-600 dark:text-rose-400", bg: "bg-rose-100 dark:bg-rose-900/30" },
};

const PILLAR_COLORS: Record<string, string> = {
  environmental: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  social: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  governance: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
};

const STRENGTH_LABELS: Record<string, { label: string; color: string }> = {
  direct: { label: "Direct", color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" },
  partial: { label: "Partial", color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300" },
  supporting: { label: "Supporting", color: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" },
};

const MANDATORY_LABELS: Record<string, string> = {
  core: "Core",
  conditional: "Conditional",
  advanced: "Advanced",
};

const REQUIREMENT_TYPE_LABELS: Record<string, string> = {
  metric: "Metric",
  narrative: "Narrative",
  policy: "Policy",
  target: "Target",
  risk: "Risk Assessment",
  evidence: "Evidence",
};

function StatusIcon({ status }: { status: string }) {
  if (status === "covered") return <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />;
  if (status === "partial") return <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />;
  return <XCircle className="w-4 h-4 text-red-400 shrink-0" />;
}

function StatusBadge({ status }: { status: string }) {
  if (status === "covered") return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 border-0 text-xs">Supported</Badge>;
  if (status === "partial") return <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border-0 text-xs">Partially supported</Badge>;
  return <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 border-0 text-xs">Not covered</Badge>;
}

function RequirementRow({ req }: { req: any }) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-border last:border-0" data-testid={`row-requirement-${req.code}`}>
      <StatusIcon status={req.status} />
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2 flex-wrap">
          <span className="text-sm font-medium text-foreground">{req.title}</span>
          <span className="text-xs text-muted-foreground font-mono">{req.code}</span>
        </div>
        {req.description && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{req.description}</p>
        )}
        {req.additionalNeeded.length > 0 && req.status !== "covered" && (
          <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
            Also needed: {req.additionalNeeded.join("; ")}
          </p>
        )}
      </div>
      <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
        {req.pillar && (
          <Badge variant="outline" className={`text-[10px] h-4 border-0 ${PILLAR_COLORS[req.pillar] ?? ""}`}>
            {req.pillar.charAt(0).toUpperCase() + req.pillar.slice(1)}
          </Badge>
        )}
        <Badge variant="outline" className="text-[10px] h-4">
          {REQUIREMENT_TYPE_LABELS[req.requirementType] ?? req.requirementType}
        </Badge>
        <Badge variant="outline" className="text-[10px] h-4">
          {MANDATORY_LABELS[req.mandatoryLevel] ?? req.mandatoryLevel}
        </Badge>
        <StatusBadge status={req.status} />
      </div>
    </div>
  );
}

type ReadinessGroup = {
  framework: {
    id: string;
    code: string;
    name: string;
    fullName: string | null;
    version: string | null;
  };
  requirements: any[];
  summary: { covered: number; partial: number; missing: number; total: number };
  nextBestActions: any[];
};

function FrameworkReadinessCard({ group, defaultExpanded = false }: { group: ReadinessGroup; defaultExpanded?: boolean }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [filter, setFilter] = useState<"all" | "covered" | "partial" | "missing">("all");

  const { framework, requirements, summary, nextBestActions } = group;
  const meta = FRAMEWORK_META[framework.code] ?? { icon: Shield, color: "text-muted-foreground", bg: "bg-muted" };
  const Icon = meta.icon;

  const filteredReqs = requirements.filter(r => filter === "all" || r.status === filter);

  const pillarGroups = filteredReqs.reduce((acc: Record<string, any[]>, r) => {
    const p = r.pillar || "other";
    if (!acc[p]) acc[p] = [];
    acc[p].push(r);
    return acc;
  }, {});

  const alignmentPct = summary.total > 0
    ? Math.round(((summary.covered + summary.partial * 0.5) / summary.total) * 100)
    : 0;

  return (
    <Card data-testid={`card-readiness-${framework.code}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className={`p-2 rounded-lg shrink-0 ${meta.bg}`}>
              <Icon className={`w-5 h-5 ${meta.color}`} />
            </div>
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                {framework.name}
                {framework.version && <Badge variant="outline" className="text-[10px] h-4">{framework.version}</Badge>}
              </CardTitle>
              {framework.fullName && (
                <CardDescription className="text-xs">{framework.fullName}</CardDescription>
              )}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-2xl font-bold text-foreground" data-testid={`text-alignment-pct-${framework.code}`}>{alignmentPct}%</div>
            <div className="text-xs text-muted-foreground">alignment</div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 mt-3">
          <button
            className={`flex flex-col items-center p-2 rounded-lg transition-colors cursor-pointer ${filter === "covered" ? "bg-green-100 dark:bg-green-900/30 ring-1 ring-green-400" : "bg-green-50 dark:bg-green-950/20 hover:bg-green-100 dark:hover:bg-green-900/20"}`}
            onClick={() => setFilter(filter === "covered" ? "all" : "covered")}
            data-testid={`filter-covered-${framework.code}`}
          >
            <CheckCircle2 className="w-4 h-4 text-green-500 mb-0.5" />
            <span className="text-lg font-bold text-green-700 dark:text-green-400">{summary.covered}</span>
            <span className="text-[10px] text-green-600 dark:text-green-500">Supported</span>
          </button>
          <button
            className={`flex flex-col items-center p-2 rounded-lg transition-colors cursor-pointer ${filter === "partial" ? "bg-amber-100 dark:bg-amber-900/30 ring-1 ring-amber-400" : "bg-amber-50 dark:bg-amber-950/20 hover:bg-amber-100 dark:hover:bg-amber-900/20"}`}
            onClick={() => setFilter(filter === "partial" ? "all" : "partial")}
            data-testid={`filter-partial-${framework.code}`}
          >
            <AlertCircle className="w-4 h-4 text-amber-500 mb-0.5" />
            <span className="text-lg font-bold text-amber-700 dark:text-amber-400">{summary.partial}</span>
            <span className="text-[10px] text-amber-600 dark:text-amber-500">Partial</span>
          </button>
          <button
            className={`flex flex-col items-center p-2 rounded-lg transition-colors cursor-pointer ${filter === "missing" ? "bg-red-100 dark:bg-red-900/30 ring-1 ring-red-400" : "bg-red-50 dark:bg-red-950/20 hover:bg-red-100 dark:hover:bg-red-900/20"}`}
            onClick={() => setFilter(filter === "missing" ? "all" : "missing")}
            data-testid={`filter-missing-${framework.code}`}
          >
            <XCircle className="w-4 h-4 text-red-400 mb-0.5" />
            <span className="text-lg font-bold text-red-600 dark:text-red-400">{summary.missing}</span>
            <span className="text-[10px] text-red-500 dark:text-red-500">Not covered</span>
          </button>
        </div>

        {nextBestActions.length > 0 && !expanded && (
          <div className="mt-3 space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Priority actions</p>
            {nextBestActions.map((a, i) => (
              <div key={i} className="flex items-start gap-2 text-xs" data-testid={`action-${framework.code}-${i}`}>
                <ArrowRight className="w-3 h-3 text-muted-foreground mt-0.5 shrink-0" />
                <span className="text-muted-foreground"><span className="font-medium text-foreground">{a.requirementCode}:</span> {a.action}</span>
              </div>
            ))}
          </div>
        )}
      </CardHeader>

      <CardContent className="pt-0">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-center text-xs"
          onClick={() => setExpanded(!expanded)}
          data-testid={`button-expand-${framework.code}`}
        >
          {expanded
            ? <><ChevronUp className="w-3.5 h-3.5 mr-1" /> Hide requirements</>
            : <><ChevronDown className="w-3.5 h-3.5 mr-1" /> View all {summary.total} requirements</>
          }
        </Button>

        {expanded && (
          <div className="mt-3 space-y-4">
            {filter !== "all" && filteredReqs.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">No requirements in this category.</p>
            )}
            {Object.entries(pillarGroups).map(([pillar, reqs]) => (
              <div key={pillar}>
                <div className="flex items-center gap-2 mb-1 pb-1 border-b border-border">
                  <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${PILLAR_COLORS[pillar] ?? "bg-muted text-muted-foreground"}`}>
                    {pillar.charAt(0).toUpperCase() + pillar.slice(1)}
                  </span>
                  <span className="text-xs text-muted-foreground">{reqs.length} requirement{reqs.length !== 1 ? "s" : ""}</span>
                </div>
                {reqs.map(req => <RequirementRow key={req.id} req={req} />)}
              </div>
            ))}

            {nextBestActions.length > 0 && (
              <div className="mt-4 p-3 rounded-lg bg-muted/50 space-y-2">
                <p className="text-xs font-semibold text-foreground uppercase tracking-wide">Recommended next steps</p>
                {nextBestActions.map((a, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs" data-testid={`expanded-action-${framework.code}-${i}`}>
                    <ArrowRight className="w-3 h-3 text-primary mt-0.5 shrink-0" />
                    <span className="text-muted-foreground">
                      <span className="font-medium text-foreground">{a.requirementCode} – {a.title}:</span>{" "}
                      {a.action}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function FrameworkReadinessPage() {
  const { data: readiness, isLoading } = useQuery<ReadinessGroup[]>({
    queryKey: ["/api/framework-readiness"],
  });

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-80" />
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-48 w-full" />
        ))}
      </div>
    );
  }

  if (!readiness || readiness.length === 0) {
    return (
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Framework Readiness</h1>
          <p className="text-muted-foreground mt-1">
            Track your alignment against ESG reporting frameworks.
          </p>
        </div>

        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center gap-4">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
              <ClipboardList className="w-6 h-6 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium text-foreground">No frameworks selected</p>
              <p className="text-sm text-muted-foreground mt-1">
                Enable one or more frameworks in Framework Settings to see your readiness view.
              </p>
            </div>
            <Link href="/framework-settings">
              <Button variant="outline" size="sm" data-testid="button-go-framework-settings">
                <Settings className="w-4 h-4 mr-2" />
                Go to Framework Settings
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground" data-testid="heading-readiness">
            Framework Readiness
          </h1>
          <p className="text-muted-foreground mt-1">
            Your alignment against {readiness.length} selected framework{readiness.length !== 1 ? "s" : ""}. 
            This shows what is supported by your current metrics, what is partially covered, and what still needs attention.
          </p>
        </div>
        <Link href="/framework-settings">
          <Button variant="outline" size="sm" data-testid="button-framework-settings-link">
            <Settings className="w-4 h-4 mr-2" />
            Settings
          </Button>
        </Link>
      </div>

      <Card className="border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/20">
        <CardContent className="pt-4 pb-3">
          <div className="flex gap-3">
            <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
            <p className="text-sm text-blue-800 dark:text-blue-300">
              This view shows <strong>readiness alignment</strong> based on your active metrics — not a formal compliance certification or audit. "Supported" means metric data is captured; additional narrative, policy, and evidence documentation will also be needed for formal reporting.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {readiness.map((group, i) => (
          <FrameworkReadinessCard key={group.framework.id} group={group} defaultExpanded={i === 0 && readiness.length === 1} />
        ))}
      </div>
    </div>
  );
}
