import { useState, type ChangeEvent, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { FileText, Plus, AlertTriangle, Clock, CheckCircle, Edit, Trash2, Shield } from "lucide-react";
import { PageGuidance } from "@/components/page-guidance";
import { usePermissions } from "@/lib/permissions";
import { Link } from "wouter";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";

type PolicyAttachment = {
  id: string;
  fileName: string;
  storagePath: string | null;
  objectKey: string | null;
  mimeType: string | null;
  size: number | null;
  uploadedBy: string | null;
  uploadedAt: string | null;
  downloadUrl: string;
};

type PolicyRecord = {
  origin?: "template";
  id: string;
  title: string;
  policyType: string;
  owner: string | null;
  status: string;
  effectiveDate: string | null;
  reviewDate: string | null;
  documentLink: string | null;
  notes: string | null;
  attachment: PolicyAttachment | null;
};

type GovernanceAssignment = {
  id: string;
  area: string;
  ownerName: string | null;
  ownerTitle: string | null;
  responsibilities: string | null;
};

type LegacyPolicyResponse = {
  policy: {
    id: string;
    status: "draft" | "published" | null;
    reviewDate: string | null;
  } | null;
  latestVersion: { versionNumber: number } | null;
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

const POLICY_ATTACHMENT_ACCEPT = ".pdf,.doc,.docx";

function formatFileSize(size: number | null): string {
  if (!size) return "";
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

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

function PolicyForm({ onSave, initial, saving = false }: { onSave: (data: any) => void; initial?: PolicyRecord; saving?: boolean }) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [removeExistingAttachment, setRemoveExistingAttachment] = useState(false);
  const { register, handleSubmit, setValue } = useForm({
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

  const submitPolicy = (data: any) => {
    if (selectedFile || removeExistingAttachment) {
      const formData = new FormData();
      formData.append("title", data.title);
      formData.append("policyType", data.policyType);
      formData.append("owner", data.owner || "");
      formData.append("status", data.status);
      formData.append("effectiveDate", data.effectiveDate || "");
      formData.append("reviewDate", data.reviewDate || "");
      formData.append("documentLink", data.documentLink || "");
      formData.append("notes", data.notes || "");
      if (selectedFile) formData.append("attachment", selectedFile, selectedFile.name);
      if (removeExistingAttachment) formData.append("removeAttachment", "true");
      onSave(formData);
      return;
    }

    onSave(data);
  };

  return (
    <form onSubmit={handleSubmit(submitPolicy)} className="space-y-4">
      <input type="hidden" {...register("policyType")} />
      <input type="hidden" {...register("status")} />
      <div className="space-y-1">
        <Label>Policy Title *</Label>
        <Input {...register("title", { required: true })} placeholder="e.g. Environmental Management Policy" data-testid="input-policy-title" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Type</Label>
          <Select defaultValue={initial?.policyType ?? "other"} onValueChange={(v: string) => setValue("policyType", v)}>
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
          <Select defaultValue={initial?.status ?? "draft"} onValueChange={(v: string) => setValue("status", v)}>
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
        <p className="text-xs text-muted-foreground">Provide a link, upload a file, or use both.</p>
      </div>
      <div className="space-y-2">
        <Label>Policy Attachment</Label>
        <Input
          type="file"
          accept={POLICY_ATTACHMENT_ACCEPT}
          data-testid="input-policy-attachment"
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            const nextFile = event.target.files?.[0] ?? null;
            setSelectedFile(nextFile);
            if (nextFile) setRemoveExistingAttachment(false);
            event.target.value = "";
          }}
        />
        <p className="text-xs text-muted-foreground">Accepted formats: PDF, DOC, DOCX. Max size 10 MB.</p>
        {initial?.attachment && !removeExistingAttachment && !selectedFile && (
          <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs" data-testid="policy-existing-attachment">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-foreground truncate">{initial.attachment.fileName}</p>
                <p className="text-muted-foreground">
                  Existing attachment{initial.attachment.size ? ` • ${formatFileSize(initial.attachment.size)}` : ""}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setRemoveExistingAttachment(true)}
                data-testid="button-remove-policy-attachment"
              >
                Remove
              </Button>
            </div>
          </div>
        )}
        {removeExistingAttachment && !selectedFile && (
          <div className="rounded-md border border-dashed border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800" data-testid="policy-attachment-remove-pending">
            Existing attachment will be removed when you save.
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="ml-2 h-6 px-2 text-xs"
              onClick={() => setRemoveExistingAttachment(false)}
            >
              Undo
            </Button>
          </div>
        )}
        {selectedFile && (
          <div className="rounded-md border border-dashed border-primary/30 bg-primary/5 px-3 py-2 text-xs" data-testid="policy-selected-attachment">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-foreground truncate">{selectedFile.name}</p>
                <p className="text-muted-foreground">
                  New upload{selectedFile.size ? ` • ${formatFileSize(selectedFile.size)}` : ""}
                </p>
              </div>
              <Button type="button" size="sm" variant="ghost" onClick={() => setSelectedFile(null)}>
                Clear
              </Button>
            </div>
          </div>
        )}
      </div>
      <div className="space-y-1">
        <Label>Notes</Label>
        <Textarea {...register("notes")} rows={2} className="resize-none" data-testid="textarea-policy-notes" />
      </div>
      <div className="sticky -bottom-6 bg-background py-3 border-t"><Button type="submit" disabled={saving} className="w-full min-h-11" data-testid="button-save-policy">{saving ? "Saving…" : "Save policy"}</Button></div>
    </form>
  );
}

function GovernanceAssignmentCard({ area, label, assignment, onSave, canEdit }: {
  area: string;
  label: string;
  assignment?: GovernanceAssignment;
  onSave: (data: any) => void;
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const assignedOwnerName = assignment?.ownerName?.trim() || null;
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
              {assignedOwnerName && <Badge variant="secondary" className="text-xs">{assignedOwnerName}</Badge>}
            </div>
            {assignment?.ownerTitle && (
              <p className="text-xs text-muted-foreground mt-1">{assignment.ownerTitle}</p>
            )}
            {assignment?.responsibilities && (
              <p className="text-xs text-muted-foreground mt-1">{assignment.responsibilities}</p>
            )}
          </div>
          {canEdit && (
            <Button
              variant="ghost" size="sm"
              onClick={() => setEditing(!editing)}
              aria-label={`Edit ${label} governance owner`}
              data-testid={`button-edit-governance-${area}`}
            >
              <Edit className="w-3.5 h-3.5" />
            </Button>
          )}
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

export function PolicyRegisterWorkspace({
  embedded = false,
  draftsSection,
}: {
  embedded?: boolean;
  draftsSection?: ReactNode;
} = {}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const canManagePolicies = can("policy_editing");
  const [showDialog, setShowDialog] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<PolicyRecord | null>(null);
  const [search, setSearch] = useState("");

  const { data: registeredPolicies = [], isLoading: policiesLoading, isError: policiesError } = useQuery<PolicyRecord[]>({
    queryKey: ["/api/policy-records"],
  });
  const { data: generatedPolicies = [], isLoading: generatedPoliciesLoading, isError: generatedPoliciesError } = useQuery<any[]>({ queryKey: ["/api/generated-policies"] });
  const policies: PolicyRecord[] = [...registeredPolicies, ...generatedPolicies.map(policy => ({
    id: policy.id, title: policy.title || "Untitled policy", policyType: "other", owner: policy.policyOwner,
    status: policy.status === "published" || policy.status === "approved" ? "active" : policy.workflowStatus === "submitted" ? "under_review" : "draft",
    effectiveDate: policy.approvedAt || null, reviewDate: policy.reviewDate || null, documentLink: null,
    notes: null, attachment: null, origin: "template" as const,
  }))].sort((a, b) => a.title.localeCompare(b.title));
  const { data: legacyPolicyData, isLoading: legacyPolicyLoading } = useQuery<LegacyPolicyResponse>({
    queryKey: ["/api/policy"],
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
    onError: (e: any) => toast({ title: "Save failed", description: e?.message || "Unable to save policy right now.", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => apiRequest("PATCH", `/api/policy-records/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/policy-records"] });
      setShowDialog(false);
      setEditingPolicy(null);
      toast({ title: "Policy updated" });
    },
    onError: (e: any) => toast({ title: "Update failed", description: e?.message || "Unable to update policy right now.", variant: "destructive" }),
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

  const legacyPolicy = legacyPolicyData?.policy ?? null;
  const filteredPolicies = policies.filter(policy => `${policy.title} ${policy.owner || ""}`.toLowerCase().includes(search.trim().toLowerCase()));
  const showLegacyPolicy = legacyPolicy && "company esg policy".includes(search.trim().toLowerCase());
  const overduePolicies = policies.filter(p => p.status !== "retired" && isOverdue(p.reviewDate));
  const upcomingPolicies = policies.filter(p => p.status !== "retired" && !isOverdue(p.reviewDate) && isUpcoming(p.reviewDate));
  const overduePolicyCount = overduePolicies.length + (legacyPolicy && isOverdue(legacyPolicy.reviewDate) ? 1 : 0);
  const upcomingPolicyCount = upcomingPolicies.length + (legacyPolicy && isUpcoming(legacyPolicy.reviewDate) ? 1 : 0);
  const assignedAreas = new Set(
    assignments
      .filter((assignment) => Boolean(assignment.ownerName?.trim()))
      .map((assignment) => assignment.area),
  );
  const govCompleteness = Math.round((assignedAreas.size / GOVERNANCE_AREAS.length) * 100);

  const handleSave = (data: any) => {
    if (editingPolicy) {
      updateMutation.mutate({ id: editingPolicy.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  if (policiesLoading || generatedPoliciesLoading || legacyPolicyLoading || assignmentsLoading) {
    return (
      <div className={embedded ? "space-y-4" : "p-6 space-y-4"}>
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 gap-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20" />)}
        </div>
      </div>
    );
  }

  return (
    <div className={embedded ? "space-y-8" : "p-6 space-y-8 max-w-5xl mx-auto"} data-testid="policy-register-workspace">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {embedded ? (
            <h2 className="text-base font-semibold flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" />
              All policies
            </h2>
          ) : (
            <h1 className="text-xl font-semibold flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            Policy Register
            </h1>
          )}
          <p className="text-sm text-muted-foreground mt-0.5">
            {embedded
              ? "All your policies in one place, with owners, status and review dates."
              : "Track policies, owners, review dates and governance area assignments"}
          </p>
        </div>
        {canManagePolicies && (
          <Dialog open={showDialog} onOpenChange={(v: boolean) => { setShowDialog(v); if (!v) setEditingPolicy(null); }}>
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild><Button size="sm" data-testid="button-add-policy"><Plus className="w-4 h-4 mr-1" /> Add policy</Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild><Link href="/policies?tab=templates">Use a template</Link></DropdownMenuItem>
                <DropdownMenuItem onSelect={() => { setEditingPolicy(null); setShowDialog(true); }}>Add an existing policy</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>{editingPolicy ? "Edit Policy" : "Add existing policy"}</DialogTitle>
                <DialogDescription>Record the policy, its owner and review date. You can add the document now or later.</DialogDescription>
              </DialogHeader>
              <PolicyForm onSave={handleSave} initial={editingPolicy ?? undefined} saving={createMutation.isPending || updateMutation.isPending} />
            </DialogContent>
          </Dialog>
        )}
      </div>

      <PageGuidance
        pageKey="esg-policy-register"
        title="What is the Policy Register?"
        summary="The Policy Register is a central record of all your ESG-related policies — from environmental management to health & safety, diversity, and data privacy. It tracks who owns each policy, when it was last reviewed, and when the next review is due. Governance ownership below records accountability for each ESG area."
        goodLooksLike="Every relevant ESG policy is listed with an active owner and a review date no more than 12 months out. Overdue reviews are resolved promptly, and governance roles are assigned to named individuals rather than job titles alone."
        steps={[
          "Click 'Add existing policy' to create a record for each ESG-related policy your business has.",
          "Set the policy type (e.g. Environmental, H&S, Diversity) and assign a named owner.",
          "Add the effective date and next review date so nothing slips through the cracks.",
          "Optionally add the policy document using a document link, a direct file upload, or both.",
          "Use Governance ownership below to assign board or management accountability for each ESG area.",
          "Review and update the register at least annually or after major organisational changes.",
        ]}
      />

      {(overduePolicyCount > 0 || upcomingPolicyCount > 0) && (
        <div className="flex flex-wrap gap-3">
          {overduePolicyCount > 0 && (
            <Card className="flex-1 min-w-56 border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/20">
              <CardContent className="p-3 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-500" />
                <span className="text-sm font-medium text-red-700 dark:text-red-400">
                  {overduePolicyCount} overdue review{overduePolicyCount > 1 ? "s" : ""}
                </span>
              </CardContent>
            </Card>
          )}
          {upcomingPolicyCount > 0 && (
            <Card className="flex-1 min-w-56 border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/20">
              <CardContent className="p-3 flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-500" />
                <span className="text-sm font-medium text-amber-700 dark:text-amber-400">
                  {upcomingPolicyCount} review{upcomingPolicyCount > 1 ? "s" : ""} due within 90 days
                </span>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <Input aria-label="Search policies" placeholder="Search all policies by title or owner" value={search} onChange={event => setSearch(event.target.value)} data-testid="search-all-policies" />
      {(policiesError || generatedPoliciesError) && <div role="alert" className="rounded-md border p-4 text-sm">Some policies could not be loaded. <Button variant="link" onClick={() => { queryClient.invalidateQueries({ queryKey: ["/api/policy-records"] }); queryClient.invalidateQueries({ queryKey: ["/api/generated-policies"] }); }}>Try again</Button></div>}
      <section className="space-y-3" aria-label="All policies" data-testid="registered-policy-list">
          {showLegacyPolicy && legacyPolicy && (
            <Card data-testid="core-esg-policy-card" className="border border-primary/20 bg-primary/[0.025]">
              <CardContent className="p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">Company ESG policy</span>
                      <Badge variant={legacyPolicy.status === "published" ? "default" : "secondary"}>
                        {legacyPolicy.status === "published" ? "Published" : "Draft"}
                      </Badge>
                      <Badge variant="outline" className="text-xs">Built-in policy</Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Version {legacyPolicyData?.latestVersion?.versionNumber ?? 0}
                      {legacyPolicy.reviewDate ? ` · Review ${new Date(legacyPolicy.reviewDate).toLocaleDateString()}` : " · Review date not set"}
                    </p>
                  </div>
                  <Button asChild size="sm" variant="outline" data-testid="button-open-core-policy">
                    <Link href="/policies?tab=register&policy=company">Open policy</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
          {filteredPolicies.length === 0 && !showLegacyPolicy ? (
            <Card>
              <CardContent className="py-12 text-center">
                <FileText className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">
                  {search.trim() ? "No policies match your search. Try another title or owner." : policiesError || generatedPoliciesError ? "The policy list is incomplete. Retry loading before making changes." : canManagePolicies ? "No policies yet. Add your first policy to get started." : "No registered policies yet."}
                </p>
              </CardContent>
            </Card>
          ) : (
            filteredPolicies.map(policy => {
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
                          <Badge variant="outline" className="text-xs">{policy.origin === "template" ? "From template" : POLICY_TYPE_LABELS[policy.policyType] ?? policy.policyType}</Badge>
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
                        </div>
                        {(policy.documentLink || policy.attachment) && (
                          <div className="mt-3 space-y-1.5 text-xs">
                            {policy.documentLink && (
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-medium text-foreground">Document link:</span>
                                <a href={policy.documentLink} target="_blank" rel="noreferrer" className="text-primary hover:underline" data-testid={`link-policy-doc-${policy.id}`}>
                                  {policy.documentLink}
                                </a>
                              </div>
                            )}
                            {policy.attachment && (
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-medium text-foreground">Attachment:</span>
                                <a href={policy.attachment.downloadUrl} className="text-primary hover:underline" data-testid={`link-policy-attachment-${policy.id}`}>
                                  {policy.attachment.fileName}
                                </a>
                                {policy.attachment.size && (
                                  <span className="text-muted-foreground">({formatFileSize(policy.attachment.size)})</span>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      {policy.origin === "template" ? <Button asChild size="sm" variant="outline"><Link href={`/policies?tab=register&policy=${encodeURIComponent(policy.id)}`}>Open policy</Link></Button> : canManagePolicies && <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="ghost" size="icon" className="w-7 h-7"
                          onClick={() => { setEditingPolicy(policy); setShowDialog(true); }}
                          aria-label={`Edit ${policy.title}`}
                          data-testid={`button-edit-policy-${policy.id}`}
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost" size="icon" className="w-7 h-7 text-destructive hover:text-destructive"
                          onClick={() => {
                            if (window.confirm(`Delete ${policy.title}? This cannot be undone.`)) {
                              deleteMutation.mutate(policy.id);
                            }
                          }}
                          aria-label={`Delete ${policy.title}`}
                          data-testid={`button-delete-policy-${policy.id}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>}
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
      </section>

      {draftsSection}

      <details className="space-y-4 rounded-lg border p-4" data-testid="governance-ownership-section">
          <summary className="cursor-pointer text-sm font-medium">Governance ownership · {assignedAreas.size} areas assigned</summary>
          <div>
            <h2 id="governance-ownership-heading" className="text-base font-semibold">Governance ownership</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">Name the people accountable for relevant ESG areas. One person can cover several areas.</p>
          </div>
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
                canEdit={canManagePolicies}
              />
            ))}
          </div>
      </details>
    </div>
  );
}

export default function EsgPolicyRegisterPage() {
  return <PolicyRegisterWorkspace />;
}
