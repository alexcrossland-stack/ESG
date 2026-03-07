import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { ClipboardList, Lock, Unlock, Save, CheckCircle, Leaf, Users, Shield, AlertCircle } from "lucide-react";
import { format, subMonths } from "date-fns";

type MetricRow = {
  metricId: string;
  name: string;
  category: string;
  unit: string | null;
  frequency: string;
  dataOwner: string | null;
  enabled: boolean;
};

type ValueRow = {
  id: string;
  metricId: string;
  period: string;
  value: string;
  notes: string | null;
  locked: boolean;
  metricName: string;
  category: string;
  unit: string | null;
};

function generatePeriods() {
  const periods = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = subMonths(now, i);
    periods.push(format(d, "yyyy-MM"));
  }
  return periods;
}

const CATEGORY_ICONS = {
  environmental: { icon: Leaf, color: "text-primary", bg: "bg-primary/10" },
  social: { icon: Users, color: "text-blue-500", bg: "bg-blue-500/10" },
  governance: { icon: Shield, color: "text-purple-500", bg: "bg-purple-500/10" },
};

export default function DataEntry() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const periods = generatePeriods();
  const [selectedPeriod, setSelectedPeriod] = useState(periods[0]);
  const [values, setValues] = useState<Record<string, { value: string; notes: string }>>({});
  const [saving, setSaving] = useState<Set<string>>(new Set());

  const { data, isLoading } = useQuery<{ values: ValueRow[]; metrics: MetricRow[] }>({
    queryKey: ["/api/data-entry", selectedPeriod],
    queryFn: () => fetch(`/api/data-entry/${selectedPeriod}`).then(r => r.json()),
    onSuccess: (d) => {
      const initial: Record<string, { value: string; notes: string }> = {};
      d.values.forEach(v => {
        initial[v.metricId] = { value: v.value || "", notes: v.notes || "" };
      });
      setValues(initial);
    },
  } as any);

  const lockMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/data-entry/${selectedPeriod}/lock`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/data-entry", selectedPeriod] });
      toast({ title: `Period ${selectedPeriod} locked`, description: "Data has been approved and locked." });
    },
  });

  const saveMutation = useMutation({
    mutationFn: (data: { metricId: string; period: string; value: string; notes: string }) =>
      apiRequest("POST", "/api/data-entry", { ...data, period: selectedPeriod }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/data-entry", selectedPeriod] });
    },
  });

  const handleSave = async (metricId: string) => {
    const val = values[metricId];
    if (!val?.value) return;
    setSaving(prev => new Set([...prev, metricId]));
    try {
      await saveMutation.mutateAsync({ metricId, period: selectedPeriod, value: val.value, notes: val.notes });
      toast({ title: "Saved", description: "Value recorded successfully." });
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally {
      setSaving(prev => { const n = new Set(prev); n.delete(metricId); return n; });
    }
  };

  const handleSaveAll = async () => {
    const entries = Object.entries(values).filter(([_, v]) => v.value);
    for (const [metricId, val] of entries) {
      await saveMutation.mutateAsync({ metricId, period: selectedPeriod, value: val.value, notes: val.notes });
    }
    toast({ title: "All values saved", description: `${entries.length} metrics recorded for ${selectedPeriod}.` });
  };

  if (isLoading) {
    return <div className="p-6 space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-20" />)}</div>;
  }

  const metrics = data?.metrics || [];
  const existingValues = data?.values || [];
  const isLocked = existingValues.some(v => v.locked);

  const groupedMetrics = {
    environmental: metrics.filter(m => m.category === "environmental"),
    social: metrics.filter(m => m.category === "social"),
    governance: metrics.filter(m => m.category === "governance"),
  };

  const completedCount = metrics.filter(m => {
    const existing = existingValues.find(v => v.metricId === m.metricId);
    const local = values[m.metricId];
    return existing?.value || local?.value;
  }).length;

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-primary" />
            Data Entry
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Record your ESG metrics for each reporting period
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
            <SelectTrigger className="w-36" data-testid="select-period">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {periods.map(p => (
                <SelectItem key={p} value={p}>{p}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {isLocked ? (
            <Badge variant="secondary" className="gap-1">
              <Lock className="w-3 h-3" />
              Locked
            </Badge>
          ) : (
            <>
              <Button size="sm" variant="outline" onClick={handleSaveAll} disabled={saveMutation.isPending} data-testid="button-save-all">
                <Save className="w-3.5 h-3.5 mr-1.5" />
                Save All
              </Button>
              <Button size="sm" variant="default" onClick={() => lockMutation.mutate()} disabled={lockMutation.isPending} data-testid="button-lock-period">
                <Lock className="w-3.5 h-3.5 mr-1.5" />
                {lockMutation.isPending ? "Locking..." : "Lock Period"}
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-md border border-border">
        <div className="flex-1">
          <p className="text-sm font-medium">Period: {selectedPeriod}</p>
          <p className="text-xs text-muted-foreground">{completedCount} of {metrics.length} metrics entered</p>
        </div>
        <div className="text-right">
          <div className="text-lg font-bold text-primary">{metrics.length ? Math.round((completedCount / metrics.length) * 100) : 0}%</div>
          <div className="text-xs text-muted-foreground">complete</div>
        </div>
      </div>

      {isLocked && (
        <Alert>
          <Lock className="w-4 h-4" />
          <AlertDescription>
            This period is locked. Data cannot be edited. Contact your administrator to unlock it.
          </AlertDescription>
        </Alert>
      )}

      {(Object.entries(groupedMetrics) as [string, MetricRow[]][]).map(([cat, catMetrics]) => {
        if (catMetrics.length === 0) return null;
        const config = CATEGORY_ICONS[cat as keyof typeof CATEGORY_ICONS];
        const Icon = config.icon;

        return (
          <Card key={cat}>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <div className={`p-1.5 rounded-md ${config.bg}`}>
                  <Icon className={`w-3.5 h-3.5 ${config.color}`} />
                </div>
                {cat.charAt(0).toUpperCase() + cat.slice(1)}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {catMetrics.map(metric => {
                const existing = existingValues.find(v => v.metricId === metric.metricId);
                const localVal = values[metric.metricId] || { value: "", notes: "" };
                const hasValue = existing?.value || localVal.value;
                const isSaving = saving.has(metric.metricId);

                return (
                  <div key={metric.metricId} className={`grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 p-3 rounded-md border ${hasValue ? "border-primary/20 bg-primary/5" : "border-border"}`} data-testid={`data-row-${metric.metricId}`}>
                    <div className="space-y-2">
                      <div className="flex items-start gap-2 flex-wrap">
                        <Label className="text-sm font-medium">{metric.name}</Label>
                        <Badge variant="outline" className="text-xs">{metric.unit || "—"}</Badge>
                        {hasValue && <CheckCircle className="w-3.5 h-3.5 text-primary mt-0.5" />}
                      </div>
                      {metric.dataOwner && (
                        <p className="text-xs text-muted-foreground">Owner: {metric.dataOwner}</p>
                      )}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Value</Label>
                          <Input
                            type="number"
                            value={localVal.value}
                            onChange={e => setValues(prev => ({
                              ...prev,
                              [metric.metricId]: { ...prev[metric.metricId] || { notes: "" }, value: e.target.value }
                            }))}
                            placeholder={`Enter ${metric.unit || "value"}`}
                            disabled={isLocked}
                            className="h-8 text-sm"
                            data-testid={`input-value-${metric.metricId}`}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Notes (optional)</Label>
                          <Input
                            value={localVal.notes}
                            onChange={e => setValues(prev => ({
                              ...prev,
                              [metric.metricId]: { ...prev[metric.metricId] || { value: "" }, notes: e.target.value }
                            }))}
                            placeholder="Add a note..."
                            disabled={isLocked}
                            className="h-8 text-sm"
                            data-testid={`input-notes-${metric.metricId}`}
                          />
                        </div>
                      </div>
                    </div>
                    {!isLocked && (
                      <div className="flex items-end">
                        <Button
                          size="sm"
                          variant={hasValue ? "secondary" : "default"}
                          onClick={() => handleSave(metric.metricId)}
                          disabled={isSaving || !localVal.value}
                          data-testid={`button-save-${metric.metricId}`}
                        >
                          {isSaving ? "..." : <Save className="w-3.5 h-3.5" />}
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        );
      })}

      {metrics.length === 0 && (
        <div className="text-center py-12">
          <AlertCircle className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No metrics enabled. Go to Metrics Library to enable metrics.</p>
        </div>
      )}
    </div>
  );
}
