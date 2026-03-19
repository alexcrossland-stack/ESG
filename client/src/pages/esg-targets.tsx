import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { Target, Plus, CheckCircle, AlertTriangle, Clock, Leaf, Users, Shield, Edit, Trash2, ChevronDown, ChevronUp } from "lucide-react";

type EsgTarget = {
  id: string;
  title: string;
  description: string | null;
  pillar: "environmental" | "social" | "governance";
  baselineValue: string | null;
  baselineYear: number | null;
  targetValue: string | null;
  targetYear: number | null;
  owner: string | null;
  status: string;
  progressPercent: number | null;
  notes: string | null;
};

type EsgAction = {
  id: string;
  targetId: string | null;
  title: string;
  description: string | null;
  owner: string | null;
  dueDate: string | null;
  status: string;
  progressPercent: number | null;
};

const TARGET_STATUS: Record<string, { label: string; badge: any; color: string }> = {
  not_started: { label: "Not Started", badge: "secondary", color: "text-muted-foreground" },
  in_progress: { label: "In Progress", badge: "default", color: "text-blue-600" },
  achieved: { label: "Achieved", badge: "default", color: "text-green-600" },
  missed: { label: "Missed", badge: "destructive", color: "text-red-500" },
  cancelled: { label: "Cancelled", badge: "secondary", color: "text-muted-foreground" },
};

const ACTION_STATUS: Record<string, { label: string; badge: any }> = {
  not_started: { label: "Not Started", badge: "secondary" },
  in_progress: { label: "In Progress", badge: "default" },
  complete: { label: "Complete", badge: "default" },
  overdue: { label: "Overdue", badge: "destructive" },
  cancelled: { label: "Cancelled", badge: "secondary" },
};

const PILLAR_CONFIG = {
  environmental: { label: "Environmental", icon: Leaf, color: "text-green-600" },
  social: { label: "Social", icon: Users, color: "text-blue-600" },
  governance: { label: "Governance", icon: Shield, color: "text-purple-600" },
};

function TargetForm({ onSave, initial }: { onSave: (data: any) => void; initial?: EsgTarget }) {
  const { register, handleSubmit, setValue, watch } = useForm({
    defaultValues: {
      title: initial?.title ?? "",
      description: initial?.description ?? "",
      pillar: initial?.pillar ?? "environmental",
      baselineValue: initial?.baselineValue ?? "",
      baselineYear: initial?.baselineYear ?? new Date().getFullYear(),
      targetValue: initial?.targetValue ?? "",
      targetYear: initial?.targetYear ?? new Date().getFullYear() + 5,
      owner: initial?.owner ?? "",
      status: initial?.status ?? "not_started",
      progressPercent: initial?.progressPercent ?? 0,
      notes: initial?.notes ?? "",
    },
  });

  return (
    <form onSubmit={handleSubmit(onSave)} className="space-y-4">
      <div className="space-y-1">
        <Label>Target Title *</Label>
        <Input {...register("title", { required: true })} placeholder="e.g. Reduce Scope 1 emissions by 30%" data-testid="input-target-title" />
      </div>
      <div className="space-y-1">
        <Label>Pillar</Label>
        <Select defaultValue={initial?.pillar ?? "environmental"} onValueChange={v => setValue("pillar", v as any)}>
          <SelectTrigger data-testid="select-target-pillar">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="environmental">Environmental</SelectItem>
            <SelectItem value="social">Social</SelectItem>
            <SelectItem value="governance">Governance</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label>Description</Label>
        <Textarea {...register("description")} rows={2} className="resize-none" placeholder="What does this target aim to achieve?" data-testid="textarea-target-desc" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Baseline Value</Label>
          <Input {...register("baselineValue")} placeholder="e.g. 100" data-testid="input-baseline-value" />
        </div>
        <div className="space-y-1">
          <Label>Baseline Year</Label>
          <Input type="number" {...register("baselineYear", { valueAsNumber: true })} data-testid="input-baseline-year" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Target Value</Label>
          <Input {...register("targetValue")} placeholder="e.g. 70" data-testid="input-target-value" />
        </div>
        <div className="space-y-1">
          <Label>Target Year</Label>
          <Input type="number" {...register("targetYear", { valueAsNumber: true })} data-testid="input-target-year" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Owner</Label>
          <Input {...register("owner")} placeholder="Target owner" data-testid="input-target-owner" />
        </div>
        <div className="space-y-1">
          <Label>Status</Label>
          <Select defaultValue={initial?.status ?? "not_started"} onValueChange={v => setValue("status", v)}>
            <SelectTrigger data-testid="select-target-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(TARGET_STATUS).map(([v, c]) => (
                <SelectItem key={v} value={v}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1">
        <Label>Progress ({watch("progressPercent")}%)</Label>
        <Input type="number" {...register("progressPercent", { valueAsNumber: true, min: 0, max: 100 })} min={0} max={100} data-testid="input-target-progress" />
      </div>
      <Button type="submit" className="w-full" data-testid="button-save-target">Save Target</Button>
    </form>
  );
}

function ActionForm({ targetId, onSave, initial }: { targetId: string; onSave: (data: any) => void; initial?: EsgAction }) {
  const { register, handleSubmit, setValue } = useForm({
    defaultValues: {
      title: initial?.title ?? "",
      description: initial?.description ?? "",
      owner: initial?.owner ?? "",
      dueDate: initial?.dueDate ? initial.dueDate.split("T")[0] : "",
      status: initial?.status ?? "not_started",
      progressPercent: initial?.progressPercent ?? 0,
      targetId,
    },
  });

  return (
    <form onSubmit={handleSubmit(onSave)} className="space-y-3">
      <div className="space-y-1">
        <Label>Action Title *</Label>
        <Input {...register("title", { required: true })} placeholder="What needs to be done?" data-testid="input-action-title" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Owner</Label>
          <Input {...register("owner")} placeholder="Action owner" data-testid="input-action-owner" />
        </div>
        <div className="space-y-1">
          <Label>Due Date</Label>
          <Input type="date" {...register("dueDate")} data-testid="input-action-due-date" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Status</Label>
          <Select defaultValue={initial?.status ?? "not_started"} onValueChange={v => setValue("status", v)}>
            <SelectTrigger data-testid="select-action-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(ACTION_STATUS).map(([v, c]) => (
                <SelectItem key={v} value={v}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Progress (%)</Label>
          <Input type="number" {...register("progressPercent", { valueAsNumber: true, min: 0, max: 100 })} min={0} max={100} data-testid="input-action-progress" />
        </div>
      </div>
      <Button type="submit" size="sm" className="w-full" data-testid="button-save-action">Save Action</Button>
    </form>
  );
}

export default function EsgTargetsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showTargetDialog, setShowTargetDialog] = useState(false);
  const [showActionDialog, setShowActionDialog] = useState<string | null>(null);
  const [editingTarget, setEditingTarget] = useState<EsgTarget | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data: targets = [], isLoading } = useQuery<EsgTarget[]>({ queryKey: ["/api/esg-targets"] });
  const { data: allActions = [] } = useQuery<EsgAction[]>({ queryKey: ["/api/esg-actions"] });

  const createTarget = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/esg-targets", data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/esg-targets"] }); setShowTargetDialog(false); setEditingTarget(null); toast({ title: "Target created" }); },
    onError: () => toast({ title: "Save failed", variant: "destructive" }),
  });
  const updateTarget = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => apiRequest("PATCH", `/api/esg-targets/${id}`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/esg-targets"] }); setShowTargetDialog(false); setEditingTarget(null); toast({ title: "Target updated" }); },
    onError: () => toast({ title: "Update failed", variant: "destructive" }),
  });
  const deleteTarget = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/esg-targets/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/esg-targets"] }); toast({ title: "Target deleted" }); },
    onError: () => toast({ title: "Delete failed", variant: "destructive" }),
  });
  const createAction = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/esg-actions", data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/esg-actions"] }); setShowActionDialog(null); toast({ title: "Action added" }); },
    onError: () => toast({ title: "Save failed", variant: "destructive" }),
  });
  const updateAction = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => apiRequest("PATCH", `/api/esg-actions/${id}`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/esg-actions"] }); toast({ title: "Action updated" }); },
    onError: () => toast({ title: "Update failed", variant: "destructive" }),
  });
  const deleteAction = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/esg-actions/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/esg-actions"] }); toast({ title: "Action deleted" }); },
    onError: () => toast({ title: "Delete failed", variant: "destructive" }),
  });

  const overdueActions = allActions.filter(a => {
    if (a.status === "complete" || a.status === "cancelled") return false;
    return a.dueDate && new Date(a.dueDate) < new Date();
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

  const grouped = {
    environmental: targets.filter(t => t.pillar === "environmental"),
    social: targets.filter(t => t.pillar === "social"),
    governance: targets.filter(t => t.pillar === "governance"),
  };

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Target className="w-5 h-5 text-primary" />
            ESG Targets & Actions
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Set measurable ESG targets and track the actions to achieve them</p>
        </div>
        <Dialog open={showTargetDialog} onOpenChange={v => { setShowTargetDialog(v); if (!v) setEditingTarget(null); }}>
          <DialogTrigger asChild>
            <Button size="sm" data-testid="button-add-target">
              <Plus className="w-4 h-4 mr-1" /> Add Target
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingTarget ? "Edit Target" : "New ESG Target"}</DialogTitle>
            </DialogHeader>
            <TargetForm onSave={data => editingTarget ? updateTarget.mutate({ id: editingTarget.id, data }) : createTarget.mutate(data)} initial={editingTarget ?? undefined} />
          </DialogContent>
        </Dialog>
      </div>

      {overdueActions.length > 0 && (
        <Card className="border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/20">
          <CardContent className="p-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-500" />
            <span className="text-sm font-medium text-red-700 dark:text-red-400">
              {overdueActions.length} overdue action{overdueActions.length > 1 ? "s" : ""}
            </span>
            <span className="text-xs text-muted-foreground">({overdueActions.map(a => a.title).slice(0, 2).join(", ")}{overdueActions.length > 2 ? ` +${overdueActions.length - 2} more` : ""})</span>
          </CardContent>
        </Card>
      )}

      {targets.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Target className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No targets yet. Add your first ESG target to get started.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {(Object.entries(grouped) as [keyof typeof PILLAR_CONFIG, EsgTarget[]][]).map(([pillar, pillarTargets]) => {
            if (pillarTargets.length === 0) return null;
            const config = PILLAR_CONFIG[pillar];
            const Icon = config.icon;
            return (
              <div key={pillar}>
                <div className="flex items-center gap-2 mb-3">
                  <Icon className={`w-4 h-4 ${config.color}`} />
                  <h2 className="text-sm font-medium">{config.label}</h2>
                  <Badge variant="secondary">{pillarTargets.length}</Badge>
                </div>
                <div className="space-y-3">
                  {pillarTargets.map(target => {
                    const statusCfg = TARGET_STATUS[target.status] ?? TARGET_STATUS.not_started;
                    const targetActions = allActions.filter(a => a.targetId === target.id);
                    const isOpen = expanded === target.id;
                    const overdueActionsForTarget = targetActions.filter(a => {
                      if (a.status === "complete" || a.status === "cancelled") return false;
                      return a.dueDate && new Date(a.dueDate) < new Date();
                    });

                    return (
                      <Card key={target.id} data-testid={`target-card-${target.id}`} className="border border-border">
                        <CardContent className="p-0">
                          <button
                            className="w-full text-left p-4 flex items-start justify-between"
                            onClick={() => setExpanded(isOpen ? null : target.id)}
                            data-testid={`button-expand-target-${target.id}`}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-medium">{target.title}</span>
                                <Badge variant={statusCfg.badge}>{statusCfg.label}</Badge>
                                {overdueActionsForTarget.length > 0 && (
                                  <Badge variant="destructive" className="text-xs">
                                    <AlertTriangle className="w-3 h-3 mr-1" />{overdueActionsForTarget.length} overdue
                                  </Badge>
                                )}
                              </div>
                              {target.targetValue && target.targetYear && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  Target: {target.targetValue} by {target.targetYear}
                                  {target.baselineValue && ` (baseline: ${target.baselineValue}, ${target.baselineYear})`}
                                </p>
                              )}
                              {target.progressPercent !== null && target.progressPercent > 0 && (
                                <div className="mt-2 space-y-1">
                                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                                    <span>Progress</span>
                                    <span>{target.progressPercent}%</span>
                                  </div>
                                  <Progress value={target.progressPercent} className="h-1.5" />
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-1 ml-3 shrink-0">
                              <span className="text-xs text-muted-foreground">{targetActions.length} action{targetActions.length !== 1 ? "s" : ""}</span>
                              {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </div>
                          </button>

                          {isOpen && (
                            <div className="border-t border-border px-4 pb-4 pt-3 space-y-3">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-medium text-muted-foreground">LINKED ACTIONS</span>
                                <div className="flex items-center gap-1">
                                  <Button
                                    variant="ghost" size="sm" className="h-6 text-xs"
                                    onClick={() => { setEditingTarget(target); setShowTargetDialog(true); }}
                                    data-testid={`button-edit-target-${target.id}`}
                                  >
                                    <Edit className="w-3 h-3 mr-1" />Edit Target
                                  </Button>
                                  <Button
                                    variant="ghost" size="sm" className="h-6 text-xs text-destructive hover:text-destructive"
                                    onClick={() => deleteTarget.mutate(target.id)}
                                    data-testid={`button-delete-target-${target.id}`}
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </Button>
                                </div>
                              </div>

                              {targetActions.length === 0 ? (
                                <p className="text-xs text-muted-foreground">No actions yet.</p>
                              ) : (
                                <div className="space-y-2">
                                  {targetActions.map(action => {
                                    const aStatusCfg = ACTION_STATUS[action.status] ?? ACTION_STATUS.not_started;
                                    const isActionOverdue = action.status !== "complete" && action.status !== "cancelled" && action.dueDate && new Date(action.dueDate) < new Date();
                                    return (
                                      <div
                                        key={action.id}
                                        className={`flex items-start justify-between gap-2 p-2 rounded-md border ${isActionOverdue ? "border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/20" : "border-border bg-muted/30"}`}
                                        data-testid={`action-row-${action.id}`}
                                      >
                                        <div className="flex-1 min-w-0">
                                          <div className="flex flex-wrap items-center gap-2">
                                            <span className="text-xs font-medium">{action.title}</span>
                                            <Badge variant={aStatusCfg.badge} className="text-xs">{aStatusCfg.label}</Badge>
                                          </div>
                                          <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                                            {action.owner && <span>{action.owner}</span>}
                                            {action.dueDate && <span className={isActionOverdue ? "text-red-500" : ""}>Due {new Date(action.dueDate).toLocaleDateString()}</span>}
                                            {action.progressPercent !== null && action.progressPercent > 0 && <span>{action.progressPercent}%</span>}
                                          </div>
                                        </div>
                                        <div className="flex items-center gap-0.5 shrink-0">
                                          <Select defaultValue={action.status} onValueChange={status => updateAction.mutate({ id: action.id, data: { status } })}>
                                            <SelectTrigger className="h-6 w-28 text-xs" data-testid={`select-action-status-${action.id}`}>
                                              <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                              {Object.entries(ACTION_STATUS).map(([v, c]) => (
                                                <SelectItem key={v} value={v}>{c.label}</SelectItem>
                                              ))}
                                            </SelectContent>
                                          </Select>
                                          <Button
                                            variant="ghost" size="icon" className="w-6 h-6 text-destructive hover:text-destructive"
                                            onClick={() => deleteAction.mutate(action.id)}
                                            data-testid={`button-delete-action-${action.id}`}
                                          >
                                            <Trash2 className="w-3 h-3" />
                                          </Button>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}

                              <Dialog open={showActionDialog === target.id} onOpenChange={v => setShowActionDialog(v ? target.id : null)}>
                                <DialogTrigger asChild>
                                  <Button variant="outline" size="sm" className="h-7 text-xs" data-testid={`button-add-action-${target.id}`}>
                                    <Plus className="w-3 h-3 mr-1" />Add Action
                                  </Button>
                                </DialogTrigger>
                                <DialogContent className="max-w-md">
                                  <DialogHeader>
                                    <DialogTitle>Add Action</DialogTitle>
                                  </DialogHeader>
                                  <ActionForm targetId={target.id} onSave={data => createAction.mutate(data)} />
                                </DialogContent>
                              </Dialog>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
