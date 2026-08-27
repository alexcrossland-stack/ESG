import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest, authFetch } from "@/lib/queryClient";
import { useSiteContext } from "@/hooks/use-site-context";
import { usePermissions } from "@/lib/permissions";
import { useToast } from "@/hooks/use-toast";
import {
  CheckCircle2, AlertCircle, XCircle, ChevronDown, ChevronUp,
  Globe, Building2, Shield, Leaf, BookOpen, Flag,
  ArrowRight, Settings, ClipboardList, Info, Upload, Send, Save,
} from "lucide-react";

const FRAMEWORK_META: Record<string, { icon: any; color: string; bg: string }> = {
  GRI: { icon: Globe, color: "text-green-600 dark:text-green-400", bg: "bg-green-100 dark:bg-green-900/30" },
  ISSB: { icon: Building2, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-100 dark:bg-blue-900/30" },
  TCFD: { icon: Shield, color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-100 dark:bg-amber-900/30" },
  ESRS: { icon: Flag, color: "text-purple-600 dark:text-purple-400", bg: "bg-purple-100 dark:bg-purple-900/30" },
  CDP: { icon: Leaf, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-100 dark:bg-emerald-900/30" },
  UNGC: { icon: BookOpen, color: "text-rose-600 dark:text-rose-400", bg: "bg-rose-100 dark:bg-rose-900/30" },
};

const PILLAR_COLORS: Record<string, string> = {
  environmental: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  social: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  governance: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
};

const STRENGTH_LABELS: Record<string, { label: string; color: string }> = {
  direct: { label: "Direct", color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" },
  partial: { label: "Partial", color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300" },
  supporting: { label: "Supporting", color: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" },
};

const MANDATORY_LABELS: Record<string, string> = {
  core: "Core",
  conditional: "Conditional",
  advanced: "Advanced",
};

const REQUIREMENT_TYPE_LABELS: Record<string, string> = {
  metric: "Metric",
  narrative: "Narrative",
  policy: "Policy",
  target: "Target",
  risk: "Risk Assessment",
  evidence: "Evidence",
};

function StatusIcon({ status }: { status: string }) {
  if (status === "covered") return <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />;
  if (status === "partial") return <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />;
  return <XCircle className="w-4 h-4 text-red-400 shrink-0" />;
}

function StatusBadge({ status }: { status: string }) {
  if (status === "covered") return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 border-0 text-xs">Ready</Badge>;
  if (status === "partial") return <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border-0 text-xs">In progress</Badge>;
  return <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 border-0 text-xs">Missing</Badge>;
}

function RequirementRow({
  req,
  canContribute,
  onOpen,
}: {
  req: any;
  canContribute: boolean;
  onOpen: (requirement: any) => void;
}) {
  const facts = req.factSummary;
  const metricFactLabel = req.requirementType === "metric" && facts
    ? facts.mappedDefinitions === 0
      ? "No active metric is mapped"
      : facts.enteredValues === 0
        ? `${facts.mappedDefinitions} mapped metric${facts.mappedDefinitions === 1 ? "" : "s"} · No company value in this view`
        : `Entered ${facts.enteredValues} · Approved ${facts.approvedValues} · Evidence ${facts.evidenceFiles}${facts.subperiodValues > 0 ? ` · Sub-period only ${facts.subperiodValues}` : ""}${facts.rejectedValues > 0 ? ` · Rejected ${facts.rejectedValues}` : ""}`
    : null;
  const nonMetricFactLabel = req.requirementType !== "metric" && facts
    ? facts.requirementLinkedEvidence > 0
      ? `Requirement-linked evidence ${facts.requirementLinkedEvidence} · Reviewed/approved ${facts.approvedRequirementLinkedEvidence}`
      : `No requirement-linked ${REQUIREMENT_TYPE_LABELS[req.requirementType]?.toLowerCase() ?? "record"} fact`
    : null;

  return (
    <div
      className="flex items-start gap-3 py-2.5 border-b border-border last:border-0 scroll-mt-6"
      data-testid={`row-requirement-${req.code}`}
      data-requirement-id={req.id}
    >
      <StatusIcon status={req.status} />
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2 flex-wrap">
          <span className="text-sm font-medium text-foreground">{req.title}</span>
          <span className="text-xs text-muted-foreground font-mono">{req.code}</span>
        </div>
        {req.description && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{req.description}</p>
        )}
        {(metricFactLabel || nonMetricFactLabel) && (
          <p className="text-xs text-muted-foreground mt-1" data-testid={`facts-requirement-${req.code}`}>
            {metricFactLabel || nonMetricFactLabel}
            {facts?.evidenceRequired ? " · Evidence required" : ""}
          </p>
        )}
        {req.additionalNeeded.length > 0 && req.status !== "covered" && (
          <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
            Next: {req.additionalNeeded.join("; ")}
          </p>
        )}
      </div>
      <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
        {req.pillar && (
          <Badge variant="outline" className={`text-[10px] h-4 border-0 ${PILLAR_COLORS[req.pillar] ?? ""}`}>
            {req.pillar.charAt(0).toUpperCase() + req.pillar.slice(1)}
          </Badge>
        )}
        <Badge variant="outline" className="text-[10px] h-4">
          {REQUIREMENT_TYPE_LABELS[req.requirementType] ?? req.requirementType}
        </Badge>
        <Badge variant="outline" className="text-[10px] h-4">
          {MANDATORY_LABELS[req.mandatoryLevel] ?? req.mandatoryLevel}
        </Badge>
        <StatusBadge status={req.status} />
        {req.requirementType === "metric" ? (
          <Link href={`/data-entry?metric=${encodeURIComponent(req.mappedMetricIds?.[0] || "")}`}>
            <Button variant="outline" size="sm" className="h-7 text-xs" data-testid={`button-enter-${req.code}`}>
              Enter data
            </Button>
          </Link>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => onOpen(req)}
            data-testid={`button-complete-${req.code}`}
          >
            {canContribute ? (req.status === "missing" ? "Complete" : "Update") : "View"}
          </Button>
        )}
      </div>
    </div>
  );
}

type ReadinessGroup = {
  framework: {
    id: string;
    code: string;
    name: string;
    fullName: string | null;
    version: string | null;
  };
  requirements: any[];
  summary: { covered: number; partial: number; missing: number; total: number };
  nextBestActions: any[];
  scope: {
    period: string | null;
    siteMode: "all" | "organisation" | "site";
    siteId: string | null;
  };
};

type RequirementResponse = {
  id: string;
  responseText: string | null;
  linkedEntityType: "policy" | "target" | "risk" | null;
  linkedEntityId: string | null;
  workflowStatus: "draft" | "submitted" | "approved" | "rejected";
  reviewComment: string | null;
  updatedAt: string | null;
};

type FrameworkEvidence = {
  id: string;
  filename: string;
  evidenceStatus: string;
  frameworkRequirementId: string | null;
  resolvedLinkedPeriod: string | null;
};

function RequirementCompletionDialog({
  open,
  onOpenChange,
  requirement,
  scope,
  periodLabel,
  canContribute,
  canReview,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  requirement: any | null;
  scope: ReadinessGroup["scope"] | null;
  periodLabel?: string;
  canContribute: boolean;
  canReview: boolean;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [responseText, setResponseText] = useState("");
  const [linkedEntityId, setLinkedEntityId] = useState("");
  const [reviewComment, setReviewComment] = useState("");
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);

  const period = scope?.period || "";
  const siteParam = scope?.siteMode === "site" && scope.siteId ? scope.siteId : "__org__";
  const siteId = scope?.siteMode === "site" ? scope.siteId : null;
  const requirementId = requirement?.id || "";
  const responseQueryKey = ["/api/framework-requirement-responses", requirementId, period, siteParam];
  const evidenceQueryKey = ["/api/evidence", "framework-requirement", requirementId, period, siteParam];

  const { data: responseData, isLoading: responseLoading } = useQuery<{
    responses: RequirementResponse[];
  }>({
    queryKey: responseQueryKey,
    queryFn: async () => {
      const params = new URLSearchParams({ frameworkRequirementId: requirementId, period, siteId: siteParam });
      const response = await authFetch(`/api/framework-requirement-responses?${params.toString()}`);
      if (!response.ok) throw new Error("Could not load this requirement response");
      return response.json();
    },
    enabled: open && Boolean(requirementId && period) && requirement?.requirementType !== "evidence",
  });

  const { data: allEvidence = [], isLoading: evidenceLoading } = useQuery<FrameworkEvidence[]>({
    queryKey: evidenceQueryKey,
    queryFn: async () => {
      const params = new URLSearchParams({ period, siteId: siteParam === "__org__" ? "null" : siteParam });
      const response = await authFetch(`/api/evidence?${params.toString()}`);
      if (!response.ok) throw new Error("Could not load requirement evidence");
      return response.json();
    },
    enabled: open && Boolean(requirementId && period) && requirement?.requirementType === "evidence",
  });

  const { data: policies = [] } = useQuery<any[]>({
    queryKey: ["/api/policy-records"],
    enabled: open && requirement?.requirementType === "policy",
  });
  const { data: targets = [] } = useQuery<any[]>({
    queryKey: ["/api/esg-targets"],
    enabled: open && requirement?.requirementType === "target",
  });
  const { data: risks = [] } = useQuery<any[]>({
    queryKey: ["/api/esg-risks"],
    enabled: open && requirement?.requirementType === "risk",
  });

  const currentResponse = responseData?.responses?.[0] || null;
  const requirementEvidence = allEvidence.filter((item) => item.frameworkRequirementId === requirementId);

  useEffect(() => {
    if (!open) return;
    setResponseText(currentResponse?.responseText || "");
    setLinkedEntityId(currentResponse?.linkedEntityId || "");
    setReviewComment(currentResponse?.reviewComment || "");
    setEvidenceFile(null);
  }, [open, requirementId, currentResponse?.id, currentResponse?.updatedAt]);

  const refreshFacts = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["/api/framework-readiness"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/framework-requirement-responses"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/evidence"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/control-centre"] }),
    ]);
  };

  const saveResponse = useMutation({
    mutationFn: async (workflowStatus: "draft" | "submitted") => {
      const type = requirement?.requirementType;
      const payload: any = { period, siteId, workflowStatus };
      if (type === "narrative") payload.responseText = responseText;
      if (type === "policy" || type === "target" || type === "risk") {
        payload.linkedEntityType = type;
        payload.linkedEntityId = linkedEntityId;
      }
      const response = await apiRequest("PUT", `/api/framework-requirements/${requirementId}/response`, payload);
      return response.json();
    },
    onSuccess: async (_data, workflowStatus) => {
      await refreshFacts();
      toast({ title: workflowStatus === "submitted" ? "Sent for review" : "Draft saved" });
    },
    onError: (error: Error) => toast({ title: "Could not save requirement", description: error.message, variant: "destructive" }),
  });

  const reviewResponse = useMutation({
    mutationFn: async (workflowStatus: "approved" | "rejected") => {
      if (!currentResponse) throw new Error("No submitted response is available");
      const response = await apiRequest("POST", `/api/framework-requirement-responses/${currentResponse.id}/review`, {
        workflowStatus,
        reviewComment: reviewComment || null,
      });
      return response.json();
    },
    onSuccess: async (_data, workflowStatus) => {
      await refreshFacts();
      toast({ title: workflowStatus === "approved" ? "Requirement approved" : "Changes requested" });
    },
    onError: (error: Error) => toast({ title: "Could not review requirement", description: error.message, variant: "destructive" }),
  });

  const uploadEvidence = useMutation({
    mutationFn: async () => {
      if (!evidenceFile) throw new Error("Choose a file first");
      const form = new FormData();
      form.append("file", evidenceFile);
      form.append("frameworkRequirementId", requirementId);
      form.append("period", period);
      form.append("siteId", siteParam);
      const response = await apiRequest("POST", "/api/evidence", form);
      return response.json();
    },
    onSuccess: async () => {
      setEvidenceFile(null);
      await refreshFacts();
      toast({ title: "Evidence uploaded", description: "An Approver or Company Admin must review it before this requirement is ready." });
    },
    onError: (error: Error) => toast({ title: "Could not upload evidence", description: error.message, variant: "destructive" }),
  });

  const reviewEvidence = useMutation({
    mutationFn: async ({ id, evidenceStatus }: { id: string; evidenceStatus: "approved" | "rejected" }) => {
      const response = await apiRequest("PUT", `/api/evidence/${id}`, { evidenceStatus });
      return response.json();
    },
    onSuccess: async (_data, variables) => {
      await refreshFacts();
      toast({ title: variables.evidenceStatus === "approved" ? "Evidence approved" : "Evidence rejected" });
    },
    onError: (error: Error) => toast({ title: "Could not review evidence", description: error.message, variant: "destructive" }),
  });

  if (!requirement || !scope) return null;

  const eligibleSources = requirement.requirementType === "policy"
    ? policies.filter((item) => item.status === "active")
    : requirement.requirementType === "target"
      ? targets.filter((item) => item.status !== "cancelled" && item.targetValue != null && item.targetYear != null)
      : requirement.requirementType === "risk"
        ? risks.filter((item) => item.riskScore != null)
        : [];
  const sourcePage = requirement.requirementType === "policy"
    ? "/esg-policy-register"
    : requirement.requirementType === "target"
      ? "/esg-targets"
      : "/esg-risks";
  const sourceLabel = REQUIREMENT_TYPE_LABELS[requirement.requirementType] || "Record";
  const responseBusy = saveResponse.isPending || reviewResponse.isPending;
  const evidenceBusy = uploadEvidence.isPending || reviewEvidence.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl" data-testid="dialog-framework-requirement">
        <DialogHeader>
          <DialogTitle>{requirement.title}</DialogTitle>
          <DialogDescription>
            {requirement.code} · {sourceLabel} · {periodLabel || period || "Choose a reporting period"}
          </DialogDescription>
        </DialogHeader>

        {!period ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            Choose a reporting period before completing this requirement.
          </div>
        ) : requirement.requirementType === "evidence" ? (
          <div className="space-y-4">
            {evidenceLoading ? <Skeleton className="h-20 w-full" /> : requirementEvidence.length > 0 ? (
              <div className="space-y-2" data-testid="framework-evidence-list">
                {requirementEvidence.map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{item.filename}</p>
                      <p className="text-xs text-muted-foreground">Status: {item.evidenceStatus}</p>
                    </div>
                    {canReview && !["approved", "reviewed"].includes(item.evidenceStatus) && (
                      <div className="flex gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={evidenceBusy}
                          onClick={() => reviewEvidence.mutate({ id: item.id, evidenceStatus: "rejected" })}
                          data-testid={`button-reject-evidence-${item.id}`}
                        >Reject</Button>
                        <Button
                          size="sm"
                          disabled={evidenceBusy}
                          onClick={() => reviewEvidence.mutate({ id: item.id, evidenceStatus: "approved" })}
                          data-testid={`button-approve-evidence-${item.id}`}
                        >Approve</Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">No evidence is linked to this requirement for this period and boundary.</p>
            )}

            {canContribute && (
              <div className="space-y-2 rounded-lg bg-muted/40 p-3">
                <Label htmlFor="framework-evidence-file">Upload supporting evidence</Label>
                <Input
                  id="framework-evidence-file"
                  type="file"
                  onChange={(event) => setEvidenceFile(event.target.files?.[0] || null)}
                  data-testid="input-framework-evidence-file"
                />
                <Button
                  onClick={() => uploadEvidence.mutate()}
                  disabled={!evidenceFile || evidenceBusy}
                  data-testid="button-upload-framework-evidence"
                >
                  <Upload className="mr-2 h-4 w-4" /> Upload for review
                </Button>
              </div>
            )}
          </div>
        ) : responseLoading ? (
          <Skeleton className="h-28 w-full" />
        ) : (
          <div className="space-y-4">
            {currentResponse && (
              <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-sm">
                <span>Current response</span>
                <Badge variant="outline" data-testid="framework-response-status">{currentResponse.workflowStatus}</Badge>
              </div>
            )}

            {requirement.requirementType === "narrative" ? (
              <div className="space-y-2">
                <Label htmlFor="framework-response-text">Plain-English response</Label>
                <Textarea
                  id="framework-response-text"
                  value={responseText}
                  onChange={(event) => setResponseText(event.target.value)}
                  disabled={!canContribute}
                  rows={7}
                  placeholder="Describe what your organisation does, who is responsible, and how often it is reviewed."
                  data-testid="input-framework-response-text"
                />
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Eligible {sourceLabel.toLowerCase()}</Label>
                <Select value={linkedEntityId} onValueChange={setLinkedEntityId} disabled={!canContribute}>
                  <SelectTrigger data-testid="select-framework-linked-record">
                    <SelectValue placeholder={`Choose a ${sourceLabel.toLowerCase()}`} />
                  </SelectTrigger>
                  <SelectContent>
                    {eligibleSources.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.title}{item.targetYear ? ` · ${item.targetYear}` : ""}{item.riskScore != null ? ` · score ${item.riskScore}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {eligibleSources.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    No eligible record exists yet. <Link href={sourcePage}><span className="font-medium text-primary hover:underline">Create or complete one</span></Link> first.
                  </p>
                )}
              </div>
            )}

            {canReview && currentResponse?.workflowStatus === "submitted" && (
              <div className="space-y-2 rounded-lg border p-3">
                <Label htmlFor="framework-review-comment">Review comment (optional)</Label>
                <Textarea
                  id="framework-review-comment"
                  value={reviewComment}
                  onChange={(event) => setReviewComment(event.target.value)}
                  rows={2}
                  data-testid="input-framework-review-comment"
                />
                <div className="flex justify-end gap-2">
                  <Button variant="outline" disabled={responseBusy} onClick={() => reviewResponse.mutate("rejected")} data-testid="button-reject-framework-response">Request changes</Button>
                  <Button disabled={responseBusy} onClick={() => reviewResponse.mutate("approved")} data-testid="button-approve-framework-response">Approve</Button>
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
          {period && requirement.requirementType !== "evidence" && canContribute && (
            <>
              <Button
                variant="outline"
                onClick={() => saveResponse.mutate("draft")}
                disabled={responseBusy || (requirement.requirementType === "narrative" ? !responseText.trim() : !linkedEntityId)}
                data-testid="button-save-framework-draft"
              >
                <Save className="mr-2 h-4 w-4" /> Save draft
              </Button>
              <Button
                onClick={() => saveResponse.mutate("submitted")}
                disabled={responseBusy || (requirement.requirementType === "narrative" ? !responseText.trim() : !linkedEntityId)}
                data-testid="button-submit-framework-response"
              >
                <Send className="mr-2 h-4 w-4" /> Send for review
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FrameworkReadinessCard({
  group,
  defaultExpanded = false,
  canContribute,
  onOpenRequirement,
}: {
  group: ReadinessGroup;
  defaultExpanded?: boolean;
  canContribute: boolean;
  onOpenRequirement: (requirement: any, scope: ReadinessGroup["scope"]) => void;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [filter, setFilter] = useState<"all" | "covered" | "partial" | "missing">("all");

  const { framework, requirements, summary, nextBestActions } = group;
  const meta = FRAMEWORK_META[framework.code] ?? { icon: Shield, color: "text-muted-foreground", bg: "bg-muted" };
  const Icon = meta.icon;

  const filteredReqs = requirements.filter(r => filter === "all" || r.status === filter);

  const pillarGroups = filteredReqs.reduce((acc: Record<string, any[]>, r) => {
    const p = r.pillar || "other";
    if (!acc[p]) acc[p] = [];
    acc[p].push(r);
    return acc;
  }, {});

  const alignmentPct = summary.total > 0
    ? Math.round((summary.covered / summary.total) * 100)
    : 0;

  return (
    <Card data-testid={`card-readiness-${framework.code}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className={`p-2 rounded-lg shrink-0 ${meta.bg}`}>
              <Icon className={`w-5 h-5 ${meta.color}`} />
            </div>
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                {framework.name}
                {framework.version && <Badge variant="outline" className="text-[10px] h-4">{framework.version}</Badge>}
              </CardTitle>
              {framework.fullName && (
                <CardDescription className="text-xs">{framework.fullName}</CardDescription>
              )}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-2xl font-bold text-foreground" data-testid={`text-alignment-pct-${framework.code}`}>{alignmentPct}%</div>
            <div className="text-xs text-muted-foreground">ready</div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 mt-3">
          <button
            className={`flex flex-col items-center p-2 rounded-lg transition-colors cursor-pointer ${filter === "covered" ? "bg-green-100 dark:bg-green-900/30 ring-1 ring-green-400" : "bg-green-50 dark:bg-green-950/20 hover:bg-green-100 dark:hover:bg-green-900/20"}`}
            onClick={() => setFilter(filter === "covered" ? "all" : "covered")}
            data-testid={`filter-covered-${framework.code}`}
          >
            <CheckCircle2 className="w-4 h-4 text-green-500 mb-0.5" />
            <span className="text-lg font-bold text-green-700 dark:text-green-400">{summary.covered}</span>
            <span className="text-[10px] text-green-600 dark:text-green-500">Ready</span>
          </button>
          <button
            className={`flex flex-col items-center p-2 rounded-lg transition-colors cursor-pointer ${filter === "partial" ? "bg-amber-100 dark:bg-amber-900/30 ring-1 ring-amber-400" : "bg-amber-50 dark:bg-amber-950/20 hover:bg-amber-100 dark:hover:bg-amber-900/20"}`}
            onClick={() => setFilter(filter === "partial" ? "all" : "partial")}
            data-testid={`filter-partial-${framework.code}`}
          >
            <AlertCircle className="w-4 h-4 text-amber-500 mb-0.5" />
            <span className="text-lg font-bold text-amber-700 dark:text-amber-400">{summary.partial}</span>
            <span className="text-[10px] text-amber-600 dark:text-amber-500">In progress</span>
          </button>
          <button
            className={`flex flex-col items-center p-2 rounded-lg transition-colors cursor-pointer ${filter === "missing" ? "bg-red-100 dark:bg-red-900/30 ring-1 ring-red-400" : "bg-red-50 dark:bg-red-950/20 hover:bg-red-100 dark:hover:bg-red-900/20"}`}
            onClick={() => setFilter(filter === "missing" ? "all" : "missing")}
            data-testid={`filter-missing-${framework.code}`}
          >
            <XCircle className="w-4 h-4 text-red-400 mb-0.5" />
            <span className="text-lg font-bold text-red-600 dark:text-red-400">{summary.missing}</span>
            <span className="text-[10px] text-red-500 dark:text-red-500">Missing</span>
          </button>
        </div>

        {nextBestActions.length > 0 && !expanded && (
          <div className="mt-3 space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Priority actions</p>
            {nextBestActions.map((a, i) => (
              <div key={i} className="flex items-start gap-2 text-xs" data-testid={`action-${framework.code}-${i}`}>
                <ArrowRight className="w-3 h-3 text-muted-foreground mt-0.5 shrink-0" />
                <span className="text-muted-foreground"><span className="font-medium text-foreground">{a.requirementCode}:</span> {a.action}</span>
              </div>
            ))}
          </div>
        )}
      </CardHeader>

      <CardContent className="pt-0">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-center text-xs"
          onClick={() => setExpanded(!expanded)}
          data-testid={`button-expand-${framework.code}`}
        >
          {expanded
            ? <><ChevronUp className="w-3.5 h-3.5 mr-1" /> Hide requirements</>
            : <><ChevronDown className="w-3.5 h-3.5 mr-1" /> View all {summary.total} requirements</>
          }
        </Button>

        {expanded && (
          <div className="mt-3 space-y-4">
            {filter !== "all" && filteredReqs.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">No requirements in this category.</p>
            )}
            {Object.entries(pillarGroups).map(([pillar, reqs]) => (
              <div key={pillar}>
                <div className="flex items-center gap-2 mb-1 pb-1 border-b border-border">
                  <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${PILLAR_COLORS[pillar] ?? "bg-muted text-muted-foreground"}`}>
                    {pillar.charAt(0).toUpperCase() + pillar.slice(1)}
                  </span>
                  <span className="text-xs text-muted-foreground">{reqs.length} requirement{reqs.length !== 1 ? "s" : ""}</span>
                </div>
                {reqs.map(req => (
                  <RequirementRow
                    key={req.id}
                    req={req}
                    canContribute={canContribute}
                    onOpen={(requirement) => onOpenRequirement(requirement, group.scope)}
                  />
                ))}
              </div>
            ))}

            {nextBestActions.length > 0 && (
              <div className="mt-4 p-3 rounded-lg bg-muted/50 space-y-2">
                <p className="text-xs font-semibold text-foreground uppercase tracking-wide">Recommended next steps</p>
                {nextBestActions.map((a, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs" data-testid={`expanded-action-${framework.code}-${i}`}>
                    <ArrowRight className="w-3 h-3 text-primary mt-0.5 shrink-0" />
                    <span className="text-muted-foreground">
                      <span className="font-medium text-foreground">{a.requirementCode} – {a.title}:</span>{" "}
                      {a.action}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function FrameworkReadinessPage() {
  const { activeSiteId, activeSites } = useSiteContext();
  const { role } = usePermissions();
  const now = new Date();
  const fallbackPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [selectedPeriod, setSelectedPeriod] = useState(fallbackPeriod);
  const [selectedScope, setSelectedScope] = useState(activeSiteId ?? "__all__");
  const [activeRequirement, setActiveRequirement] = useState<{
    requirement: any;
    scope: ReadinessGroup["scope"];
  } | null>(null);
  const targetRequirementId = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("requirement")
    : null;
  const normalizedRole = (role as string | undefined) === "editor" ? "contributor" : role;
  const canContribute = normalizedRole === "admin" || normalizedRole === "super_admin" || normalizedRole === "contributor";
  const canReview = normalizedRole === "admin" || normalizedRole === "super_admin" || normalizedRole === "approver";
  useEffect(() => {
    setSelectedScope(activeSiteId ?? "__all__");
  }, [activeSiteId]);

  const { data: reportingPeriods = [], isFetched: reportingPeriodsFetched } = useQuery<Array<{
    id: string;
    name: string;
    startDate: string;
    endDate: string;
    status?: "open" | "closed" | "locked";
  }>>({
    queryKey: ["/api/reporting-periods"],
  });

  useEffect(() => {
    if (selectedPeriod !== fallbackPeriod || !reportingPeriodsFetched) return;
    const preferred = reportingPeriods.find((period) => period.status === "open") || reportingPeriods[0];
    if (preferred) setSelectedPeriod(preferred.id);
  }, [fallbackPeriod, reportingPeriods, reportingPeriodsFetched, selectedPeriod]);

  const { data: readiness, isLoading } = useQuery<ReadinessGroup[]>({
    queryKey: ["/api/framework-readiness", selectedPeriod, selectedScope],
      queryFn: async () => {
        const params = new URLSearchParams();
      params.set("period", selectedPeriod);
      params.set("siteId", selectedScope);
      const response = await authFetch(`/api/framework-readiness?${params.toString()}`);
      if (!response.ok) throw new Error("Failed to load framework readiness");
      return response.json();
    },
  });

  useEffect(() => {
    if (!targetRequirementId || !readiness?.length) return;
    const timer = window.setTimeout(() => {
      document.querySelector(`[data-requirement-id="${CSS.escape(targetRequirementId)}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [readiness, targetRequirementId]);

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-80" />
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-48 w-full" />
        ))}
      </div>
    );
  }

  if (!readiness || readiness.length === 0) {
    return (
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Framework Readiness</h1>
          <p className="text-muted-foreground mt-1">
            Track evidence-backed readiness against ESG reporting frameworks.
          </p>
        </div>

        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center gap-4">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
              <ClipboardList className="w-6 h-6 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium text-foreground">No frameworks selected</p>
              <p className="text-sm text-muted-foreground mt-1">
                Enable one or more frameworks in Framework Settings to see your readiness view.
              </p>
            </div>
            <Link href="/framework-settings">
              <Button variant="outline" size="sm" data-testid="button-go-framework-settings">
                <Settings className="w-4 h-4 mr-2" />
                Go to Framework Settings
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground" data-testid="heading-readiness">
            Framework Readiness
          </h1>
          <p className="text-muted-foreground mt-1">
            Fact-based readiness across {readiness.length} selected framework{readiness.length !== 1 ? "s" : ""}.
            A catalogue mapping alone never counts as ready.
          </p>
        </div>
        <Link href="/framework-settings">
          <Button variant="outline" size="sm" data-testid="button-framework-settings-link">
            <Settings className="w-4 h-4 mr-2" />
            Settings
          </Button>
        </Link>
      </div>

      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="framework-readiness-period" className="text-xs text-muted-foreground">Reporting period</Label>
                <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                  <SelectTrigger id="framework-readiness-period" data-testid="select-readiness-period">
                  <SelectValue placeholder="Choose reporting period" />
                  </SelectTrigger>
                  <SelectContent>
                  {reportingPeriods.length === 0 && (
                    <SelectItem value={fallbackPeriod}>{fallbackPeriod} · current month</SelectItem>
                  )}
                  {reportingPeriods.map((period) => (
                    <SelectItem key={period.id} value={period.id} data-testid={`option-readiness-period-${period.id}`}>
                      {period.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="framework-readiness-scope" className="text-xs text-muted-foreground">Organisation scope</Label>
              <Select value={selectedScope} onValueChange={setSelectedScope}>
                <SelectTrigger id="framework-readiness-scope" data-testid="select-readiness-scope">
                  <SelectValue placeholder="All scopes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All scopes</SelectItem>
                  <SelectItem value="__org__">Organisation-wide only</SelectItem>
                  {activeSites.map((site) => (
                    <SelectItem key={site.id} value={site.id} data-testid={`option-readiness-site-${site.id}`}>
                      {site.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/20">
        <CardContent className="pt-4 pb-3">
          <div className="flex gap-3">
            <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
            <p className="text-sm text-blue-800 dark:text-blue-300">
              This is a readiness view, not a compliance certification or audit. <strong>Ready</strong> means a directly mapped metric has an approved company value in the selected view and any required evidence is attached. Policy, target, risk, narrative and evidence requirements need records linked to the requirement; catalogue availability does not count.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {readiness.map((group, i) => (
          <FrameworkReadinessCard
            key={group.framework.id}
            group={group}
            defaultExpanded={Boolean(
              (i === 0 && readiness.length === 1)
              || (targetRequirementId && group.requirements.some((requirement) => requirement.id === targetRequirementId))
            )}
            canContribute={canContribute}
            onOpenRequirement={(requirement, scope) => setActiveRequirement({ requirement, scope })}
          />
        ))}
      </div>

      <RequirementCompletionDialog
        open={Boolean(activeRequirement)}
        onOpenChange={(open) => { if (!open) setActiveRequirement(null); }}
        requirement={activeRequirement?.requirement || null}
        scope={activeRequirement?.scope || null}
        periodLabel={reportingPeriods.find((period) => period.id === activeRequirement?.scope.period)?.name || activeRequirement?.scope.period || undefined}
        canContribute={canContribute}
        canReview={canReview}
      />
    </div>
  );
}
