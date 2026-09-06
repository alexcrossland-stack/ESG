import { useState } from "react";
import { useSearch } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { CheckSquare, Plus, Edit2, Trash2, Calendar, User, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { usePermissions } from "@/lib/permissions";
import { OwnerAssignment } from "@/components/owner-assignment";
import { PageHeader, PageLayout } from "@/components/page-layout";

type ActionPlan = {
  id: string;
  title: string;
  description: string | null;
  owner: string | null;
  dueDate: string | null;
  status: "not_started" | "in_progress" | "complete" | "overdue";
  notes: string | null;
  createdAt: string;
};

const STATUS_CONFIG = {
  not_started: { label: "Not Started", variant: "outline" as const, color: "text-muted-foreground" },
  in_progress: { label: "In Progress", variant: "secondary" as const, color: "text-blue-500" },
  complete: { label: "Complete", variant: "default" as const, color: "text-primary" },
  overdue: { label: "Overdue", variant: "destructive" as const, color: "text-destructive" },
};

const actionSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters"),
  description: z.string().optional(),
  owner: z.string().optional(),
  dueDate: z.string().optional(),
  status: z.enum(["not_started", "in_progress", "complete", "overdue"]),
  notes: z.string().optional(),
});

function ActionDialog({
  action,
  onClose,
}: {
  action?: ActionPlan;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isEditing = !!action;

  const form = useForm<z.infer<typeof actionSchema>>({
    resolver: zodResolver(actionSchema),
    defaultValues: {
      title: action?.title || "",
      description: action?.description || "",
      owner: action?.owner || "",
      dueDate: action?.dueDate ? format(new Date(action.dueDate), "yyyy-MM-dd") : "",
      status: action?.status || "not_started",
      notes: action?.notes || "",
    },
  });

  const mutation = useMutation({
    mutationFn: (data: z.infer<typeof actionSchema>) => {
      const payload = { ...data, dueDate: data.dueDate ? new Date(data.dueDate).toISOString() : null };
      return isEditing
        ? apiRequest("PUT", `/api/actions/${action!.id}`, payload)
        : apiRequest("POST", "/api/actions", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/actions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      toast({ title: isEditing ? "Action updated" : "Action created" });
      onClose();
    },
    onError: () => toast({ title: "Failed to save", variant: "destructive" }),
  });

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>{isEditing ? "Edit Action" : "New Improvement Action"}</DialogTitle>
        <DialogDescription>Describe the work, assign an owner and choose a due date.</DialogDescription>
      </DialogHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(d => mutation.mutate(d))} className="space-y-4 pt-2">
          <FormField control={form.control} name="title" render={({ field }) => (
            <FormItem>
              <FormLabel>Action Title</FormLabel>
              <FormControl>
                <Input placeholder="e.g. Switch to LED lighting" {...field} data-testid="input-action-title" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="description" render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Textarea placeholder="What needs to be done and why?" className="resize-none min-h-20" {...field} data-testid="input-action-desc" />
              </FormControl>
            </FormItem>
          )} />
          <div className="grid grid-cols-2 gap-3">
            <FormField control={form.control} name="owner" render={({ field }) => (
              <FormItem>
                <FormLabel>Owner</FormLabel>
                <FormControl>
                  <Input placeholder="HR Manager" {...field} data-testid="input-action-owner" />
                </FormControl>
              </FormItem>
            )} />
            <FormField control={form.control} name="dueDate" render={({ field }) => (
              <FormItem>
                <FormLabel>Due Date</FormLabel>
                <FormControl>
                  <Input type="date" {...field} data-testid="input-action-due" />
                </FormControl>
              </FormItem>
            )} />
          </div>
          <FormField control={form.control} name="status" render={({ field }) => (
            <FormItem>
              <FormLabel>Status</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger data-testid="select-action-status"><SelectValue /></SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="not_started">Not Started</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="complete">Complete</SelectItem>
                  <SelectItem value="overdue">Overdue</SelectItem>
                </SelectContent>
              </Select>
            </FormItem>
          )} />
          <FormField control={form.control} name="notes" render={({ field }) => (
            <FormItem>
              <FormLabel>Progress Notes</FormLabel>
              <FormControl>
                <Textarea placeholder="Any updates or notes?" className="resize-none" {...field} data-testid="input-action-notes" />
              </FormControl>
            </FormItem>
          )} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={mutation.isPending} data-testid="button-save-action">
              {mutation.isPending ? "Saving..." : (isEditing ? "Save Changes" : "Create Action")}
            </Button>
          </div>
        </form>
      </Form>
    </DialogContent>
  );
}

export default function Actions() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const [editAction, setEditAction] = useState<ActionPlan | undefined>();
  const search = useSearch();
  const [showCreate, setShowCreate] = useState(() => can("metrics_data_entry") && new URLSearchParams(search).get("create") === "true");
  const [filter, setFilter] = useState<string>("all");

  const { data: actions = [], isLoading } = useQuery<ActionPlan[]>({ queryKey: ["/api/actions"] });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/actions/${id}`, undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/actions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      toast({ title: "Action deleted" });
    },
  });

  if (isLoading) {
    return <PageLayout>{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24" />)}</PageLayout>;
  }

  const filtered = filter === "all" ? actions : actions.filter(a => a.status === filter);
  const counts = {
    all: actions.length,
    not_started: actions.filter(a => a.status === "not_started").length,
    in_progress: actions.filter(a => a.status === "in_progress").length,
    complete: actions.filter(a => a.status === "complete").length,
    overdue: actions.filter(a => a.status === "overdue").length,
  };

  return (
    <PageLayout>
      <PageHeader
        title="Action Tracker"
        description="Track your ESG improvement actions and progress"
        actions={can("metrics_data_entry") ? (
          <Dialog open={showCreate} onOpenChange={setShowCreate}>
            <DialogTrigger asChild>
              <Button data-testid="button-new-action">
                <Plus className="h-4 w-4" />
                New Action
              </Button>
            </DialogTrigger>
            <ActionDialog onClose={() => setShowCreate(false)} />
          </Dialog>
        ) : undefined}
      />

      {/* Status filter */}
      <div className="flex flex-wrap gap-1 rounded-xl border bg-card p-2" role="group" aria-label="Filter actions by status">
        {[
          { key: "all", label: "All" },
          { key: "not_started", label: "Not Started" },
          { key: "in_progress", label: "In Progress" },
          { key: "complete", label: "Complete" },
          { key: "overdue", label: "Overdue" },
        ].map(({ key, label }) => (
          <Button
            key={key}
            variant={filter === key ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setFilter(key)}
            aria-pressed={filter === key}
            data-testid={`filter-${key}`}
          >
            {label}
            <Badge variant={filter === key ? "secondary" : "outline"} className="ml-1.5 text-xs">
              {counts[key as keyof typeof counts]}
            </Badge>
          </Button>
        ))}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total", count: counts.all, color: "text-foreground" },
          { label: "In Progress", count: counts.in_progress, color: "text-blue-500" },
          { label: "Complete", count: counts.complete, color: "text-primary" },
          { label: "Overdue", count: counts.overdue, color: "text-destructive" },
        ].map(({ label, count, color }) => (
          <Card key={label}>
            <CardContent className="p-4 sm:p-5">
              <div className="text-xs font-medium text-muted-foreground">{label}</div>
              <div className={`mt-2 text-2xl font-semibold tabular-nums ${color}`}>{count}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Actions list */}
      <div className="space-y-3">
        {filtered.map(action => {
          const statusConfig = STATUS_CONFIG[action.status];
          const isOverdue = action.dueDate && new Date(action.dueDate) < new Date() && action.status !== "complete";

          return (
            <Card key={action.id} data-testid={`action-card-${action.id}`}>
              <CardContent className="p-4">
                <div className="flex flex-col items-start gap-3 sm:flex-row">
                  <div className="w-full min-w-0 flex-1 space-y-2 sm:w-auto">
                    <div className="flex items-start gap-2 flex-wrap">
                      <h3 className="min-w-0 max-w-full break-words text-sm font-semibold">{action.title}</h3>
                      <Badge variant={statusConfig.variant} className="text-xs shrink-0">
                        {statusConfig.label}
                      </Badge>
                      {isOverdue && (
                        <Badge variant="destructive" className="text-xs shrink-0">
                          <AlertTriangle className="w-3 h-3 mr-1" />
                          Overdue
                        </Badge>
                      )}
                    </div>
                    {action.description && (
                      <p className="line-clamp-2 break-words text-sm text-muted-foreground">{action.description}</p>
                    )}
                    <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                      <span className="flex items-center gap-1">
                        <User className="w-3 h-3" />
                        <OwnerAssignment entityType="action_plans" entityId={action.id} currentUserId={(action as any).assignedUserId} invalidateKeys={[["/api/actions"]]} />
                      </span>
                      {action.dueDate && (
                        <span className={`flex items-center gap-1 ${isOverdue ? "text-destructive" : ""}`}>
                          <Calendar className="w-3 h-3" />
                          Due: {format(new Date(action.dueDate), "dd MMM yyyy")}
                        </span>
                      )}
                    </div>
                    {action.notes && (
                      <p className="break-words rounded-md bg-muted/50 px-2 py-1.5 text-xs italic text-muted-foreground">
                        {action.notes}
                      </p>
                    )}
                  </div>
                  {can("metrics_data_entry") && (
                    <div className="flex shrink-0 items-center gap-1 self-end sm:self-start">
                      <Dialog
                        open={editAction?.id === action.id}
                        onOpenChange={open => !open && setEditAction(undefined)}
                      >
                        <DialogTrigger asChild>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => setEditAction(action)}
                            aria-label={`Edit ${action.title}`}
                            data-testid={`button-edit-action-${action.id}`}
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </Button>
                        </DialogTrigger>
                        <ActionDialog action={editAction} onClose={() => setEditAction(undefined)} />
                      </Dialog>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => deleteMutation.mutate(action.id)}
                        aria-label={`Delete ${action.title}`}
                        data-testid={`button-delete-action-${action.id}`}
                      >
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}

        {filtered.length === 0 && (
          <div className="text-center py-12 space-y-2">
            <CheckSquare className="w-8 h-8 text-muted-foreground mx-auto" />
            <p className="text-sm text-muted-foreground">
              {filter === "all" ? "No actions yet. Create your first improvement action." : `No ${filter.replace(/_/g, " ")} actions.`}
            </p>
            {filter === "all" && can("metrics_data_entry") && (
              <Button size="sm" variant="outline" onClick={() => setShowCreate(true)}>
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                Create First Action
              </Button>
            )}
          </div>
        )}
      </div>
    </PageLayout>
  );
}
