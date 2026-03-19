import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle, Plus, Leaf, Users, Shield, Edit, Trash2 } from "lucide-react";

type EsgRisk = {
  id: string;
  pillar: "environmental" | "social" | "governance";
  riskType: string;
  title: string;
  description: string | null;
  likelihood: string;
  impact: string;
  riskScore: number | null;
  mitigationPlan: string | null;
  owner: string | null;
  reviewDate: string | null;
  status: string;
};

const LIKELIHOOD_MAP: Record<string, number> = {
  very_low: 1, low: 2, medium: 3, high: 4, very_high: 5,
};
const IMPACT_MAP: Record<string, number> = {
  very_low: 1, low: 2, medium: 3, high: 4, very_high: 5,
};

function getRiskScore(likelihood: string, impact: string): number {
  return (LIKELIHOOD_MAP[likelihood] ?? 3) * (IMPACT_MAP[impact] ?? 3);
}

function getRiskLevel(score: number): { label: string; color: string; bg: string } {
  if (score >= 16) return { label: "Critical", color: "text-red-600", bg: "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900" };
  if (score >= 9) return { label: "High", color: "text-orange-600", bg: "bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-900" };
  if (score >= 4) return { label: "Medium", color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900" };
  return { label: "Low", color: "text-green-600", bg: "bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-900" };
}

const RISK_STATUS: Record<string, { label: string; badge: any }> = {
  open: { label: "Open", badge: "destructive" },
  mitigated: { label: "Mitigated", badge: "secondary" },
  accepted: { label: "Accepted", badge: "outline" },
  closed: { label: "Closed", badge: "secondary" },
};

const RISK_TYPES = [
  { value: "physical", label: "Physical" },
  { value: "transition", label: "Transition" },
  { value: "regulatory", label: "Regulatory" },
  { value: "reputational", label: "Reputational" },
  { value: "supply_chain", label: "Supply Chain" },
  { value: "operational", label: "Operational" },
  { value: "financial", label: "Financial" },
  { value: "social", label: "Social" },
  { value: "governance", label: "Governance" },
  { value: "other", label: "Other" },
];

const SCORE_LEVELS = [
  { value: "very_low", label: "Very Low (1)" },
  { value: "low", label: "Low (2)" },
  { value: "medium", label: "Medium (3)" },
  { value: "high", label: "High (4)" },
  { value: "very_high", label: "Very High (5)" },
];

const PILLAR_CONFIG = {
  environmental: { label: "Environmental", icon: Leaf, color: "text-green-600" },
  social: { label: "Social", icon: Users, color: "text-blue-600" },
  governance: { label: "Governance", icon: Shield, color: "text-purple-600" },
};

function RiskForm({ onSave, initial }: { onSave: (data: any) => void; initial?: EsgRisk }) {
  const { register, handleSubmit, setValue, watch } = useForm({
    defaultValues: {
      title: initial?.title ?? "",
      description: initial?.description ?? "",
      pillar: initial?.pillar ?? "environmental",
      riskType: initial?.riskType ?? "other",
      likelihood: initial?.likelihood ?? "medium",
      impact: initial?.impact ?? "medium",
      mitigationPlan: initial?.mitigationPlan ?? "",
      owner: initial?.owner ?? "",
      reviewDate: initial?.reviewDate ? initial.reviewDate.split("T")[0] : "",
      status: initial?.status ?? "open",
    },
  });

  const likelihood = watch("likelihood");
  const impact = watch("impact");
  const score = getRiskScore(likelihood, impact);
  const level = getRiskLevel(score);

  return (
    <form onSubmit={handleSubmit(data => onSave({ ...data, riskScore: getRiskScore(data.likelihood, data.impact) }))} className="space-y-4">
      <div className="space-y-1">
        <Label>Risk Title *</Label>
        <Input {...register("title", { required: true })} placeholder="e.g. Physical climate risk from flooding" data-testid="input-risk-title" />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1">
          <Label>Pillar</Label>
          <Select defaultValue={initial?.pillar ?? "environmental"} onValueChange={v => setValue("pillar", v as any)}>
            <SelectTrigger data-testid="select-risk-pillar"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="environmental">Environmental</SelectItem>
              <SelectItem value="social">Social</SelectItem>
              <SelectItem value="governance">Governance</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1 col-span-2">
          <Label>Risk Type</Label>
          <Select defaultValue={initial?.riskType ?? "other"} onValueChange={v => setValue("riskType", v)}>
            <SelectTrigger data-testid="select-risk-type"><SelectValue /></SelectTrigger>
            <SelectContent>
              {RISK_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1">
        <Label>Description</Label>
        <Textarea {...register("description")} rows={2} className="resize-none" data-testid="textarea-risk-desc" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Likelihood</Label>
          <Select defaultValue={initial?.likelihood ?? "medium"} onValueChange={v => setValue("likelihood", v)}>
            <SelectTrigger data-testid="select-risk-likelihood"><SelectValue /></SelectTrigger>
            <SelectContent>
              {SCORE_LEVELS.map(l => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Impact</Label>
          <Select defaultValue={initial?.impact ?? "medium"} onValueChange={v => setValue("impact", v)}>
            <SelectTrigger data-testid="select-risk-impact"><SelectValue /></SelectTrigger>
            <SelectContent>
              {SCORE_LEVELS.map(l => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className={`p-2 rounded-md border text-sm font-medium text-center ${level.bg} ${level.color}`} data-testid="risk-score-display">
        Risk Score: {score}/25 — {level.label}
      </div>
      <div className="space-y-1">
        <Label>Mitigation Plan</Label>
        <Textarea {...register("mitigationPlan")} rows={2} className="resize-none" placeholder="How will this risk be managed?" data-testid="textarea-risk-mitigation" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Owner</Label>
          <Input {...register("owner")} placeholder="Risk owner" data-testid="input-risk-owner" />
        </div>
        <div className="space-y-1">
          <Label>Review Date</Label>
          <Input type="date" {...register("reviewDate")} data-testid="input-risk-review-date" />
        </div>
      </div>
      <div className="space-y-1">
        <Label>Status</Label>
        <Select defaultValue={initial?.status ?? "open"} onValueChange={v => setValue("status", v)}>
          <SelectTrigger data-testid="select-risk-status"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(RISK_STATUS).map(([v, c]) => <SelectItem key={v} value={v}>{c.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <Button type="submit" className="w-full" data-testid="button-save-risk">Save Risk</Button>
    </form>
  );
}

export default function EsgRisksPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showDialog, setShowDialog] = useState(false);
  const [editingRisk, setEditingRisk] = useState<EsgRisk | null>(null);
  const [filterPillar, setFilterPillar] = useState("all");
  const [filterType, setFilterType] = useState("all");

  const { data: risks = [], isLoading } = useQuery<EsgRisk[]>({ queryKey: ["/api/esg-risks"] });

  const createRisk = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/esg-risks", data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/esg-risks"] }); setShowDialog(false); toast({ title: "Risk logged" }); },
    onError: () => toast({ title: "Save failed", variant: "destructive" }),
  });
  const updateRisk = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => apiRequest("PATCH", `/api/esg-risks/${id}`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/esg-risks"] }); setShowDialog(false); setEditingRisk(null); toast({ title: "Risk updated" }); },
    onError: () => toast({ title: "Update failed", variant: "destructive" }),
  });
  const deleteRisk = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/esg-risks/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/esg-risks"] }); toast({ title: "Risk deleted" }); },
    onError: () => toast({ title: "Delete failed", variant: "destructive" }),
  });

  const filteredRisks = risks.filter(r => {
    if (filterPillar !== "all" && r.pillar !== filterPillar) return false;
    if (filterType !== "all" && r.riskType !== filterType) return false;
    return true;
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      </div>
    );
  }

  const openRisks = risks.filter(r => r.status === "open");
  const highRisks = openRisks.filter(r => (r.riskScore ?? 0) >= 9);

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-primary" />
            ESG Risk Register
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Log and manage ESG risks across environmental, social, and governance pillars</p>
        </div>
        <Dialog open={showDialog} onOpenChange={v => { setShowDialog(v); if (!v) setEditingRisk(null); }}>
          <DialogTrigger asChild>
            <Button size="sm" data-testid="button-add-risk">
              <Plus className="w-4 h-4 mr-1" /> Log Risk
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingRisk ? "Edit Risk" : "Log ESG Risk"}</DialogTitle>
            </DialogHeader>
            <RiskForm onSave={data => editingRisk ? updateRisk.mutate({ id: editingRisk.id, data }) : createRisk.mutate(data)} initial={editingRisk ?? undefined} />
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card className="border border-border">
          <CardContent className="p-3 text-center">
            <div className="text-2xl font-bold">{openRisks.length}</div>
            <div className="text-xs text-muted-foreground">Open Risks</div>
          </CardContent>
        </Card>
        <Card className="border border-border">
          <CardContent className="p-3 text-center">
            <div className="text-2xl font-bold text-red-500">{highRisks.length}</div>
            <div className="text-xs text-muted-foreground">High/Critical</div>
          </CardContent>
        </Card>
        <Card className="border border-border">
          <CardContent className="p-3 text-center">
            <div className="text-2xl font-bold text-green-600">{risks.filter(r => r.status === "mitigated").length}</div>
            <div className="text-xs text-muted-foreground">Mitigated</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="list">
        <TabsList>
          <TabsTrigger value="list" data-testid="tab-risk-list">Risk List</TabsTrigger>
          <TabsTrigger value="matrix" data-testid="tab-risk-matrix">Risk Matrix</TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="mt-4 space-y-4">
          <div className="flex flex-wrap gap-3">
            <Select value={filterPillar} onValueChange={setFilterPillar}>
              <SelectTrigger className="w-40" data-testid="select-filter-pillar">
                <SelectValue placeholder="All Pillars" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Pillars</SelectItem>
                <SelectItem value="environmental">Environmental</SelectItem>
                <SelectItem value="social">Social</SelectItem>
                <SelectItem value="governance">Governance</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-44" data-testid="select-filter-type">
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {RISK_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {filteredRisks.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <AlertTriangle className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">
                  {risks.length === 0 ? "No risks logged yet." : "No risks match the current filters."}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {filteredRisks
                .sort((a, b) => (b.riskScore ?? 0) - (a.riskScore ?? 0))
                .map(risk => {
                  const score = risk.riskScore ?? getRiskScore(risk.likelihood, risk.impact);
                  const level = getRiskLevel(score);
                  const statusCfg = RISK_STATUS[risk.status] ?? RISK_STATUS.open;
                  const pillarCfg = PILLAR_CONFIG[risk.pillar];
                  const PillarIcon = pillarCfg.icon;

                  return (
                    <Card key={risk.id} data-testid={`risk-card-${risk.id}`} className={`border ${level.bg}`}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <PillarIcon className={`w-3.5 h-3.5 ${pillarCfg.color}`} />
                              <span className="text-sm font-medium">{risk.title}</span>
                              <Badge variant={statusCfg.badge}>{statusCfg.label}</Badge>
                              <span className={`text-xs font-semibold ${level.color}`}>{level.label} ({score}/25)</span>
                            </div>
                            <div className="flex flex-wrap gap-3 mt-2 text-xs text-muted-foreground">
                              <span className="capitalize">{risk.riskType.replace("_", " ")}</span>
                              {risk.owner && <span>Owner: <span className="text-foreground">{risk.owner}</span></span>}
                              {risk.reviewDate && <span>Review: {new Date(risk.reviewDate).toLocaleDateString()}</span>}
                            </div>
                            {risk.mitigationPlan && (
                              <p className="text-xs text-muted-foreground mt-1 truncate">Mitigation: {risk.mitigationPlan}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Button
                              variant="ghost" size="icon" className="w-7 h-7"
                              onClick={() => { setEditingRisk(risk); setShowDialog(true); }}
                              data-testid={`button-edit-risk-${risk.id}`}
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost" size="icon" className="w-7 h-7 text-destructive hover:text-destructive"
                              onClick={() => deleteRisk.mutate(risk.id)}
                              data-testid={`button-delete-risk-${risk.id}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="matrix" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Risk Matrix</CardTitle>
              <CardDescription>Likelihood (x-axis) vs Impact (y-axis) for open risks</CardDescription>
            </CardHeader>
            <CardContent>
              {openRisks.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No open risks to display</p>
              ) : (
                <div className="relative border border-border rounded-lg" style={{ height: 360 }} data-testid="risk-matrix-chart">
                  {/* Background quadrants */}
                  <div className="absolute inset-0 grid grid-cols-5 grid-rows-5 rounded-lg overflow-hidden">
                    {Array.from({ length: 25 }, (_, i) => {
                      const row = Math.floor(i / 5);
                      const col = i % 5;
                      const score = (col + 1) * (5 - row);
                      const level = getRiskLevel(score);
                      return (
                        <div key={i} className={`opacity-20 ${
                          score >= 16 ? "bg-red-400" : score >= 9 ? "bg-orange-300" :
                          score >= 4 ? "bg-amber-200" : "bg-green-100"
                        }`} />
                      );
                    })}
                  </div>
                  <div className="absolute left-1 top-1/2 -translate-y-1/2 -rotate-90 text-[10px] text-muted-foreground font-medium">Impact</div>
                  <div className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[10px] text-muted-foreground font-medium">Likelihood</div>
                  {openRisks.map(risk => {
                    const lh = LIKELIHOOD_MAP[risk.likelihood] ?? 3;
                    const im = IMPACT_MAP[risk.impact] ?? 3;
                    const x = ((lh - 1) / 4) * 84 + 8;
                    const y = (1 - (im - 1) / 4) * 84 + 4;
                    const score = lh * im;
                    const level = getRiskLevel(score);
                    const pillarCfg = PILLAR_CONFIG[risk.pillar];
                    return (
                      <div
                        key={risk.id}
                        className={`absolute w-3 h-3 rounded-full border-2 border-white cursor-pointer ${
                          risk.pillar === "environmental" ? "bg-green-500" :
                          risk.pillar === "social" ? "bg-blue-500" : "bg-purple-500"
                        }`}
                        style={{ left: `${x}%`, top: `${y}%`, transform: "translate(-50%, -50%)" }}
                        title={`${risk.title} (${level.label})`}
                        data-testid={`matrix-risk-dot-${risk.id}`}
                      />
                    );
                  })}
                </div>
              )}
              <div className="flex flex-wrap gap-3 mt-4 text-xs">
                <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-green-500" /> Environmental</div>
                <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-blue-500" /> Social</div>
                <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-purple-500" /> Governance</div>
                <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-red-400 opacity-50" /> Critical</div>
                <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-orange-300 opacity-50" /> High</div>
                <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-amber-200 opacity-50" /> Medium</div>
                <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-green-100 opacity-50" /> Low</div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
