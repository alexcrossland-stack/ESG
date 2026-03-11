import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  Search, ChevronDown, ChevronRight, HelpCircle, BarChart3, FileText, Upload,
  Settings, Leaf, Users, Shield, Zap, MessageSquare, CheckCircle, ExternalLink
} from "lucide-react";
import { Link, useLocation } from "wouter";

interface HelpArticle {
  id: string;
  title: string;
  content: string;
  tags?: string[];
}

interface HelpGroup {
  id: string;
  icon: any;
  title: string;
  description: string;
  articles: HelpArticle[];
}

const HELP_GROUPS: HelpGroup[] = [
  {
    id: "getting-started",
    icon: Zap,
    title: "Getting Started",
    description: "Set up your ESG platform and complete your first steps",
    articles: [
      {
        id: "onboarding-overview",
        title: "How to complete the activation checklist",
        content: "The activation checklist on your dashboard shows 6 steps to get your ESG programme running. Each step becomes ticked once you complete the corresponding action. Steps are: 1. Complete your company profile (name, industry, country). 2. Choose ESG focus areas in the onboarding wizard. 3. Set a reporting frequency and activate metrics. 4. Enter your first data value. 5. Upload a piece of evidence. 6. Generate a report, policy, or questionnaire response. You can dismiss the checklist once all steps are done, or hide it early using the Dismiss button.",
        tags: ["onboarding", "checklist", "dashboard"],
      },
      {
        id: "company-profile",
        title: "Updating your company profile",
        content: "Go to Settings > Company Profile to update your company name, industry, country, employee count, and reporting year. This information is used to populate reports and benchmark your performance against similar businesses. Your industry selection also influences which ESG metrics are suggested as priorities.",
        tags: ["settings", "profile"],
      },
      {
        id: "first-data",
        title: "Entering your first ESG data",
        content: "Navigate to Data Entry in the sidebar. Choose a metric (such as Energy Use or Carbon Emissions), select a reporting period, and enter the measured value with its unit. You can also upload supporting evidence directly from the data entry form. For bulk uploads, use the CSV import feature available on the Data Entry page.",
        tags: ["data", "metrics", "entry"],
      },
    ],
  },
  {
    id: "metrics-data",
    icon: BarChart3,
    title: "Metrics & Data Entry",
    description: "Recording ESG values, CSV imports, and evidence linking",
    articles: [
      {
        id: "csv-import",
        title: "Importing data via CSV",
        content: "On the Data Entry page, click 'Import CSV'. Download the appropriate template (Energy, Carbon, Social, or Governance), fill in your data in the exact column format shown, then upload the file. The system validates each row and reports any errors before importing. Successful rows are imported immediately; failed rows are listed so you can correct and re-upload.",
        tags: ["csv", "import", "bulk"],
      },
      {
        id: "metric-management",
        title: "Managing your active metrics",
        content: "Go to Metrics in the sidebar to view all available metrics for your industry. Toggle metrics on or off using the Active switch. Only active metrics appear in data entry forms and reports. You can also set target values and assign ownership to specific team members from this page.",
        tags: ["metrics", "management"],
      },
      {
        id: "evidence-linking",
        title: "Uploading and linking evidence",
        content: "Evidence files (PDFs, images, spreadsheets) can be uploaded from the Evidence page or directly when entering data. Each piece of evidence can be tagged to one or more metrics, giving auditors a clear link between your reported values and the underlying documentation. Supported formats: PDF, DOCX, XLSX, PNG, JPG, up to 25 MB.",
        tags: ["evidence", "upload", "files"],
      },
      {
        id: "raw-data",
        title: "Using raw data inputs",
        content: "Some metrics accept structured raw data inputs rather than single figures. For example, energy invoices can be entered line-by-line with date, supplier, and kWh figures. The platform aggregates these into the metric total automatically. Raw data inputs also make it easier to trace reported figures back to source documents.",
        tags: ["raw data", "inputs"],
      },
    ],
  },
  {
    id: "reporting",
    icon: FileText,
    title: "Reports & Policy",
    description: "Generating reports, ESG policies, and questionnaire responses",
    articles: [
      {
        id: "generate-report",
        title: "Generating an ESG report",
        content: "Go to Reports and click 'New Report'. Choose a report type: ESG Summary (high-level performance overview), CSRD Readiness (compliance gap analysis), Carbon Footprint (Scope 1, 2, and 3 emissions), or Stakeholder Report (narrative with KPIs). Select the reporting period, add any commentary, then click Generate. Reports are produced as downloadable PDFs. Previously generated reports are listed on the Reports page for re-download.",
        tags: ["reports", "pdf", "export"],
      },
      {
        id: "policy-generator",
        title: "Using the AI Policy Generator",
        content: "The Policy Generator uses AI to create draft ESG policies tailored to your company profile. Go to Policy Generator, select a policy type (e.g., Environmental Policy, Modern Slavery Statement), review the suggested content, and edit as needed. You can regenerate any section or the entire policy. When satisfied, save the policy to your Policy Library. Always have policies reviewed by a qualified person before publishing externally.",
        tags: ["policy", "ai", "generator"],
      },
      {
        id: "questionnaire",
        title: "Completing a stakeholder questionnaire",
        content: "Questionnaires in ESG Manager represent requests from customers, investors, or frameworks (e.g., CDP, EcoVadis). Go to Questionnaires, open a questionnaire, and fill in answers per section. Use the AI Autofill feature to pre-populate answers using your existing data and Answer Library. Review all AI-filled answers before submitting. Submitted questionnaires are locked and archived for audit purposes.",
        tags: ["questionnaire", "autofill", "ai"],
      },
    ],
  },
  {
    id: "compliance",
    icon: Shield,
    title: "Compliance & Topics",
    description: "ESG topics, material issues, and regulatory frameworks",
    articles: [
      {
        id: "material-topics",
        title: "Setting your material ESG topics",
        content: "Material topics are the ESG issues most relevant to your business. Go to ESG Topics and toggle which topics apply to your operations. Environmental topics include energy, emissions, water, and waste. Social topics include employee wellbeing, diversity, training, and health and safety. Governance topics include anti-bribery, data privacy, and board oversight. Your topic selection influences which metrics are prioritised and which report sections are populated.",
        tags: ["topics", "material", "materiality"],
      },
      {
        id: "compliance-tracker",
        title: "Using the compliance tracker",
        content: "The Compliance Tracker shows your obligations under selected ESG frameworks (e.g., CSRD, GRI, UN SDGs). Each obligation is linked to relevant metrics so you can see at a glance which data you still need to collect. Mark obligations as 'In Progress', 'Complete', or 'Not Applicable'. The tracker also flags upcoming reporting deadlines.",
        tags: ["compliance", "frameworks", "CSRD", "GRI"],
      },
    ],
  },
  {
    id: "team",
    icon: Users,
    title: "Team & Access",
    description: "Inviting users, roles, and permissions",
    articles: [
      {
        id: "invite-users",
        title: "Inviting team members",
        content: "Go to Settings > Team to invite colleagues. Enter their email address and assign a role: Admin (full access), Editor (can enter data and manage content), Contributor (data entry only), or Viewer (read-only). Invited users receive an email with a link to create their account and join your company workspace.",
        tags: ["team", "invite", "users", "roles"],
      },
      {
        id: "roles-permissions",
        title: "Understanding roles and permissions",
        content: "Admin: Full access to all features including settings, billing, and user management. Editor: Can manage metrics, enter data, generate reports, and manage policies. Cannot access billing or team management. Contributor: Can enter data values and upload evidence. Cannot generate reports or manage settings. Viewer: Read-only access to dashboards, reports, and metrics. Cannot edit anything.",
        tags: ["roles", "permissions", "access"],
      },
    ],
  },
  {
    id: "account",
    icon: Settings,
    title: "Account & Settings",
    description: "Profile, notifications, data export, and privacy",
    articles: [
      {
        id: "data-export",
        title: "Exporting your data",
        content: "You can export all your ESG data at any time from Settings > Privacy & Data Rights. Click 'Request Data Export' to generate a downloadable archive of all your metrics, reports, and profile data. The export is prepared within 24 hours and you receive an email when it is ready. Data is exported as CSV and JSON files in a ZIP archive.",
        tags: ["export", "data", "GDPR"],
      },
      {
        id: "notifications",
        title: "Managing notifications",
        content: "Go to Settings > Notifications to control which emails you receive. You can enable or disable notifications for: data submission reminders, report generation alerts, team activity updates, and compliance deadline warnings. In-app notifications appear in the bell icon at the top right.",
        tags: ["notifications", "email", "alerts"],
      },
      {
        id: "privacy-rights",
        title: "Exercising your data rights",
        content: "As a registered user, you have rights under UK GDPR including the right to access your data, correct inaccuracies, request deletion, and data portability. Go to Settings > Privacy & Data Rights to submit a formal request. Your request is logged and processed within 30 days. For account deletion, note that some audit logs may be retained for legal compliance purposes.",
        tags: ["privacy", "GDPR", "data rights", "deletion"],
      },
    ],
  },
];

const supportSchema = z.object({
  category: z.string().min(1, "Please select a category"),
  subject: z.string().min(5, "Subject must be at least 5 characters").max(200, "Subject too long"),
  message: z.string().min(20, "Please describe your issue in at least 20 characters").max(5000, "Message too long"),
});

function ArticleItem({ article }: { article: HelpArticle }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border rounded-lg overflow-hidden" id={article.id} data-testid={`help-article-${article.id}`}>
      <button
        className="flex items-center justify-between w-full px-4 py-3 text-left hover:bg-muted/40 transition-colors"
        onClick={() => setOpen(!open)}
        data-testid={`help-article-toggle-${article.id}`}
      >
        <span className="text-sm font-medium">{article.title}</span>
        {open ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
      </button>
      {open && (
        <div className="px-4 pb-4 text-sm text-muted-foreground leading-relaxed border-t bg-muted/20">
          <p className="pt-3">{article.content}</p>
          {article.tags && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {article.tags.map(tag => (
                <Badge key={tag} variant="secondary" className="text-xs font-normal">{tag}</Badge>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SupportForm({ user, company }: { user: any; company: any }) {
  const { toast } = useToast();
  const [location] = useLocation();
  const [refNumber, setRefNumber] = useState<string | null>(null);

  const form = useForm<z.infer<typeof supportSchema>>({
    resolver: zodResolver(supportSchema),
    defaultValues: { category: "", subject: "", message: "" },
  });

  const mutation = useMutation({
    mutationFn: async (data: z.infer<typeof supportSchema>) => {
      const res = await apiRequest("POST", "/api/support-requests", {
        ...data,
        pageContext: location,
        userName: user?.username,
        userEmail: user?.email,
        companyName: company?.name,
      });
      return res.json();
    },
    onSuccess: (data) => {
      setRefNumber(data.refNumber);
      form.reset();
    },
    onError: (e: any) => {
      toast({ title: "Failed to send", description: e.message || "Something went wrong", variant: "destructive" });
    },
  });

  if (refNumber) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center" data-testid="support-success">
        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
          <CheckCircle className="w-6 h-6 text-primary" />
        </div>
        <div>
          <p className="font-semibold">Support request sent</p>
          <p className="text-sm text-muted-foreground mt-1">
            Your reference number is{" "}
            <span className="font-mono font-semibold text-foreground" data-testid="support-ref-number">{refNumber}</span>
          </p>
          <p className="text-xs text-muted-foreground mt-2">We typically respond within 1-2 business days.</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setRefNumber(null)} data-testid="button-new-request">
          Send another request
        </Button>
      </div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(d => mutation.mutate(d))} className="space-y-4" data-testid="support-form">
        <FormField control={form.control} name="category" render={({ field }) => (
          <FormItem>
            <FormLabel>Category</FormLabel>
            <Select onValueChange={field.onChange} value={field.value}>
              <FormControl>
                <SelectTrigger data-testid="select-support-category">
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem value="general">General question</SelectItem>
                <SelectItem value="technical">Technical issue</SelectItem>
                <SelectItem value="billing">Billing</SelectItem>
                <SelectItem value="data">Data or reporting query</SelectItem>
                <SelectItem value="privacy">Privacy or data rights</SelectItem>
                <SelectItem value="feedback">Feedback or feature request</SelectItem>
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )} />

        <FormField control={form.control} name="subject" render={({ field }) => (
          <FormItem>
            <FormLabel>Subject</FormLabel>
            <FormControl>
              <Input placeholder="Brief summary of your question" {...field} data-testid="input-support-subject" />
            </FormControl>
            <FormMessage />
          </FormItem>
        )} />

        <FormField control={form.control} name="message" render={({ field }) => (
          <FormItem>
            <FormLabel>Message</FormLabel>
            <FormControl>
              <Textarea
                placeholder="Please describe your question or issue in as much detail as possible..."
                className="min-h-[120px] resize-y"
                {...field}
                data-testid="textarea-support-message"
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )} />

        <div className="text-xs text-muted-foreground space-y-1">
          <p>Submitting as: <span className="font-medium">{user?.email}</span> ({company?.name})</p>
          <p>Current page: <span className="font-mono">{location}</span></p>
        </div>

        <Button type="submit" disabled={mutation.isPending} className="w-full" data-testid="button-submit-support">
          {mutation.isPending ? "Sending..." : "Send Support Request"}
        </Button>
      </form>
    </Form>
  );
}

export default function HelpPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"articles" | "contact">("articles");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(["getting-started"]));

  const { data: authData } = useQuery<{ user: any; company: any }>({ queryKey: ["/api/auth/me"] });
  const user = authData?.user;
  const company = authData?.company;

  const toggleGroup = (id: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const lowerSearch = searchQuery.toLowerCase().trim();
  const filteredGroups = HELP_GROUPS.map(group => ({
    ...group,
    articles: lowerSearch
      ? group.articles.filter(a =>
          a.title.toLowerCase().includes(lowerSearch) ||
          a.content.toLowerCase().includes(lowerSearch) ||
          a.tags?.some(t => t.toLowerCase().includes(lowerSearch))
        )
      : group.articles,
  })).filter(g => g.articles.length > 0);

  const totalArticles = HELP_GROUPS.reduce((acc, g) => acc + g.articles.length, 0);

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">Help &amp; Support</h1>
        <p className="text-muted-foreground text-sm">{totalArticles} articles covering every feature of ESG Manager</p>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search help articles..."
            className="pl-9"
            value={searchQuery}
            onChange={e => {
              setSearchQuery(e.target.value);
              if (e.target.value) setExpandedGroups(new Set(HELP_GROUPS.map(g => g.id)));
            }}
            data-testid="input-help-search"
          />
        </div>
        <Button
          variant={activeTab === "contact" ? "default" : "outline"}
          onClick={() => setActiveTab(activeTab === "contact" ? "articles" : "contact")}
          data-testid="button-contact-support"
          className="shrink-0"
        >
          <MessageSquare className="w-4 h-4 mr-1.5" />
          Contact Support
        </Button>
      </div>

      {activeTab === "contact" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Contact Support</CardTitle>
            <CardDescription>Our team typically responds within 1-2 business days. For urgent issues, email <a href="mailto:support@esgmanager.com" className="underline">support@esgmanager.com</a> directly.</CardDescription>
          </CardHeader>
          <CardContent>
            <SupportForm user={user} company={company} />
          </CardContent>
        </Card>
      )}

      {searchQuery && filteredGroups.length === 0 && (
        <div className="text-center py-10 space-y-2">
          <HelpCircle className="w-8 h-8 text-muted-foreground mx-auto" />
          <p className="text-sm text-muted-foreground">No articles found for "{searchQuery}"</p>
          <Button size="sm" variant="outline" onClick={() => setActiveTab("contact")} data-testid="button-contact-no-results">
            Contact Support
          </Button>
        </div>
      )}

      <div className="space-y-3">
        {filteredGroups.map(group => {
          const Icon = group.icon;
          const isOpen = expandedGroups.has(group.id);
          return (
            <Card key={group.id} data-testid={`help-group-${group.id}`}>
              <button
                className="flex items-center gap-3 w-full p-4 text-left hover:bg-muted/30 transition-colors rounded-lg"
                onClick={() => toggleGroup(group.id)}
                data-testid={`help-group-toggle-${group.id}`}
              >
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Icon className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{group.title}</p>
                  <p className="text-xs text-muted-foreground truncate">{group.description}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-muted-foreground">{group.articles.length}</span>
                  {isOpen ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                </div>
              </button>
              {isOpen && (
                <CardContent className="pt-0 pb-3 px-3 space-y-1.5">
                  <Separator className="mb-2" />
                  {group.articles.map(article => (
                    <ArticleItem key={article.id} article={article} />
                  ))}
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>

      <Card className="bg-muted/40 border-dashed">
        <CardContent className="flex items-center gap-4 py-4">
          <MessageSquare className="w-5 h-5 text-muted-foreground shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">Still need help?</p>
            <p className="text-xs text-muted-foreground">Our support team is here for you at <a href="mailto:support@esgmanager.com" className="underline">support@esgmanager.com</a></p>
          </div>
          <Button size="sm" variant="outline" onClick={() => setActiveTab("contact")} data-testid="button-contact-bottom">
            Get in touch
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
