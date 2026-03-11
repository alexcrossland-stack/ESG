import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { OwnerAssignment } from "@/components/owner-assignment";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import {
  FileText, Sparkles, ChevronRight, ChevronLeft, Loader2, Shield,
  Leaf, Users, Building2, ClipboardCheck, AlertTriangle, Download,
  CheckCircle, Clock, Search, Library, FilePlus, Eye, Trash2, Edit3,
  Send, XCircle,
} from "lucide-react";
import { format } from "date-fns";
import { usePermissions } from "@/lib/permissions";
import { WorkflowBadge, AiDraftBadge } from "@/components/workflow-badge";

const CATEGORY_ICONS: Record<string, any> = {
  "Quality": ClipboardCheck,
  "Environmental": Leaf,
  "Health & Safety": Shield,
  "Information Security": Shield,
  "Governance": Building2,
  "Social": Users,
  "Supply Chain": Building2,
};

const CATEGORY_COLORS: Record<string, string> = {
  "Quality": "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  "Environmental": "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  "Health & Safety": "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  "Information Security": "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  "Governance": "bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-300",
  "Social": "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300",
  "Supply Chain": "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
};

type ViewState =
  | { mode: "library" }
  | { mode: "questionnaire"; slug: string }
  | { mode: "view-policy"; id: string };

export default function PolicyTemplatesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const [view, setView] = useState<ViewState>({ mode: "library" });
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const { data: templates = [], isLoading: templatesLoading } = useQuery<any[]>({
    queryKey: ["/api/policy-templates"],
  });

  const { data: generatedPolicies = [], isLoading: policiesLoading } = useQuery<any[]>({
    queryKey: ["/api/generated-policies"],
  });

  const { data: authData } = useQuery<{ user: any; company: any }>({
    queryKey: ["/api/auth/me"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/generated-policies/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/generated-policies"] });
      toast({ title: "Policy deleted" });
    },
  });

  const filteredTemplates = templates.filter((t: any) => {
    const matchesSearch = !searchTerm || t.name.toLowerCase().includes(searchTerm.toLowerCase()) || t.description?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = categoryFilter === "all" || t.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const categories = [...new Set(templates.map((t: any) => t.category))];

  if (view.mode === "questionnaire") {
    return (
      <QuestionnaireWizard
        slug={view.slug}
        authData={authData}
        onBack={() => setView({ mode: "library" })}
        onComplete={(policy: any) => {
          queryClient.invalidateQueries({ queryKey: ["/api/generated-policies"] });
          setView({ mode: "view-policy", id: policy.id });
        }}
      />
    );
  }

  if (view.mode === "view-policy") {
    return (
      <PolicyViewer
        id={view.id}
        onBack={() => setView({ mode: "library" })}
      />
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Library className="w-5 h-5 text-primary" />
            Policy Templates
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {templates.length} structured policy and procedure templates with guided questionnaires and smart drafting
          </p>
        </div>
      </div>

      <Tabs defaultValue="templates">
        <TabsList>
          <TabsTrigger value="templates" data-testid="tab-templates">
            <Library className="w-3.5 h-3.5 mr-1.5" />
            Template Library
          </TabsTrigger>
          <TabsTrigger value="my-policies" data-testid="tab-my-policies">
            <FileText className="w-3.5 h-3.5 mr-1.5" />
            My Policies ({generatedPolicies.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="templates" className="mt-4 space-y-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search templates..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
                data-testid="input-search-templates"
              />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[180px]" data-testid="select-category-filter">
                <SelectValue placeholder="All categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {categories.map((c: string) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {templatesLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-44" />)}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredTemplates.map((t: any) => {
                const IconComp = CATEGORY_ICONS[t.category] || FileText;
                const colorClass = CATEGORY_COLORS[t.category] || "bg-muted text-muted-foreground";
                const compliance = t.complianceMapping as any;
                const existingPolicy = generatedPolicies.find((p: any) => p.templateSlug === t.slug);
                return (
                  <Card
                    key={t.slug}
                    className="group cursor-pointer hover:border-primary/40 transition-colors"
                    onClick={() => setView({ mode: "questionnaire", slug: t.slug })}
                    data-testid={`card-template-${t.slug}`}
                  >
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className={`flex items-center justify-center w-8 h-8 rounded-lg ${colorClass}`}>
                          <IconComp className="w-4 h-4" />
                        </div>
                        {existingPolicy && (
                          <Badge variant="secondary" className="text-xs">Created</Badge>
                        )}
                      </div>
                      <CardTitle className="text-sm mt-2">{t.name}</CardTitle>
                      <CardDescription className="text-xs line-clamp-2">{t.description}</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="flex flex-wrap gap-1.5">
                        <Badge variant="outline" className="text-[10px]">{t.category}</Badge>
                        {compliance?.isoStandards?.slice(0, 2).map((iso: string) => (
                          <Badge key={iso} variant="outline" className="text-[10px]">{iso.split(":")[0]}</Badge>
                        ))}
                      </div>
                      <div className="flex items-center text-xs text-primary mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Sparkles className="w-3 h-3 mr-1" />
                        Generate this policy
                        <ChevronRight className="w-3 h-3 ml-auto" />
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="my-policies" className="mt-4 space-y-4">
          {policiesLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20" />)}
            </div>
          ) : generatedPolicies.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <FilePlus className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                <p className="text-sm font-medium">No policies created yet</p>
                <p className="text-xs text-muted-foreground mt-1">Select a template from the library to get started</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {generatedPolicies.map((p: any) => {
                const statusColor = p.status === "published" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                  : p.status === "approved" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                  : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300";
                return (
                  <Card
                    key={p.id}
                    className="cursor-pointer hover:border-primary/40 transition-colors"
                    onClick={() => setView({ mode: "view-policy", id: p.id })}
                    data-testid={`card-policy-${p.id}`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3">
                        <FileText className="w-5 h-5 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{p.title}</p>
                          <p className="text-xs text-muted-foreground">
                            v{p.versionNumber} · {p.policyOwner || "No owner"} · Updated {p.updatedAt ? format(new Date(p.updatedAt), "dd MMM yyyy") : "—"}
                          </p>
                        </div>
                        <div onClick={(e) => e.stopPropagation()}>
                          <OwnerAssignment
                            entityType="esg_policies"
                            entityId={p.id}
                            currentUserId={p.assignedUserId}
                            invalidateKeys={[["/api/generated-policies"]]}
                          />
                        </div>
                        <WorkflowBadge status={p.workflowStatus} size="sm" />
                        {p.workflowStatus !== "approved" && p.status !== "approved" && p.status !== "published" && (
                          <AiDraftBadge />
                        )}
                        <Badge className={`text-xs ${statusColor}`}>{p.status}</Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteMutation.mutate(p.id);
                          }}
                          data-testid={`button-delete-policy-${p.id}`}
                        >
                          <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function QuestionnaireWizard({ slug, authData, onBack, onComplete }: {
  slug: string;
  authData: any;
  onBack: () => void;
  onComplete: (policy: any) => void;
}) {
  const { toast } = useToast();
  const { can } = usePermissions();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [initialized, setInitialized] = useState(false);

  const { data: template, isLoading } = useQuery<any>({
    queryKey: ["/api/policy-templates", slug],
  });

  if (template && !initialized) {
    const company = authData?.company;
    const user = authData?.user;
    setAnswers({
      companyName: company?.name || "",
      sector: company?.industry || "",
      employeeCount: company?.employeeCount?.toString() || "",
      countries: company?.country || "United Kingdom",
      policyOwner: user?.username || "",
      approver: "",
      tone: "Simple SME — plain language, practical",
    });
    setInitialized(true);
  }

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/policy-templates/${slug}/generate`, { answers });
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Policy created", description: `${template.name} has been created successfully.` });
      onComplete(data);
    },
    onError: (e: any) => {
      toast({ title: "Generation failed", description: e.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="p-6 max-w-3xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!template) return null;

  const questionnaire = template.questionnaire as any[];
  const compliance = template.complianceMapping as any;

  const commonQuestions = questionnaire.filter((q: any) =>
    ["companyName", "legalEntity", "sector", "employeeCount", "countries", "setupType", "customerRequirements", "certifications", "keyRisks", "policyOwner", "approver", "tone"].includes(q.key)
  );
  const specificQuestions = questionnaire.filter((q: any) =>
    !["companyName", "legalEntity", "sector", "employeeCount", "countries", "setupType", "customerRequirements", "certifications", "keyRisks", "policyOwner", "approver", "tone"].includes(q.key)
  );

  const steps = [
    { label: "Company Details", questions: commonQuestions.slice(0, 6) },
    { label: "Requirements", questions: commonQuestions.slice(6) },
    { label: template.name, questions: specificQuestions },
    { label: "Review & Generate", questions: [] },
  ];

  const currentStep = steps[step];

  const updateAnswer = (key: string, value: any) => {
    setAnswers(prev => ({ ...prev, [key]: value }));
  };

  const toggleMultiSelect = (key: string, option: string) => {
    setAnswers(prev => {
      const current = Array.isArray(prev[key]) ? prev[key] : [];
      const next = current.includes(option) ? current.filter((v: string) => v !== option) : [...current, option];
      return { ...prev, [key]: next };
    });
  };

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack} data-testid="button-back-to-library">
          <ChevronLeft className="w-4 h-4 mr-1" />
          Back
        </Button>
        <div>
          <h1 className="text-lg font-semibold">{template.name}</h1>
          <p className="text-xs text-muted-foreground">{template.description}</p>
        </div>
      </div>

      <div className="flex gap-2">
        {steps.map((s, i) => (
          <div
            key={i}
            className={`flex-1 h-1.5 rounded-full ${i <= step ? "bg-primary" : "bg-muted"}`}
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Step {step + 1} of {steps.length}: {currentStep.label}</p>

      {step < 3 ? (
        <Card>
          <CardContent className="p-5 space-y-4">
            {currentStep.questions.map((q: any) => (
              <div key={q.key} className="space-y-1.5">
                <Label className="text-sm">{q.label}{q.required && <span className="text-destructive ml-0.5">*</span>}</Label>
                {q.type === "text" && (
                  <Input
                    value={answers[q.key] || ""}
                    onChange={(e) => updateAnswer(q.key, e.target.value)}
                    placeholder={q.placeholder || ""}
                    data-testid={`input-${q.key}`}
                  />
                )}
                {q.type === "number" && (
                  <Input
                    type="number"
                    value={answers[q.key] || ""}
                    onChange={(e) => updateAnswer(q.key, e.target.value)}
                    placeholder={q.placeholder || ""}
                    data-testid={`input-${q.key}`}
                  />
                )}
                {q.type === "select" && (
                  <Select value={answers[q.key] || ""} onValueChange={(v) => updateAnswer(q.key, v)}>
                    <SelectTrigger data-testid={`select-${q.key}`}>
                      <SelectValue placeholder={`Select ${q.label.toLowerCase()}`} />
                    </SelectTrigger>
                    <SelectContent>
                      {q.options?.map((opt: string) => (
                        <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {q.type === "multiselect" && (
                  <div className="flex flex-wrap gap-2">
                    {q.options?.map((opt: string) => {
                      const selected = Array.isArray(answers[q.key]) && answers[q.key].includes(opt);
                      return (
                        <Badge
                          key={opt}
                          variant={selected ? "default" : "outline"}
                          className="cursor-pointer text-xs"
                          onClick={() => toggleMultiSelect(q.key, opt)}
                          data-testid={`badge-${q.key}-${opt.replace(/\s+/g, "-").toLowerCase()}`}
                        >
                          {opt}
                        </Badge>
                      );
                    })}
                  </div>
                )}
                {q.type === "checkbox" && (
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={!!answers[q.key]}
                      onCheckedChange={(c) => updateAnswer(q.key, !!c)}
                      data-testid={`checkbox-${q.key}`}
                    />
                    <span className="text-sm text-muted-foreground">Yes</span>
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Review Your Answers</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {Object.entries(answers).filter(([_, v]) => v && (typeof v !== "object" || (Array.isArray(v) && v.length > 0))).map(([key, val]) => {
                const q = questionnaire.find((q: any) => q.key === key);
                return (
                  <div key={key} className="flex justify-between text-xs gap-2">
                    <span className="text-muted-foreground">{q?.label || key}</span>
                    <span className="text-right font-medium">{Array.isArray(val) ? val.join(", ") : val === true ? "Yes" : String(val)}</span>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {compliance && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Shield className="w-4 h-4" />
                  Compliance Mapping
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                {compliance.isoStandards?.length > 0 && (
                  <div>
                    <span className="font-medium">ISO Standards:</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {compliance.isoStandards.map((s: string) => (
                        <Badge key={s} variant="outline" className="text-[10px]">{s}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                {compliance.legalDrivers?.length > 0 && (
                  <div>
                    <span className="font-medium">Legal Drivers:</span>
                    <ul className="mt-1 space-y-0.5 text-muted-foreground">
                      {compliance.legalDrivers.map((l: string) => (
                        <li key={l}>• {l}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {compliance.customerQuestionnaireUses?.length > 0 && (
                  <div>
                    <span className="font-medium">Common Customer Questionnaire Uses:</span>
                    <ul className="mt-1 space-y-0.5 text-muted-foreground">
                      {compliance.customerQuestionnaireUses.map((u: string) => (
                        <li key={u}>• {u}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <Card className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20">
            <CardContent className="p-4 flex gap-3">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-800 dark:text-amber-200 space-y-1">
                <p className="font-medium">Important Notice</p>
                <p>This policy is a starting point. It does not guarantee certification to any ISO standard or full legal compliance. A functioning management system also requires implementation, records, training, internal audits, and management review.</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          onClick={() => step > 0 ? setStep(step - 1) : onBack()}
          data-testid="button-wizard-back"
        >
          <ChevronLeft className="w-4 h-4 mr-1" />
          {step === 0 ? "Cancel" : "Back"}
        </Button>

        {step < 3 ? (
          <Button
            onClick={() => {
              const requiredMissing = currentStep.questions
                .filter((q: any) => q.required)
                .filter((q: any) => !answers[q.key] || (typeof answers[q.key] === "string" && !answers[q.key].trim()));
              if (requiredMissing.length > 0) {
                toast({ title: "Required fields missing", description: `Please complete: ${requiredMissing.map((q: any) => q.label).join(", ")}`, variant: "destructive" });
                return;
              }
              setStep(step + 1);
            }}
            data-testid="button-wizard-next"
          >
            Next
            <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        ) : (
          <Button
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending || !can("policy_editing")}
            data-testid="button-generate-policy"
          >
            {generateMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-1.5" />
                Generate Policy
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}

function PolicyViewer({ id, onBack }: { id: string; onBack: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const isApprover = can("report_generation");
  const [editContent, setEditContent] = useState<Record<string, string> | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [reviewComment, setReviewComment] = useState("");

  const { data: policy, isLoading } = useQuery<any>({
    queryKey: ["/api/generated-policies", id],
  });

  const { data: template } = useQuery<any>({
    queryKey: ["/api/policy-templates", policy?.templateSlug],
    enabled: !!policy?.templateSlug,
  });

  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("PUT", `/api/generated-policies/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/generated-policies", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/generated-policies"] });
      setIsDirty(false);
      toast({ title: "Policy updated" });
    },
    onError: () => toast({ title: "Update failed", variant: "destructive" }),
  });

  const submitMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/workflow/submit", {
        entityType: "generated_policy",
        entityIds: [id],
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/generated-policies", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/generated-policies"] });
      toast({ title: "Policy submitted for review" });
    },
    onError: () => toast({ title: "Submit failed", variant: "destructive" }),
  });

  const workflowReviewMutation = useMutation({
    mutationFn: (data: { action: string; comment: string }) =>
      apiRequest("POST", "/api/workflow/review", {
        entityType: "generated_policy",
        entityId: id,
        action: data.action,
        comment: data.comment,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/generated-policies", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/generated-policies"] });
      setReviewComment("");
      toast({ title: "Review submitted" });
    },
    onError: () => toast({ title: "Review failed", variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!policy) return null;

  const content = (editContent || policy.content || {}) as Record<string, string>;
  const sections = (template?.sections || []) as any[];
  const compliance = template?.complianceMapping as any;

  const handleContentChange = (key: string, value: string) => {
    setEditContent(prev => ({ ...(prev || content), [key]: value }));
    setIsDirty(true);
  };

  const handleSave = () => {
    updateMutation.mutate({ content: editContent || content });
  };

  const handleApprove = () => {
    updateMutation.mutate({
      status: "approved",
      approvedAt: new Date().toISOString(),
      versionNumber: (policy.versionNumber || 1) + 1,
    });
  };

  const handlePublish = () => {
    updateMutation.mutate({ status: "published" });
  };

  const buildDocContent = () => {
    const text = Object.entries(content).map(([key, val]) => {
      const section = sections.find((s: any) => s.key === key);
      return `## ${section?.label || key}\n\n${val}\n`;
    }).join("\n---\n\n");
    const header = `# ${policy.title}\n\nPolicy Owner: ${policy.policyOwner || "—"}\nApprover: ${policy.approver || "—"}\nVersion: ${policy.versionNumber || 1}\nStatus: ${policy.status}\nReview Date: ${policy.reviewDate ? new Date(policy.reviewDate).toLocaleDateString() : "Not set"}\n\n---\n\n`;
    const guardrail = "\n\n---\n\nDISCLAIMER: This policy does not guarantee certification to any ISO standard or full legal compliance. Implementation, records, training, internal audits, and management review are also required.\n";
    return header + text + guardrail;
  };

  const buildHtmlDoc = () => {
    const clauses = Object.entries(content).map(([key, val]) => {
      const section = sections.find((s: any) => s.key === key);
      return `<h2 style="color:#1a5c3a;border-bottom:1px solid #ccc;padding-bottom:4px;margin-top:24px;">${section?.label || key}</h2>\n<p style="white-space:pre-wrap;">${(val as string).replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`;
    }).join("\n");
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${policy.title}</title><style>body{font-family:'Segoe UI',Arial,sans-serif;max-width:800px;margin:40px auto;padding:20px;color:#222;line-height:1.6}h1{color:#1a5c3a}table{border-collapse:collapse;margin:16px 0}td{padding:4px 12px;border:1px solid #ddd;font-size:14px}.disclaimer{margin-top:32px;padding:16px;background:#fff3cd;border:1px solid #ffc107;border-radius:6px;font-size:13px}</style></head><body><h1>${policy.title}</h1><table><tr><td><strong>Policy Owner</strong></td><td>${policy.policyOwner || "—"}</td></tr><tr><td><strong>Approver</strong></td><td>${policy.approver || "—"}</td></tr><tr><td><strong>Version</strong></td><td>${policy.versionNumber || 1}</td></tr><tr><td><strong>Status</strong></td><td>${policy.status}</td></tr><tr><td><strong>Review Date</strong></td><td>${policy.reviewDate ? new Date(policy.reviewDate).toLocaleDateString() : "Not set"}</td></tr></table>${clauses}<div class="disclaimer"><strong>Disclaimer:</strong> This policy does not guarantee certification to any ISO standard or full legal compliance. Implementation, records, training, internal audits, and management review are also required.</div></body></html>`;
  };

  const handleExport = (format: "txt" | "docx" | "pdf") => {
    if (format === "txt") {
      const blob = new Blob([buildDocContent()], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${policy.templateSlug || "policy"}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    } else if (format === "docx") {
      const html = buildHtmlDoc();
      const blob = new Blob(['\ufeff', html], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${policy.templateSlug || "policy"}.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } else if (format === "pdf") {
      const html = buildHtmlDoc();
      const printWindow = window.open("", "_blank");
      if (printWindow) {
        printWindow.document.write(html);
        printWindow.document.close();
        setTimeout(() => { printWindow.print(); }, 500);
      }
    }
    toast({ title: `Policy exported as ${format.toUpperCase()}` });
  };

  const isApprovedWorkflow = policy.workflowStatus === "approved";

  const statusColor = policy.status === "published" ? "bg-green-100 text-green-700"
    : policy.status === "approved" ? "bg-blue-100 text-blue-700"
    : "bg-amber-100 text-amber-700";

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="sm" onClick={onBack} data-testid="button-back-from-viewer">
          <ChevronLeft className="w-4 h-4 mr-1" />
          Back
        </Button>
        <div className="flex-1">
          <h1 className="text-lg font-semibold">{policy.title}</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            v{policy.versionNumber} · {policy.policyOwner || "No owner"} · {policy.tone === "audit_ready" ? "Audit-ready" : "Simple SME"}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <WorkflowBadge status={policy.workflowStatus} />
          {policy.workflowStatus !== "approved" && policy.status !== "approved" && policy.status !== "published" && (
            <AiDraftBadge />
          )}
          <Badge className={`text-xs ${statusColor}`} data-testid="badge-policy-status">
            {policy.status === "published" && <CheckCircle className="w-3 h-3 mr-1" />}
            {policy.status === "approved" && <CheckCircle className="w-3 h-3 mr-1" />}
            {policy.status === "draft" && <Clock className="w-3 h-3 mr-1" />}
            {policy.status}
          </Badge>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" data-testid="button-export-generated">
              <Download className="w-3.5 h-3.5 mr-1.5" />
              Export
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => handleExport("txt")} data-testid="export-txt">
              <FileText className="w-3.5 h-3.5 mr-2" /> Plain Text (.txt)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleExport("docx")} data-testid="export-docx">
              <FileText className="w-3.5 h-3.5 mr-2" /> Word Document (.docx)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleExport("pdf")} data-testid="export-pdf">
              <Download className="w-3.5 h-3.5 mr-2" /> Print / Save as PDF
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {can("policy_editing") && isDirty && (
          <Button size="sm" onClick={handleSave} disabled={updateMutation.isPending} data-testid="button-save-generated">
            <Edit3 className="w-3.5 h-3.5 mr-1.5" />
            Save Changes
          </Button>
        )}
        {policy.workflowStatus === "draft" && (
          <Button
            size="sm"
            onClick={() => submitMutation.mutate()}
            disabled={submitMutation.isPending}
            data-testid="button-submit-policy-review"
          >
            <Send className="w-3.5 h-3.5 mr-1.5" />
            {submitMutation.isPending ? "Submitting..." : "Submit for Review"}
          </Button>
        )}
        {isApprover && policy.workflowStatus === "submitted" && (
          <>
            <Button
              size="sm"
              onClick={() => workflowReviewMutation.mutate({ action: "approve", comment: reviewComment })}
              disabled={workflowReviewMutation.isPending}
              data-testid="button-workflow-approve-policy"
            >
              <CheckCircle className="w-3.5 h-3.5 mr-1.5" />
              Approve
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => workflowReviewMutation.mutate({ action: "reject", comment: reviewComment })}
              disabled={workflowReviewMutation.isPending}
              data-testid="button-workflow-reject-policy"
            >
              <XCircle className="w-3.5 h-3.5 mr-1.5" />
              Reject
            </Button>
            <Input
              placeholder="Review comment (optional)"
              value={reviewComment}
              onChange={(e) => setReviewComment(e.target.value)}
              className="min-w-[150px] max-w-[250px]"
              data-testid="input-policy-review-comment"
            />
          </>
        )}
        {can("policy_editing") && policy.status === "draft" && (
          <Button size="sm" onClick={handleApprove} disabled={updateMutation.isPending} data-testid="button-approve-policy">
            <CheckCircle className="w-3.5 h-3.5 mr-1.5" />
            Approve
          </Button>
        )}
        {can("policy_editing") && policy.status === "approved" && (
          <Button size="sm" onClick={handlePublish} disabled={updateMutation.isPending} data-testid="button-publish-generated">
            <CheckCircle className="w-3.5 h-3.5 mr-1.5" />
            Publish
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
        <div className="space-y-4">
          {(sections.length > 0 ? sections : Object.keys(content).map(k => ({ key: k, label: k }))).map((section: any) => (
            <Card key={section.key} data-testid={`section-${section.key}`}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{section.label}</CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={content[section.key] || ""}
                  onChange={(e) => handleContentChange(section.key, e.target.value)}
                  className="min-h-32 text-sm resize-none whitespace-pre-wrap"
                  disabled={!can("policy_editing") || isApprovedWorkflow}
                  data-testid={`textarea-${section.key}`}
                />
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs">Policy Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Owner</span>
                <span className="font-medium">{policy.policyOwner || "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Approver</span>
                <span className="font-medium">{policy.approver || "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Version</span>
                <span className="font-medium">{policy.versionNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Created</span>
                <span className="font-medium">{policy.createdAt ? format(new Date(policy.createdAt), "dd MMM yyyy") : "—"}</span>
              </div>
              {policy.approvedAt && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Approved</span>
                  <span className="font-medium">{format(new Date(policy.approvedAt), "dd MMM yyyy")}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {compliance && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs flex items-center gap-1">
                  <Shield className="w-3 h-3" />
                  Compliance
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                {compliance.isoStandards?.map((s: string) => (
                  <Badge key={s} variant="outline" className="text-[10px] mr-1">{s}</Badge>
                ))}
                <div className="mt-2 space-y-0.5 text-muted-foreground">
                  {compliance.legalDrivers?.slice(0, 3).map((l: string) => (
                    <p key={l}>• {l}</p>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20">
            <CardContent className="p-3">
              <div className="flex gap-2 text-xs text-amber-800 dark:text-amber-200">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <p>This policy does not guarantee ISO certification or legal compliance. Implementation, records, training, audits and management review are also required.</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
