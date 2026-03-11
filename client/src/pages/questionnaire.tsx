import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OwnerAssignment } from "@/components/owner-assignment";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  ClipboardList,
  Plus,
  Trash2,
  Check,
  Copy,
  Download,
  Loader2,
  FileText,
  ArrowLeft,
  Pencil,
  X,
  AlertTriangle,
  ChevronDown,
  Send,
  CheckCircle,
  XCircle,
  Upload,
  FileSpreadsheet,
  Sparkles,
  ChevronUp,
  Info,
} from "lucide-react";
import type { Questionnaire, QuestionnaireQuestion } from "@shared/schema";
import { usePermissions } from "@/lib/permissions";
import { WorkflowBadge, AiDraftBadge, ConfidenceBadge } from "@/components/workflow-badge";
import { DataSourceBadge } from "@/pages/evidence";

type QuestionnaireWithQuestions = Questionnaire & {
  questions: QuestionnaireQuestion[];
};

const CONFIDENCE_CONFIG: Record<string, { label: string; className: string }> = {
  high: { label: "High", className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
  medium: { label: "Medium", className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200" },
  low: { label: "Low", className: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" },
};

const CATEGORY_CONFIG: Record<string, { className: string }> = {
  environmental: { className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200" },
  social: { className: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
  governance: { className: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200" },
};

function QuestionCard({
  question,
  index,
  questionnaireId,
}: {
  question: QuestionnaireQuestion;
  index: number;
  questionnaireId: string;
}) {
  const { toast } = useToast();
  const { can } = usePermissions();
  const isApprover = can("report_generation");
  const [editedAnswer, setEditedAnswer] = useState(
    question.editedAnswer || question.suggestedAnswer || ""
  );
  const [isEditing, setIsEditing] = useState(false);
  const [reviewComment, setReviewComment] = useState("");

  const updateMutation = useMutation({
    mutationFn: (data: { editedAnswer: string; approved: boolean }) =>
      apiRequest("PUT", `/api/questionnaires/${questionnaireId}/questions/${question.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/questionnaires", questionnaireId] });
      toast({ title: "Answer updated" });
      setIsEditing(false);
    },
    onError: () => toast({ title: "Failed to update", variant: "destructive" }),
  });

  const reviewMutation = useMutation({
    mutationFn: (data: { action: string; comment: string }) =>
      apiRequest("POST", "/api/workflow/review", {
        entityType: "questionnaire_question",
        entityId: question.id,
        action: data.action,
        comment: data.comment,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/questionnaires", questionnaireId] });
      setReviewComment("");
      toast({ title: "Review submitted" });
    },
    onError: () => toast({ title: "Review failed", variant: "destructive" }),
  });

  const confidenceKey = question.confidence || "low";
  const confidenceConfig = CONFIDENCE_CONFIG[confidenceKey] || CONFIDENCE_CONFIG.low;
  const categoryKey = (question.category || "").toLowerCase();
  const categoryConfig = CATEGORY_CONFIG[categoryKey];
  const sourceData = (question.sourceData as string[] | null) || [];

  return (
    <Card data-testid={`question-card-${question.id}`}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start gap-3">
          <span className="text-sm font-bold text-muted-foreground shrink-0 mt-0.5">
            Q{index + 1}
          </span>
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-start gap-2 flex-wrap">
              <p className="text-sm font-medium" data-testid={`text-question-${question.id}`}>
                {question.questionText}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {categoryConfig && (
                <Badge variant="outline" className={`text-xs ${categoryConfig.className}`} data-testid={`badge-category-${question.id}`}>
                  {question.category}
                </Badge>
              )}
              <ConfidenceBadge level={question.confidence} />
              <DataSourceBadge type={(question as any).dataSourceType} />
              <WorkflowBadge status={question.workflowStatus} size="sm" />
              {question.suggestedAnswer && !question.approved && (
                <AiDraftBadge />
              )}
              {question.approved && (
                <Badge variant="default" className="text-xs">
                  <Check className="w-3 h-3 mr-1" />
                  Approved
                </Badge>
              )}
            </div>
            {confidenceKey === "low" && (
              <div className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-300" data-testid={`warning-low-confidence-${question.id}`}>
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                Insufficient data - requires manual review
              </div>
            )}
            {isEditing ? (
              <Textarea
                value={editedAnswer}
                onChange={(e) => setEditedAnswer(e.target.value)}
                className="text-sm min-h-20 resize-none"
                data-testid={`textarea-answer-${question.id}`}
              />
            ) : (
              <p className="text-sm text-muted-foreground bg-muted/50 px-3 py-2 rounded-md" data-testid={`text-answer-${question.id}`}>
                {editedAnswer || "No answer generated yet"}
              </p>
            )}
            {question.rationale && (
              <Collapsible>
                <CollapsibleTrigger className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors" data-testid={`trigger-rationale-${question.id}`}>
                  <ChevronDown className="w-3 h-3" />
                  AI Rationale
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <p className="text-xs text-muted-foreground bg-muted/30 px-3 py-2 rounded-md mt-1" data-testid={`text-rationale-${question.id}`}>
                    {question.rationale}
                  </p>
                </CollapsibleContent>
              </Collapsible>
            )}
            {sourceData.length > 0 && (
              <div className="space-y-1" data-testid={`source-data-${question.id}`}>
                <p className="text-xs font-medium text-muted-foreground">Supporting Data</p>
                <ul className="text-xs text-muted-foreground space-y-0.5 pl-3">
                  {sourceData.map((item, idx) => (
                    <li key={idx} data-testid={`source-data-item-${question.id}-${idx}`}>
                      &bull; {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {question.sourceRef && (
              <p className="text-xs text-muted-foreground italic" data-testid={`text-source-${question.id}`}>
                <FileText className="w-3 h-3 inline mr-1" />
                Source: {question.sourceRef}
              </p>
            )}
            <div className="flex items-center gap-2 flex-wrap">
              {isEditing ? (
                <>
                  <Button
                    size="sm"
                    onClick={() => updateMutation.mutate({ editedAnswer, approved: false })}
                    disabled={updateMutation.isPending}
                    data-testid={`button-save-answer-${question.id}`}
                  >
                    {updateMutation.isPending ? "Saving..." : "Save"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEditedAnswer(question.editedAnswer || question.suggestedAnswer || "");
                      setIsEditing(false);
                    }}
                    data-testid={`button-cancel-edit-${question.id}`}
                  >
                    <X className="w-3.5 h-3.5 mr-1" />
                    Cancel
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setIsEditing(true)}
                    data-testid={`button-edit-answer-${question.id}`}
                  >
                    <Pencil className="w-3.5 h-3.5 mr-1" />
                    Edit
                  </Button>
                  {!question.approved && (
                    <Button
                      size="sm"
                      onClick={() => updateMutation.mutate({ editedAnswer, approved: true })}
                      disabled={updateMutation.isPending}
                      data-testid={`button-accept-answer-${question.id}`}
                    >
                      <Check className="w-3.5 h-3.5 mr-1" />
                      Accept
                    </Button>
                  )}
                </>
              )}
            </div>
            {isApprover && question.workflowStatus === "submitted" && (
              <div className="flex items-center gap-2 pt-1 flex-wrap" data-testid={`review-controls-${question.id}`}>
                <Button
                  size="sm"
                  onClick={() => reviewMutation.mutate({ action: "approve", comment: reviewComment })}
                  disabled={reviewMutation.isPending}
                  data-testid={`button-approve-question-${question.id}`}
                >
                  <CheckCircle className="w-3.5 h-3.5 mr-1" />
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => reviewMutation.mutate({ action: "reject", comment: reviewComment })}
                  disabled={reviewMutation.isPending}
                  data-testid={`button-reject-question-${question.id}`}
                >
                  <XCircle className="w-3.5 h-3.5 mr-1" />
                  Reject
                </Button>
                <Input
                  placeholder="Review comment (optional)"
                  value={reviewComment}
                  onChange={(e) => setReviewComment(e.target.value)}
                  className="flex-1 min-w-[150px]"
                  data-testid={`input-review-comment-${question.id}`}
                />
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function NewQuestionnaireTab() {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [pasteMode, setPasteMode] = useState(true);
  const [pastedQuestions, setPastedQuestions] = useState("");
  const [singleQuestion, setSingleQuestion] = useState("");
  const [manualQuestions, setManualQuestions] = useState<string[]>([]);
  const [resultId, setResultId] = useState<string | null>(null);

  const { data: resultData, isLoading: isLoadingResult } = useQuery<QuestionnaireWithQuestions>({
    queryKey: ["/api/questionnaires", resultId],
    enabled: !!resultId,
  });

  const createMutation = useMutation({
    mutationFn: async (questions: string[]) => {
      const res = await apiRequest("POST", "/api/questionnaires", {
        title,
        source: "manual",
        questions,
      });
      return res.json();
    },
    onSuccess: async (data: { id: string }) => {
      await autofillMutation.mutateAsync(data.id);
    },
    onError: () => toast({ title: "Failed to create questionnaire", variant: "destructive" }),
  });

  const autofillMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/questionnaires/${id}/autofill`, undefined);
      return res.json();
    },
    onSuccess: (data: { id: string }) => {
      setResultId(data.id);
      queryClient.invalidateQueries({ queryKey: ["/api/questionnaires"] });
      toast({ title: "Questionnaire autofilled successfully" });
    },
    onError: () => toast({ title: "Autofill failed", variant: "destructive" }),
  });

  const isProcessing = createMutation.isPending || autofillMutation.isPending;

  const handleSubmit = () => {
    const questions = pasteMode
      ? pastedQuestions.split("\n").map((q) => q.trim()).filter(Boolean)
      : manualQuestions;

    if (!title.trim()) {
      toast({ title: "Please enter a title", variant: "destructive" });
      return;
    }
    if (questions.length === 0) {
      toast({ title: "Please add at least one question", variant: "destructive" });
      return;
    }
    createMutation.mutate(questions);
  };

  const handleAddQuestion = () => {
    if (singleQuestion.trim()) {
      setManualQuestions((prev) => [...prev, singleQuestion.trim()]);
      setSingleQuestion("");
    }
  };

  const handleRemoveQuestion = (index: number) => {
    setManualQuestions((prev) => prev.filter((_, i) => i !== index));
  };

  const handleCopyAll = () => {
    if (!resultData?.questions) return;
    const text = resultData.questions
      .map(
        (q, i) =>
          `Q${i + 1}: ${q.questionText}\nA: ${q.editedAnswer || q.suggestedAnswer || "No answer"}\n`
      )
      .join("\n");
    navigator.clipboard.writeText(text);
    toast({ title: "Copied to clipboard" });
  };

  const handleExportCsv = () => {
    if (!resultData?.questions) return;
    const header = "Question,Answer,Category,Confidence,Source,Data Source\n";
    const rows = resultData.questions
      .map((q) => {
        const answer = (q.editedAnswer || q.suggestedAnswer || "").replace(/"/g, '""');
        const question = q.questionText.replace(/"/g, '""');
        const source = (q.sourceRef || "").replace(/"/g, '""');
        const dsType = q.dataSourceType === "evidenced" ? "Evidenced" : (q.dataSourceType === "estimated" ? "Estimated" : "Manual");
        return `"${question}","${answer}","${q.category || ""}","${q.confidence || ""}","${source}","${dsType}"`;
      })
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${resultData.title || "questionnaire"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleReset = () => {
    setResultId(null);
    setTitle("");
    setPastedQuestions("");
    setManualQuestions([]);
  };

  const submitAllMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/workflow/submit", {
        entityType: "questionnaire_question",
        entityIds: resultData?.questions.map((q) => q.id) || [],
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/questionnaires", resultId] });
      toast({ title: "All questions submitted for review" });
    },
    onError: () => toast({ title: "Submit failed", variant: "destructive" }),
  });

  if (resultId && resultData) {
    return (
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <Button variant="outline" size="sm" onClick={handleReset} data-testid="button-back-new">
              <ArrowLeft className="w-3.5 h-3.5 mr-1" />
              New Questionnaire
            </Button>
            <h2 className="text-lg font-semibold mt-2" data-testid="text-result-title">
              {resultData.title}
            </h2>
            <p className="text-sm text-muted-foreground">
              {resultData.questions.length} questions autofilled
            </p>
            <div className="mt-1">
              <OwnerAssignment
                entityType="questionnaires"
                entityId={resultData.id}
                currentUserId={(resultData as any).assignedUserId}
                invalidateKeys={[["/api/questionnaires", resultId!]]}
              />
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              size="sm"
              onClick={() => submitAllMutation.mutate()}
              disabled={submitAllMutation.isPending}
              data-testid="button-submit-all-review"
            >
              <Send className="w-3.5 h-3.5 mr-1" />
              {submitAllMutation.isPending ? "Submitting..." : "Submit All for Review"}
            </Button>
            <Button variant="outline" size="sm" onClick={handleCopyAll} data-testid="button-copy-all">
              <Copy className="w-3.5 h-3.5 mr-1" />
              Copy All
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportCsv} data-testid="button-export-csv">
              <Download className="w-3.5 h-3.5 mr-1" />
              Export CSV
            </Button>
          </div>
        </div>
        <div className="space-y-3">
          {resultData.questions.map((q, i) => (
            <QuestionCard
              key={q.id}
              question={q}
              index={i}
              questionnaireId={resultData.id}
            />
          ))}
        </div>
      </div>
    );
  }

  if (isProcessing) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
        <p className="text-sm text-muted-foreground" data-testid="text-processing">
          Analysing questions and generating answers...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <div>
          <Label htmlFor="questionnaire-title">Questionnaire Title</Label>
          <Input
            id="questionnaire-title"
            placeholder="e.g. Supplier ESG Assessment 2024"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            data-testid="input-questionnaire-title"
            className="mt-1.5"
          />
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant={pasteMode ? "default" : "outline"}
            size="sm"
            onClick={() => setPasteMode(true)}
            data-testid="button-paste-mode"
          >
            Paste Questions
          </Button>
          <Button
            variant={!pasteMode ? "default" : "outline"}
            size="sm"
            onClick={() => setPasteMode(false)}
            data-testid="button-manual-mode"
          >
            Add One by One
          </Button>
        </div>

        {pasteMode ? (
          <div>
            <Label htmlFor="paste-questions">Paste questions (one per line)</Label>
            <Textarea
              id="paste-questions"
              placeholder={"What is your company's carbon reduction target?\nDo you have an environmental management system?\nHow do you ensure board diversity?"}
              value={pastedQuestions}
              onChange={(e) => setPastedQuestions(e.target.value)}
              className="mt-1.5 min-h-32 resize-none"
              data-testid="textarea-paste-questions"
            />
            {pastedQuestions.trim() && (
              <p className="text-xs text-muted-foreground mt-1">
                {pastedQuestions.split("\n").filter((l) => l.trim()).length} questions detected
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Label htmlFor="single-question">Add a question</Label>
                <Input
                  id="single-question"
                  placeholder="Type a question..."
                  value={singleQuestion}
                  onChange={(e) => setSingleQuestion(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddQuestion()}
                  className="mt-1.5"
                  data-testid="input-single-question"
                />
              </div>
              <Button size="sm" onClick={handleAddQuestion} data-testid="button-add-question">
                <Plus className="w-3.5 h-3.5 mr-1" />
                Add
              </Button>
            </div>
            {manualQuestions.length > 0 && (
              <div className="space-y-1.5">
                {manualQuestions.map((q, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 text-sm bg-muted/50 px-3 py-2 rounded-md"
                    data-testid={`text-manual-question-${i}`}
                  >
                    <span className="text-muted-foreground font-medium shrink-0">
                      {i + 1}.
                    </span>
                    <span className="flex-1 min-w-0 truncate">{q}</span>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => handleRemoveQuestion(i)}
                      data-testid={`button-remove-question-${i}`}
                    >
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <Button
        onClick={handleSubmit}
        disabled={isProcessing}
        data-testid="button-create-autofill"
      >
        <ClipboardList className="w-4 h-4 mr-1.5" />
        Create & Autofill
      </Button>
    </div>
  );
}

function PreviousQuestionnairesTab() {
  const { toast } = useToast();
  const { can } = usePermissions();
  const canDelete = can("questionnaire_access");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: questionnaires = [], isLoading } = useQuery<Questionnaire[]>({
    queryKey: ["/api/questionnaires"],
  });

  const { data: detailData, isLoading: isLoadingDetail } = useQuery<QuestionnaireWithQuestions>({
    queryKey: ["/api/questionnaires", selectedId],
    enabled: !!selectedId,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/questionnaires/${id}`, undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/questionnaires"] });
      toast({ title: "Questionnaire deleted" });
      if (selectedId) setSelectedId(null);
    },
    onError: () => toast({ title: "Failed to delete", variant: "destructive" }),
  });

  const handleCopyAll = () => {
    if (!detailData?.questions) return;
    const text = detailData.questions
      .map(
        (q, i) =>
          `Q${i + 1}: ${q.questionText}\nA: ${q.editedAnswer || q.suggestedAnswer || "No answer"}\n`
      )
      .join("\n");
    navigator.clipboard.writeText(text);
    toast({ title: "Copied to clipboard" });
  };

  const handleExportCsv = () => {
    if (!detailData?.questions) return;
    const header = "Question,Answer,Category,Confidence,Source,Data Source\n";
    const rows = detailData.questions
      .map((q) => {
        const answer = (q.editedAnswer || q.suggestedAnswer || "").replace(/"/g, '""');
        const question = q.questionText.replace(/"/g, '""');
        const source = (q.sourceRef || "").replace(/"/g, '""');
        const dsType = q.dataSourceType === "evidenced" ? "Evidenced" : (q.dataSourceType === "estimated" ? "Estimated" : "Manual");
        return `"${question}","${answer}","${q.category || ""}","${q.confidence || ""}","${source}","${dsType}"`;
      })
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${detailData.title || "questionnaire"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
    );
  }

  if (selectedId && detailData) {
    return (
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedId(null)}
              data-testid="button-back-list"
            >
              <ArrowLeft className="w-3.5 h-3.5 mr-1" />
              Back to List
            </Button>
            <h2 className="text-lg font-semibold mt-2" data-testid="text-detail-title">
              {detailData.title}
            </h2>
            <p className="text-sm text-muted-foreground">
              {detailData.questions.length} questions
              {detailData.status && (
                <Badge variant="outline" className="ml-2 text-xs">
                  {detailData.status}
                </Badge>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={handleCopyAll} data-testid="button-detail-copy-all">
              <Copy className="w-3.5 h-3.5 mr-1" />
              Copy All
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportCsv} data-testid="button-detail-export-csv">
              <Download className="w-3.5 h-3.5 mr-1" />
              Export CSV
            </Button>
          </div>
        </div>
        {isLoadingDetail ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {detailData.questions.map((q, i) => (
              <QuestionCard
                key={q.id}
                question={q}
                index={i}
                questionnaireId={detailData.id}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  if (questionnaires.length === 0) {
    return (
      <div className="text-center py-12 space-y-2">
        <ClipboardList className="w-8 h-8 text-muted-foreground mx-auto" />
        <p className="text-sm text-muted-foreground">
          No questionnaires yet. Create your first one in the "New Questionnaire" tab.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {questionnaires.map((q) => (
        <Card key={q.id} data-testid={`questionnaire-card-${q.id}`}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setSelectedId(q.id)}>
                <h3 className="text-sm font-semibold" data-testid={`text-questionnaire-title-${q.id}`}>
                  {q.title}
                </h3>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {q.status && (
                    <Badge variant="outline" className="text-xs">
                      {q.status}
                    </Badge>
                  )}
                  {q.createdAt && (
                    <span className="text-xs text-muted-foreground">
                      {new Date(q.createdAt).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setSelectedId(q.id)}
                  data-testid={`button-view-questionnaire-${q.id}`}
                >
                  <FileText className="w-3.5 h-3.5" />
                </Button>
                {canDelete && (
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => deleteMutation.mutate(q.id)}
                    data-testid={`button-delete-questionnaire-${q.id}`}
                  >
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ImportQuestionnaireDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const [importTab, setImportTab] = useState<"text" | "csv" | "xlsx">("text");
  const [importTitle, setImportTitle] = useState("");
  const [importText, setImportText] = useState("");
  const [importPreview, setImportPreview] = useState<any>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const importMutation = useMutation({
    mutationFn: async (data: { format: string; content: string; title: string }) => {
      const res = await apiRequest("POST", "/api/questionnaires/import", data);
      return res.json();
    },
    onSuccess: (data: any) => {
      setImportPreview(data);
      queryClient.invalidateQueries({ queryKey: ["/api/questionnaires"] });
      toast({ title: `Imported ${data.totalQuestions} questions (${data.matched} matched)` });
    },
    onError: () => toast({ title: "Import failed", variant: "destructive" }),
  });

  const handleTextImport = () => {
    if (!importTitle.trim()) { toast({ title: "Enter a title", variant: "destructive" }); return; }
    if (!importText.trim()) { toast({ title: "Paste some questions", variant: "destructive" }); return; }
    importMutation.mutate({ format: "text", content: importText, title: importTitle });
  };

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!importTitle.trim()) { toast({ title: "Enter a title first", variant: "destructive" }); return; }
    const reader = new FileReader();
    reader.onload = (evt) => {
      const base64 = btoa(new Uint8Array(evt.target?.result as ArrayBuffer).reduce((d, b) => d + String.fromCharCode(b), ""));
      const format = file.name.endsWith(".csv") ? "csv" : "xlsx";
      importMutation.mutate({ format, content: base64, title: importTitle });
    };
    reader.readAsArrayBuffer(file);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleClose = () => {
    setImportPreview(null);
    setImportText("");
    setImportTitle("");
    onClose();
  };

  const confidenceColor = (c: number) => c >= 70 ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200" : c >= 40 ? "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200" : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="w-4 h-4" />
            Import Questionnaire
          </DialogTitle>
        </DialogHeader>

        {importPreview ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{importPreview.totalQuestions} questions imported</p>
                <p className="text-xs text-muted-foreground">{importPreview.matched} matched, {importPreview.unmatched} unmatched</p>
              </div>
              <Badge variant="default">Complete</Badge>
            </div>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {(importPreview.questions || []).map((q: any, i: number) => (
                <div key={i} className="p-3 rounded-md border text-sm" data-testid={`import-preview-${i}`}>
                  <p className="font-medium text-xs">{q.text}</p>
                  {q.suggestedAnswer && (
                    <p className="text-xs text-muted-foreground mt-1 bg-muted/50 px-2 py-1 rounded">{q.suggestedAnswer}</p>
                  )}
                  <div className="flex items-center gap-2 mt-2">
                    <Badge className={`text-[10px] ${confidenceColor(q.confidence)}`}>{q.confidence}%</Badge>
                    <Badge variant="outline" className="text-[10px]">{q.sourceType}</Badge>
                    {q.requiresReview && <Badge variant="destructive" className="text-[10px]">Needs Review</Badge>}
                  </div>
                </div>
              ))}
            </div>
            <DialogFooter>
              <Button onClick={handleClose} data-testid="button-import-done">Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <Label>Questionnaire Title</Label>
              <Input
                value={importTitle}
                onChange={(e) => setImportTitle(e.target.value)}
                placeholder="e.g. CDP Climate Change 2024"
                className="mt-1.5"
                data-testid="input-import-title"
              />
            </div>

            <Tabs value={importTab} onValueChange={(v) => setImportTab(v as any)}>
              <TabsList>
                <TabsTrigger value="text" data-testid="tab-import-text">Paste Text</TabsTrigger>
                <TabsTrigger value="csv" data-testid="tab-import-csv">Upload CSV</TabsTrigger>
                <TabsTrigger value="xlsx" data-testid="tab-import-xlsx">Upload Excel</TabsTrigger>
              </TabsList>
              <TabsContent value="text" className="mt-3">
                <Textarea
                  placeholder={"One question per line:\nWhat is your carbon reduction target?\nDo you have an environmental management system?"}
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  className="min-h-32"
                  data-testid="textarea-import-text"
                />
                {importText.trim() && (
                  <p className="text-xs text-muted-foreground mt-1">{importText.split("\n").filter(l => l.trim()).length} questions detected</p>
                )}
              </TabsContent>
              <TabsContent value="csv" className="mt-3">
                <div className="border-2 border-dashed rounded-lg p-8 text-center">
                  <FileSpreadsheet className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground mb-3">Upload a CSV file with questions</p>
                  <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} data-testid="button-upload-csv">
                    <Upload className="w-3.5 h-3.5 mr-1.5" />
                    Choose CSV File
                  </Button>
                  <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFileImport} />
                </div>
              </TabsContent>
              <TabsContent value="xlsx" className="mt-3">
                <div className="border-2 border-dashed rounded-lg p-8 text-center">
                  <FileSpreadsheet className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground mb-3">Upload an Excel file with questions</p>
                  <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} data-testid="button-upload-xlsx">
                    <Upload className="w-3.5 h-3.5 mr-1.5" />
                    Choose Excel File
                  </Button>
                  <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileImport} />
                </div>
              </TabsContent>
            </Tabs>

            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              {importTab === "text" && (
                <Button
                  onClick={handleTextImport}
                  disabled={importMutation.isPending}
                  data-testid="button-confirm-import"
                >
                  {importMutation.isPending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Upload className="w-4 h-4 mr-1.5" />}
                  {importMutation.isPending ? "Importing..." : "Import & Match"}
                </Button>
              )}
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function AIResponseGeneratorTab() {
  const { toast } = useToast();
  const [text, setText] = useState("");
  const [results, setResults] = useState<Array<{ question: string; suggestedAnswer: string; confidence: string; source: string }> | null>(null);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const generateMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/questionnaires/generate-responses", { text }),
    onSuccess: async (res) => {
      const data = await res.json();
      setResults(data.questions || []);
    },
    onError: async (err: any) => {
      const body = await err.response?.json().catch(() => ({}));
      toast({ title: "Error", description: body?.error || "Failed to generate responses", variant: "destructive" });
    },
  });

  function copyAll() {
    if (!results) return;
    const out = results.map((r, i) => `Q${i + 1}: ${r.question}\n\nAnswer: ${r.suggestedAnswer}`).join("\n\n---\n\n");
    navigator.clipboard.writeText(out);
    toast({ title: "Copied", description: "All answers copied to clipboard" });
  }

  function copyOne(idx: number) {
    if (!results) return;
    navigator.clipboard.writeText(results[idx].suggestedAnswer);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  }

  const confColor: Record<string, string> = {
    high: "text-green-600 dark:text-green-400",
    medium: "text-amber-600 dark:text-amber-400",
    low: "text-red-600 dark:text-red-400",
  };

  return (
    <div className="mt-4 space-y-4">
      <Card>
        <CardContent className="pt-5 space-y-4">
          <div className="flex items-start gap-3 p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
            <p className="text-xs text-blue-800 dark:text-blue-300">
              Paste your questionnaire questions below (one per line or numbered). The AI will draft answers using your answer library, policies, and ESG metrics.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="questionnaire-text" className="text-xs font-medium">
              Paste questionnaire questions
            </Label>
            <Textarea
              id="questionnaire-text"
              placeholder={"1. What is your company's approach to reducing carbon emissions?\n2. Do you have a formal environmental policy?\n3. What percentage of your workforce have completed ESG training?"}
              value={text}
              onChange={e => setText(e.target.value)}
              rows={8}
              className="font-mono text-xs resize-none"
              data-testid="textarea-questionnaire-input"
            />
            <p className="text-xs text-muted-foreground">{text.split("\n").filter(l => l.trim()).length} lines detected</p>
          </div>
          <Button
            onClick={() => generateMutation.mutate()}
            disabled={!text.trim() || generateMutation.isPending}
            className="w-full"
            data-testid="button-generate-ai-responses"
          >
            {generateMutation.isPending ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Generating responses...</>
            ) : (
              <><Sparkles className="w-4 h-4 mr-2" />Generate AI Responses</>
            )}
          </Button>
        </CardContent>
      </Card>

      {results && (
        <div className="space-y-3" data-testid="section-generated-responses">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">{results.length} suggested answer{results.length !== 1 ? "s" : ""}</p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={copyAll} data-testid="button-copy-all">
                <Copy className="w-3.5 h-3.5 mr-1.5" />Copy All
              </Button>
              <Button variant="outline" size="sm" onClick={() => {
                const out = results.map((r, i) => `Q${i + 1}: ${r.question}\n\nAnswer: ${r.suggestedAnswer}`).join("\n\n---\n\n");
                const blob = new Blob([out], { type: "text/plain" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url; a.download = "questionnaire-responses.txt"; a.click();
                URL.revokeObjectURL(url);
              }} data-testid="button-export-responses">
                <Download className="w-3.5 h-3.5 mr-1.5" />Export
              </Button>
            </div>
          </div>
          {results.map((r, i) => (
            <Card key={i} data-testid={`card-response-${i}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <button
                      className="w-full text-left flex items-start justify-between gap-2"
                      onClick={() => setExpandedIdx(expandedIdx === i ? null : i)}
                      data-testid={`button-expand-response-${i}`}
                    >
                      <p className="text-sm font-medium">{i + 1}. {r.question}</p>
                      {expandedIdx === i ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />}
                    </button>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <span className={`text-xs font-medium ${confColor[r.confidence] || confColor.low}`}>
                        {r.confidence.charAt(0).toUpperCase() + r.confidence.slice(1)} confidence
                      </span>
                      {r.source && (
                        <span className="text-xs text-muted-foreground">Source: {r.source}</span>
                      )}
                    </div>
                  </div>
                </div>
                {expandedIdx === i && (
                  <div className="mt-3 space-y-3">
                    <div className="p-3 bg-muted/40 rounded-md text-sm leading-relaxed whitespace-pre-wrap">
                      {r.suggestedAnswer}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => copyOne(i)}
                      data-testid={`button-copy-response-${i}`}
                    >
                      {copiedIdx === i ? <><Check className="w-3 h-3 mr-1" />Copied</> : <><Copy className="w-3 h-3 mr-1" />Copy answer</>}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export default function QuestionnairePage() {
  const { can } = usePermissions();
  const canAccess = can("questionnaire_access");
  const [importOpen, setImportOpen] = useState(false);

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-primary" />
            Questionnaire Autofill
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Answer ESG questionnaires using your company data
          </p>
        </div>
        {canAccess && (
          <Button variant="outline" size="sm" onClick={() => setImportOpen(true)} data-testid="button-open-import">
            <Upload className="w-3.5 h-3.5 mr-1.5" />
            Import
          </Button>
        )}
      </div>

      <ImportQuestionnaireDialog open={importOpen} onClose={() => setImportOpen(false)} />

      <Tabs defaultValue={canAccess ? "generator" : "previous"} className="w-full">
        <TabsList data-testid="tabs-questionnaire">
          {canAccess && (
            <TabsTrigger value="generator" data-testid="tab-ai-generator">
              <Sparkles className="w-3.5 h-3.5 mr-1.5" />
              AI Response Generator
            </TabsTrigger>
          )}
          {canAccess && (
            <TabsTrigger value="new" data-testid="tab-new-questionnaire">
              Questionnaire Builder
            </TabsTrigger>
          )}
          <TabsTrigger value="previous" data-testid="tab-previous-questionnaires">
            History
          </TabsTrigger>
        </TabsList>
        {canAccess && (
          <TabsContent value="generator">
            <AIResponseGeneratorTab />
          </TabsContent>
        )}
        {canAccess && (
          <TabsContent value="new">
            <NewQuestionnaireTab />
          </TabsContent>
        )}
        <TabsContent value="previous">
          <PreviousQuestionnairesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
