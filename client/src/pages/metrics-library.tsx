import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Search, Leaf, Users, Shield, Clock, FileCheck, ChevronDown, ChevronRight, Zap, PencilLine, CheckCircle2, Loader2, Globe } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { MetricEvidenceAttachment } from "@/components/metric-evidence-attachment";
import { subMonths } from "date-fns";

const STRENGTH_COLORS: Record<string, string> = {
  direct: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  partial: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  supporting: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
};

function FrameworkAlignmentPanel({ metricDefinitionId }: { metricDefinitionId: string }) {
  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/metric-definitions", metricDefinitionId, "framework-alignment"],
    queryFn: async () => {
      const res = await fetch(`/api/metric-definitions/${metricDefinitionId}/framework-alignment`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch alignment");
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-2 mt-3 pt-3 border-t border-border/50">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  const frameworks: any[] = data?.frameworks ?? [];

  if (frameworks.length === 0) {
    return (
      <div className="mt-3 pt-3 border-t border-border/50">
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Globe className="w-3.5 h-3.5" />
          No framework alignments mapped for this metric.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-3 pt-3 border-t border-border/50 space-y-3">
      {frameworks.map((fwGroup: any) => (
        <div key={fwGroup.framework.id} className="rounded-md border border-border p-3 space-y-2" data-testid={`alignment-fw-${fwGroup.framework.code}`}>
          <div className="flex items-center gap-2">
            <Globe className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <span className="text-sm font-medium text-foreground">{fwGroup.framework.name}</span>
            {fwGroup.framework.version && <Badge variant="outline" className="text-[10px] h-4">{fwGroup.framework.version}</Badge>}
          </div>
          {fwGroup.alignments.map((alignment: any) => (
            <div key={alignment.mappingId} className="pl-5 space-y-1" data-testid={`alignment-req-${alignment.requirement?.code}`}>
              <div className="flex items-start gap-2 flex-wrap">
                <span className="text-xs font-mono text-muted-foreground">{alignment.requirement?.code}</span>
                <span className="text-xs text-foreground">{alignment.requirement?.title}</span>
                <Badge
                  variant="outline"
                  className={`text-[10px] h-4 border-0 ${STRENGTH_COLORS[alignment.mappingStrength] ?? ""}`}
                  data-testid={`badge-strength-${alignment.requirement?.code}`}
                >
                  {alignment.mappingStrength.charAt(0).toUpperCase() + alignment.mappingStrength.slice(1)}
                </Badge>
              </div>
              {alignment.additionalNeeded.length > 0 && (
                <p className="text-[11px] text-amber-700 dark:text-amber-400 pl-1">
                  Also needed: {alignment.additionalNeeded.join("; ")}
                </p>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

type MetricDefinition = {
  id: string;
  code: string;
  name: string;
  pillar: "environmental" | "social" | "governance";
  category: string;
  description: string | null;
  dataType: string;
  unit: string | null;
  inputFrequency: string;
  isCore: boolean;
  isActive: boolean;
  isDerived: boolean;
  formulaJson: Record<string, unknown> | null;
  frameworkTags: string[] | null;
  scoringWeight: string | null;
  evidenceRequired: boolean;
  rollupMethod: string;
  sortOrder: number;
};

const PILLAR_CONFIG = {
  environmental: { label: "Environmental", icon: Leaf, color: "text-green-600 dark:text-green-400", bg: "bg-green-50 dark:bg-green-900/20", border: "border-green-200 dark:border-green-800" },
  social: { label: "Social", icon: Users, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-900/20", border: "border-blue-200 dark:border-blue-800" },
  governance: { label: "Governance", icon: Shield, color: "text-purple-600 dark:text-purple-400", bg: "bg-purple-50 dark:bg-purple-900/20", border: "border-purple-200 dark:border-purple-800" },
};

const FREQUENCY_LABELS: Record<string, string> = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  annual: "Annual",
};

function generatePeriods() {
  const periods: { label: string; start: string; end: string }[] = [];
  const now = new Date();
  const startDate = new Date(2020, 0, 1);
  let d = new Date(now.getFullYear(), now.getMonth(), 1);
  while (d >= startDate) {
    const year = d.getFullYear();
    const month = d.getMonth();
    const quarterStart = new Date(year, Math.floor(month / 3) * 3, 1);
    const quarterEnd = new Date(year, Math.floor(month / 3) * 3 + 3, 0, 23, 59, 59);
    const label = `Q${Math.floor(month / 3) + 1} ${year}`;
    const existing = periods.find(p => p.label === label);
    if (!existing) {
      periods.push({ label, start: quarterStart.toISOString(), end: quarterEnd.toISOString() });
    }
    d = subMonths(d, 1);
  }
  return periods;
}

const PERIODS = generatePeriods();

type MetricDefinitionValue = {
  id: string;
  valueNumeric: string | null;
  valueText: string | null;
  valueBoolean: boolean | null;
  notes: string | null;
};

function buildSavePayload(metric: MetricDefinition, numericValue: string, textValue: string, boolValue: boolean | null, notes: string, period: typeof PERIODS[0]) {
  const base = {
    metricDefinitionId: metric.id,
    reportingPeriodStart: period.start,
    reportingPeriodEnd: period.end,
    notes: notes || null,
    sourceType: "manual",
  };
  if (metric.dataType === "boolean") {
    return { ...base, valueBoolean: boolValue };
  }
  if (metric.dataType === "text") {
    return { ...base, valueText: textValue };
  }
  return { ...base, valueNumeric: numericValue };
}

function MetricValueEntry({ metric, period }: { metric: MetricDefinition; period: typeof PERIODS[0] }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [numericValue, setNumericValue] = useState("");
  const [textValue, setTextValue] = useState("");
  const [boolValue, setBoolValue] = useState<boolean | null>(null);
  const [notes, setNotes] = useState("");

  const { data: existingValues = [] } = useQuery<MetricDefinitionValue[]>({
    queryKey: ["/api/metric-definition-values", metric.id, period.start],
    queryFn: () => fetch(`/api/metric-definition-values?metricDefinitionId=${metric.id}&periodStart=${period.start}&periodEnd=${period.end}`, { credentials: "include" }).then(r => r.json()),
  });

  const existingValue = existingValues[0];

  const saveMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/metric-definition-values", buildSavePayload(metric, numericValue, textValue, boolValue, notes, period)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/metric-definition-values", metric.id, period.start] });
      toast({ title: "Value saved" });
    },
    onError: (e: Error) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const hasValue = metric.dataType === "boolean" ? boolValue !== null : metric.dataType === "text" ? textValue.trim().length > 0 : numericValue.trim().length > 0;

  if (metric.isDerived) {
    return (
      <div className="mt-3 pt-3 border-t border-border/50">
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <Zap className="w-3 h-3" />
          Derived metric — calculated automatically from source values
        </p>
        {existingValue?.valueNumeric && (
          <p className="text-xs font-medium mt-1">{parseFloat(existingValue.valueNumeric).toFixed(4)} {metric.unit || ""}</p>
        )}
      </div>
    );
  }

  const currentDisplay = () => {
    if (!existingValue) return null;
    if (metric.dataType === "boolean") return existingValue.valueBoolean === true ? "Yes" : existingValue.valueBoolean === false ? "No" : null;
    if (metric.dataType === "text") return existingValue.valueText;
    return existingValue.valueNumeric ? `${existingValue.valueNumeric} ${metric.unit || ""}`.trim() : null;
  };

  return (
    <div className="mt-3 pt-3 border-t border-border/50 space-y-2" data-testid={`entry-panel-${metric.id}`}>
      {existingValue && currentDisplay() && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <CheckCircle2 className="w-3 h-3 text-primary" />
          Current: <span className="font-medium text-foreground">{currentDisplay()}</span>
          {existingValue.notes && <span className="truncate max-w-[120px]">— {existingValue.notes}</span>}
        </div>
      )}
      <div className="flex gap-2 items-end">
        <div className="flex-1 space-y-1">
          <Label className="text-xs text-muted-foreground">
            {metric.dataType === "boolean" ? "Yes / No" : metric.unit ? `Value (${metric.unit})` : "Value"}
          </Label>
          {metric.dataType === "boolean" ? (
            <div className="flex gap-2" data-testid={`input-value-${metric.id}`}>
              <Button
                size="sm"
                variant={boolValue === true ? "default" : "outline"}
                className="h-7 text-xs flex-1"
                onClick={() => setBoolValue(true)}
                data-testid={`input-value-${metric.id}-yes`}
              >Yes</Button>
              <Button
                size="sm"
                variant={boolValue === false ? "default" : "outline"}
                className="h-7 text-xs flex-1"
                onClick={() => setBoolValue(false)}
                data-testid={`input-value-${metric.id}-no`}
              >No</Button>
            </div>
          ) : metric.dataType === "text" ? (
            <Input
              value={textValue}
              onChange={e => setTextValue(e.target.value)}
              placeholder="Enter text value"
              className="h-7 text-xs"
              data-testid={`input-value-${metric.id}`}
            />
          ) : (
            <Input
              type="number"
              step="any"
              value={numericValue}
              onChange={e => setNumericValue(e.target.value)}
              placeholder="Enter value"
              className="h-7 text-xs"
              data-testid={`input-value-${metric.id}`}
            />
          )}
        </div>
        <div className="flex-1 space-y-1">
          <Label className="text-xs text-muted-foreground">Notes</Label>
          <Input
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Optional"
            className="h-7 text-xs"
            data-testid={`input-notes-${metric.id}`}
          />
        </div>
        <Button
          size="sm"
          className="h-7 text-xs"
          onClick={() => saveMutation.mutate()}
          disabled={!hasValue || saveMutation.isPending}
          data-testid={`button-save-metric-value-${metric.id}`}
        >
          {saveMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Save"}
        </Button>
      </div>
      {existingValue?.id && (
        <MetricEvidenceAttachment metricValueId={existingValue.id} />
      )}
    </div>
  );
}

function MetricCard({ metric, onToggle, isToggling, selectedPeriod }: { metric: MetricDefinition; onToggle: (id: string) => void; isToggling: boolean; selectedPeriod: typeof PERIODS[0] }) {
  const [showEntry, setShowEntry] = useState(false);
  const [showAlignment, setShowAlignment] = useState(false);
  const pillar = PILLAR_CONFIG[metric.pillar];

  return (
    <div
      className={`rounded-lg border p-4 transition-all ${metric.isActive ? "bg-background" : "bg-muted/30 opacity-60"}`}
      data-testid={`card-metric-${metric.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="font-medium text-sm text-foreground" data-testid={`text-metric-name-${metric.id}`}>{metric.name}</span>
            {metric.isCore ? (
              <Badge variant="default" className="text-[10px] px-1.5 py-0 h-4" data-testid={`badge-core-${metric.id}`}>Core</Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4" data-testid={`badge-advanced-${metric.id}`}>Advanced</Badge>
            )}
            {metric.isDerived && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                <Zap className="w-2.5 h-2.5 mr-0.5" />Derived
              </Badge>
            )}
          </div>
          {metric.description && (
            <p className="text-xs text-muted-foreground mb-2 line-clamp-2">{metric.description}</p>
          )}
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            {metric.unit && (
              <span className="flex items-center gap-1">
                <span className="font-mono text-[10px] bg-muted px-1 rounded">{metric.unit}</span>
              </span>
            )}
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {FREQUENCY_LABELS[metric.inputFrequency] ?? metric.inputFrequency}
            </span>
            {metric.evidenceRequired && (
              <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                <FileCheck className="w-3 h-3" />
                Evidence required
              </span>
            )}
            {metric.frameworkTags && metric.frameworkTags.length > 0 && (
              <span className="text-muted-foreground">{metric.frameworkTags.slice(0, 2).join(", ")}</span>
            )}
          </div>
        </div>
        <div className="flex-shrink-0 flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            className="h-6 text-xs px-2"
            onClick={() => setShowAlignment(v => !v)}
            data-testid={`button-framework-alignment-${metric.id}`}
          >
            <Globe className="w-3 h-3 mr-1" />
            {showAlignment ? "Hide" : "Alignment"}
          </Button>
          {metric.isActive && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 text-xs px-2"
              onClick={() => setShowEntry(v => !v)}
              data-testid={`button-enter-value-${metric.id}`}
            >
              <PencilLine className="w-3 h-3 mr-1" />
              {showEntry ? "Close" : "Enter"}
            </Button>
          )}
          {!metric.isCore ? (
            <Switch
              checked={metric.isActive}
              onCheckedChange={() => onToggle(metric.id)}
              disabled={isToggling}
              data-testid={`toggle-metric-${metric.id}`}
              aria-label={`${metric.isActive ? "Disable" : "Enable"} ${metric.name}`}
            />
          ) : (
            <span className="text-[10px] text-muted-foreground">Always on</span>
          )}
        </div>
      </div>
      {showEntry && <MetricValueEntry metric={metric} period={selectedPeriod} />}
      {showAlignment && <FrameworkAlignmentPanel metricDefinitionId={metric.id} />}
    </div>
  );
}

function CategoryGroup({ category, metrics, onToggle, toggling, selectedPeriod }: { category: string; metrics: MetricDefinition[]; onToggle: (id: string) => void; toggling: Set<string>; selectedPeriod: typeof PERIODS[0] }) {
  const [open, setOpen] = useState(true);
  const activeCount = metrics.filter(m => m.isActive).length;

  return (
    <Collapsible open={open} onOpenChange={setOpen} data-testid={`group-category-${category.replace(/\s+/g, "-").toLowerCase()}`}>
      <CollapsibleTrigger className="w-full">
        <div className="flex items-center justify-between py-2 px-1 hover:bg-muted/50 rounded-md cursor-pointer">
          <div className="flex items-center gap-2">
            {open ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
            <span className="text-sm font-medium">{category}</span>
            <span className="text-xs text-muted-foreground">({activeCount}/{metrics.length} active)</span>
          </div>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="space-y-2 mt-1 mb-3">
          {metrics.map(m => (
            <MetricCard key={m.id} metric={m} onToggle={onToggle} isToggling={toggling.has(m.id)} selectedPeriod={selectedPeriod} />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export default function MetricsLibraryPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [pillarFilter, setPillarFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [toggling, setToggling] = useState<Set<string>>(new Set());
  const [selectedPeriodIdx, setSelectedPeriodIdx] = useState(0);

  const { data: definitions = [], isLoading } = useQuery<MetricDefinition[]>({
    queryKey: ["/api/metric-definitions"],
  });

  const seedMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/metric-definitions/seed"),
    onSuccess: (data: { seeded: number; message: string }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/metric-definitions"] });
      toast({ title: "Metrics seeded", description: data?.message || "Metric library populated." });
    },
    onError: (e: Error) => toast({ title: "Seed failed", description: e.message, variant: "destructive" }),
  });

  const toggleMutation = useMutation({
    mutationFn: (id: string) => apiRequest("PATCH", `/api/metric-definitions/${id}/toggle`),
    onMutate: (id: string) => setToggling(prev => new Set([...prev, id])),
    onSettled: (_, __, id: string) => setToggling(prev => { const s = new Set(prev); s.delete(id); return s; }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/metric-definitions"] }),
    onError: (e: Error) => toast({ title: "Toggle failed", description: e.message, variant: "destructive" }),
  });

  const filtered = useMemo(() => {
    return definitions.filter(d => {
      const matchesPillar = pillarFilter === "all" || d.pillar === pillarFilter;
      const matchesStatus = statusFilter === "all" || (statusFilter === "active" && d.isActive) || (statusFilter === "inactive" && !d.isActive) || (statusFilter === "core" && d.isCore) || (statusFilter === "advanced" && !d.isCore);
      const matchesSearch = !search || d.name.toLowerCase().includes(search.toLowerCase()) || d.code.toLowerCase().includes(search.toLowerCase()) || (d.description ?? "").toLowerCase().includes(search.toLowerCase());
      return matchesPillar && matchesStatus && matchesSearch;
    });
  }, [definitions, pillarFilter, statusFilter, search]);

  const byPillarAndCategory = useMemo(() => {
    const pillars: Record<string, Record<string, MetricDefinition[]>> = {};
    for (const d of filtered) {
      if (!pillars[d.pillar]) pillars[d.pillar] = {};
      if (!pillars[d.pillar][d.category]) pillars[d.pillar][d.category] = [];
      pillars[d.pillar][d.category].push(d);
    }
    return pillars;
  }, [filtered]);

  const pillarOrder: Array<"environmental" | "social" | "governance"> = ["environmental", "social", "governance"];

  const stats = useMemo(() => ({
    total: definitions.length,
    core: definitions.filter(d => d.isCore).length,
    advanced: definitions.filter(d => !d.isCore).length,
    active: definitions.filter(d => d.isActive).length,
    derived: definitions.filter(d => d.isDerived).length,
  }), [definitions]);

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="heading-metrics-library">Metrics Library</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Browse and manage all ESG metric definitions. Core metrics are always tracked; advanced metrics can be enabled as needed.
          </p>
        </div>
        {definitions.length === 0 && !isLoading && (
          <Button
            onClick={() => seedMutation.mutate()}
            disabled={seedMutation.isPending}
            data-testid="button-seed-metrics"
          >
            {seedMutation.isPending ? "Seeding..." : "Load Metric Library"}
          </Button>
        )}
      </div>

      {definitions.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" data-testid="stats-summary">
          <Card className="p-3">
            <div className="text-2xl font-bold" data-testid="stat-total">{stats.total}</div>
            <div className="text-xs text-muted-foreground">Total metrics</div>
          </Card>
          <Card className="p-3">
            <div className="text-2xl font-bold text-primary" data-testid="stat-core">{stats.core}</div>
            <div className="text-xs text-muted-foreground">Core (always on)</div>
          </Card>
          <Card className="p-3">
            <div className="text-2xl font-bold text-muted-foreground" data-testid="stat-advanced">{stats.advanced}</div>
            <div className="text-xs text-muted-foreground">Advanced (optional)</div>
          </Card>
          <Card className="p-3">
            <div className="text-2xl font-bold text-green-600" data-testid="stat-active">{stats.active}</div>
            <div className="text-xs text-muted-foreground">Active</div>
          </Card>
        </div>
      )}

      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search metrics..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-search-metrics"
          />
        </div>
        <Select value={pillarFilter} onValueChange={setPillarFilter}>
          <SelectTrigger className="w-40" data-testid="select-pillar-filter">
            <SelectValue placeholder="All pillars" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All pillars</SelectItem>
            <SelectItem value="environmental">Environmental</SelectItem>
            <SelectItem value="social">Social</SelectItem>
            <SelectItem value="governance">Governance</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40" data-testid="select-status-filter">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="core">Core only</SelectItem>
            <SelectItem value="advanced">Advanced only</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
        <Select value={String(selectedPeriodIdx)} onValueChange={v => setSelectedPeriodIdx(Number(v))}>
          <SelectTrigger className="w-32" data-testid="select-period-filter">
            <SelectValue placeholder="Period" />
          </SelectTrigger>
          <SelectContent>
            {PERIODS.map((p, i) => (
              <SelectItem key={p.label} value={String(i)}>{p.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-32 w-full" />)}
        </div>
      ) : definitions.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Leaf className="w-12 h-12 text-muted-foreground mb-4" />
            <CardTitle className="mb-2">No metrics in library yet</CardTitle>
            <p className="text-muted-foreground text-sm mb-6 max-w-md">
              Load the metric library to access 58 pre-built ESG metrics covering environmental, social, and governance pillars.
            </p>
            <Button onClick={() => seedMutation.mutate()} disabled={seedMutation.isPending} data-testid="button-seed-metrics-empty">
              {seedMutation.isPending ? "Loading..." : "Load Metric Library"}
            </Button>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No metrics match your filters. Try adjusting your search or filter settings.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {pillarOrder.map(pillar => {
            const categories = byPillarAndCategory[pillar];
            if (!categories) return null;
            const config = PILLAR_CONFIG[pillar];
            const PillarIcon = config.icon;
            const pillarMetrics = Object.values(categories).flat();
            const activePillarCount = pillarMetrics.filter(m => m.isActive).length;

            return (
              <Card key={pillar} className={`border ${config.border}`} data-testid={`section-pillar-${pillar}`}>
                <CardHeader className={`py-4 rounded-t-lg ${config.bg}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <PillarIcon className={`w-5 h-5 ${config.color}`} />
                      <CardTitle className={`text-base ${config.color}`}>{config.label}</CardTitle>
                    </div>
                    <span className="text-xs text-muted-foreground">{activePillarCount}/{pillarMetrics.length} active</span>
                  </div>
                </CardHeader>
                <CardContent className="pt-4">
                  <div className="space-y-1">
                    {Object.entries(categories).map(([category, catMetrics]) => (
                      <CategoryGroup
                        key={category}
                        category={category}
                        metrics={catMetrics}
                        onToggle={id => toggleMutation.mutate(id)}
                        toggling={toggling}
                        selectedPeriod={PERIODS[selectedPeriodIdx]}
                      />
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
