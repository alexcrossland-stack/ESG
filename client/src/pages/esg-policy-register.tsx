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
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, Plus, AlertTriangle, Clock, CheckCircle, Users, Edit, Trash2, Shield } from "lucide-react";
import { PageGuidance } from "@/components/page-guidance";

type PolicyRecord = {
  id: string;
  title: string;
  policyType: string;
  owner: string | null;
  status: string;
  effectiveDate: string | null;
  reviewDate: string | null;
  documentLink: string | null;
  notes: string | null;
};

type GovernanceAssignment = {
  id: string;
  area: string;
  ownerName: string | null;
  ownerTitle: string | null;
  responsibilities: string | null;
};

const STATUS_CONFIG: Record<string, { label: string; color: string; badge: any }> = {
  draft: { label: "Draft", color: "text-muted-foreground", badge: "secondary" },
  active: { label: "Active", color: "text-green-600", badge: "default" },
  under_review: { label: "Under Review", color: "text-amber-600", badge: "outline" },
  retired: { label: "Retired", color: "text-red-500", badge: "destructive" },
};

const POLICY_TYPE_LABELS: Record<string, string> = {
  environmental: "Environmental",
  social: "Social",
  governance: "Governance",
  health_safety: "Health & Safety",
  data_privacy: "Data Privacy",
  anti_bribery: "Anti-Bribery",
  whistleblowing: "Whistleblowing",
  cybersecurity: "Cybersecurity",
  supplier: "Supplier",
  climate: "Climate",
  other: "Other",
};

const GOVERNANCE_AREAS = [
  { area: "environment", label: "Environment" },
  { area: "social", label: "Social" },
  { area: "governance", label: "Governance" },
  { area: "climate", label: "Climate" },
  { area: "privacy_cyber", label: "Privacy & Cyber" },
];

function isOverdue(reviewDate: string | null): boolean {
  if (!reviewDate) return false;
  return new Date(reviewDate) < new Date();
}

function isUpcoming(reviewDate: string | null): boolean {
  if (!reviewDate) return false;
  const d = new Date(reviewDate);
  const in90 = new Date();
  in90.setDate(in90.getDate() + 90);
  return d >= new Date() && d <= in90;
}

function PolicyForm({ onSave, initial }: { onSave: (data: any) => void; initial?: PolicyRecord }) {
  const { register, handleSubmit, setValue, watch } = useForm({
    defaultValues: {
      title: initial?.title ?? "",
      policyType: initial?.policyType ?? "other",
      owner: initial?.owner ?? "",
      status: initial?.status ?? "draft",
      effectiveDate: initial?.effectiveDate ? initial.effectiveDate.split("T")[0] : "",
      reviewDate: initial?.reviewDate ? initial.reviewDate.split("T")[0] : "",
      documentLink: initial?.documentLink ?? "",
      notes: initial?.notes ?? "",
    },
  });

  return (
    <form onSubmit={handleSubmit(onSave)} className="space-y-4">
      <div className="space-y-1">
        <Label>Policy Title *</Label>
        <Input {...register("title", { required: true })} placeholder="e.g. Environmental Management Policy" data-testid="input-policy-title" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Type</Label>
          <Select defaultValue={initial?.policyType ?? "other"} onValueChange={v => setValue("policyType", v)}>
            <SelectTrigger data-testid="select-policy-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(POLICY_TYPE_LABELS).map(([v, l]) => (
                <SelectItem key={v} value={v}>{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Status</Label>
          <Select defaultValue={initial?.status ?? "draft"} onValueChange={v => setValue("status", v)}>
            <SelectTrigger data-testid="select-policy-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(STATUS_CONFIG).map(([v, c]) => (
                <SelectItem key={v} value={v}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1">
        <Label>Owner</Label>
        <Input {...register("owner")} placeholder="Policy owner name or role" data-testid="input-policy-owner" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Effective Date</Label>
          <Input type="date" {...register("effectiveDate")} data-testid="input-policy-effective-date" />
        </div>
        <div className="space-y-1">
          <Label>Review Date</Label>
          <Input type="date" {...register("reviewDate")} data-testid="input-policy-review-date" />
        </div>
      </div>
      <div className="space-y-1">
        <Label>Document Link</Label>
        <Input {...register("documentLink")} placeholder="https://..." data-testid="input-policy-doc-link" />
      </div>
      <div className="space-y-1">
        <Label>Notes</Label>
        <Textarea {...register("notes")} rows={2} className="resize-none" data-testid="textarea-policy-notes" />
      </div>
      <Button type="submit" className="w-full" data-testid="button-save-policy">Save Policy</Button>
    </form>
  );
}

function GovernanceAssignmentCard({ area, label, assignment, onSave }: {
  area: string;
  label: string;
  assignment?: GovernanceAssignment;
  onSave: (data: any) => void;
}) {
  const [editing, setEditing] = useState(false);
  const { register, handleSubmit } = useForm({
    defaultValues: {
      ownerName: assignment?.ownerName ?? "",
      ownerTitle: assignment?.ownerTitle ?? "",
      responsibilities: assignment?.responsibilities ?? "",
    },
  });

  return (
    <Card data-testid={`governance-card-${area}`} className="border border-border">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-purple-500" />
              <span className="text-sm font-medium">{label}</span>
              {assignment?.ownerName && <Badge variant="secondary" className="text-xs">{assignment.ownerName}</Badge>}
            </div>
            {assignment?.ownerTitle && (
              <p className="text-xs text-muted-foreground mt-1">{assignment.ownerTitle}</p>
            )}
            {assignment?.responsibilities && (
              <p className="text-xs text-muted-foreground mt-1">{assignment.responsibilities}</p>
            )}
          </div>
          <Button
            variant="ghost" size="sm"
            onClick={() => setEditing(!editing)}
            data-testid={`button-edit-governance-${area}`}
          >
            <Edit className="w-3.5 h-3.5" />
          </Button>
        </div>
        {editing && (
          <form onSubmit={handleSubmit(data => { onSave(data); setEditing(false); })} className="mt-4 space-y-3 border-t border-border pt-3">
            <div className="space-y-1">
              <Label className="text-xs">Owner Name</Label>
              <Input {...register("ownerName")} placeholder="Name" className="h-8 text-sm" data-testid={`input-gov-owner-${area}`} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Title / Role</Label>
              <Input {...register("ownerTitle")} placeholder="e.g. Head of Sustainability" className="h-8 text-sm" data-testid={`input-gov-title-${area}`} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Responsibilities</Label>
              <Textarea {...register("responsibilities")} rows={2} className="text-sm resize-none" data-testid={`textarea-gov-resp-${area}`} />
            </div>
            <div className="flex gap-2">
              <Button type="submit" size="sm" data-testid={`button-save-gov-${area}`}>Save</Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

export default function EsgPolicyRegisterPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showDialog, setShowDialog] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<PolicyRecord | null>(null);

  const { data: policies = [], isLoading: policiesLoading } = useQuery<PolicyRecord[]>({
    queryKey: ["/api/policy-records"],
  });
  const { data: assignments = [], isLoading: assignmentsLoading } = useQuery<GovernanceAssignment[]>({
    queryKey: ["/api/governance-assignments"],
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/policy-records", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/policy-records"] });
      setShowDialog(false);
      setEditingPolicy(null);
      toast({ title: "Policy saved" });
    },
    onError: () => toast({ title: "Save failed", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => apiRequest("PATCH", `/api/policy-records/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/policy-records"] });
      setShowDialog(false);
      setEditingPolicy(null);
      toast({ title: "Policy updated" });
    },
    onError: () => toast({ title: "Update failed", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/policy-records/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/policy-records"] });
      toast({ title: "Policy deleted" });
    },
    onError: () => toast({ title: "Delete failed", variant: "destructive" }),
  });

  const govMutation = useMutation({
    mutationFn: ({ area, data }: { area: string; data: any }) => apiRequest("PUT", `/api/governance-assignments/${area}`, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/governance-assignments"] }),
    onError: () => toast({ title: "Save failed", variant: "destructive" }),
  });

  const overduePolicies = policies.filter(p => p.status !== "retired" && isOverdue(p.reviewDate));
  const upcomingPolicies = policies.filter(p => p.status !== "retired" && !isOverdue(p.reviewDate) && isUpcoming(p.reviewDate));
  const assignedAreas = new Set(assignments.map(a => a.area));
  const govCompleteness = Math.round((assignedAreas.size / GOVERNANCE_AREAS.length) * 100);

  const handleSave = (data: any) => {
    if (editingPolicy) {
      updateMutation.mutate({ id: editingPolicy.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  if (policiesLoading || assignmentsLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 gap-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            Policy Register
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Track policies, owners, review dates and governance area assignments</p>
        </div>
        <Dialog open={showDialog} onOpenChange={v => { setShowDialog(v); if (!v) setEditingPolicy(null); }}>

          <DialogTrigger asChild>
            <Button size="sm" data-testid="button-add-policy">
              <Plus className="w-4 h-4 mr-1" /> Add Policy
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingPolicy ? "Edit Policy" : "Add Policy"}</DialogTitle>
            </DialogHeader>
            <PolicyForm onSave={handleSave} initial={editingPolicy ?? undefined} />
          </DialogContent>
        </Dialog>
      </div>

      <PageGuidance
        pageKey="esg-policy-register"
        title="What is the Policy Register?"
        summary="The Policy Register is a central record of all your ESG-related policies — from environmental management to health & safety, diversity, and data privacy. It tracks who owns each policy, when it was last reviewed, and when the next review is due. The Governance tab lets you assign board members or managers to specific ESG responsibility areas."
        goodLooksLike="Every relevant ESG policy is listed with an active owner and a review date no more than 12 months out. Overdue reviews are resolved promptly, and governance roles are assigned to named individuals rather than job titles alone."
        steps={[
          "Click 'Add Policy' to create a new record for each ESG-related policy your business has.",
          "Set the policy type (e.g. Environmental, H&S, Diversity) and assign a named owner.",
          "Add the effective date and next review date so nothing slips through the cracks.",
          "Optionally link to the actual policy document using the document link field.",
          "Switch to the Governance tab to assign board or management accountability for each ESG area.",
          "Review and update the register at least annually or after major organisational changes.",
        ]}
      />

      {(overduePolicies.length > 0 || upcomingPolicies.length > 0) && (
        <div className="flex flex-wrap gap-3">
          {overduePolicies.length > 0 && (
            <Card className="flex-1 min-w-56 border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/20">
              <CardContent className="p-3 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-500" />
                <span className="text-sm font-medium text-red-700 dark:text-red-400">
                  {overduePolicies.length} overdue review{overduePolicies.length > 1 ? "s" : ""}
                </span>
              </CardContent>
            </Card>
          )}
          {upcomingPolicies.length > 0 && (
            <Card className="flex-1 min-w-56 border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/20">
              <CardContent className="p-3 flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-500" />
                <span className="text-sm font-medium text-amber-700 dark:text-amber-400">
                  {upcomingPolicies.length} review{upcomingPolicies.length > 1 ? "s" : ""} due within 90 days
                </span>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <Tabs defaultValue="policies">
        <TabsList>
          <TabsTrigger value="policies" data-testid="tab-policies">Policies ({policies.length})</TabsTrigger>
          <TabsTrigger value="governance" data-testid="tab-governance">
            Governance Ownership
            <Badge variant="secondary" className="ml-2 text-xs">{govCompleteness}%</Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="policies" className="mt-4 space-y-3">
          {policies.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <FileText className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No policies yet. Add your first policy to get started.</p>
              </CardContent>
            </Card>
          ) : (
            policies.map(policy => {
              const statusCfg = STATUS_CONFIG[policy.status] ?? STATUS_CONFIG.draft;
              const overdue = isOverdue(policy.reviewDate);
              const upcoming = isUpcoming(policy.reviewDate);
              return (
                <Card
                  key={policy.id}
                  data-testid={`policy-card-${policy.id}`}
                  className={`border ${overdue && policy.status !== "retired" ? "border-red-200 dark:border-red-900" : upcoming ? "border-amber-200 dark:border-amber-900" : "border-border"}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium">{policy.title}</span>
                          <Badge variant={statusCfg.badge}>{statusCfg.label}</Badge>
                          <Badge variant="outline" className="text-xs">{POLICY_TYPE_LABELS[policy.policyType] ?? policy.policyType}</Badge>
                          {overdue && policy.status !== "retired" && (
                            <Badge variant="destructive" className="text-xs">
                              <AlertTriangle className="w-3 h-3 mr-1" />Overdue
                            </Badge>
                          )}
                          {upcoming && !overdue && (
                            <Badge className="text-xs bg-amber-500">
                              <Clock className="w-3 h-3 mr-1" />Due Soon
                            </Badge>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-4 mt-2 text-xs text-muted-foreground">
                          {policy.owner && <span>Owner: <span className="font-medium text-foreground">{policy.owner}</span></span>}
                          {policy.effectiveDate && <span>Effective: <span className="font-medium text-foreground">{new Date(policy.effectiveDate).toLocaleDateString()}</span></span>}
                          {policy.reviewDate && <span className={overdue ? "text-red-500" : upcoming ? "text-amber-500" : ""}>Review: <span className="font-medium">{new Date(policy.reviewDate).toLocaleDateString()}</span></span>}
                          {policy.documentLink && (
                            <a href={policy.documentLink} target="_blank" rel="noreferrer" className="text-primary hover:underline" data-testid={`link-policy-doc-${policy.id}`}>
                              View Document
                            </a>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="ghost" size="icon" className="w-7 h-7"
                          onClick={() => { setEditingPolicy(policy); setShowDialog(true); }}
                          data-testid={`button-edit-policy-${policy.id}`}
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost" size="icon" className="w-7 h-7 text-destructive hover:text-destructive"
                          onClick={() => deleteMutation.mutate(policy.id)}
                          data-testid={`button-delete-policy-${policy.id}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>

        <TabsContent value="governance" className="mt-4 space-y-4">
          <div className="flex items-center gap-3 p-3 rounded-md border border-border bg-muted/30">
            <CheckCircle className={`w-5 h-5 ${govCompleteness === 100 ? "text-green-500" : govCompleteness >= 60 ? "text-amber-500" : "text-red-500"}`} />
            <div className="flex-1">
              <span className="text-sm font-medium">Governance completeness: {govCompleteness}%</span>
              <p className="text-xs text-muted-foreground">{assignedAreas.size} of {GOVERNANCE_AREAS.length} areas have an assigned owner</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {GOVERNANCE_AREAS.map(({ area, label }) => (
              <GovernanceAssignmentCard
                key={area}
                area={area}
                label={label}
                assignment={assignments.find(a => a.area === area)}
                onSave={(data) => govMutation.mutate({ area, data })}
              />
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
