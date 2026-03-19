import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { usePermissions } from "@/lib/permissions";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  BarChart3, Network, Layers, ArrowLeftRight, Tags, Sliders,
  Plus, Pencil, ToggleLeft, ToggleRight, RefreshCw, Search, Check, X, Trash2,
} from "lucide-react";
import { useLocation } from "wouter";
import type {
  MetricDefinition,
  Framework,
  FrameworkRequirement,
  MetricFrameworkMapping,
  MaterialTopic,
} from "@shared/schema";

function PillarBadge({ pillar }: { pillar: string }) {
  const map: Record<string, string> = {
    environmental: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    social: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    governance: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  };
  return <Badge className={map[pillar] || ""}>{pillar}</Badge>;
}

// ============================================================
// METRIC DEFINITIONS TAB
// ============================================================
function MetricDefinitionsTab() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [pillarFilter, setPillarFilter] = useState("all");
  const [showInactive, setShowInactive] = useState(false);
  const [editDef, setEditDef] = useState<MetricDefinition | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const { data: defs = [], isLoading } = useQuery<MetricDefinition[]>({
    queryKey: ["/api/admin/metric-definitions", pillarFilter, showInactive],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (pillarFilter !== "all") params.set("pillar", pillarFilter);
      if (!showInactive) params.set("isActive", "true");
      const res = await apiRequest("GET", `/api/admin/metric-definitions?${params}`);
      return res.json();
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (id: string) => apiRequest("PATCH", `/api/admin/metric-definitions/${id}/toggle-active`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/metric-definitions"] });
      toast({ title: "Status updated" });
    },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<MetricDefinition> }) =>
      apiRequest("PATCH", `/api/admin/metric-definitions/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/metric-definitions"] });
      setEditDef(null);
      toast({ title: "Metric definition updated" });
    },
    onError: (e: Error) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });

  const createMutation = useMutation({
    mutationFn: (data: Partial<MetricDefinition>) => apiRequest("POST", "/api/admin/metric-definitions", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/metric-definitions"] });
      setShowCreate(false);
      toast({ title: "Metric definition created" });
    },
    onError: (e: Error) => toast({ title: "Create failed", description: e.message, variant: "destructive" }),
  });

  const filtered = defs.filter(d => {
    if (!search) return true;
    return d.name?.toLowerCase().includes(search.toLowerCase()) || d.code?.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Search by name or code…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm"
            data-testid="input-search-metric-defs"
          />
        </div>
        <Select value={pillarFilter} onValueChange={setPillarFilter}>
          <SelectTrigger className="w-36 h-8 text-sm" data-testid="select-pillar-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Pillars</SelectItem>
            <SelectItem value="environmental">Environmental</SelectItem>
            <SelectItem value="social">Social</SelectItem>
            <SelectItem value="governance">Governance</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2 text-sm">
          <Switch checked={showInactive} onCheckedChange={setShowInactive} id="show-inactive" />
          <Label htmlFor="show-inactive" className="text-xs cursor-pointer">Show inactive</Label>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)} data-testid="button-create-metric-def" className="gap-1.5">
          <Plus className="w-3.5 h-3.5" /> New Definition
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">No metric definitions found.</div>
      ) : (
        <div className="border border-border rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-xs">Code</th>
                <th className="text-left px-3 py-2 font-medium text-xs">Name</th>
                <th className="text-left px-3 py-2 font-medium text-xs">Pillar</th>
                <th className="text-left px-3 py-2 font-medium text-xs">Category</th>
                <th className="text-left px-3 py-2 font-medium text-xs">Unit</th>
                <th className="text-left px-3 py-2 font-medium text-xs">Weight</th>
                <th className="text-left px-3 py-2 font-medium text-xs">Core</th>
                <th className="text-left px-3 py-2 font-medium text-xs">Status</th>
                <th className="text-right px-3 py-2 font-medium text-xs">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((d) => (
                <tr key={d.id} className={`border-t border-border ${!d.isActive ? "opacity-50" : ""}`} data-testid={`row-metric-def-${d.id}`}>
                  <td className="px-3 py-2 font-mono text-xs">{d.code}</td>
                  <td className="px-3 py-2">{d.name}</td>
                  <td className="px-3 py-2"><PillarBadge pillar={d.pillar} /></td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{d.category}</td>
                  <td className="px-3 py-2 text-xs">{d.unit || "—"}</td>
                  <td className="px-3 py-2 text-xs">{d.scoringWeight ?? "1"}</td>
                  <td className="px-3 py-2 text-xs">{d.isCore ? <Check className="w-3.5 h-3.5 text-green-600" /> : <X className="w-3.5 h-3.5 text-muted-foreground" />}</td>
                  <td className="px-3 py-2">
                    <Badge variant={d.isActive ? "default" : "secondary"}>{d.isActive ? "Active" : "Inactive"}</Badge>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setEditDef(d)} data-testid={`button-edit-metric-def-${d.id}`}>
                        <Pencil className="w-3 h-3" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => toggleMutation.mutate(d.id)} data-testid={`button-toggle-metric-def-${d.id}`}>
                        {d.isActive ? <ToggleRight className="w-4 h-4 text-green-600" /> : <ToggleLeft className="w-4 h-4 text-muted-foreground" />}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <MetricDefEditDialog
        def={editDef}
        open={!!editDef}
        onClose={() => setEditDef(null)}
        onSave={data => updateMutation.mutate({ id: editDef.id, data })}
        saving={updateMutation.isPending}
      />
      <MetricDefCreateDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onSave={data => createMutation.mutate(data)}
        saving={createMutation.isPending}
      />
    </div>
  );
}

function MetricDefEditDialog({ def, open, onClose, onSave, saving }: {
  def: MetricDefinition | null;
  open: boolean;
  onClose: () => void;
  onSave: (data: Partial<MetricDefinition>) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<Partial<MetricDefinition>>({});
  const f = (k: keyof MetricDefinition): string => String(form[k] !== undefined ? form[k] : def?.[k] ?? "");
  const fBool = (k: keyof MetricDefinition): boolean => Boolean(form[k] !== undefined ? form[k] : def?.[k]);
  const set = (k: keyof MetricDefinition, v: unknown) => setForm((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    setForm({});
  }, [def?.id]);

  if (!def) return null;
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit: {def.code}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2 max-h-[60vh] overflow-y-auto pr-1">
          <div>
            <Label className="text-xs">Name</Label>
            <Input className="h-8 text-sm" value={f("name")} onChange={e => set("name", e.target.value)} data-testid="input-edit-md-name" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Pillar</Label>
              <Select value={f("pillar")} onValueChange={v => set("pillar", v)}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="environmental">Environmental</SelectItem>
                  <SelectItem value="social">Social</SelectItem>
                  <SelectItem value="governance">Governance</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Category</Label>
              <Input className="h-8 text-sm" value={f("category")} onChange={e => set("category", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Unit</Label>
              <Input className="h-8 text-sm" value={f("unit")} onChange={e => set("unit", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Scoring Weight</Label>
              <Input type="number" step="0.1" className="h-8 text-sm" value={f("scoringWeight")} onChange={e => set("scoringWeight", e.target.value)} data-testid="input-edit-md-weight" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Description</Label>
            <Textarea rows={2} className="text-sm" value={f("description")} onChange={e => set("description", e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Framework Tags</Label>
            <p className="text-xs text-muted-foreground mb-1">Comma-separated framework codes that this metric supports (e.g. GRI_302, TCFD, GHG_PROTOCOL)</p>
            <Input
              className="h-8 text-sm"
              value={Array.isArray(f("frameworkTags")) ? f("frameworkTags").join(", ") : (f("frameworkTags") || "")}
              onChange={e => set("frameworkTags", e.target.value.split(",").map((s: string) => s.trim()).filter(Boolean))}
              placeholder="GRI_302, TCFD, GHG_PROTOCOL"
              data-testid="input-edit-md-framework-tags"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Input Frequency</Label>
              <Select value={f("inputFrequency")} onValueChange={v => set("inputFrequency", v)}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="quarterly">Quarterly</SelectItem>
                  <SelectItem value="annual">Annual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Rollup Method</Label>
              <Select value={f("rollupMethod")} onValueChange={v => set("rollupMethod", v)}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sum">Sum</SelectItem>
                  <SelectItem value="weighted_average">Weighted Average</SelectItem>
                  <SelectItem value="latest">Latest</SelectItem>
                  <SelectItem value="none">None</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex gap-6 flex-wrap">
            <div className="flex items-center gap-2">
              <Switch checked={fBool("isCore")} onCheckedChange={v => set("isCore", v)} id="md-isCore" />
              <Label htmlFor="md-isCore" className="text-xs">Core metric</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={fBool("evidenceRequired")} onCheckedChange={v => set("evidenceRequired", v)} id="md-evid" />
              <Label htmlFor="md-evid" className="text-xs">Evidence required</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={fBool("isDerived")} onCheckedChange={v => set("isDerived", v)} id="md-isDerived" />
              <Label htmlFor="md-isDerived" className="text-xs">Derived metric</Label>
            </div>
          </div>
          {fBool("isDerived") && (
            <div>
              <Label className="text-xs">Formula JSON</Label>
              <p className="text-xs text-muted-foreground mb-1">
                JSON describing how this metric is derived from other metrics. Example: <code className="text-xs bg-muted px-1 rounded">{"{ \"operation\": \"sum\", \"metricCodes\": [\"ENV_GHG_SCOPE1\", \"ENV_GHG_SCOPE2\"] }"}</code>
              </p>
              <Textarea
                rows={4}
                className="text-xs font-mono"
                value={typeof f("formulaJson") === "string" ? f("formulaJson") : (f("formulaJson") ? JSON.stringify(f("formulaJson"), null, 2) : "")}
                onChange={e => {
                  try {
                    const parsed = JSON.parse(e.target.value);
                    set("formulaJson", parsed);
                  } catch {
                    set("formulaJson", e.target.value);
                  }
                }}
                placeholder='{ "operation": "sum", "metricCodes": [] }'
                data-testid="textarea-formula-json"
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={() => onSave(form)} disabled={saving} data-testid="button-save-metric-def">
            {saving ? "Saving…" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MetricDefCreateDialog({ open, onClose, onSave, saving }: {
  open: boolean;
  onClose: () => void;
  onSave: (data: Partial<MetricDefinition>) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState({ code: "", name: "", pillar: "environmental", category: "", unit: "", dataType: "numeric", inputFrequency: "quarterly", scoringWeight: "1", isCore: false, evidenceRequired: false, rollupMethod: "sum", description: "", frameworkTags: [] as string[] });
  const set = (k: string, v: unknown) => setForm(p => ({ ...p, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New Metric Definition</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2 max-h-[60vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Code <span className="text-red-500">*</span></Label>
              <Input className="h-8 text-sm font-mono" value={form.code} onChange={e => set("code", e.target.value)} placeholder="ENV_GHG_001" data-testid="input-create-md-code" />
            </div>
            <div>
              <Label className="text-xs">Name <span className="text-red-500">*</span></Label>
              <Input className="h-8 text-sm" value={form.name} onChange={e => set("name", e.target.value)} placeholder="GHG Emissions" data-testid="input-create-md-name" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Pillar <span className="text-red-500">*</span></Label>
              <Select value={form.pillar} onValueChange={v => set("pillar", v)}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="environmental">Environmental</SelectItem>
                  <SelectItem value="social">Social</SelectItem>
                  <SelectItem value="governance">Governance</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Category <span className="text-red-500">*</span></Label>
              <Input className="h-8 text-sm" value={form.category} onChange={e => set("category", e.target.value)} placeholder="emissions" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Unit</Label>
              <Input className="h-8 text-sm" value={form.unit} onChange={e => set("unit", e.target.value)} placeholder="kgCO2e" />
            </div>
            <div>
              <Label className="text-xs">Data Type</Label>
              <Select value={form.dataType} onValueChange={v => set("dataType", v)}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="numeric">Numeric</SelectItem>
                  <SelectItem value="percentage">Percentage</SelectItem>
                  <SelectItem value="boolean">Boolean</SelectItem>
                  <SelectItem value="text">Text</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Input Frequency</Label>
              <Select value={form.inputFrequency} onValueChange={v => set("inputFrequency", v)}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="quarterly">Quarterly</SelectItem>
                  <SelectItem value="annual">Annual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Scoring Weight</Label>
              <Input type="number" step="0.1" className="h-8 text-sm" value={form.scoringWeight} onChange={e => set("scoringWeight", e.target.value)} />
            </div>
          </div>
          <div>
            <Label className="text-xs">Description</Label>
            <Textarea rows={2} className="text-sm" value={form.description} onChange={e => set("description", e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Framework Tags</Label>
            <p className="text-xs text-muted-foreground mb-1">Comma-separated framework codes (e.g. GRI_302, TCFD)</p>
            <Input
              className="h-8 text-sm"
              value={form.frameworkTags.join(", ")}
              onChange={e => set("frameworkTags", e.target.value.split(",").map((s: string) => s.trim()).filter(Boolean))}
              placeholder="GRI_302, TCFD"
              data-testid="input-create-md-framework-tags"
            />
          </div>
          <div className="flex gap-6">
            <div className="flex items-center gap-2">
              <Switch checked={form.isCore} onCheckedChange={v => set("isCore", v)} id="new-isCore" />
              <Label htmlFor="new-isCore" className="text-xs">Core metric</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.evidenceRequired} onCheckedChange={v => set("evidenceRequired", v)} id="new-evid" />
              <Label htmlFor="new-evid" className="text-xs">Evidence required</Label>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={() => onSave(form)} disabled={saving || !form.code || !form.name} data-testid="button-save-create-metric-def">
            {saving ? "Creating…" : "Create Definition"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// FRAMEWORKS TAB
// ============================================================
function FrameworksTab() {
  const { toast } = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [editFw, setEditFw] = useState<Framework | null>(null);

  const { data: frameworks = [], isLoading } = useQuery<Framework[]>({
    queryKey: ["/api/admin/frameworks"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/frameworks");
      return res.json();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Framework> }) =>
      apiRequest("PATCH", `/api/admin/frameworks/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/frameworks"] });
      setEditFw(null);
      toast({ title: "Framework updated" });
    },
    onError: (e: Error) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });

  const createMutation = useMutation({
    mutationFn: (data: Partial<Framework>) => apiRequest("POST", "/api/admin/frameworks", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/frameworks"] });
      setShowCreate(false);
      toast({ title: "Framework created" });
    },
    onError: (e: Error) => toast({ title: "Create failed", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Manage ESG framework definitions available on the platform.</p>
        <Button size="sm" onClick={() => setShowCreate(true)} data-testid="button-create-framework" className="gap-1.5">
          <Plus className="w-3.5 h-3.5" /> New Framework
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : (
        <div className="border border-border rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-xs">Code</th>
                <th className="text-left px-3 py-2 font-medium text-xs">Name</th>
                <th className="text-left px-3 py-2 font-medium text-xs">Full Name</th>
                <th className="text-left px-3 py-2 font-medium text-xs">Version</th>
                <th className="text-left px-3 py-2 font-medium text-xs">Status</th>
                <th className="text-right px-3 py-2 font-medium text-xs">Actions</th>
              </tr>
            </thead>
            <tbody>
              {frameworks.map((fw) => (
                <tr key={fw.id} className="border-t border-border" data-testid={`row-framework-${fw.id}`}>
                  <td className="px-3 py-2 font-mono text-xs">{fw.code}</td>
                  <td className="px-3 py-2 font-medium">{fw.name}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{fw.fullName || "—"}</td>
                  <td className="px-3 py-2 text-xs">{fw.version || "—"}</td>
                  <td className="px-3 py-2">
                    <Badge variant={fw.isActive ? "default" : "secondary"}>{fw.isActive ? "Active" : "Inactive"}</Badge>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setEditFw(fw)} data-testid={`button-edit-framework-${fw.id}`}>
                      <Pencil className="w-3 h-3" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editFw && (
        <Dialog open onOpenChange={() => setEditFw(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Edit Framework: {editFw.code}</DialogTitle></DialogHeader>
            <FrameworkForm
              initial={editFw}
              onSave={data => updateMutation.mutate({ id: editFw.id, data })}
              onCancel={() => setEditFw(null)}
              saving={updateMutation.isPending}
            />
          </DialogContent>
        </Dialog>
      )}

      {showCreate && (
        <Dialog open onOpenChange={() => setShowCreate(false)}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>New Framework</DialogTitle></DialogHeader>
            <FrameworkForm
              onSave={data => createMutation.mutate(data)}
              onCancel={() => setShowCreate(false)}
              saving={createMutation.isPending}
              isCreate
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function FrameworkForm({ initial, onSave, onCancel, saving, isCreate }: {
  initial?: Partial<Framework> | null;
  onSave: (data: Partial<Framework>) => void;
  onCancel: () => void;
  saving: boolean;
  isCreate?: boolean;
}) {
  const [form, setForm] = useState({
    code: initial?.code || "",
    name: initial?.name || "",
    fullName: initial?.fullName || "",
    description: initial?.description || "",
    version: initial?.version || "",
    isActive: initial?.isActive ?? true,
  });
  const set = (k: string, v: unknown) => setForm(p => ({ ...p, [k]: v }));

  return (
    <>
      <div className="space-y-3 py-2">
        {isCreate && (
          <div>
            <Label className="text-xs">Code <span className="text-red-500">*</span></Label>
            <Input className="h-8 text-sm font-mono" value={form.code} onChange={e => set("code", e.target.value)} placeholder="GRI" data-testid="input-fw-code" />
          </div>
        )}
        <div>
          <Label className="text-xs">Name <span className="text-red-500">*</span></Label>
          <Input className="h-8 text-sm" value={form.name} onChange={e => set("name", e.target.value)} placeholder="GRI Standards" data-testid="input-fw-name" />
        </div>
        <div>
          <Label className="text-xs">Full Name</Label>
          <Input className="h-8 text-sm" value={form.fullName} onChange={e => set("fullName", e.target.value)} placeholder="Global Reporting Initiative Standards" />
        </div>
        <div>
          <Label className="text-xs">Version</Label>
          <Input className="h-8 text-sm" value={form.version} onChange={e => set("version", e.target.value)} placeholder="2021" />
        </div>
        <div>
          <Label className="text-xs">Description</Label>
          <Textarea rows={2} className="text-sm" value={form.description} onChange={e => set("description", e.target.value)} />
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={form.isActive} onCheckedChange={v => set("isActive", v)} id="fw-active" />
          <Label htmlFor="fw-active" className="text-xs">Active</Label>
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
        <Button size="sm" onClick={() => onSave(form)} disabled={saving || !form.name} data-testid="button-save-framework">
          {saving ? "Saving…" : isCreate ? "Create" : "Save Changes"}
        </Button>
      </DialogFooter>
    </>
  );
}

// ============================================================
// FRAMEWORK REQUIREMENTS TAB
// ============================================================
function FrameworkRequirementsTab() {
  const { toast } = useToast();
  const [fwFilter, setFwFilter] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [editReq, setEditReq] = useState<FrameworkRequirement | null>(null);

  const { data: frameworks = [] } = useQuery<Framework[]>({
    queryKey: ["/api/admin/frameworks"],
    queryFn: async () => (await apiRequest("GET", "/api/admin/frameworks")).json(),
  });

  const { data: reqs = [], isLoading } = useQuery<FrameworkRequirement[]>({
    queryKey: ["/api/admin/framework-requirements", fwFilter],
    queryFn: async () => {
      const params = fwFilter !== "all" ? `?frameworkId=${fwFilter}` : "";
      return (await apiRequest("GET", `/api/admin/framework-requirements${params}`)).json();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/admin/framework-requirements/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/framework-requirements"] });
      toast({ title: "Requirement deleted" });
    },
    onError: (e: Error) => toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<FrameworkRequirement> }) =>
      apiRequest("PATCH", `/api/admin/framework-requirements/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/framework-requirements"] });
      setEditReq(null);
      toast({ title: "Requirement updated" });
    },
    onError: (e: Error) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });

  const createMutation = useMutation({
    mutationFn: (data: Partial<FrameworkRequirement>) => apiRequest("POST", "/api/admin/framework-requirements", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/framework-requirements"] });
      setShowCreate(false);
      toast({ title: "Requirement created" });
    },
    onError: (e: Error) => toast({ title: "Create failed", description: e.message, variant: "destructive" }),
  });

  const fwMap = Object.fromEntries(frameworks.map(f => [f.id, f.name]));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={fwFilter} onValueChange={setFwFilter}>
          <SelectTrigger className="w-48 h-8 text-sm" data-testid="select-fw-req-filter">
            <SelectValue placeholder="Filter by framework" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Frameworks</SelectItem>
            {frameworks.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="sm" onClick={() => setShowCreate(true)} data-testid="button-create-fw-req" className="gap-1.5 ml-auto">
          <Plus className="w-3.5 h-3.5" /> New Requirement
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
      ) : (
        <div className="border border-border rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-xs">Framework</th>
                <th className="text-left px-3 py-2 font-medium text-xs">Code</th>
                <th className="text-left px-3 py-2 font-medium text-xs">Title</th>
                <th className="text-left px-3 py-2 font-medium text-xs">Type</th>
                <th className="text-left px-3 py-2 font-medium text-xs">Level</th>
                <th className="text-right px-3 py-2 font-medium text-xs">Actions</th>
              </tr>
            </thead>
            <tbody>
              {reqs.map((r) => (
                <tr key={r.id} className="border-t border-border" data-testid={`row-fw-req-${r.id}`}>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{fwMap[r.frameworkId] || r.frameworkId}</td>
                  <td className="px-3 py-2 font-mono text-xs">{r.code}</td>
                  <td className="px-3 py-2 text-xs">{r.title}</td>
                  <td className="px-3 py-2 text-xs">{r.requirementType}</td>
                  <td className="px-3 py-2"><Badge variant="outline" className="text-xs">{r.mandatoryLevel}</Badge></td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setEditReq(r)}>
                        <Pencil className="w-3 h-3" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive" onClick={() => deleteMutation.mutate(r.id)} data-testid={`button-delete-fw-req-${r.id}`}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editReq && (
        <Dialog open onOpenChange={() => setEditReq(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Edit Requirement</DialogTitle></DialogHeader>
            <FwReqForm initial={editReq} frameworks={frameworks} onSave={data => updateMutation.mutate({ id: editReq.id, data })} onCancel={() => setEditReq(null)} saving={updateMutation.isPending} />
          </DialogContent>
        </Dialog>
      )}
      {showCreate && (
        <Dialog open onOpenChange={() => setShowCreate(false)}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>New Framework Requirement</DialogTitle></DialogHeader>
            <FwReqForm frameworks={frameworks} onSave={data => createMutation.mutate(data)} onCancel={() => setShowCreate(false)} saving={createMutation.isPending} isCreate />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function FwReqForm({ initial, frameworks, onSave, onCancel, saving, isCreate }: {
  initial?: Partial<FrameworkRequirement> | null;
  frameworks: Framework[];
  onSave: (data: Partial<FrameworkRequirement>) => void;
  onCancel: () => void;
  saving: boolean;
  isCreate?: boolean;
}) {
  const [form, setForm] = useState({
    frameworkId: initial?.frameworkId || "",
    code: initial?.code || "",
    title: initial?.title || "",
    description: initial?.description || "",
    requirementType: initial?.requirementType || "metric",
    pillar: initial?.pillar || "",
    mandatoryLevel: initial?.mandatoryLevel || "core",
    sortOrder: initial?.sortOrder ?? 0,
  });
  const set = (k: string, v: unknown) => setForm(p => ({ ...p, [k]: v }));

  return (
    <>
      <div className="space-y-3 py-2 max-h-[50vh] overflow-y-auto pr-1">
        {isCreate && (
          <div>
            <Label className="text-xs">Framework <span className="text-red-500">*</span></Label>
            <Select value={form.frameworkId} onValueChange={v => set("frameworkId", v)}>
              <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select framework" /></SelectTrigger>
              <SelectContent>
                {frameworks.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        {isCreate && (
          <div>
            <Label className="text-xs">Code <span className="text-red-500">*</span></Label>
            <Input className="h-8 text-sm font-mono" value={form.code} onChange={e => set("code", e.target.value)} placeholder="GRI-305-1" data-testid="input-req-code" />
          </div>
        )}
        <div>
          <Label className="text-xs">Title <span className="text-red-500">*</span></Label>
          <Input className="h-8 text-sm" value={form.title} onChange={e => set("title", e.target.value)} data-testid="input-req-title" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Type</Label>
            <Select value={form.requirementType} onValueChange={v => set("requirementType", v)}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="metric">Metric</SelectItem>
                <SelectItem value="narrative">Narrative</SelectItem>
                <SelectItem value="policy">Policy</SelectItem>
                <SelectItem value="target">Target</SelectItem>
                <SelectItem value="risk">Risk</SelectItem>
                <SelectItem value="evidence">Evidence</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Mandatory Level</Label>
            <Select value={form.mandatoryLevel} onValueChange={v => set("mandatoryLevel", v)}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="core">Core</SelectItem>
                <SelectItem value="conditional">Conditional</SelectItem>
                <SelectItem value="advanced">Advanced</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <Label className="text-xs">Description</Label>
          <Textarea rows={2} className="text-sm" value={form.description} onChange={e => set("description", e.target.value)} />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
        <Button size="sm" onClick={() => onSave(form)} disabled={saving || !form.title || (isCreate && (!form.frameworkId || !form.code))} data-testid="button-save-fw-req">
          {saving ? "Saving…" : isCreate ? "Create" : "Save Changes"}
        </Button>
      </DialogFooter>
    </>
  );
}

// ============================================================
// METRIC-FRAMEWORK MAPPINGS TAB
// ============================================================
function MetricFrameworkMappingsTab() {
  const { toast } = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [editMapping, setEditMapping] = useState<MetricFrameworkMapping | null>(null);

  const { data: mappings = [], isLoading } = useQuery<MetricFrameworkMapping[]>({
    queryKey: ["/api/admin/metric-framework-mappings"],
    queryFn: async () => (await apiRequest("GET", "/api/admin/metric-framework-mappings")).json(),
  });

  const { data: metricDefs = [] } = useQuery<MetricDefinition[]>({
    queryKey: ["/api/admin/metric-definitions"],
    queryFn: async () => (await apiRequest("GET", "/api/admin/metric-definitions?isActive=true")).json(),
  });

  const { data: fwReqs = [] } = useQuery<FrameworkRequirement[]>({
    queryKey: ["/api/admin/framework-requirements"],
    queryFn: async () => (await apiRequest("GET", "/api/admin/framework-requirements")).json(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/admin/metric-framework-mappings/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/metric-framework-mappings"] });
      toast({ title: "Mapping deleted" });
    },
    onError: (e: Error) => toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
  });

  const createMutation = useMutation({
    mutationFn: (data: Partial<MetricFrameworkMapping>) => apiRequest("POST", "/api/admin/metric-framework-mappings", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/metric-framework-mappings"] });
      setShowCreate(false);
      toast({ title: "Mapping created" });
    },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: Partial<MetricFrameworkMapping> & { id: string }) =>
      apiRequest("PATCH", `/api/admin/metric-framework-mappings/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/metric-framework-mappings"] });
      setEditMapping(null);
      toast({ title: "Mapping updated" });
    },
    onError: (e: Error) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });

  const mdMap = Object.fromEntries(metricDefs.map(d => [d.id, d.name]));
  const reqMap = Object.fromEntries(fwReqs.map(r => [r.id, r.title]));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Map metric definitions to framework requirements to drive readiness scoring.</p>
        <Button size="sm" onClick={() => setShowCreate(true)} data-testid="button-create-mapping" className="gap-1.5">
          <Plus className="w-3.5 h-3.5" /> New Mapping
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
      ) : (
        <div className="border border-border rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-xs">Metric Definition</th>
                <th className="text-left px-3 py-2 font-medium text-xs">Framework Requirement</th>
                <th className="text-left px-3 py-2 font-medium text-xs">Strength</th>
                <th className="text-right px-3 py-2 font-medium text-xs">Actions</th>
              </tr>
            </thead>
            <tbody>
              {mappings.map((m) => (
                <tr key={m.id} className="border-t border-border" data-testid={`row-mapping-${m.id}`}>
                  <td className="px-3 py-2 text-xs">{mdMap[m.metricDefinitionId] || m.metricDefinitionId}</td>
                  <td className="px-3 py-2 text-xs">{reqMap[m.frameworkRequirementId] || m.frameworkRequirementId}</td>
                  <td className="px-3 py-2"><Badge variant="outline" className="text-xs">{m.mappingStrength}</Badge></td>
                  <td className="px-3 py-2 text-right flex items-center justify-end gap-1">
                    <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setEditMapping(m)} data-testid={`button-edit-mapping-${m.id}`}>
                      <Pencil className="w-3 h-3" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive" onClick={() => deleteMutation.mutate(m.id)} data-testid={`button-delete-mapping-${m.id}`}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <Dialog open onOpenChange={() => setShowCreate(false)}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>New Metric-Framework Mapping</DialogTitle></DialogHeader>
            <MappingCreateForm
              metricDefs={metricDefs}
              fwReqs={fwReqs}
              onSave={data => createMutation.mutate(data)}
              onCancel={() => setShowCreate(false)}
              saving={createMutation.isPending}
            />
          </DialogContent>
        </Dialog>
      )}

      {editMapping && (
        <Dialog open onOpenChange={() => setEditMapping(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Edit Mapping</DialogTitle></DialogHeader>
            <MappingEditForm
              mapping={editMapping}
              mdMap={mdMap}
              reqMap={reqMap}
              onSave={data => updateMutation.mutate({ id: editMapping.id, ...data })}
              onCancel={() => setEditMapping(null)}
              saving={updateMutation.isPending}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function MappingCreateForm({ metricDefs, fwReqs, onSave, onCancel, saving }: {
  metricDefs: MetricDefinition[];
  fwReqs: FrameworkRequirement[];
  onSave: (data: Partial<MetricFrameworkMapping>) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState({ metricDefinitionId: "", frameworkRequirementId: "", mappingStrength: "direct", notes: "" });
  const set = (k: string, v: unknown) => setForm(p => ({ ...p, [k]: v }));

  return (
    <>
      <div className="space-y-3 py-2">
        <div>
          <Label className="text-xs">Metric Definition <span className="text-red-500">*</span></Label>
          <Select value={form.metricDefinitionId} onValueChange={v => set("metricDefinitionId", v)}>
            <SelectTrigger className="h-8 text-sm" data-testid="select-mapping-metric"><SelectValue placeholder="Select metric" /></SelectTrigger>
            <SelectContent>
              {metricDefs.map((d) => <SelectItem key={d.id} value={d.id}>{d.name} ({d.code})</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Framework Requirement <span className="text-red-500">*</span></Label>
          <Select value={form.frameworkRequirementId} onValueChange={v => set("frameworkRequirementId", v)}>
            <SelectTrigger className="h-8 text-sm" data-testid="select-mapping-req"><SelectValue placeholder="Select requirement" /></SelectTrigger>
            <SelectContent>
              {fwReqs.map((r) => <SelectItem key={r.id} value={r.id}>{r.code} — {r.title}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Mapping Strength</Label>
          <Select value={form.mappingStrength} onValueChange={v => set("mappingStrength", v)}>
            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="direct">Direct</SelectItem>
              <SelectItem value="partial">Partial</SelectItem>
              <SelectItem value="supporting">Supporting</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Notes</Label>
          <Textarea rows={2} className="text-sm" value={form.notes} onChange={e => set("notes", e.target.value)} />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
        <Button size="sm" onClick={() => onSave(form)} disabled={saving || !form.metricDefinitionId || !form.frameworkRequirementId} data-testid="button-save-mapping">
          {saving ? "Saving…" : "Create Mapping"}
        </Button>
      </DialogFooter>
    </>
  );
}

function MappingEditForm({ mapping, mdMap, reqMap, onSave, onCancel, saving }: {
  mapping: MetricFrameworkMapping;
  mdMap: Record<string, string>;
  reqMap: Record<string, string>;
  onSave: (data: Partial<MetricFrameworkMapping>) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState({ mappingStrength: mapping.mappingStrength || "direct", notes: mapping.notes || "" });
  const set = (k: string, v: unknown) => setForm(p => ({ ...p, [k]: v }));

  return (
    <>
      <div className="space-y-3 py-2">
        <div>
          <Label className="text-xs text-muted-foreground">Metric Definition</Label>
          <p className="text-sm font-medium">{mdMap[mapping.metricDefinitionId] || mapping.metricDefinitionId}</p>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Framework Requirement</Label>
          <p className="text-sm font-medium">{reqMap[mapping.frameworkRequirementId] || mapping.frameworkRequirementId}</p>
        </div>
        <div>
          <Label className="text-xs">Mapping Strength</Label>
          <Select value={form.mappingStrength} onValueChange={v => set("mappingStrength", v)}>
            <SelectTrigger className="h-8 text-sm" data-testid="select-edit-mapping-strength"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="direct">Direct</SelectItem>
              <SelectItem value="partial">Partial</SelectItem>
              <SelectItem value="supporting">Supporting</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Notes</Label>
          <Textarea rows={2} className="text-sm" value={form.notes} onChange={e => set("notes", e.target.value)} data-testid="textarea-edit-mapping-notes" />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
        <Button size="sm" onClick={() => onSave(form)} disabled={saving} data-testid="button-save-edit-mapping">
          {saving ? "Saving…" : "Save Changes"}
        </Button>
      </DialogFooter>
    </>
  );
}

// ============================================================
// SCORING CONFIG TAB
// ============================================================
function ScoringConfigTab() {
  const { toast } = useToast();
  const [editPillar, setEditPillar] = useState<string | null>(null);
  const [newWeight, setNewWeight] = useState("");
  const [editingDimWeights, setEditingDimWeights] = useState(false);
  const [dimWeights, setDimWeights] = useState<Record<string, number>>({});

  type ScoringConfig = {
    currentWeights: Array<{ pillar: string; count: number; avgWeight: string }>;
    dimensions: string[];
    dimensionWeights: Record<string, number>;
    description: string;
  };

  const { data: config, isLoading, refetch } = useQuery<ScoringConfig>({
    queryKey: ["/api/admin/scoring-config"],
    queryFn: async () => (await apiRequest("GET", "/api/admin/scoring-config")).json(),
  });

  const updateMutation = useMutation({
    mutationFn: (data: { pillar: string; scoringWeight: number }) => apiRequest("PATCH", "/api/admin/scoring-config/pillar-weights", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/scoring-config"] });
      setEditPillar(null);
      toast({ title: "Scoring weights updated" });
    },
    onError: (e: Error) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });

  const dimWeightMutation = useMutation({
    mutationFn: (data: Record<string, number>) => apiRequest("PATCH", "/api/admin/scoring-config/dimension-weights", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/scoring-config"] });
      setEditingDimWeights(false);
      toast({ title: "Dimension weights updated" });
    },
    onError: (e: Error) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Platform Scoring Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">{config?.description}</p>
          {isLoading ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
          ) : (
            <div className="space-y-2">
              {(config?.currentWeights ?? []).map((w) => (
                <div key={w.pillar} className="flex items-center gap-3 p-3 rounded-md border border-border" data-testid={`scoring-pillar-${w.pillar}`}>
                  <PillarBadge pillar={w.pillar} />
                  <div className="flex-1">
                    <p className="text-xs text-muted-foreground">{w.count} metrics · avg weight {w.avgWeight}</p>
                  </div>
                  {editPillar === w.pillar ? (
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        step="0.1"
                        min="0"
                        max="5"
                        value={newWeight}
                        onChange={e => setNewWeight(e.target.value)}
                        className="w-20 h-7 text-sm"
                        data-testid={`input-pillar-weight-${w.pillar}`}
                      />
                      <Button size="sm" className="h-7 px-2" onClick={() => updateMutation.mutate({ pillar: w.pillar, scoringWeight: parseFloat(newWeight) })} disabled={updateMutation.isPending}>
                        <Check className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setEditPillar(null)}>
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setEditPillar(w.pillar); setNewWeight(w.avgWeight); }} data-testid={`button-edit-pillar-weight-${w.pillar}`}>
                      Set Weight
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-muted-foreground border-t border-border pt-3">
            Note: "Set Weight" applies the new weight to all active metrics in that pillar. To adjust individual metric weights, use the Metric Definitions tab.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">ESG Scoring Dimensions</CardTitle>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => {
                setEditingDimWeights(true);
                setDimWeights({ ...((config?.dimensionWeights) || { completeness: 25, performance: 35, maturity: 20, readiness: 20 }) });
              }}
              data-testid="button-edit-dimension-weights"
            >
              Edit Weights
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            ESG scores are computed across four dimensions. Dimension weights define how much each contributes to the overall score (must sum to 100%).
          </p>
        </CardHeader>
        <CardContent>
          {editingDimWeights ? (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">Adjust dimension weights (must sum to 100):</p>
              {[
                { key: "completeness", label: "Completeness" },
                { key: "performance", label: "Performance" },
                { key: "maturity", label: "Maturity" },
                { key: "readiness", label: "Framework Readiness" },
              ].map(dim => (
                <div key={dim.key} className="flex items-center gap-3" data-testid={`scoring-dimension-${dim.key}`}>
                  <span className="text-xs w-36">{dim.label}</span>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    className="w-20 h-7 text-sm"
                    value={dimWeights[dim.key] ?? 0}
                    onChange={e => setDimWeights(prev => ({ ...prev, [dim.key]: parseFloat(e.target.value) || 0 }))}
                    data-testid={`input-dim-weight-${dim.key}`}
                  />
                  <span className="text-xs text-muted-foreground">%</span>
                </div>
              ))}
              <p className={`text-xs ${Math.abs(Object.values(dimWeights).reduce((a, b) => a + b, 0) - 100) > 0.1 ? "text-red-500" : "text-green-600"}`}>
                Total: {Object.values(dimWeights).reduce((a, b) => a + b, 0)}% {Math.abs(Object.values(dimWeights).reduce((a, b) => a + b, 0) - 100) > 0.1 ? "(must equal 100)" : "✓"}
              </p>
              <div className="flex gap-2 pt-1">
                <Button
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => dimWeightMutation.mutate(dimWeights)}
                  disabled={dimWeightMutation.isPending || Math.abs(Object.values(dimWeights).reduce((a, b) => a + b, 0) - 100) > 0.1}
                  data-testid="button-save-dimension-weights"
                >
                  {dimWeightMutation.isPending ? "Saving…" : "Save Weights"}
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditingDimWeights(false)}>Cancel</Button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                {
                  key: "completeness",
                  label: "Completeness",
                  description: "Proportion of required metrics that have values submitted for the reporting period. Missing metrics reduce this score.",
                  example: "e.g. 12 of 15 required metrics reported = 80%",
                },
                {
                  key: "performance",
                  label: "Performance",
                  description: "Traffic-light status of reported metrics (Green=100, Amber=50, Red=0). Weighted by metric scoring_weight and material topics boost (+25%).",
                  example: "e.g. weighted average of all metric statuses",
                },
                {
                  key: "maturity",
                  label: "Maturity",
                  description: "Quality of reported data: Evidenced (100), Approved (80), Submitted (60), Estimated (40), Draft (20). Reflects how well-evidenced the data is.",
                  example: "e.g. 70% evidenced, 20% estimated = 76 maturity",
                },
                {
                  key: "readiness",
                  label: "Framework Readiness",
                  description: "Alignment percentage across selected ESG frameworks (GRI, TCFD, CDP etc.). Driven by metric-framework mappings and completion.",
                  example: "e.g. 8 of 12 framework requirements met = 67%",
                },
              ].map(dim => (
                <div key={dim.key} className="p-3 rounded-md border border-border" data-testid={`scoring-dimension-${dim.key}`}>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-semibold capitalize">{dim.label}</p>
                    <Badge variant="secondary" className="text-xs">{config?.dimensionWeights?.[dim.key] ?? "—"}%</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mb-1">{dim.description}</p>
                  <p className="text-xs text-primary/70 italic">{dim.example}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// MATERIAL TOPICS SEED TAB
// ============================================================
function MaterialTopicsSeedTab() {
  const { toast } = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [newTopic, setNewTopic] = useState({ topic: "", category: "environmental" });

  type TopicSeedRow = { topic: string; category: string; is_default: boolean; company_count: number };

  const { data: topicsSeed = [], isLoading, refetch } = useQuery<TopicSeedRow[]>({
    queryKey: ["/api/admin/material-topics-seed"],
    queryFn: async () => (await apiRequest("GET", "/api/admin/material-topics-seed")).json(),
  });

  const seedMutation = useMutation({
    mutationFn: (data: { topic: string; category: string }) => apiRequest("POST", "/api/admin/material-topics-seed", data),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/material-topics-seed"] });
      setShowCreate(false);
      setNewTopic({ topic: "", category: "environmental" });
      toast({ title: `"${vars.topic}" seeded across companies` });
    },
    onError: (e: Error) => toast({ title: "Seed failed", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Manage the global material topics seed set. Adding a topic here seeds it across all companies that have material topics configured.</p>
        <Button size="sm" onClick={() => setShowCreate(true)} data-testid="button-seed-topic" className="gap-1.5">
          <Plus className="w-3.5 h-3.5" /> Seed Topic
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
      ) : (
        <div className="border border-border rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-xs">Topic</th>
                <th className="text-left px-3 py-2 font-medium text-xs">Category</th>
                <th className="text-left px-3 py-2 font-medium text-xs">Default</th>
                <th className="text-left px-3 py-2 font-medium text-xs">Companies</th>
              </tr>
            </thead>
            <tbody>
              {topicsSeed.map((t, i) => (
                <tr key={i} className="border-t border-border" data-testid={`row-topic-seed-${i}`}>
                  <td className="px-3 py-2 text-xs">{t.topic}</td>
                  <td className="px-3 py-2"><PillarBadge pillar={t.category} /></td>
                  <td className="px-3 py-2 text-xs">{t.is_default ? <Check className="w-3.5 h-3.5 text-green-600" /> : "—"}</td>
                  <td className="px-3 py-2 text-xs">{t.company_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <Dialog open onOpenChange={() => setShowCreate(false)}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Seed Global Material Topic</DialogTitle></DialogHeader>
            <div className="space-y-3 py-2">
              <div>
                <Label className="text-xs">Topic Name <span className="text-red-500">*</span></Label>
                <Input className="h-8 text-sm" value={newTopic.topic} onChange={e => setNewTopic(p => ({ ...p, topic: e.target.value }))} placeholder="e.g. Climate Risk Management" data-testid="input-new-topic" />
              </div>
              <div>
                <Label className="text-xs">Category</Label>
                <Select value={newTopic.category} onValueChange={v => setNewTopic(p => ({ ...p, category: v }))}>
                  <SelectTrigger className="h-8 text-sm" data-testid="select-topic-category"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="environmental">Environmental</SelectItem>
                    <SelectItem value="social">Social</SelectItem>
                    <SelectItem value="governance">Governance</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button size="sm" onClick={() => seedMutation.mutate(newTopic)} disabled={seedMutation.isPending || !newTopic.topic} data-testid="button-confirm-seed-topic">
                {seedMutation.isPending ? "Seeding…" : "Seed Topic"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// ============================================================
// MAIN PAGE
// ============================================================
export default function AdminEsgPage() {
  const { isSuperAdmin } = usePermissions();
  const [, navigate] = useLocation();

  if (!isSuperAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <p className="text-muted-foreground text-sm">Super-admin access required.</p>
          <Button variant="link" size="sm" onClick={() => navigate("/")}>Go home</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-xl font-semibold" data-testid="page-title-admin-esg">ESG Platform Management</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage metric definitions, frameworks, framework requirements, metric mappings, material topics, and scoring configuration.
        </p>
      </div>

      <Tabs defaultValue="metric-definitions">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="metric-definitions" data-testid="tab-metric-definitions">
            <BarChart3 className="w-3.5 h-3.5 mr-1.5" /> Metric Definitions
          </TabsTrigger>
          <TabsTrigger value="frameworks" data-testid="tab-frameworks">
            <Network className="w-3.5 h-3.5 mr-1.5" /> Frameworks
          </TabsTrigger>
          <TabsTrigger value="fw-requirements" data-testid="tab-fw-requirements">
            <Layers className="w-3.5 h-3.5 mr-1.5" /> Requirements
          </TabsTrigger>
          <TabsTrigger value="mappings" data-testid="tab-mappings">
            <ArrowLeftRight className="w-3.5 h-3.5 mr-1.5" /> Metric Mappings
          </TabsTrigger>
          <TabsTrigger value="material-topics" data-testid="tab-material-topics">
            <Tags className="w-3.5 h-3.5 mr-1.5" /> Material Topics
          </TabsTrigger>
          <TabsTrigger value="scoring" data-testid="tab-scoring">
            <Sliders className="w-3.5 h-3.5 mr-1.5" /> Scoring Config
          </TabsTrigger>
        </TabsList>

        <TabsContent value="metric-definitions" className="mt-4">
          <MetricDefinitionsTab />
        </TabsContent>
        <TabsContent value="frameworks" className="mt-4">
          <FrameworksTab />
        </TabsContent>
        <TabsContent value="fw-requirements" className="mt-4">
          <FrameworkRequirementsTab />
        </TabsContent>
        <TabsContent value="mappings" className="mt-4">
          <MetricFrameworkMappingsTab />
        </TabsContent>
        <TabsContent value="material-topics" className="mt-4">
          <MaterialTopicsSeedTab />
        </TabsContent>
        <TabsContent value="scoring" className="mt-4">
          <ScoringConfigTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
