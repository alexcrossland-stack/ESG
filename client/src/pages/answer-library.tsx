import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Pencil, Trash2, Search, AlertTriangle, Check, FileText } from "lucide-react";

interface ProcurementAnswer {
  id: string;
  company_id: string;
  question: string;
  answer: string;
  category: string | null;
  linked_metric_ids: string[] | null;
  linked_policy_section: string | null;
  linked_evidence_ids: string[] | null;
  linked_compliance_req_ids: string[] | null;
  status: "draft" | "approved" | "flagged";
  approved_by: string | null;
  approved_at: string | null;
  last_reviewed_at: string | null;
  flagged_reason: string | null;
  created_at: string;
  needsReview: boolean;
  reviewReasons: string[];
}

const CATEGORIES = [
  "Environmental",
  "Social",
  "Governance",
  "Supply Chain",
  "Health & Safety",
  "Data Privacy",
  "General",
];

function statusBadge(status: string, needsReview: boolean) {
  if (needsReview) {
    return <Badge variant="outline" className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border-amber-300 dark:border-amber-700">Needs Review</Badge>;
  }
  switch (status) {
    case "approved":
      return <Badge variant="outline" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 border-green-300 dark:border-green-700">Approved</Badge>;
    case "flagged":
      return <Badge variant="outline" className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border-amber-300 dark:border-amber-700">Flagged</Badge>;
    default:
      return <Badge variant="secondary">Draft</Badge>;
  }
}

export default function AnswerLibrary() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAnswer, setEditingAnswer] = useState<ProcurementAnswer | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const [formQuestion, setFormQuestion] = useState("");
  const [formAnswer, setFormAnswer] = useState("");
  const [formCategory, setFormCategory] = useState("General");
  const [formStatus, setFormStatus] = useState<string>("draft");
  const [formLinkedMetricIds, setFormLinkedMetricIds] = useState("");
  const [formLinkedPolicySection, setFormLinkedPolicySection] = useState("");
  const [formLinkedEvidenceIds, setFormLinkedEvidenceIds] = useState("");
  const [formLinkedComplianceReqIds, setFormLinkedComplianceReqIds] = useState("");
  const [formFlaggedReason, setFormFlaggedReason] = useState("");

  const { data: answers = [], isLoading } = useQuery<ProcurementAnswer[]>({
    queryKey: ["/api/procurement-answers"],
  });

  const { data: metricsData = [] } = useQuery<any[]>({
    queryKey: ["/api/metrics"],
  });

  const { data: evidenceData = [] } = useQuery<any[]>({
    queryKey: ["/api/evidence"],
  });

  const { data: complianceData } = useQuery<any>({
    queryKey: ["/api/compliance/status"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/procurement-answers", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/procurement-answers"] });
      toast({ title: "Answer created" });
      closeDialog();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await apiRequest("PUT", `/api/procurement-answers/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/procurement-answers"] });
      toast({ title: "Answer updated" });
      closeDialog();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/procurement-answers/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/procurement-answers"] });
      toast({ title: "Answer deleted" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  function openCreate() {
    setEditingAnswer(null);
    setFormQuestion("");
    setFormAnswer("");
    setFormCategory("General");
    setFormStatus("draft");
    setFormLinkedMetricIds("");
    setFormLinkedPolicySection("");
    setFormLinkedEvidenceIds("");
    setFormLinkedComplianceReqIds("");
    setFormFlaggedReason("");
    setDialogOpen(true);
  }

  function openEdit(a: ProcurementAnswer) {
    setEditingAnswer(a);
    setFormQuestion(a.question);
    setFormAnswer(a.answer);
    setFormCategory(a.category || "General");
    setFormStatus(a.status);
    setFormLinkedMetricIds((a.linked_metric_ids || []).join(", "));
    setFormLinkedPolicySection(a.linked_policy_section || "");
    setFormLinkedEvidenceIds((a.linked_evidence_ids || []).join(", "));
    setFormLinkedComplianceReqIds((a.linked_compliance_req_ids || []).join(", "));
    setFormFlaggedReason(a.flagged_reason || "");
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditingAnswer(null);
  }

  function parseIds(s: string): string[] | null {
    const trimmed = s.trim();
    if (!trimmed) return null;
    return trimmed.split(",").map(v => v.trim()).filter(Boolean);
  }

  function handleSubmit() {
    if (!formQuestion.trim() || !formAnswer.trim()) {
      toast({ title: "Question and answer are required", variant: "destructive" });
      return;
    }
    const payload = {
      question: formQuestion.trim(),
      answer: formAnswer.trim(),
      category: formCategory,
      status: formStatus,
      linkedMetricIds: parseIds(formLinkedMetricIds),
      linkedPolicySection: formLinkedPolicySection.trim() || null,
      linkedEvidenceIds: parseIds(formLinkedEvidenceIds),
      linkedComplianceReqIds: parseIds(formLinkedComplianceReqIds),
      flaggedReason: formStatus === "flagged" ? formFlaggedReason.trim() || null : null,
    };
    if (editingAnswer) {
      updateMutation.mutate({ id: editingAnswer.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  const filtered = answers.filter((a) => {
    if (filterCategory !== "all" && a.category !== filterCategory) return false;
    if (filterStatus === "needs_review" && !a.needsReview) return false;
    if (filterStatus !== "all" && filterStatus !== "needs_review" && a.status !== filterStatus) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!a.question.toLowerCase().includes(q) && !a.answer.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const grouped: Record<string, ProcurementAnswer[]> = {};
  for (const a of filtered) {
    const cat = a.category || "Uncategorised";
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(a);
  }

  const metricOptions = metricsData.map((m: any) => ({ id: m.id, name: m.name }));
  const evidenceOptions = evidenceData.map((e: any) => ({ id: e.id, name: e.filename }));
  const complianceReqs: any[] = complianceData?.requirements || [];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6" data-testid="page-answer-library">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Answer Library</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Pre-approved answers for customer procurement questionnaires
          </p>
        </div>
        <Button onClick={openCreate} data-testid="button-create-answer">
          <Plus className="w-4 h-4 mr-2" />
          New Answer
        </Button>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search questions or answers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            data-testid="input-search-answers"
          />
        </div>
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-[160px]" data-testid="select-filter-category">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[160px]" data-testid="select-filter-status">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="flagged">Flagged</SelectItem>
            <SelectItem value="needs_review">Needs Review</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}><CardContent className="p-6"><Skeleton className="h-24 w-full" /></CardContent></Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="w-10 h-10 text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No answers found</p>
            <Button variant="outline" className="mt-4" onClick={openCreate} data-testid="button-create-answer-empty">
              Create your first answer
            </Button>
          </CardContent>
        </Card>
      ) : (
        Object.entries(grouped).map(([category, items]) => (
          <div key={category} className="space-y-3">
            <h2 className="text-lg font-semibold flex items-center gap-2" data-testid={`text-category-${category}`}>
              {category}
              <Badge variant="secondary">{items.length}</Badge>
            </h2>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {items.map((a) => (
                <Card key={a.id} className="flex flex-col" data-testid={`card-answer-${a.id}`}>
                  <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
                    <CardTitle className="text-sm font-medium leading-snug flex-1 min-w-0">
                      {a.question}
                    </CardTitle>
                    <div data-testid={`badge-answer-status-${a.id}`}>
                      {statusBadge(a.status, a.needsReview)}
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1 flex flex-col gap-3">
                    <p className="text-sm text-muted-foreground line-clamp-4">
                      {a.answer}
                    </p>
                    {a.needsReview && a.reviewReasons.length > 0 && (
                      <div className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                        <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                        <span>{a.reviewReasons.join("; ")}</span>
                      </div>
                    )}
                    {a.linked_metric_ids && a.linked_metric_ids.length > 0 && (
                      <div className="flex items-center gap-1 flex-wrap">
                        <span className="text-xs text-muted-foreground">Metrics:</span>
                        <Badge variant="secondary" className="text-xs">{a.linked_metric_ids.length} linked</Badge>
                      </div>
                    )}
                    {a.linked_evidence_ids && a.linked_evidence_ids.length > 0 && (
                      <div className="flex items-center gap-1 flex-wrap">
                        <span className="text-xs text-muted-foreground">Evidence:</span>
                        <Badge variant="secondary" className="text-xs">{a.linked_evidence_ids.length} linked</Badge>
                      </div>
                    )}
                    <div className="flex items-center gap-1 mt-auto pt-2">
                      <Button size="sm" variant="outline" onClick={() => openEdit(a)} data-testid={`button-edit-answer-${a.id}`}>
                        <Pencil className="w-3.5 h-3.5 mr-1" />
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          if (confirm("Delete this answer?")) deleteMutation.mutate(a.id);
                        }}
                        data-testid={`button-delete-answer-${a.id}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                      {a.status === "draft" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="ml-auto"
                          onClick={() => updateMutation.mutate({ id: a.id, data: { status: "approved" } })}
                          data-testid={`button-approve-answer-${a.id}`}
                        >
                          <Check className="w-3.5 h-3.5 mr-1" />
                          Approve
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="dialog-answer-editor">
          <DialogHeader>
            <DialogTitle>{editingAnswer ? "Edit Answer" : "New Answer"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Question</Label>
              <Textarea
                value={formQuestion}
                onChange={(e) => setFormQuestion(e.target.value)}
                placeholder="e.g. What is your carbon reduction strategy?"
                data-testid="input-answer-question"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Answer</Label>
              <Textarea
                value={formAnswer}
                onChange={(e) => setFormAnswer(e.target.value)}
                placeholder="Enter the pre-approved answer..."
                className="min-h-[120px]"
                data-testid="input-answer-text"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select value={formCategory} onValueChange={setFormCategory}>
                  <SelectTrigger data-testid="select-answer-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={formStatus} onValueChange={setFormStatus}>
                  <SelectTrigger data-testid="select-answer-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="flagged">Flagged</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Linked Metrics</Label>
              {metricOptions.length > 0 ? (
                <div className="border rounded-md p-2 max-h-32 overflow-y-auto space-y-1">
                  {metricOptions.map((m: any) => {
                    const ids = parseIds(formLinkedMetricIds) || [];
                    const checked = ids.includes(m.id);
                    return (
                      <label key={m.id} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            const newIds = checked ? ids.filter(i => i !== m.id) : [...ids, m.id];
                            setFormLinkedMetricIds(newIds.join(", "));
                          }}
                        />
                        {m.name}
                      </label>
                    );
                  })}
                </div>
              ) : (
                <Input
                  value={formLinkedMetricIds}
                  onChange={(e) => setFormLinkedMetricIds(e.target.value)}
                  placeholder="Comma-separated metric IDs"
                  data-testid="input-linked-metrics"
                />
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Linked Policy Section</Label>
              <Input
                value={formLinkedPolicySection}
                onChange={(e) => setFormLinkedPolicySection(e.target.value)}
                placeholder="e.g. Environmental Policy"
                data-testid="input-linked-policy"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Linked Evidence</Label>
              {evidenceOptions.length > 0 ? (
                <div className="border rounded-md p-2 max-h-32 overflow-y-auto space-y-1">
                  {evidenceOptions.map((e: any) => {
                    const ids = parseIds(formLinkedEvidenceIds) || [];
                    const checked = ids.includes(e.id);
                    return (
                      <label key={e.id} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            const newIds = checked ? ids.filter(i => i !== e.id) : [...ids, e.id];
                            setFormLinkedEvidenceIds(newIds.join(", "));
                          }}
                        />
                        {e.name}
                      </label>
                    );
                  })}
                </div>
              ) : (
                <Input
                  value={formLinkedEvidenceIds}
                  onChange={(e) => setFormLinkedEvidenceIds(e.target.value)}
                  placeholder="Comma-separated evidence IDs"
                  data-testid="input-linked-evidence"
                />
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Linked Compliance Requirements</Label>
              {complianceReqs.length > 0 ? (
                <div className="border rounded-md p-2 max-h-32 overflow-y-auto space-y-1">
                  {complianceReqs.map((r: any) => {
                    const ids = parseIds(formLinkedComplianceReqIds) || [];
                    const checked = ids.includes(r.id);
                    return (
                      <label key={r.id} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            const newIds = checked ? ids.filter(i => i !== r.id) : [...ids, r.id];
                            setFormLinkedComplianceReqIds(newIds.join(", "));
                          }}
                        />
                        {r.code}: {r.title}
                      </label>
                    );
                  })}
                </div>
              ) : (
                <Input
                  value={formLinkedComplianceReqIds}
                  onChange={(e) => setFormLinkedComplianceReqIds(e.target.value)}
                  placeholder="Comma-separated compliance requirement IDs"
                  data-testid="input-linked-compliance"
                />
              )}
            </div>

            {formStatus === "flagged" && (
              <div className="space-y-1.5">
                <Label>Flagged Reason</Label>
                <Input
                  value={formFlaggedReason}
                  onChange={(e) => setFormFlaggedReason(e.target.value)}
                  placeholder="Reason for flagging"
                  data-testid="input-flagged-reason"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} data-testid="button-cancel-answer">
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending}
              data-testid="button-save-answer"
            >
              {(createMutation.isPending || updateMutation.isPending) ? "Saving..." : editingAnswer ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
