import { useState } from "react";
import { useBillingStatus, UpgradeButton } from "@/components/upgrade-prompt";
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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
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
import { GeneratedDocumentContent } from "@/components/generated-document-content";
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, HeadingLevel, WidthType } from "docx";
import {
  buildGeneratedDocumentHtmlPage,
  parseGeneratedInlineMarkdown,
  parseGeneratedMarkdownBlocks,
  renderGeneratedMarkdownToHtml,
  stripMarkdownToText,
  type GeneratedInlineRun,
} from "@shared/generated-document-markdown";

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

function sanitizeDocxText(value: unknown): string {
  if (value == null) return "";
  const normalized = String(value).replace(/\r\n?/g, "\n");
  let sanitized = "";

  for (let index = 0; index < normalized.length; index++) {
    const codeUnit = normalized.charCodeAt(index);

    if (codeUnit >= 0xD800 && codeUnit <= 0xDBFF) {
      const nextCodeUnit = normalized.charCodeAt(index + 1);
      if (nextCodeUnit >= 0xDC00 && nextCodeUnit <= 0xDFFF) {
        sanitized += normalized[index] + normalized[index + 1];
        index += 1;
      }
      continue;
    }

    if (codeUnit >= 0xDC00 && codeUnit <= 0xDFFF) continue;

    const isValidXmlChar =
      codeUnit === 0x09 ||
      codeUnit === 0x0A ||
      codeUnit === 0x0D ||
      (codeUnit >= 0x20 && codeUnit <= 0xD7FF) ||
      (codeUnit >= 0xE000 && codeUnit <= 0xFFFD);

    if (isValidXmlChar) sanitized += normalized[index];
  }

  return sanitized;
}

function docxRunsFromMarkdownRuns(runs: GeneratedInlineRun[], size = 22): TextRun[] {
  if (!runs.length) return [new TextRun({ text: "", size })];
  return runs.map((run) => new TextRun({
    text: sanitizeDocxText(run.text),
    size,
    bold: run.bold,
    italics: run.italic,
    font: run.code ? "Courier New" : undefined,
  }));
}

function paragraphFromMarkdownRuns(runs: GeneratedInlineRun[], options: { size?: number; bullet?: boolean } = {}) {
  return new Paragraph({
    children: docxRunsFromMarkdownRuns(runs, options.size ?? 22),
    bullet: options.bullet ? { level: 0 } : undefined,
    spacing: { after: 120 },
  });
}

function buildDocxTable(headers: string[], rows: string[][]) {
  const colPercent = Math.floor(100 / Math.max(headers.length, 1));
  return new Table({
    rows: [
      new TableRow({
        children: headers.map((header) => new TableCell({
          width: { size: colPercent, type: WidthType.PERCENTAGE },
          children: [
            new Paragraph({
              children: [new TextRun({ text: sanitizeDocxText(stripMarkdownToText(header)) || "-", bold: true, size: 20 })],
            }),
          ],
        })),
      }),
      ...rows.map((row) => new TableRow({
        children: row.map((cell) => new TableCell({
          width: { size: colPercent, type: WidthType.PERCENTAGE },
          children: [
            new Paragraph({
              children: [new TextRun({ text: sanitizeDocxText(stripMarkdownToText(cell)) || "-", size: 20 })],
            }),
          ],
        })),
      })),
    ],
    width: { size: 100, type: WidthType.PERCENTAGE },
  });
}

function renderMarkdownToDocx(markdown: string): Array<Paragraph | Table> {
  const blocks = parseGeneratedMarkdownBlocks(markdown);
  const children: Array<Paragraph | Table> = [];

  for (const block of blocks) {
    if (block.type === "heading") {
      const heading = block.depth <= 1
        ? HeadingLevel.HEADING_1
        : block.depth === 2
          ? HeadingLevel.HEADING_2
          : HeadingLevel.HEADING_3;
      children.push(new Paragraph({
        children: docxRunsFromMarkdownRuns(block.runs, 22),
        heading,
        spacing: { before: 160, after: 100 },
      }));
      continue;
    }

    if (block.type === "paragraph") {
      children.push(paragraphFromMarkdownRuns(block.runs));
      continue;
    }

    if (block.type === "list") {
      for (const [index, item] of block.items.entries()) {
        if (block.ordered) {
          const runs = item.runs.length ? item.runs : [{ text: stripMarkdownToText(item.text) }];
          children.push(new Paragraph({
            children: docxRunsFromMarkdownRuns([{ text: `${index + 1}. ` }, ...runs], 22),
            spacing: { after: 120 },
          }));
        } else {
          children.push(paragraphFromMarkdownRuns(item.runs.length ? item.runs : [{ text: stripMarkdownToText(item.text) }], { bullet: true }));
        }
      }
      continue;
    }

    if (block.type === "table") {
      children.push(buildDocxTable(block.headers, block.rows));
      continue;
    }

    if (block.type === "thematicBreak") {
      children.push(new Paragraph({ text: "", spacing: { after: 120 } }));
    }
  }

  return children;
}

export type PolicyTemplateView =
  | { mode: "library" }
  | { mode: "questionnaire"; slug: string }
  | { mode: "view-policy"; id: string };

type PolicyTemplatesWorkspaceProps = {
  embedded?: boolean;
  selectedTemplateSlug?: string | null;
  selectedPolicyId?: string | null;
  onNavigate?: (view: PolicyTemplateView) => void;
};

export function PolicyTemplatesWorkspace({
  embedded = false,
  selectedTemplateSlug = null,
  selectedPolicyId = null,
  onNavigate,
}: PolicyTemplatesWorkspaceProps = {}) {
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const [localView, setLocalView] = useState<PolicyTemplateView>({ mode: "library" });
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const view: PolicyTemplateView = onNavigate
    ? selectedPolicyId
      ? { mode: "view-policy", id: selectedPolicyId }
      : selectedTemplateSlug
        ? { mode: "questionnaire", slug: selectedTemplateSlug }
        : { mode: "library" }
    : localView;
  const navigate = (nextView: PolicyTemplateView) => {
    if (onNavigate) onNavigate(nextView);
    else setLocalView(nextView);
  };

  const { data: templates = [], isLoading: templatesLoading } = useQuery<any[]>({
    queryKey: ["/api/policy-templates"],
  });

  const { data: generatedPolicies = [] } = useQuery<any[]>({
    queryKey: ["/api/generated-policies"],
  });

  const { data: authData } = useQuery<{ user: any; company: any }>({
    queryKey: ["/api/auth/me"],
  });

  const availableTemplates = templates.filter((template: any) => template.enabled !== false);
  const filteredTemplates = availableTemplates.filter((t: any) => {
    const matchesSearch = !searchTerm || t.name.toLowerCase().includes(searchTerm.toLowerCase()) || t.description?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = categoryFilter === "all" || t.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const categories = [...new Set(availableTemplates.map((t: any) => t.category))];

  if (view.mode === "questionnaire") {
    return (
      <QuestionnaireWizard
        slug={view.slug}
        authData={authData}
        embedded={embedded}
        onBack={() => navigate({ mode: "library" })}
        onComplete={(policy: any) => {
          queryClient.invalidateQueries({ queryKey: ["/api/generated-policies"] });
          navigate({ mode: "view-policy", id: policy.id });
        }}
      />
    );
  }

  if (view.mode === "view-policy") {
    return (
      <PolicyViewer
        id={view.id}
        embedded={embedded}
        onBack={() => navigate({ mode: "library" })}
      />
    );
  }

  return (
    <div className={embedded ? "space-y-5" : "p-6 space-y-6 max-w-6xl mx-auto"} data-testid="policy-template-library">
      {!embedded && <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Library className="w-5 h-5 text-primary" />
            Policy Templates
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {availableTemplates.length} structured policy and procedure templates with guided questionnaires and smart drafting
          </p>
        </div>
      </div>}

      <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row">
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
              <SelectTrigger className="w-full sm:w-[180px]" data-testid="select-category-filter">
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
          ) : filteredTemplates.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center">
                <Search className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
                <p className="text-sm font-medium">No templates match your search</p>
                <p className="mt-1 text-xs text-muted-foreground">Try another term or category.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredTemplates.map((t: any) => {
                const IconComp = CATEGORY_ICONS[t.category] || FileText;
                const colorClass = CATEGORY_COLORS[t.category] || "bg-muted text-muted-foreground";
                const compliance = t.complianceMapping as any;
                const existingPolicy = generatedPolicies.find((p: any) => p.templateSlug === t.slug);
                const canCreatePolicy = can("policy_editing");
                return (
                  <Card
                    key={t.slug}
                    className="transition-colors hover:border-primary/30"
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
                      {canCreatePolicy ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="mt-4 w-full justify-between"
                          onClick={() => navigate({ mode: "questionnaire", slug: t.slug })}
                          data-testid={`button-use-template-${t.slug}`}
                        >
                          <span className="flex items-center">
                            <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                            Use template
                          </span>
                          <ChevronRight className="h-3.5 w-3.5" />
                        </Button>
                      ) : (
                        <p className="mt-4 text-xs text-muted-foreground" data-testid={`template-read-only-${t.slug}`}>
                          Company admins can use this template.
                        </p>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
      </div>
    </div>
  );
}

export default function PolicyTemplatesPage() {
  return <PolicyTemplatesWorkspace />;
}

export function GeneratedPoliciesRegister({
  onOpen,
  onUseTemplate,
}: {
  onOpen: (id: string) => void;
  onUseTemplate: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const { data: generatedPolicies = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/generated-policies"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/generated-policies/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/generated-policies"] });
      toast({ title: "Draft deleted" });
    },
    onError: () => toast({ title: "Delete failed", variant: "destructive" }),
  });

  return (
    <section className="space-y-3" aria-labelledby="generated-policy-heading" data-testid="generated-policy-register">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="generated-policy-heading" className="text-base font-semibold">Template-created policies</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Follow each policy from first draft through review, adoption, publication and its next review date.
          </p>
        </div>
        {can("policy_editing") && (
          <Button size="sm" variant="outline" onClick={onUseTemplate} data-testid="button-create-from-template">
            <Sparkles className="mr-1.5 h-3.5 w-3.5" />
            Use a template
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(2)].map((_, index) => <Skeleton key={index} className="h-20" />)}
        </div>
      ) : generatedPolicies.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <FilePlus className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">No generated drafts</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {can("policy_editing") ? "Use a template when you need help creating a policy." : "No template-generated policies are available yet."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {generatedPolicies.map((policy: any) => {
            const statusColor = policy.status === "published"
              ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
              : policy.status === "approved"
                ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300";
            return (
              <Card key={policy.id} data-testid={`card-policy-${policy.id}`}>
                <CardContent className="p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <FileText className="hidden h-5 w-5 shrink-0 text-muted-foreground sm:block" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{policy.title}</p>
                      <p className="text-xs text-muted-foreground">
                        v{policy.versionNumber} · {policy.policyOwner || "No owner"} · Updated {policy.updatedAt ? format(new Date(policy.updatedAt), "dd MMM yyyy") : "—"}
                        {policy.reviewDate ? ` · Review ${format(new Date(policy.reviewDate), "dd MMM yyyy")}` : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <WorkflowBadge status={policy.workflowStatus} size="sm" />
                      {policy.workflowStatus !== "approved" && policy.status !== "approved" && policy.status !== "published" && <AiDraftBadge />}
                      <Badge className={`text-xs ${statusColor}`}>{policy.status}</Badge>
                      <Button size="sm" variant="outline" onClick={() => onOpen(policy.id)} data-testid={`button-view-policy-${policy.id}`}>
                        <Eye className="mr-1.5 h-3.5 w-3.5" />
                        View
                      </Button>
                      {can("policy_editing") && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => {
                            if (window.confirm(`Delete ${policy.title}? This cannot be undone.`)) {
                              deleteMutation.mutate(policy.id);
                            }
                          }}
                          disabled={deleteMutation.isPending}
                          aria-label={`Delete ${policy.title}`}
                          data-testid={`button-delete-policy-${policy.id}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </section>
  );
}

function QuestionnaireWizard({ slug, authData, onBack, onComplete, embedded = false }: {
  slug: string;
  authData: any;
  onBack: () => void;
  onComplete: (policy: any) => void;
  embedded?: boolean;
}) {
  const { toast } = useToast();
  const { can } = usePermissions();
  const { isPro } = useBillingStatus();
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
      <div className={embedded ? "mx-auto max-w-3xl space-y-4" : "p-6 max-w-3xl mx-auto space-y-4"}>
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!template || template.enabled === false) {
    return (
      <div className={embedded ? "mx-auto max-w-3xl space-y-4" : "p-6 max-w-3xl mx-auto space-y-4"}>
        <Button variant="ghost" size="sm" onClick={onBack} data-testid="button-back-to-library">
          <ChevronLeft className="mr-1 h-4 w-4" />
          Back to templates
        </Button>
        <Card>
          <CardContent className="py-10 text-center">
            <Library className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">Template not found</p>
            <p className="mt-1 text-xs text-muted-foreground">This template may no longer be available.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!can("policy_editing")) {
    return (
      <div className={embedded ? "mx-auto max-w-3xl space-y-4" : "p-6 max-w-3xl mx-auto space-y-4"}>
        <Button variant="ghost" size="sm" onClick={onBack} data-testid="button-back-to-library">
          <ChevronLeft className="mr-1 h-4 w-4" />
          Back to templates
        </Button>
        <Card>
          <CardContent className="py-10 text-center">
            <Shield className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">Company admin access required</p>
            <p className="mt-1 text-xs text-muted-foreground">Only company admins can create a policy from a template.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

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
    <div className={embedded ? "mx-auto max-w-3xl space-y-6" : "p-6 max-w-3xl mx-auto space-y-6"}>
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
        ) : isPro ? (
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
        ) : (
          <UpgradeButton
            feature="AI Policy Generation"
            valueMessage="Produce a tailored ESG policy document to adopt, share with your board, or publish to stakeholders."
            data-testid="button-generate-policy-upgrade"
          >
            Generate Policy
          </UpgradeButton>
        )}
      </div>
    </div>
  );
}

export function PolicyViewer({ id, onBack, embedded = false }: { id: string; onBack: () => void; embedded?: boolean }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const isApprover = can("report_generation");
  const [editContent, setEditContent] = useState<Record<string, string> | null>(null);
  const [editMetadata, setEditMetadata] = useState<{
    policyOwner?: string;
    approver?: string;
    reviewDate?: string;
  }>({});
  const [isDirty, setIsDirty] = useState(false);
  const [reviewComment, setReviewComment] = useState("");

  const { data: policy, isLoading } = useQuery<any>({
    queryKey: ["/api/generated-policies", id],
  });

  const { data: workflowSettings } = useQuery<any>({
    queryKey: ["/api/company/settings"],
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
      setEditMetadata({});
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

  const reviseMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/workflow/revise", {
      entityType: "generated_policy",
      entityId: id,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/generated-policies", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/generated-policies"] });
      toast({ title: "Policy reopened for revision" });
    },
    onError: () => toast({ title: "Unable to start revision", variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <div className={embedded ? "mx-auto max-w-4xl space-y-4" : "p-6 max-w-4xl mx-auto space-y-4"}>
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!policy) {
    return (
      <div className={embedded ? "mx-auto max-w-4xl space-y-4" : "p-6 max-w-4xl mx-auto space-y-4"}>
        <Button variant="ghost" size="sm" onClick={onBack} data-testid="button-back-from-viewer">
          <ChevronLeft className="mr-1 h-4 w-4" />
          Back
        </Button>
        <Card>
          <CardContent className="py-10 text-center">
            <FileText className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">Policy not found</p>
            <p className="mt-1 text-xs text-muted-foreground">It may have been deleted or you may no longer have access.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const content = (editContent || policy.content || {}) as Record<string, string>;
  const sections = (template?.sections || []) as any[];
  const compliance = template?.complianceMapping as any;

  const handleContentChange = (key: string, value: string) => {
    setEditContent(prev => ({ ...(prev || content), [key]: value }));
    setIsDirty(true);
  };

  const handleSave = () => {
    updateMutation.mutate({
      ...(editContent ? { content: editContent } : {}),
      ...editMetadata,
      ...(editMetadata.reviewDate !== undefined
        ? { reviewDate: editMetadata.reviewDate || null }
        : {}),
    });
  };

  const handleApprove = () => {
    updateMutation.mutate({ status: "approved" });
  };

  const handlePublish = () => {
    updateMutation.mutate({ status: "published" });
  };

  const buildDocContent = () => {
    const metadataRows = [
      ["Policy Owner", policy.policyOwner || "—"],
      ["Approver", policy.approver || "—"],
      ["Version", String(policy.versionNumber || 1)],
      ["Status", policy.status || "draft"],
      ["Review Date", policy.reviewDate ? new Date(policy.reviewDate).toLocaleDateString() : "Not set"],
    ];

    const metadataTable = [
      "| Field | Value |",
      "| --- | --- |",
      ...metadataRows.map(([label, value]) => `| ${label} | ${String(value).replace(/\|/g, "\\|")} |`),
    ].join("\n");

    const text = Object.entries(content).map(([key, val]) => {
      const section = sections.find((s: any) => s.key === key);
      return `## ${section?.label || key}\n\n${val}\n`;
    }).join("\n---\n\n");
    const header = `# ${policy.title}\n\n${metadataTable}\n\n---\n\n`;
    const guardrail = "\n\n---\n\n> **Disclaimer:** This policy does not guarantee certification to any ISO standard or full legal compliance. Implementation, records, training, internal audits, and management review are also required.\n";
    return header + text + guardrail;
  };

  const buildHtmlDoc = () => {
    return buildGeneratedDocumentHtmlPage({
      title: policy.title,
      bodyHtml: renderGeneratedMarkdownToHtml(buildDocContent()),
    });
  };

  const renderedPolicyMarkdown = buildDocContent();

  const handleExport = async (format: "txt" | "docx" | "pdf") => {
    if (format === "txt") {
      const blob = new Blob([buildDocContent()], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${policy.templateSlug || "policy"}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    } else if (format === "docx") {
      const doc = new Document({
        sections: [{
          children: renderMarkdownToDocx(buildDocContent()),
        }],
      });
      const blob = await Packer.toBlob(doc);
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

  const requiresApproval = workflowSettings?.requireApprovalPolicies !== false;
  const approvedEditingUnlocked = policy.workflowStatus === "approved"
    && workflowSettings?.autoLockApproved === false;
  const canEditContent = can("policy_editing")
    && (policy.workflowStatus === "draft" || approvedEditingUnlocked);
  const canSubmitForReview = requiresApproval
    && policy.workflowStatus === "draft"
    && policy.status === "draft";
  const displayedOwner = editMetadata.policyOwner ?? policy.policyOwner ?? "";
  const displayedApprover = editMetadata.approver ?? policy.approver ?? "";
  const displayedReviewDate = editMetadata.reviewDate
    ?? (policy.reviewDate ? format(new Date(policy.reviewDate), "yyyy-MM-dd") : "");

  const handleMetadataChange = (field: "policyOwner" | "approver" | "reviewDate", value: string) => {
    setEditMetadata((current) => ({ ...current, [field]: value }));
    setIsDirty(true);
  };

  const statusColor = policy.status === "published" ? "bg-green-100 text-green-700"
    : policy.status === "approved" ? "bg-blue-100 text-blue-700"
    : "bg-amber-100 text-amber-700";

  return (
    <div className={embedded ? "mx-auto max-w-4xl space-y-6" : "p-6 max-w-4xl mx-auto space-y-6"} data-testid="generated-policy-viewer">
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

      {policy.workflowStatus === "rejected" && policy.reviewComment && (
        <Card className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20" data-testid="policy-rejection-guidance">
          <CardContent className="p-3 text-sm text-amber-800 dark:text-amber-200">
            <span className="font-medium">Reviewer feedback:</span> {policy.reviewComment}
          </CardContent>
        </Card>
      )}

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
        {canEditContent && isDirty && (
          <Button size="sm" onClick={handleSave} disabled={updateMutation.isPending} data-testid="button-save-generated">
            <Edit3 className="w-3.5 h-3.5 mr-1.5" />
            Save Changes
          </Button>
        )}
        {can("policy_editing") && canSubmitForReview && (
          <Button
            size="sm"
            onClick={() => submitMutation.mutate()}
            disabled={submitMutation.isPending || isDirty}
            title={isDirty ? "Save your changes before submitting this policy" : undefined}
            data-testid="button-submit-policy-review"
          >
            <Send className="w-3.5 h-3.5 mr-1.5" />
            {submitMutation.isPending ? "Submitting..." : isDirty ? "Save before review" : "Submit for Review"}
          </Button>
        )}
        {can("policy_editing") && (policy.workflowStatus === "rejected" || policy.workflowStatus === "approved") && (
          <Button
            size="sm"
            onClick={() => reviseMutation.mutate()}
            disabled={reviseMutation.isPending}
            data-testid="button-revise-policy"
          >
            <Edit3 className="w-3.5 h-3.5 mr-1.5" />
            {reviseMutation.isPending
              ? "Starting revision..."
              : policy.workflowStatus === "approved"
                ? "Start new revision"
                : "Revise policy"}
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
              disabled={workflowReviewMutation.isPending || !reviewComment.trim()}
              title={!reviewComment.trim() ? "Add a reason before rejecting this policy" : undefined}
              data-testid="button-workflow-reject-policy"
            >
              <XCircle className="w-3.5 h-3.5 mr-1.5" />
              Reject
            </Button>
            <Input
              placeholder="Reason for rejection (required to reject)"
              aria-label="Review comment; required for rejection"
              value={reviewComment}
              onChange={(e) => setReviewComment(e.target.value)}
              className="min-w-[150px] max-w-[250px]"
              data-testid="input-policy-review-comment"
            />
          </>
        )}
        {can("policy_editing") && !requiresApproval && policy.status === "draft" && policy.workflowStatus === "draft" && (
          <Button size="sm" onClick={handleApprove} disabled={updateMutation.isPending} data-testid="button-approve-policy">
            <CheckCircle className="w-3.5 h-3.5 mr-1.5" />
            Approve
          </Button>
        )}
        {can("policy_editing") && policy.status === "approved" && (!requiresApproval || policy.workflowStatus === "approved") && (
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
                  disabled={!canEditContent}
                  data-testid={`textarea-${section.key}`}
                />
              </CardContent>
            </Card>
          ))}

          <Card data-testid="generated-policy-preview-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Rendered Preview</CardTitle>
              <CardDescription className="text-xs">
                Generated markdown is rendered here using the same safe document pipeline used for print and export.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <GeneratedDocumentContent markdown={renderedPolicyMarkdown} data-testid="generated-policy-preview" />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs">Policy Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              {canEditContent ? (
                <>
                  <div className="space-y-1">
                    <Label htmlFor="generated-policy-owner" className="text-xs text-muted-foreground">Owner</Label>
                    <Input
                      id="generated-policy-owner"
                      value={displayedOwner}
                      onChange={(event) => handleMetadataChange("policyOwner", event.target.value)}
                      className="h-8 text-xs"
                      data-testid="input-generated-policy-owner"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="generated-policy-approver" className="text-xs text-muted-foreground">Approver</Label>
                    <Input
                      id="generated-policy-approver"
                      value={displayedApprover}
                      onChange={(event) => handleMetadataChange("approver", event.target.value)}
                      className="h-8 text-xs"
                      data-testid="input-generated-policy-approver"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="generated-policy-review-date" className="text-xs text-muted-foreground">Next review</Label>
                    <Input
                      id="generated-policy-review-date"
                      type="date"
                      value={displayedReviewDate}
                      onChange={(event) => handleMetadataChange("reviewDate", event.target.value)}
                      className="h-8 text-xs"
                      data-testid="input-generated-policy-review-date"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground">Owner</span>
                    <span className="text-right font-medium">{policy.policyOwner || "—"}</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground">Approver</span>
                    <span className="text-right font-medium">{policy.approver || "—"}</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground">Next review</span>
                    <span className="text-right font-medium">{policy.reviewDate ? format(new Date(policy.reviewDate), "dd MMM yyyy") : "—"}</span>
                  </div>
                </>
              )}
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
