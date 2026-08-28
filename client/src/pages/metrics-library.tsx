import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Search, Leaf, Users, Shield, Clock, FileCheck, ChevronDown, ChevronRight, Zap, Globe } from "lucide-react";
import { apiRequest, authFetch } from "@/lib/queryClient";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AddMetricDialog } from "@/components/add-metric-dialog";
import { usePermissions } from "@/lib/permissions";
import { buildMetricLibraryEntries, type MetricLibraryEntry } from "@/lib/metric-activation";
import { invalidateMetricDependentQueries } from "@/lib/metric-query-invalidation";

const STRENGTH_COLORS: Record<string, string> = {
  direct: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  partial: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  supporting: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
};

function FrameworkAlignmentPanel({ metricDefinitionId }: { metricDefinitionId: string }) {
  const { data, isLoading, isError } = useQuery<any>({
    queryKey: ["/api/metric-definitions", metricDefinitionId, "framework-alignment"],
    queryFn: async () => {
      const res = await authFetch(`/api/metric-definitions/${metricDefinitionId}/framework-alignment`);
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

  if (isError) {
    return (
      <div className="mt-3 pt-3 border-t border-border/50">
        <p className="text-xs text-destructive" role="alert">
          Framework alignment could not be loaded. Try again.
        </p>
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
  companyMetricId?: string;
  isSyntheticCustom?: boolean;
  metricType?: string | null;
  formulaText?: string | null;
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

function MetricCard({ metric, onToggle, isToggling, canToggle }: { metric: MetricDefinition; onToggle: (id: string) => void; isToggling: boolean; canToggle: boolean }) {
  const [showAlignment, setShowAlignment] = useState(false);
  const pillar = PILLAR_CONFIG[metric.pillar];
  const calculationClassification = metric.metricType === "calculated" || metric.metricType === "derived"
    ? metric.metricType
    : metric.isDerived
      ? "derived"
      : metric.formulaJson
        ? "calculated"
        : null;
  const calculationDescription = metric.formulaText
    ?? (typeof metric.formulaJson?.description === "string" ? metric.formulaJson.description : null);

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
              <Badge variant="default" className="text-[10px] px-1.5 py-0 h-4" data-testid={`badge-core-${metric.id}`}>Recommended</Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4" data-testid={`badge-advanced-${metric.id}`}>Optional</Badge>
            )}
            {calculationClassification && (
              <Badge
                variant="secondary"
                className="text-[10px] px-1.5 py-0 h-4"
                data-testid={`badge-metric-classification-${metric.id}`}
              >
                <Zap className="w-2.5 h-2.5 mr-0.5" />
                {calculationClassification === "derived" ? "Derived" : "Calculated"}
              </Badge>
            )}
          </div>
          {metric.description && (
            <p className="text-xs text-muted-foreground mb-2 line-clamp-2">{metric.description}</p>
          )}
          {calculationClassification && calculationDescription && (
            <p
              className="text-[11px] text-blue-700 dark:text-blue-300 mb-2"
              data-testid={`text-metric-formula-${metric.id}`}
            >
              Calculation: {calculationDescription}
            </p>
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
          <Switch
            checked={metric.isActive}
            onCheckedChange={() => onToggle(metric.id)}
            disabled={isToggling || !canToggle}
            data-testid={`toggle-metric-${metric.id}`}
            aria-label={`${metric.isActive ? "Disable" : "Enable"} ${metric.name}`}
            title={canToggle ? undefined : "Your role has read-only access to metric activation"}
          />
        </div>
      </div>
      {showAlignment && <FrameworkAlignmentPanel metricDefinitionId={metric.id} />}
    </div>
  );
}

function CategoryGroup({
  pillar,
  category,
  metrics,
  open,
  onOpenChange,
  onToggle,
  toggling,
  canToggle,
}: {
  pillar: string;
  category: string;
  metrics: MetricDefinition[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onToggle: (id: string) => void;
  toggling: Set<string>;
  canToggle: boolean;
}) {
  const enabledCount = metrics.filter(m => m.isActive).length;
  const testId = `${pillar}-${category}`.replace(/\s+/g, "-").toLowerCase();

  return (
    <Collapsible open={open} onOpenChange={onOpenChange} data-testid={`group-category-${testId}`}>
      <CollapsibleTrigger className="w-full" aria-label={`${open ? "Collapse" : "Expand"} ${category} metrics`}>
        <div className="flex items-center justify-between py-2 px-1 hover:bg-muted/50 rounded-md cursor-pointer">
          <div className="flex items-center gap-2">
            {open ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
            <span className="text-sm font-medium">{category}</span>
            <span className="text-xs text-muted-foreground">({enabledCount}/{metrics.length} enabled)</span>
          </div>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="space-y-2 mt-1 mb-3">
          {metrics.map(m => (
            <MetricCard key={m.id} metric={m} onToggle={onToggle} isToggling={toggling.has(m.id)} canToggle={canToggle} />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export default function MetricsLibraryPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { can, isSuperAdmin } = usePermissions();
  const canManageMetrics = can("metrics_data_entry");

  const [search, setSearch] = useState("");
  const [pillarFilter, setPillarFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [toggling, setToggling] = useState<Set<string>>(new Set());
  const [showAdd, setShowAdd] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  const { data: definitions = [], isLoading } = useQuery<MetricDefinition[]>({
    queryKey: ["/api/metric-definitions"],
  });
  const { data: companyMetrics = [] } = useQuery<any[]>({
    queryKey: ["/api/metrics"],
    queryFn: () => authFetch("/api/metrics").then((r) => r.json()),
  });

  const libraryMetrics = useMemo<MetricLibraryEntry[]>(
    () => buildMetricLibraryEntries(definitions, companyMetrics),
    [definitions, companyMetrics],
  );

  const seedMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/metric-definitions/seed");
      return response.json() as Promise<{ seeded: number; message: string }>;
    },
    onSuccess: (data: { seeded: number; message: string }) => {
      invalidateMetricDependentQueries(queryClient);
      toast({ title: "Metrics seeded", description: data?.message || "Metric library populated." });
    },
    onError: (e: Error) => toast({ title: "Seed failed", description: e.message, variant: "destructive" }),
  });

  const toggleMutation = useMutation({
    mutationFn: (metric: MetricDefinition) => {
      if (metric.isSyntheticCustom && metric.companyMetricId) {
        return apiRequest("PUT", `/api/metrics/${metric.companyMetricId}`, { enabled: !metric.isActive });
      }
      return apiRequest("PATCH", `/api/metric-definitions/${metric.id}/toggle`);
    },
    onMutate: (metric: MetricDefinition) => setToggling(prev => new Set([...prev, metric.id])),
    onSettled: (_, __, metric: MetricDefinition) => setToggling(prev => { const s = new Set(prev); s.delete(metric.id); return s; }),
    onSuccess: () => {
      invalidateMetricDependentQueries(queryClient);
    },
    onError: (e: Error) => toast({ title: "Toggle failed", description: e.message, variant: "destructive" }),
  });

  const filtered = useMemo(() => {
    return libraryMetrics
      .filter(d => {
        const matchesPillar = pillarFilter === "all" || d.pillar === pillarFilter;
        const matchesStatus = statusFilter === "all" || (statusFilter === "active" && d.isActive) || (statusFilter === "inactive" && !d.isActive) || (statusFilter === "core" && d.isCore) || (statusFilter === "advanced" && !d.isCore);
        const matchesSearch = !search || d.name.toLowerCase().includes(search.toLowerCase()) || d.code.toLowerCase().includes(search.toLowerCase()) || (d.description ?? "").toLowerCase().includes(search.toLowerCase());
        return matchesPillar && matchesStatus && matchesSearch;
      })
      .sort((left, right) => {
        const enabledDelta = Number(right.isActive) - Number(left.isActive);
        if (enabledDelta !== 0) return enabledDelta;
        const recommendedDelta = Number(right.isCore) - Number(left.isCore);
        if (recommendedDelta !== 0) return recommendedDelta;
        const orderDelta = (left.sortOrder ?? Number.MAX_SAFE_INTEGER) - (right.sortOrder ?? Number.MAX_SAFE_INTEGER);
        if (orderDelta !== 0) return orderDelta;
        return left.name.localeCompare(right.name);
      });
  }, [libraryMetrics, pillarFilter, statusFilter, search]);

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

  const visibleCategoryKeys = useMemo(() => pillarOrder.flatMap((pillar) =>
    Object.keys(byPillarAndCategory[pillar] ?? {}).map((category) => `${pillar}:${category}`),
  ), [byPillarAndCategory]);

  const searchIsActive = search.trim().length > 0;

  const setCategoryOpen = (key: string, open: boolean) => {
    setExpandedCategories((current) => {
      const next = new Set(current);
      if (open) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  const stats = useMemo(() => ({
    total: libraryMetrics.length,
    recommended: libraryMetrics.filter(d => d.isCore).length,
    optional: libraryMetrics.filter(d => !d.isCore).length,
    enabled: libraryMetrics.filter(d => d.isActive).length,
    derived: libraryMetrics.filter(d => d.isDerived).length,
  }), [libraryMetrics]);

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="heading-metrics-library">Metrics Library</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {canManageMetrics
              ? "Browse the ESG metric catalogue, turn metrics on or off, or add a new manual metric for your company."
              : "Browse your company’s ESG metric catalogue and see which metrics are enabled. Activation controls are read-only for your role."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canManageMetrics && (
            <Dialog open={showAdd} onOpenChange={setShowAdd}>
              <DialogTrigger asChild>
                <Button data-testid="button-library-add-metric">
                  Add Manual Metric
                </Button>
              </DialogTrigger>
              <AddMetricDialog onClose={() => setShowAdd(false)} />
            </Dialog>
          )}
          {isSuperAdmin && definitions.length === 0 && !isLoading && (
            <Button
              onClick={() => seedMutation.mutate()}
              disabled={seedMutation.isPending}
              data-testid="button-seed-metrics"
            >
              {seedMutation.isPending ? "Loading platform library..." : "Load Platform Metric Library"}
            </Button>
          )}
        </div>
      </div>

      {libraryMetrics.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" data-testid="stats-summary">
          <Card className="p-3">
            <div className="text-2xl font-bold" data-testid="stat-total">{stats.total}</div>
            <div className="text-xs text-muted-foreground">Total metrics</div>
          </Card>
          <Card className="p-3">
            <div className="text-2xl font-bold text-primary" data-testid="stat-core">{stats.recommended}</div>
            <div className="text-xs text-muted-foreground">Recommended defaults</div>
          </Card>
          <Card className="p-3">
            <div className="text-2xl font-bold text-muted-foreground" data-testid="stat-advanced">{stats.optional}</div>
            <div className="text-xs text-muted-foreground">Optional metrics</div>
          </Card>
          <Card className="p-3">
            <div className="text-2xl font-bold text-green-600" data-testid="stat-active">{stats.enabled}</div>
            <div className="text-xs text-muted-foreground">Enabled for your company</div>
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
            <SelectItem value="all">All metrics</SelectItem>
            <SelectItem value="core">Recommended</SelectItem>
            <SelectItem value="advanced">Optional</SelectItem>
            <SelectItem value="active">Enabled</SelectItem>
            <SelectItem value="inactive">Disabled</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2" aria-label="Metric category display controls">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setExpandedCategories(new Set(visibleCategoryKeys))}
            disabled={visibleCategoryKeys.length === 0 || searchIsActive}
            data-testid="button-expand-all-metric-categories"
          >
            Expand all
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setExpandedCategories(new Set())}
            disabled={visibleCategoryKeys.length === 0 || searchIsActive}
            data-testid="button-collapse-all-metric-categories"
          >
            Collapse all
          </Button>
        </div>
      </div>

      <Card className="border-dashed" data-testid="metrics-library-guidance">
        <CardContent className="py-3 text-xs text-muted-foreground">
          {canManageMetrics
            ? <>Start with enabled and recommended metrics. Open only the categories you need, or search for a specific metric. Use <span className="font-medium text-foreground">Metrics</span> to review active metrics and <span className="font-medium text-foreground">Enter Data</span> to add their values.</>
            : <>Your role has read-only access to this catalogue. Open a category or search for a specific metric, then use <span className="font-medium text-foreground">Metrics</span> to review enabled company metrics.</>}
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-32 w-full" />)}
        </div>
      ) : libraryMetrics.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Leaf className="w-12 h-12 text-muted-foreground mb-4" />
            <CardTitle className="mb-2">No metrics in library yet</CardTitle>
            <p className="text-muted-foreground text-sm mb-6 max-w-md">
              {isSuperAdmin
                ? "Load the platform metric library to make the pre-built ESG catalogue available to every company. This platform-wide action is restricted to super admins."
                : "The platform metric library has not been loaded yet. Ask a platform super admin to make the pre-built ESG catalogue available."}
            </p>
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
            const enabledPillarCount = pillarMetrics.filter(m => m.isActive).length;

            return (
              <Card key={pillar} className={`border ${config.border}`} data-testid={`section-pillar-${pillar}`}>
                <CardHeader className={`py-4 rounded-t-lg ${config.bg}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <PillarIcon className={`w-5 h-5 ${config.color}`} />
                      <CardTitle className={`text-base ${config.color}`}>{config.label}</CardTitle>
                    </div>
                    <span className="text-xs text-muted-foreground">{enabledPillarCount}/{pillarMetrics.length} enabled</span>
                  </div>
                </CardHeader>
                <CardContent className="pt-4">
                  <div className="space-y-1">
                    {Object.entries(categories)
                      .sort(([leftName, leftMetrics], [rightName, rightMetrics]) => {
                        const enabledDelta = rightMetrics.filter((metric) => metric.isActive).length - leftMetrics.filter((metric) => metric.isActive).length;
                        if (enabledDelta !== 0) return enabledDelta;
                        const recommendedDelta = rightMetrics.filter((metric) => metric.isCore).length - leftMetrics.filter((metric) => metric.isCore).length;
                        if (recommendedDelta !== 0) return recommendedDelta;
                        return leftName.localeCompare(rightName);
                      })
                      .map(([category, catMetrics]) => {
                        const categoryKey = `${pillar}:${category}`;
                        return (
                          <CategoryGroup
                            key={categoryKey}
                            pillar={pillar}
                            category={category}
                            metrics={catMetrics}
                            open={searchIsActive || expandedCategories.has(categoryKey)}
                            onOpenChange={(open) => setCategoryOpen(categoryKey, open)}
                            onToggle={id => {
                              const metric = libraryMetrics.find((m) => m.id === id);
                              if (metric) toggleMutation.mutate(metric as MetricDefinition);
                            }}
                            toggling={toggling}
                            canToggle={canManageMetrics}
                          />
                        );
                      })}
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
