import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Leaf, Users, Shield, Search, Calculator, FileText,
  ChevronRight, Info, RefreshCw, Lock,
} from "lucide-react";
import { usePermissions } from "@/lib/permissions";

type MetricDefinition = {
  id: string;
  code: string;
  name: string;
  pillar: string;
  category: string;
  description: string | null;
  dataType: string;
  unit: string | null;
  inputFrequency: string;
  isCore: boolean;
  isActive: boolean;
  isDerived: boolean;
  formulaJson: any;
  frameworkTags: string[] | null;
  scoringWeight: string | null;
  sortOrder: number;
  evidenceRequired: boolean | null;
  rollupMethod: string;
};

const PILLAR_CONFIG = {
  environmental: {
    label: "Environmental",
    color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    icon: Leaf,
    iconColor: "text-green-600 dark:text-green-400",
  },
  social: {
    label: "Social",
    color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
    icon: Users,
    iconColor: "text-blue-600 dark:text-blue-400",
  },
  governance: {
    label: "Governance",
    color: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
    icon: Shield,
    iconColor: "text-purple-600 dark:text-purple-400",
  },
};

const FREQUENCY_LABELS: Record<string, string> = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  annual: "Annual",
};

const ROLLUP_LABELS: Record<string, string> = {
  sum: "Sum",
  weighted_average: "Weighted avg",
  latest: "Latest",
  none: "No rollup",
};

function MetricCard({
  def,
  canEdit,
  onToggle,
  onClick,
}: {
  def: MetricDefinition;
  canEdit: boolean;
  onToggle: (id: string, isActive: boolean) => void;
  onClick: (def: MetricDefinition) => void;
}) {
  const pillar = PILLAR_CONFIG[def.pillar as keyof typeof PILLAR_CONFIG];
  const PillarIcon = pillar?.icon ?? Shield;

  return (
    <div
      className="group border rounded-lg p-4 bg-card hover:shadow-sm transition-shadow cursor-pointer"
      onClick={() => onClick(def)}
      data-testid={`metric-card-${def.code}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className={`mt-0.5 shrink-0 ${pillar?.iconColor ?? "text-muted-foreground"}`}>
            {def.isDerived ? <Calculator className="h-4 w-4" /> : <PillarIcon className="h-4 w-4" />}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-sm truncate" data-testid={`metric-name-${def.code}`}>
                {def.name}
              </span>
              <span className="text-xs text-muted-foreground font-mono">{def.code}</span>
            </div>
            {def.description && (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{def.description}</p>
            )}
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {def.isCore ? (
                <Badge variant="default" className="text-xs h-5" data-testid={`badge-core-${def.code}`}>
                  Core
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-xs h-5" data-testid={`badge-advanced-${def.code}`}>
                  Advanced
                </Badge>
              )}
              {def.isDerived && (
                <Badge variant="outline" className="text-xs h-5 gap-1">
                  <Calculator className="h-3 w-3" /> Derived
                </Badge>
              )}
              {def.evidenceRequired && (
                <Badge variant="outline" className="text-xs h-5 gap-1 border-amber-300 text-amber-700 dark:text-amber-400">
                  <FileText className="h-3 w-3" /> Evidence req.
                </Badge>
              )}
              <span className="text-xs text-muted-foreground">
                {FREQUENCY_LABELS[def.inputFrequency] ?? def.inputFrequency}
              </span>
              {def.unit && (
                <span className="text-xs text-muted-foreground">· {def.unit}</span>
              )}
            </div>
          </div>
        </div>

        <div className="shrink-0 flex flex-col items-end gap-2" onClick={e => e.stopPropagation()}>
          {def.isCore ? (
            <div className="flex items-center gap-1 text-xs text-muted-foreground" title="Core metrics are always active">
              <Lock className="h-3 w-3" />
              <span>Always on</span>
            </div>
          ) : canEdit ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{def.isActive ? "Enabled" : "Disabled"}</span>
              <Switch
                checked={def.isActive}
                onCheckedChange={(checked) => onToggle(def.id, checked)}
                data-testid={`toggle-metric-${def.code}`}
              />
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">{def.isActive ? "Enabled" : "Disabled"}</span>
          )}
          <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
        </div>
      </div>
    </div>
  );
}

function MetricDetailDialog({
  def,
  open,
  onClose,
}: {
  def: MetricDefinition | null;
  open: boolean;
  onClose: () => void;
}) {
  if (!def) return null;
  const pillar = PILLAR_CONFIG[def.pillar as keyof typeof PILLAR_CONFIG];
  const tags = Array.isArray(def.frameworkTags) ? def.frameworkTags : [];

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg" data-testid="metric-detail-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className={pillar?.iconColor ?? ""}>{def.code}</span>
            <span>{def.name}</span>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {def.description && (
            <p className="text-sm text-muted-foreground">{def.description}</p>
          )}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-muted-foreground text-xs block">Pillar</span>
              <span className="capitalize">{def.pillar}</span>
            </div>
            <div>
              <span className="text-muted-foreground text-xs block">Category</span>
              <span className="capitalize">{def.category.replace(/_/g, " ")}</span>
            </div>
            <div>
              <span className="text-muted-foreground text-xs block">Data type</span>
              <span className="capitalize">{def.dataType}</span>
            </div>
            <div>
              <span className="text-muted-foreground text-xs block">Unit</span>
              <span>{def.unit ?? "—"}</span>
            </div>
            <div>
              <span className="text-muted-foreground text-xs block">Input frequency</span>
              <span>{FREQUENCY_LABELS[def.inputFrequency] ?? def.inputFrequency}</span>
            </div>
            <div>
              <span className="text-muted-foreground text-xs block">Site rollup</span>
              <span>{ROLLUP_LABELS[def.rollupMethod] ?? def.rollupMethod}</span>
            </div>
            <div>
              <span className="text-muted-foreground text-xs block">Scoring weight</span>
              <span>{def.scoringWeight ?? "1"}</span>
            </div>
            <div>
              <span className="text-muted-foreground text-xs block">Evidence required</span>
              <span>{def.evidenceRequired ? "Yes" : "No"}</span>
            </div>
          </div>
          {def.isDerived && def.formulaJson && (
            <div className="rounded-md bg-muted p-3">
              <p className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                <Calculator className="h-3 w-3" /> Derived metric — calculated automatically
              </p>
              <code className="text-xs">{JSON.stringify(def.formulaJson)}</code>
            </div>
          )}
          {tags.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-2">Framework alignment</p>
              <div className="flex flex-wrap gap-1.5">
                {tags.map(tag => (
                  <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function MetricsLibraryPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const canEdit = can("metrics_data_entry");

  const [search, setSearch] = useState("");
  const [pillarFilter, setPillarFilter] = useState<"all" | "environmental" | "social" | "governance">("all");
  const [typeFilter, setTypeFilter] = useState<"all" | "core" | "advanced">("all");
  const [selectedDef, setSelectedDef] = useState<MetricDefinition | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const { data: allDefs = [], isLoading } = useQuery<MetricDefinition[]>({
    queryKey: ["/api/metric-definitions"],
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiRequest("PATCH", `/api/metric-definitions/${id}/active`, { isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/metric-definitions"] });
    },
    onError: (err: any) => {
      toast({ title: "Failed to update metric", description: err.message, variant: "destructive" });
    },
  });

  const filtered = allDefs.filter(d => {
    if (pillarFilter !== "all" && d.pillar !== pillarFilter) return false;
    if (typeFilter === "core" && !d.isCore) return false;
    if (typeFilter === "advanced" && d.isCore) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!d.name.toLowerCase().includes(q) && !d.code.toLowerCase().includes(q) && !(d.category ?? "").includes(q)) return false;
    }
    return true;
  });

  // Group by pillar then category
  const grouped = filtered.reduce<Record<string, Record<string, MetricDefinition[]>>>((acc, d) => {
    if (!acc[d.pillar]) acc[d.pillar] = {};
    if (!acc[d.pillar][d.category]) acc[d.pillar][d.category] = [];
    acc[d.pillar][d.category].push(d);
    return acc;
  }, {});

  const coreCt = allDefs.filter(d => d.isCore).length;
  const advancedCt = allDefs.filter(d => !d.isCore).length;
  const enabledCt = allDefs.filter(d => d.isActive).length;
  const derivedCt = allDefs.filter(d => d.isDerived).length;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold" data-testid="page-title-metrics-library">
            Metrics Library
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Browse all ESG metrics, understand what's tracked, and enable advanced metrics for deeper reporting.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
          <RefreshCw className="h-3 w-3" />
          <span>{enabledCt} of {allDefs.length} enabled</span>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Core metrics", value: coreCt, icon: Lock, desc: "Always tracked" },
          { label: "Advanced metrics", value: advancedCt, icon: Search, desc: "Enable as needed" },
          { label: "Derived metrics", value: derivedCt, icon: Calculator, desc: "Auto-calculated" },
          { label: "Currently active", value: enabledCt, icon: RefreshCw, desc: "Enabled now" },
        ].map(stat => (
          <Card key={stat.label} className="bg-card" data-testid={`stat-card-${stat.label.replace(/\s+/g, "-").toLowerCase()}`}>
            <CardContent className="p-4">
              <stat.icon className="h-4 w-4 text-muted-foreground mb-2" />
              <div className="text-2xl font-bold">{isLoading ? <Skeleton className="h-7 w-10" /> : stat.value}</div>
              <div className="text-xs font-medium">{stat.label}</div>
              <div className="text-xs text-muted-foreground">{stat.desc}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search metrics..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-search-metrics"
          />
        </div>
        <Tabs value={pillarFilter} onValueChange={v => setPillarFilter(v as any)}>
          <TabsList data-testid="tabs-pillar-filter">
            <TabsTrigger value="all" data-testid="tab-pillar-all">All pillars</TabsTrigger>
            <TabsTrigger value="environmental" data-testid="tab-pillar-environmental">
              <Leaf className="h-3.5 w-3.5 mr-1.5 text-green-600" />Environmental
            </TabsTrigger>
            <TabsTrigger value="social" data-testid="tab-pillar-social">
              <Users className="h-3.5 w-3.5 mr-1.5 text-blue-600" />Social
            </TabsTrigger>
            <TabsTrigger value="governance" data-testid="tab-pillar-governance">
              <Shield className="h-3.5 w-3.5 mr-1.5 text-purple-600" />Governance
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <Tabs value={typeFilter} onValueChange={v => setTypeFilter(v as any)}>
          <TabsList>
            <TabsTrigger value="all" data-testid="tab-type-all">All types</TabsTrigger>
            <TabsTrigger value="core" data-testid="tab-type-core">Core</TabsTrigger>
            <TabsTrigger value="advanced" data-testid="tab-type-advanced">Advanced</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Metric groups */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <Search className="h-8 w-8 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No metrics match your current filters.</p>
          </CardContent>
        </Card>
      ) : (
        Object.entries(grouped).map(([pillar, categories]) => {
          const cfg = PILLAR_CONFIG[pillar as keyof typeof PILLAR_CONFIG];
          const PillarIcon = cfg?.icon ?? Shield;
          return (
            <div key={pillar} className="space-y-4" data-testid={`pillar-section-${pillar}`}>
              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${cfg?.color ?? "bg-muted"}`}>
                <PillarIcon className="h-4 w-4" />
                <span className="font-semibold text-sm capitalize">{pillar}</span>
                <span className="text-xs ml-auto">
                  {Object.values(categories).flat().length} metric{Object.values(categories).flat().length !== 1 ? "s" : ""}
                </span>
              </div>
              {Object.entries(categories).map(([category, defs]) => (
                <div key={category} className="space-y-2 pl-2" data-testid={`category-section-${category}`}>
                  <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide pl-2">
                    {category.replace(/_/g, " ")}
                  </h3>
                  {defs.map(def => (
                    <MetricCard
                      key={def.id}
                      def={def}
                      canEdit={canEdit}
                      onToggle={(id, isActive) => toggleMutation.mutate({ id, isActive })}
                      onClick={d => { setSelectedDef(d); setDetailOpen(true); }}
                    />
                  ))}
                </div>
              ))}
            </div>
          );
        })
      )}

      <MetricDetailDialog
        def={selectedDef}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
      />
    </div>
  );
}
