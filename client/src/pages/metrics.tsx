import { useState } from "react";
import { Link } from "wouter";
import { PageGuidance } from "@/components/page-guidance";
import { useQueries, useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  BarChart3, Leaf, Users, Shield, ArrowUp, ArrowDown,
  Minus, Calculator, PenLine, GitBranch, ChevronRight,
} from "lucide-react";

type MetricSummary = {
  id: string;
  name: string;
  category: "environmental" | "social" | "governance";
  unit: string | null;
  metricType: string;
  direction: string;
  latestValue: number | null;
  previousValue: number | null;
  status: string;
  percentChange: number | null;
  target: number | null;
  helpText: string | null;
  formulaText: string | null;
  trend: { period: string; value: number | null }[];
};

type CompanyMetric = {
  id: string;
  name: string;
  category: "environmental" | "social" | "governance";
  unit: string | null;
  metricType: string | null;
  direction: string | null;
  enabled: boolean;
  helpText: string | null;
  formulaText: string | null;
  targetValue?: string | number | null;
  targetMin?: string | number | null;
  targetMax?: string | number | null;
  target?: { targetValue?: string | number | null } | null;
};

type MetricValueRow = {
  period: string;
  value: string | number | null;
  status?: string | null;
  percentChange?: string | number | null;
};

const CATEGORY_CONFIG = {
  environmental: { label: "Environmental", icon: Leaf, color: "text-primary", bg: "bg-primary/10" },
  social: { label: "Social", icon: Users, color: "text-blue-500", bg: "bg-blue-500/10" },
  governance: { label: "Governance", icon: Shield, color: "text-purple-500", bg: "bg-purple-500/10" },
};

const TYPE_CONFIG: Record<string, { label: string; icon: any; color: string }> = {
  manual: { label: "Manual", icon: PenLine, color: "text-muted-foreground" },
  calculated: { label: "Calculated", icon: Calculator, color: "text-blue-500" },
  derived: { label: "Derived", icon: GitBranch, color: "text-purple-500" },
};

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    green: "bg-emerald-500",
    amber: "bg-amber-500",
    red: "bg-red-500",
    missing: "bg-gray-300",
  };
  return (
    <div
      className={`w-2.5 h-2.5 rounded-full shrink-0 ${colors[status] || colors.missing}`}
      data-testid={`status-dot-${status}`}
      title={status}
    />
  );
}

function TrendArrow({ percentChange, direction }: { percentChange: number | null; direction: string }) {
  if (percentChange === null || percentChange === undefined) return <Minus className="w-3 h-3 text-muted-foreground" />;
  const isPositive = percentChange > 0;
  const isGood = direction === "lower_is_better" ? !isPositive : isPositive;
  return (
    <span className={`flex items-center gap-0.5 text-xs ${isGood ? "text-emerald-600" : "text-red-500"}`}>
      {isPositive ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
      {Math.abs(percentChange).toFixed(1)}%
    </span>
  );
}

function MetricDetailDialog({ metric, onClose }: { metric: MetricSummary | null; onClose: () => void }) {
  const { data: historyData } = useQuery<any>({
    queryKey: ["/api/metrics", metric?.id, "history"],
    queryFn: () => {
        return authFetch(`/api/metrics/${metric?.id}/history`).then(r => r.json());
      },
    enabled: !!metric?.id,
  });

  if (!metric) return null;

  const config = CATEGORY_CONFIG[metric.category];
  const typeConfig = TYPE_CONFIG[metric.metricType] || TYPE_CONFIG.manual;
  const history = historyData?.history || [];
  const chartData = history.map((h: any) => ({
    period: h.period?.replace(/^\d{4}-/, ""),
    value: h.value ? Number(h.value) : null,
  }));

  return (
    <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 text-base">
          <StatusDot status={metric.status} />
          {metric.name}
        </DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="text-xs gap-1">
            <config.icon className={`w-3 h-3 ${config.color}`} />
            {config.label}
          </Badge>
          <Badge variant="secondary" className="text-xs gap-1">
            <typeConfig.icon className={`w-3 h-3 ${typeConfig.color}`} />
            {typeConfig.label}
          </Badge>
          <Badge variant="outline" className="text-xs">{metric.unit || "—"}</Badge>
        </div>

        {metric.helpText && (
          <p className="text-sm text-muted-foreground">{metric.helpText}</p>
        )}

        <div className="grid grid-cols-3 gap-3">
          <div className="p-3 bg-muted/50 rounded-md text-center">
            <p className="text-xs text-muted-foreground">Current</p>
            <p className="text-lg font-bold" data-testid="text-current-value">
              {metric.latestValue != null ? metric.latestValue.toLocaleString() : "—"}
            </p>
          </div>
          <div className="p-3 bg-muted/50 rounded-md text-center">
            <p className="text-xs text-muted-foreground">Previous</p>
            <p className="text-lg font-bold">
              {metric.previousValue != null ? metric.previousValue.toLocaleString() : "—"}
            </p>
          </div>
          <div className="p-3 bg-muted/50 rounded-md text-center">
            <p className="text-xs text-muted-foreground">Target</p>
            <p className="text-lg font-bold">
              {metric.target != null ? metric.target.toLocaleString() : "—"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <StatusDot status={metric.status} />
          <span className="text-sm capitalize font-medium">{metric.status}</span>
          <TrendArrow percentChange={metric.percentChange} direction={metric.direction} />
        </div>

        {metric.formulaText && (
          <div className="p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-md">
            <p className="text-xs text-blue-600 dark:text-blue-400 font-medium mb-1">Formula</p>
            <p className="text-sm text-blue-800 dark:text-blue-300">{metric.formulaText}</p>
          </div>
        )}

        {chartData.length > 1 && (
          <div>
            <p className="text-xs text-muted-foreground mb-2">Trend</p>
            <ResponsiveContainer width="100%" height={140}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="period" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} width={35} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 6 }} />
                <Line type="monotone" dataKey="value" stroke="hsl(158, 64%, 32%)" strokeWidth={2} dot={{ r: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </DialogContent>
  );
}

function MetricRow({ metric, onClick }: { metric: MetricSummary; onClick: () => void }) {
  const config = CATEGORY_CONFIG[metric.category];
  const typeConfig = TYPE_CONFIG[metric.metricType] || TYPE_CONFIG.manual;
  const Icon = config.icon;

  return (
    <div
      className="flex items-center gap-2 sm:gap-3 p-2.5 sm:p-3 rounded-md border border-border hover:border-primary/30 hover:bg-muted/30 cursor-pointer transition-colors"
      onClick={onClick}
      data-testid={`metric-row-${metric.id}`}
    >
      <StatusDot status={metric.status} />
      <div className={`p-1 sm:p-1.5 rounded-md ${config.bg} shrink-0 hidden sm:block`}>
        <Icon className={`w-3.5 h-3.5 ${config.color}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-medium truncate">{metric.name}</p>
          <Badge variant="secondary" className="text-[10px] shrink-0 gap-0.5 py-0 hidden sm:flex">
            <typeConfig.icon className={`w-2.5 h-2.5 ${typeConfig.color}`} />
            {typeConfig.label}
          </Badge>
        </div>
      </div>
      <div className="flex items-center gap-2 sm:gap-4 shrink-0">
        <div className="text-right">
          <p className="text-sm font-bold">
            {metric.latestValue != null ? metric.latestValue.toLocaleString() : "—"}
          </p>
          <p className="text-xs text-muted-foreground">{metric.unit || ""}</p>
        </div>
        <div className="hidden sm:block">
          <TrendArrow percentChange={metric.percentChange} direction={metric.direction} />
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground hidden sm:block" />
      </div>
    </div>
  );
}

export default function Metrics() {
  const [selectedMetric, setSelectedMetric] = useState<MetricSummary | null>(null);
  const [activeTab, setActiveTab] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");

  const { data: companyMetrics = [], isLoading: metricsLoading } = useQuery<CompanyMetric[]>({
    queryKey: ["/api/metrics"],
    queryFn: () => authFetch("/api/metrics").then((r) => r.json()),
  });

  const enabledMetrics = companyMetrics.filter((metric) => metric.enabled);
  const historyQueries = useQueries({
    queries: enabledMetrics.map((metric) => ({
      queryKey: ["/api/metrics", metric.id, "values"],
      queryFn: () => authFetch(`/api/metrics/${metric.id}/values`).then((r) => r.json() as Promise<MetricValueRow[]>),
      staleTime: 60_000,
    })),
  });

  const isLoading = metricsLoading || historyQueries.some((query) => query.isLoading);

  if (isLoading) {
    return <div className="p-4 sm:p-6 space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14" />)}</div>;
  }

  const metrics: MetricSummary[] = enabledMetrics.map((metric, index) => {
    const values = (historyQueries[index]?.data || []) as MetricValueRow[];
    const latest = values[0];
    const previous = values[1];
    const latestValue = latest?.value !== null && latest?.value !== undefined ? Number(latest.value) : null;
    const previousValue = previous?.value !== null && previous?.value !== undefined ? Number(previous.value) : null;
    const computedPercentChange = latest?.percentChange !== null && latest?.percentChange !== undefined
      ? Number(latest.percentChange)
      : (latestValue !== null && previousValue !== null && previousValue !== 0
        ? ((latestValue - previousValue) / Math.abs(previousValue)) * 100
        : null);
    const target = metric.target?.targetValue ?? metric.targetValue ?? metric.targetMax ?? metric.targetMin ?? null;

    return {
      id: metric.id,
      name: metric.name,
      category: metric.category,
      unit: metric.unit,
      metricType: metric.metricType || "manual",
      direction: metric.direction || "higher_is_better",
      latestValue,
      previousValue,
      status: latest?.status || (latestValue !== null ? "green" : "missing"),
      percentChange: computedPercentChange,
      target: target !== null && target !== undefined ? Number(target) : null,
      helpText: metric.helpText,
      formulaText: metric.formulaText,
      trend: values.slice(0, 6).reverse().map((value) => ({
        period: value.period,
        value: value.value !== null && value.value !== undefined ? Number(value.value) : null,
      })),
    };
  });

  const statusCounts = metrics.reduce(
    (acc, metric) => {
      const key = metric.status as "green" | "amber" | "red" | "missing";
      if (acc[key] !== undefined) acc[key] += 1;
      else acc.missing += 1;
      return acc;
    },
    { green: 0, amber: 0, red: 0, missing: 0 },
  );

  let filtered = activeTab === "all" ? metrics : metrics.filter(m => m.category === activeTab);
  if (statusFilter !== "all") filtered = filtered.filter(m => m.status === statusFilter);
  if (typeFilter !== "all") filtered = filtered.filter(m => m.metricType === typeFilter);

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-4xl mx-auto">
      <PageGuidance
        pageKey="metrics"
        title="Metrics — what this page does"
        summary="This page shows the ESG metrics your company is currently tracking. Use Metrics Library to enable or disable metrics and add manual metrics. Use Enter Data to add figures for eligible enabled metrics each period."
        goodLooksLike="At least 5–10 metrics enabled across environmental, social, and governance categories, with data entered for the current and previous 3 months."
        steps={[
          "Review the metrics your company is currently tracking",
          "Pay attention to 'calculated' metrics — these auto-update when you enter raw data",
          "Go to Enter Data to log values for the current period",
          "Use Metrics Library to browse the wider catalog of available definitions",
        ]}
      />
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-lg sm:text-xl font-semibold flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary" />
            Metrics
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Your company’s enabled ESG metrics and current status
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" data-testid="badge-metric-count">{metrics.length} metrics</Badge>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 sm:gap-3">
        {[
          { key: "all", label: "Total", value: metrics.length, color: "" },
          { key: "green", label: "On Track", value: statusCounts.green, color: "text-emerald-600" },
          { key: "amber", label: "At Risk", value: statusCounts.amber, color: "text-amber-600" },
          { key: "red", label: "Off Track", value: statusCounts.red, color: "text-red-600" },
        ].map(s => (
          <button
            key={s.key}
            className={`p-2 sm:p-3 rounded-md border text-center transition-colors ${
              statusFilter === s.key ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"
            }`}
            onClick={() => setStatusFilter(statusFilter === s.key && s.key !== "all" ? "all" : s.key)}
            data-testid={`filter-status-${s.key}`}
          >
            <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
            <p className="text-[10px] sm:text-xs text-muted-foreground">{s.label}</p>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1">
          <TabsList className="h-8">
            <TabsTrigger value="all" className="text-xs">All</TabsTrigger>
            <TabsTrigger value="environmental" data-testid="tab-environmental" className="text-xs">Environmental</TabsTrigger>
            <TabsTrigger value="social" data-testid="tab-social" className="text-xs">Social</TabsTrigger>
            <TabsTrigger value="governance" data-testid="tab-governance" className="text-xs">Governance</TabsTrigger>
          </TabsList>
        </Tabs>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-28 h-8 text-xs" data-testid="select-type-filter">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="manual">Manual</SelectItem>
            <SelectItem value="calculated">Calculated</SelectItem>
            <SelectItem value="derived">Derived</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        {filtered.map(metric => (
          <MetricRow
            key={metric.id}
            metric={metric}
            onClick={() => setSelectedMetric(metric)}
          />
        ))}
        {filtered.length === 0 && metrics.length === 0 && (
          <div className="text-center py-10 space-y-3" data-testid="metrics-empty-state">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
              <BarChart3 className="w-6 h-6 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium">No metrics activated yet</p>
              <p className="text-xs text-muted-foreground mt-1">Metrics are the individual measurements that make up your ESG score — things like carbon emissions, headcount, and whether policies are in place.</p>
            </div>
            <p className="text-xs text-muted-foreground">
              Open Metrics Library to enable the metrics relevant to your business, add a custom manual metric, or complete onboarding to have recommended metrics pre-selected for your industry.
            </p>
            <div className="flex items-center justify-center gap-2">
              <Link href="/metrics-library">
                <Button size="sm" variant="outline" data-testid="button-metrics-empty-library">
                  Open Metrics Library
                </Button>
              </Link>
              <Link href="/onboarding">
                <Button size="sm" variant="outline" data-testid="button-metrics-empty-onboarding">
                  Complete onboarding
                </Button>
              </Link>
            </div>
          </div>
        )}
        {filtered.length === 0 && metrics.length > 0 && (
          <div className="text-center py-8 space-y-3" data-testid="metrics-filter-empty">
            <p className="text-sm text-muted-foreground">No metrics match your filters.</p>
            <Button variant="outline" size="sm" onClick={() => { setActiveTab("all"); setStatusFilter("all"); setTypeFilter("all"); }} data-testid="button-clear-filters">
              Clear Filters
            </Button>
          </div>
        )}
      </div>

      <Dialog open={!!selectedMetric} onOpenChange={open => !open && setSelectedMetric(null)}>
        <MetricDetailDialog metric={selectedMetric} onClose={() => setSelectedMetric(null)} />
      </Dialog>
    </div>
  );
}
