import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { useToast } from "@/hooks/use-toast";
import { BarChart3, Plus, Leaf, Users, Shield, Target, Edit2, Save } from "lucide-react";

type Metric = {
  id: string;
  name: string;
  description: string | null;
  category: "environmental" | "social" | "governance";
  unit: string | null;
  frequency: "monthly" | "quarterly" | "annual";
  dataOwner: string | null;
  enabled: boolean;
  isDefault: boolean;
  target?: { targetValue: string; targetYear: number } | null;
};

const CATEGORY_CONFIG = {
  environmental: { label: "Environmental", icon: Leaf, color: "text-primary", bg: "bg-primary/10" },
  social: { label: "Social", icon: Users, color: "text-blue-500", bg: "bg-blue-500/10" },
  governance: { label: "Governance", icon: Shield, color: "text-purple-500", bg: "bg-purple-500/10" },
};

function MetricRow({ metric, onToggle, onTarget }: {
  metric: Metric;
  onToggle: (id: string, enabled: boolean) => void;
  onTarget: (metric: Metric) => void;
}) {
  const config = CATEGORY_CONFIG[metric.category];
  const Icon = config.icon;

  return (
    <div
      className={`flex items-start gap-3 p-3 rounded-md border border-border transition-opacity ${!metric.enabled ? "opacity-50" : ""}`}
      data-testid={`metric-row-${metric.id}`}
    >
      <div className={`p-1.5 rounded-md ${config.bg} shrink-0 mt-0.5`}>
        <Icon className={`w-3.5 h-3.5 ${config.color}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2 flex-wrap">
          <p className="text-sm font-medium">{metric.name}</p>
          <Badge variant="outline" className="text-xs shrink-0">{metric.unit || "—"}</Badge>
          <Badge variant="secondary" className="text-xs shrink-0">{metric.frequency}</Badge>
        </div>
        {metric.description && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{metric.description}</p>
        )}
        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
          {metric.dataOwner && <span>Owner: {metric.dataOwner}</span>}
          {metric.target && (
            <span className="flex items-center gap-1 text-primary">
              <Target className="w-3 h-3" />
              Target: {metric.target.targetValue} {metric.unit} ({metric.target.targetYear})
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Button
          size="icon"
          variant="ghost"
          onClick={() => onTarget(metric)}
          data-testid={`button-target-${metric.id}`}
          title="Set target"
        >
          <Target className="w-3.5 h-3.5" />
        </Button>
        <Switch
          checked={metric.enabled}
          onCheckedChange={(v) => onToggle(metric.id, v)}
          data-testid={`switch-metric-${metric.id}`}
        />
      </div>
    </div>
  );
}

function TargetDialog({ metric, onClose }: { metric: Metric | null; onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [targetValue, setTargetValue] = useState(metric?.target?.targetValue || "");
  const [targetYear, setTargetYear] = useState(String(metric?.target?.targetYear || new Date().getFullYear() + 1));

  const mutation = useMutation({
    mutationFn: () => apiRequest("PUT", `/api/metrics/${metric?.id}/target`, { targetValue, targetYear: parseInt(targetYear) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/metrics"] });
      toast({ title: "Target saved" });
      onClose();
    },
  });

  if (!metric) return null;

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Set Target — {metric.name}</DialogTitle>
      </DialogHeader>
      <div className="space-y-4 pt-2">
        <div className="space-y-1.5">
          <Label>Target Value ({metric.unit})</Label>
          <Input
            type="number"
            value={targetValue}
            onChange={e => setTargetValue(e.target.value)}
            placeholder={`e.g. 1000`}
            data-testid="input-target-value"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Target Year</Label>
          <Input
            type="number"
            value={targetYear}
            onChange={e => setTargetYear(e.target.value)}
            placeholder="2026"
            data-testid="input-target-year"
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !targetValue} data-testid="button-save-target">
            {mutation.isPending ? "Saving..." : "Save Target"}
          </Button>
        </div>
      </div>
    </DialogContent>
  );
}

function AddMetricDialog({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const form = useForm({
    defaultValues: {
      name: "", description: "", category: "environmental", unit: "",
      frequency: "monthly", dataOwner: "",
    },
  });

  const mutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/metrics", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/metrics"] });
      toast({ title: "Metric added" });
      onClose();
    },
  });

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Add Custom Metric</DialogTitle>
      </DialogHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(d => mutation.mutate(d))} className="space-y-4 pt-2">
          <FormField control={form.control} name="name" render={({ field }) => (
            <FormItem>
              <FormLabel>Metric Name</FormLabel>
              <FormControl><Input placeholder="e.g. Fleet Fuel Consumption" {...field} data-testid="input-metric-name" /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="description" render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl><Textarea placeholder="What does this metric measure?" {...field} className="resize-none" data-testid="input-metric-desc" /></FormControl>
            </FormItem>
          )} />
          <div className="grid grid-cols-2 gap-3">
            <FormField control={form.control} name="category" render={({ field }) => (
              <FormItem>
                <FormLabel>Category</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl><SelectTrigger data-testid="select-metric-category"><SelectValue /></SelectTrigger></FormControl>
                  <SelectContent>
                    <SelectItem value="environmental">Environmental</SelectItem>
                    <SelectItem value="social">Social</SelectItem>
                    <SelectItem value="governance">Governance</SelectItem>
                  </SelectContent>
                </Select>
              </FormItem>
            )} />
            <FormField control={form.control} name="frequency" render={({ field }) => (
              <FormItem>
                <FormLabel>Frequency</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl><SelectTrigger data-testid="select-metric-freq"><SelectValue /></SelectTrigger></FormControl>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                    <SelectItem value="annual">Annual</SelectItem>
                  </SelectContent>
                </Select>
              </FormItem>
            )} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField control={form.control} name="unit" render={({ field }) => (
              <FormItem>
                <FormLabel>Unit</FormLabel>
                <FormControl><Input placeholder="kWh, %, tonnes..." {...field} data-testid="input-metric-unit" /></FormControl>
              </FormItem>
            )} />
            <FormField control={form.control} name="dataOwner" render={({ field }) => (
              <FormItem>
                <FormLabel>Data Owner</FormLabel>
                <FormControl><Input placeholder="HR Manager" {...field} data-testid="input-metric-owner" /></FormControl>
              </FormItem>
            )} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={mutation.isPending} data-testid="button-add-metric">
              {mutation.isPending ? "Adding..." : "Add Metric"}
            </Button>
          </div>
        </form>
      </Form>
    </DialogContent>
  );
}

export default function Metrics() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [targetMetric, setTargetMetric] = useState<Metric | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [activeTab, setActiveTab] = useState("all");

  const { data: metrics = [], isLoading } = useQuery<Metric[]>({ queryKey: ["/api/metrics"] });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      apiRequest("PUT", `/api/metrics/${id}`, { enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/metrics"] }),
    onError: () => toast({ title: "Update failed", variant: "destructive" }),
  });

  if (isLoading) {
    return <div className="p-6 space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16" />)}</div>;
  }

  const filtered = activeTab === "all" ? metrics : metrics.filter(m => m.category === activeTab);
  const enabledCount = metrics.filter(m => m.enabled).length;

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary" />
            Metrics Library
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Enable and configure the ESG metrics you want to track
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{enabledCount} of {metrics.length} active</Badge>
          <Dialog open={showAdd} onOpenChange={setShowAdd}>
            <DialogTrigger asChild>
              <Button size="sm" data-testid="button-add-custom-metric">
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                Add Custom
              </Button>
            </DialogTrigger>
            <AddMetricDialog onClose={() => setShowAdd(false)} />
          </Dialog>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="all">All ({metrics.length})</TabsTrigger>
          <TabsTrigger value="environmental" data-testid="tab-environmental">
            Environmental ({metrics.filter(m => m.category === "environmental").length})
          </TabsTrigger>
          <TabsTrigger value="social" data-testid="tab-social">
            Social ({metrics.filter(m => m.category === "social").length})
          </TabsTrigger>
          <TabsTrigger value="governance" data-testid="tab-governance">
            Governance ({metrics.filter(m => m.category === "governance").length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-4 space-y-2">
          {filtered.map(metric => (
            <MetricRow
              key={metric.id}
              metric={metric}
              onToggle={(id, enabled) => toggleMutation.mutate({ id, enabled })}
              onTarget={setTargetMetric}
            />
          ))}
          {filtered.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-8">No metrics in this category.</p>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={!!targetMetric} onOpenChange={open => !open && setTargetMetric(null)}>
        <TargetDialog metric={targetMetric} onClose={() => setTargetMetric(null)} />
      </Dialog>
    </div>
  );
}
