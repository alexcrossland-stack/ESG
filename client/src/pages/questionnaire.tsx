import { useState } from "react";
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
import { Skeleton } from "@/components/ui/skeleton";
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
} from "lucide-react";
import type { Questionnaire, QuestionnaireQuestion } from "@shared/schema";

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
  const [editedAnswer, setEditedAnswer] = useState(
    question.editedAnswer || question.suggestedAnswer || ""
  );
  const [isEditing, setIsEditing] = useState(false);

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

  const confidenceKey = question.confidence || "low";
  const confidenceConfig = CONFIDENCE_CONFIG[confidenceKey] || CONFIDENCE_CONFIG.low;
  const categoryKey = (question.category || "").toLowerCase();
  const categoryConfig = CATEGORY_CONFIG[categoryKey];

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
              <Badge variant="outline" className={`text-xs ${confidenceConfig.className}`} data-testid={`badge-confidence-${question.id}`}>
                {confidenceConfig.label} confidence
              </Badge>
              {question.approved && (
                <Badge variant="default" className="text-xs">
                  <Check className="w-3 h-3 mr-1" />
                  Approved
                </Badge>
              )}
            </div>
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
    const header = "Question,Answer,Category,Confidence,Source\n";
    const rows = resultData.questions
      .map((q) => {
        const answer = (q.editedAnswer || q.suggestedAnswer || "").replace(/"/g, '""');
        const question = q.questionText.replace(/"/g, '""');
        const source = (q.sourceRef || "").replace(/"/g, '""');
        return `"${question}","${answer}","${q.category || ""}","${q.confidence || ""}","${source}"`;
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
          </div>
          <div className="flex items-center gap-2 flex-wrap">
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
    const header = "Question,Answer,Category,Confidence,Source\n";
    const rows = detailData.questions
      .map((q) => {
        const answer = (q.editedAnswer || q.suggestedAnswer || "").replace(/"/g, '""');
        const question = q.questionText.replace(/"/g, '""');
        const source = (q.sourceRef || "").replace(/"/g, '""');
        return `"${question}","${answer}","${q.category || ""}","${q.confidence || ""}","${source}"`;
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
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => deleteMutation.mutate(q.id)}
                  data-testid={`button-delete-questionnaire-${q.id}`}
                >
                  <Trash2 className="w-3.5 h-3.5 text-destructive" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function QuestionnairePage() {
  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <ClipboardList className="w-5 h-5 text-primary" />
          Questionnaire Autofill
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Answer ESG questionnaires using your company data
        </p>
      </div>

      <Tabs defaultValue="new" className="w-full">
        <TabsList data-testid="tabs-questionnaire">
          <TabsTrigger value="new" data-testid="tab-new-questionnaire">
            New Questionnaire
          </TabsTrigger>
          <TabsTrigger value="previous" data-testid="tab-previous-questionnaires">
            Previous Questionnaires
          </TabsTrigger>
        </TabsList>
        <TabsContent value="new">
          <NewQuestionnaireTab />
        </TabsContent>
        <TabsContent value="previous">
          <PreviousQuestionnairesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
