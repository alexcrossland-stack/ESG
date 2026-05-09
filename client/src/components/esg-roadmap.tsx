import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { usePermissions } from "@/lib/permissions";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  CalendarDays,
  CheckCircle2,
  CircleDashed,
  Clock3,
  Edit3,
  Loader2,
  Map,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";

type RoadmapStatus = "planned" | "in_progress" | "blocked" | "completed";

type RoadmapItem = {
  id: string;
  title: string;
  description?: string;
  targetLabel?: string;
  targetMonth?: number | null;
  dueDate?: string | null;
  status: RoadmapStatus;
  owner?: string;
  ownerUserId?: string | null;
  category?: string;
  source?: "generated" | "manual";
};

type Roadmap = {
  items: RoadmapItem[];
  generatedAt?: string | null;
  updatedAt?: string | null;
  maturityLevel?: string;
};

type RoadmapFormState = {
  title: string;
  description: string;
  targetLabel: string;
  dueDate: string;
  status: RoadmapStatus;
  owner: string;
  category: string;
};

const EMPTY_FORM: RoadmapFormState = {
  title: "",
  description: "",
  targetLabel: "",
  dueDate: "",
  status: "planned",
  owner: "",
  category: "general",
};

const STATUS_LABELS: Record<RoadmapStatus, string> = {
  planned: "Planned",
  in_progress: "In progress",
  blocked: "Blocked",
  completed: "Completed",
};

const STATUS_STYLES: Record<RoadmapStatus, string> = {
  planned: "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300",
  in_progress: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300",
  blocked: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300",
  completed: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300",
};

const CATEGORY_OPTIONS = [
  "general",
  "environmental",
  "social",
  "governance",
  "data",
  "policy",
  "reporting",
  "compliance",
];

function toFormState(item?: RoadmapItem): RoadmapFormState {
  if (!item) return EMPTY_FORM;
  return {
    title: item.title || "",
    description: item.description || "",
    targetLabel: item.targetLabel || (item.targetMonth ? `Month ${item.targetMonth}` : ""),
    dueDate: item.dueDate || "",
    status: item.status || "planned",
    owner: item.owner || "",
    category: item.category || "general",
  };
}

function formatDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function itemTarget(item: RoadmapItem) {
  if (item.dueDate) return formatDate(item.dueDate);
  if (item.targetLabel) return item.targetLabel;
  if (item.targetMonth) return `Month ${item.targetMonth}`;
  return "No target set";
}

function statusIcon(status: RoadmapStatus) {
  if (status === "completed") return CheckCircle2;
  if (status === "in_progress") return Clock3;
  return CircleDashed;
}

export function EsgRoadmap() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { can, isAdmin, isSuperAdmin } = usePermissions();
  const canManageRoadmap = isAdmin || isSuperAdmin || can("policy_editing");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<RoadmapItem | null>(null);
  const [form, setForm] = useState<RoadmapFormState>(EMPTY_FORM);

  const { data, isLoading } = useQuery<{ roadmap: Roadmap | null }>({
    queryKey: ["/api/esg/roadmap"],
  });

  const roadmap = data?.roadmap;
  const items = roadmap?.items || [];

  const statusCounts = useMemo(() => {
    return items.reduce<Record<RoadmapStatus, number>>((acc, item) => {
      acc[item.status] = (acc[item.status] || 0) + 1;
      return acc;
    }, { planned: 0, in_progress: 0, blocked: 0, completed: 0 });
  }, [items]);

  const generateMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/esg/roadmap", {}).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/esg/roadmap"] });
      toast({ title: "Roadmap generated", description: "Your ESG roadmap is ready to edit." });
    },
    onError: (e: any) => {
      toast({ title: "Generation failed", description: e.message || "Could not generate roadmap", variant: "destructive" });
    },
  });

  const createMutation = useMutation({
    mutationFn: (payload: RoadmapFormState) => apiRequest("POST", "/api/esg/roadmap/items", payload).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/esg/roadmap"] });
      setDialogOpen(false);
      toast({ title: "Roadmap item added" });
    },
    onError: (e: any) => toast({ title: "Could not add roadmap item", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: RoadmapFormState }) =>
      apiRequest("PATCH", `/api/esg/roadmap/items/${id}`, payload).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/esg/roadmap"] });
      setDialogOpen(false);
      toast({ title: "Roadmap item updated" });
    },
    onError: (e: any) => toast({ title: "Could not update roadmap item", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/esg/roadmap/items/${id}`).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/esg/roadmap"] });
      toast({ title: "Roadmap item deleted" });
    },
    onError: (e: any) => toast({ title: "Could not delete roadmap item", description: e.message, variant: "destructive" }),
  });

  useEffect(() => {
    if (!dialogOpen) {
      setEditingItem(null);
      setForm(EMPTY_FORM);
    }
  }, [dialogOpen]);

  function openCreateDialog() {
    setEditingItem(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  function openEditDialog(item: RoadmapItem) {
    setEditingItem(item);
    setForm(toFormState(item));
    setDialogOpen(true);
  }

  function submitForm() {
    const payload = {
      ...form,
      title: form.title.trim(),
      description: form.description.trim(),
      targetLabel: form.targetLabel.trim(),
      dueDate: form.dueDate || "",
      owner: form.owner.trim(),
      category: form.category.trim() || "general",
    };
    if (!payload.title) {
      toast({ title: "Title is required", variant: "destructive" });
      return;
    }
    if (editingItem) updateMutation.mutate({ id: editingItem.id, payload });
    else createMutation.mutate(payload);
  }

  const saving = createMutation.isPending || updateMutation.isPending;

  if (isLoading) {
    return (
      <Card>
        <CardHeader><Skeleton className="h-6 w-48" /></CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-24" />)}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5" data-testid="roadmap-workspace">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Map className="w-6 h-6 text-primary" />
            ESG Roadmap
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Track ESG milestones by target date, owner, status, and theme.
          </p>
          {(roadmap?.generatedAt || roadmap?.updatedAt || roadmap?.maturityLevel) && (
            <div className="flex flex-wrap items-center gap-2 mt-3 text-xs text-muted-foreground">
              {roadmap?.maturityLevel && <Badge variant="secondary">{roadmap.maturityLevel.replace(/_/g, " ")}</Badge>}
              {roadmap?.generatedAt && <span>Generated {formatDate(roadmap.generatedAt)}</span>}
              {roadmap?.updatedAt && <span>Updated {formatDate(roadmap.updatedAt)}</span>}
            </div>
          )}
        </div>
        {canManageRoadmap && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => generateMutation.mutate()} disabled={generateMutation.isPending} data-testid="button-regenerate-roadmap">
              {generateMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
              {items.length > 0 ? "Regenerate" : "Generate"}
            </Button>
            <Button onClick={openCreateDialog} data-testid="button-add-roadmap-item">
              <Plus className="w-4 h-4 mr-2" />
              Add item
            </Button>
          </div>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {(["planned", "in_progress", "blocked", "completed"] as RoadmapStatus[]).map(status => (
          <Card key={status} className="rounded-lg">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">{STATUS_LABELS[status]}</p>
                <p className="text-2xl font-semibold" data-testid={`roadmap-status-count-${status}`}>{statusCounts[status] || 0}</p>
              </div>
              <Badge variant="outline" className={STATUS_STYLES[status]}>{STATUS_LABELS[status]}</Badge>
            </CardContent>
          </Card>
        ))}
      </div>

      {items.length === 0 ? (
        <Card data-testid="card-roadmap-empty">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center space-y-4">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <Map className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-lg">No roadmap items yet</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-md">
                Generate a starter ESG roadmap or add your own company milestones.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2" data-testid="roadmap-items-list">
          {items.map(item => {
            const StatusIcon = statusIcon(item.status);
            return (
              <Card key={item.id} className="rounded-lg" data-testid={`roadmap-item-${item.id}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className={STATUS_STYLES[item.status]}>
                          <StatusIcon className="w-3 h-3 mr-1" />
                          {STATUS_LABELS[item.status]}
                        </Badge>
                        {item.category && <Badge variant="secondary" className="capitalize">{item.category}</Badge>}
                        {item.source === "generated" && <Badge variant="outline">Generated</Badge>}
                      </div>
                      <CardTitle className="text-base leading-snug">{item.title}</CardTitle>
                    </div>
                    {canManageRoadmap && (
                      <div className="flex items-center gap-1 shrink-0">
                        <Button variant="ghost" size="icon" onClick={() => openEditDialog(item)} data-testid={`button-edit-roadmap-item-${item.id}`} aria-label={`Edit ${item.title}`}>
                          <Edit3 className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            if (window.confirm("Delete this roadmap item?")) deleteMutation.mutate(item.id);
                          }}
                          disabled={deleteMutation.isPending}
                          data-testid={`button-delete-roadmap-item-${item.id}`}
                          aria-label={`Delete ${item.title}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="pt-0 space-y-3">
                  {item.description && <p className="text-sm text-muted-foreground">{item.description}</p>}
                  <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <CalendarDays className="w-3.5 h-3.5" />
                      {itemTarget(item)}
                    </span>
                    {item.owner && <span>Owner: {item.owner}</span>}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg" data-testid="dialog-roadmap-item">
          <DialogHeader>
            <DialogTitle>{editingItem ? "Edit roadmap item" : "Add roadmap item"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="roadmap-title">Title</Label>
              <Input
                id="roadmap-title"
                value={form.title}
                onChange={event => setForm(current => ({ ...current, title: event.target.value }))}
                data-testid="input-roadmap-title"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="roadmap-description">Description</Label>
              <Textarea
                id="roadmap-description"
                value={form.description}
                onChange={event => setForm(current => ({ ...current, description: event.target.value }))}
                rows={3}
                data-testid="textarea-roadmap-description"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="roadmap-target">Target month/quarter</Label>
                <Input
                  id="roadmap-target"
                  placeholder="Month 3 or Q2"
                  value={form.targetLabel}
                  onChange={event => setForm(current => ({ ...current, targetLabel: event.target.value }))}
                  data-testid="input-roadmap-target"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="roadmap-due-date">Due date</Label>
                <Input
                  id="roadmap-due-date"
                  type="date"
                  value={form.dueDate}
                  onChange={event => setForm(current => ({ ...current, dueDate: event.target.value }))}
                  data-testid="input-roadmap-due-date"
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={value => setForm(current => ({ ...current, status: value as RoadmapStatus }))}>
                  <SelectTrigger data-testid="select-roadmap-status"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Theme</Label>
                <Select value={form.category} onValueChange={value => setForm(current => ({ ...current, category: value }))}>
                  <SelectTrigger data-testid="select-roadmap-category"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORY_OPTIONS.map(value => <SelectItem key={value} value={value} className="capitalize">{value}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="roadmap-owner">Owner</Label>
                <Input
                  id="roadmap-owner"
                  value={form.owner}
                  onChange={event => setForm(current => ({ ...current, owner: event.target.value }))}
                  data-testid="input-roadmap-owner"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={submitForm} disabled={saving} data-testid="button-save-roadmap-item">
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editingItem ? "Save changes" : "Add item"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
