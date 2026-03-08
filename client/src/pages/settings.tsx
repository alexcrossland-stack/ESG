import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Form, FormControl, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Settings as SettingsIcon, Building2, Clock, Save, Library, FileText, ChevronRight, BarChart3, Target, AlertTriangle } from "lucide-react";
import { format } from "date-fns";

const INDUSTRIES = [
  "Construction", "Education", "Energy & Utilities", "Financial Services",
  "Food & Beverage", "Healthcare", "Hospitality & Tourism", "IT & Technology",
  "Legal & Professional Services", "Manufacturing", "Media & Communications",
  "Retail", "Transport & Logistics", "Other",
];

const REVENUE_BANDS = [
  "Under £1m", "£1m – £5m", "£5m – £25m", "£25m – £100m", "Over £100m",
];

const COUNTRIES = [
  "United Kingdom", "Ireland", "United States", "Canada", "Australia",
  "New Zealand", "Germany", "France", "Netherlands", "Other",
];

export default function Settings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [formInitialized, setFormInitialized] = useState(false);

  const { data: authData, isLoading: authLoading } = useQuery<any>({ queryKey: ["/api/auth/me"] });
  const { data: company, isLoading: companyLoading } = useQuery<any>({ queryKey: ["/api/company"] });
  const { data: auditLogs = [], isLoading: logsLoading } = useQuery<any[]>({ queryKey: ["/api/audit-logs"] });

  const companyForm = useForm({
    defaultValues: {
      name: "",
      industry: "",
      country: "",
      employeeCount: "",
      revenueBand: "",
      locations: "1",
    },
  });

  if (company && !formInitialized) {
    companyForm.reset({
      name: company.name || "",
      industry: company.industry || "",
      country: company.country || "",
      employeeCount: String(company.employeeCount || ""),
      revenueBand: company.revenueBand || "",
      locations: String(company.locations || "1"),
    });
    setFormInitialized(true);
  }

  const updateCompanyMutation = useMutation({
    mutationFn: (data: any) => apiRequest("PUT", "/api/company", {
      ...data,
      employeeCount: parseInt(data.employeeCount) || null,
      locations: parseInt(data.locations) || 1,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/company"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({ title: "Company details updated" });
    },
    onError: () => toast({ title: "Update failed", variant: "destructive" }),
  });

  if (authLoading || companyLoading) {
    return <div className="p-6 space-y-4">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-40" />)}</div>;
  }

  const user = authData?.user;

  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <SettingsIcon className="w-5 h-5 text-primary" />
          Settings
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Manage your company profile and account preferences
        </p>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <Building2 className="w-4 h-4 text-primary" />
            Company Details
          </CardTitle>
          <CardDescription className="text-xs">
            This information is used in your ESG reports
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...companyForm}>
            <form onSubmit={companyForm.handleSubmit(d => updateCompanyMutation.mutate(d))} className="space-y-4">
              <FormField control={companyForm.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">Company Name</FormLabel>
                  <FormControl><Input {...field} data-testid="input-company-name" /></FormControl>
                </FormItem>
              )} />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField control={companyForm.control} name="industry" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Industry</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-industry"><SelectValue placeholder="Select industry" /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {INDUSTRIES.map(i => <SelectItem key={i} value={i}>{i}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )} />
                <FormField control={companyForm.control} name="country" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Country</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-country"><SelectValue placeholder="Select country" /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {COUNTRIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )} />
                <FormField control={companyForm.control} name="employeeCount" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Number of Employees</FormLabel>
                    <FormControl><Input type="number" placeholder="e.g. 50" {...field} data-testid="input-employee-count" /></FormControl>
                  </FormItem>
                )} />
                <FormField control={companyForm.control} name="revenueBand" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Revenue Band</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-revenue"><SelectValue placeholder="Select range" /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {REVENUE_BANDS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )} />
                <FormField control={companyForm.control} name="locations" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Number of Locations</FormLabel>
                    <FormControl><Input type="number" min="1" placeholder="1" {...field} data-testid="input-locations" /></FormControl>
                  </FormItem>
                )} />
              </div>
              <div className="flex justify-end pt-2">
                <Button type="submit" size="sm" disabled={updateCompanyMutation.isPending} data-testid="button-save-company">
                  <Save className="w-3.5 h-3.5 mr-1.5" />
                  {updateCompanyMutation.isPending ? "Saving..." : "Save Details"}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-sm">Account Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between py-2 border-b border-border">
            <div>
              <p className="text-sm font-medium" data-testid="text-username">{user?.username}</p>
              <p className="text-xs text-muted-foreground">{user?.email}</p>
            </div>
            <Badge variant="secondary">{user?.role}</Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Password changes are coming in a future update.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Activity Log
          </CardTitle>
          <CardDescription className="text-xs">Recent changes in your ESG platform</CardDescription>
        </CardHeader>
        <CardContent>
          {logsLoading ? (
            <Skeleton className="h-32" />
          ) : auditLogs.length === 0 ? (
            <p className="text-xs text-muted-foreground">No activity recorded yet.</p>
          ) : (
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {auditLogs.map((log: any) => (
                <div key={log.id} className="flex items-start gap-3 py-2 border-b border-border last:border-0 text-xs" data-testid={`log-${log.id}`}>
                  <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium">{log.action}</p>
                    {log.entityType && (
                      <p className="text-muted-foreground capitalize">{log.entityType}</p>
                    )}
                  </div>
                  <p className="text-muted-foreground shrink-0">
                    {log.createdAt ? format(new Date(log.createdAt), "dd MMM HH:mm") : ""}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {user?.role === "admin" && <MetricsAdmin />}
      {user?.role === "admin" && <AdminTemplateEditor />}
    </div>
  );
}

function MetricsAdmin() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editingMetric, setEditingMetric] = useState<any | null>(null);

  const { data: enhanced } = useQuery<any>({ queryKey: ["/api/dashboard/enhanced"] });
  const metrics = enhanced?.metricSummaries || [];

  const [direction, setDirection] = useState("");
  const [targetValue, setTargetValue] = useState("");
  const [targetMin, setTargetMin] = useState("");
  const [targetMax, setTargetMax] = useState("");
  const [amberThreshold, setAmberThreshold] = useState("");
  const [redThreshold, setRedThreshold] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [helpText, setHelpText] = useState("");
  const [dataOwner, setDataOwner] = useState("");

  const openEditor = (m: any) => {
    setEditingMetric(m);
    setDirection(m.direction || "higher_is_better");
    setTargetValue(m.target ? String(m.target) : "");
    setTargetMin(m.targetMin ? String(m.targetMin) : "");
    setTargetMax(m.targetMax ? String(m.targetMax) : "");
    setAmberThreshold("5");
    setRedThreshold("15");
    setEnabled(true);
    setHelpText(m.helpText || "");
    setDataOwner(m.dataOwner || "");
  };

  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("PUT", `/api/metrics/${editingMetric.id}/admin`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/enhanced"] });
      queryClient.invalidateQueries({ queryKey: ["/api/metrics"] });
      setEditingMetric(null);
      toast({ title: "Metric settings updated" });
    },
    onError: () => toast({ title: "Update failed", variant: "destructive" }),
  });

  const handleSave = () => {
    updateMutation.mutate({
      direction,
      targetValue: targetValue || null,
      targetMin: targetMin || null,
      targetMax: targetMax || null,
      amberThreshold: amberThreshold || "5",
      redThreshold: redThreshold || "15",
      enabled,
      helpText,
      dataOwner,
    });
  };

  const statusColors: Record<string, string> = {
    green: "bg-emerald-500",
    amber: "bg-amber-500",
    red: "bg-red-500",
    missing: "bg-gray-300",
  };

  return (
    <>
      <Card data-testid="card-admin-metrics">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-primary" />
            Metric Configuration
          </CardTitle>
          <CardDescription className="text-xs">
            Configure targets, thresholds, and scoring for each metric
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-1 max-h-72 overflow-y-auto">
            {metrics.map((m: any) => (
              <div
                key={m.id}
                className="flex items-center gap-3 py-2 px-2 rounded-md hover:bg-muted/50 cursor-pointer text-xs"
                onClick={() => openEditor(m)}
                data-testid={`admin-metric-${m.id}`}
              >
                <div className={`w-2 h-2 rounded-full shrink-0 ${statusColors[m.status] || statusColors.missing}`} />
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{m.name}</p>
                  <p className="text-muted-foreground">{m.category} · {m.metricType} · {m.direction?.replace(/_/g, " ")}</p>
                </div>
                <span className="text-muted-foreground">{m.latestValue !== null ? `${m.latestValue} ${m.unit || ""}` : "—"}</span>
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!editingMetric} onOpenChange={(open) => !open && setEditingMetric(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">Configure: {editingMetric?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Scoring Direction</Label>
              <Select value={direction} onValueChange={setDirection}>
                <SelectTrigger data-testid="select-direction"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="higher_is_better">Higher is better</SelectItem>
                  <SelectItem value="lower_is_better">Lower is better</SelectItem>
                  <SelectItem value="target_range">Target range</SelectItem>
                  <SelectItem value="compliance_yes_no">Compliance (Yes/No)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {direction === "target_range" ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Target Min</Label>
                  <Input type="number" step="any" value={targetMin} onChange={e => setTargetMin(e.target.value)} data-testid="input-target-min" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Target Max</Label>
                  <Input type="number" step="any" value={targetMax} onChange={e => setTargetMax(e.target.value)} data-testid="input-target-max" />
                </div>
              </div>
            ) : direction !== "compliance_yes_no" ? (
              <div className="space-y-1.5">
                <Label className="text-xs">Target Value ({editingMetric?.unit})</Label>
                <Input type="number" step="any" value={targetValue} onChange={e => setTargetValue(e.target.value)} data-testid="input-target-value" />
              </div>
            ) : null}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1">
                  Amber Threshold
                  <span className="text-muted-foreground">(% deviation)</span>
                </Label>
                <Input type="number" step="any" value={amberThreshold} onChange={e => setAmberThreshold(e.target.value)} data-testid="input-amber-threshold" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1">
                  Red Threshold
                  <span className="text-muted-foreground">(% deviation)</span>
                </Label>
                <Input type="number" step="any" value={redThreshold} onChange={e => setRedThreshold(e.target.value)} data-testid="input-red-threshold" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Data Owner</Label>
              <Input value={dataOwner} onChange={e => setDataOwner(e.target.value)} data-testid="input-data-owner" />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Help Text</Label>
              <Textarea value={helpText} onChange={e => setHelpText(e.target.value)} className="text-xs min-h-12 resize-none" data-testid="input-help-text" />
            </div>

            <div className="flex items-center justify-between">
              <Label className="text-xs">Metric Enabled</Label>
              <Switch checked={enabled} onCheckedChange={setEnabled} data-testid="switch-metric-enabled" />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setEditingMetric(null)}>Cancel</Button>
              <Button size="sm" onClick={handleSave} disabled={updateMutation.isPending} data-testid="button-save-metric-admin">
                <Save className="w-3.5 h-3.5 mr-1.5" />
                {updateMutation.isPending ? "Saving..." : "Save Settings"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function AdminTemplateEditor() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [editSections, setEditSections] = useState<any[]>([]);
  const [editReviewCycle, setEditReviewCycle] = useState("");
  const [editCompliance, setEditCompliance] = useState<any>({});
  const [editDescription, setEditDescription] = useState("");

  const { data: templates = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/policy-templates"],
  });

  const updateMutation = useMutation({
    mutationFn: async ({ slug, data }: { slug: string; data: any }) => {
      const res = await apiRequest("PUT", `/api/policy-templates/${slug}/admin`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/policy-templates"] });
      setEditingSlug(null);
      toast({ title: "Template updated" });
    },
    onError: () => toast({ title: "Update failed", variant: "destructive" }),
  });

  const openEditor = (t: any) => {
    setEditSections(JSON.parse(JSON.stringify(t.sections)));
    setEditReviewCycle(t.defaultReviewCycle || "annual");
    setEditCompliance(JSON.parse(JSON.stringify(t.complianceMapping || {})));
    setEditDescription(t.description || "");
    setEditingSlug(t.slug);
  };

  const handleSectionChange = (index: number, field: string, value: string) => {
    setEditSections(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const handleSave = () => {
    if (!editingSlug) return;
    updateMutation.mutate({
      slug: editingSlug,
      data: { sections: editSections, defaultReviewCycle: editReviewCycle, description: editDescription, complianceMapping: editCompliance },
    });
  };

  const editingTemplate = templates.find((t: any) => t.slug === editingSlug);

  return (
    <>
      <Card data-testid="card-admin-templates">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Library className="w-4 h-4 text-primary" />
            Policy Template Admin
          </CardTitle>
          <CardDescription className="text-xs">
            Edit clause text, review cycles, and legal references for policy templates
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-32" />
          ) : (
            <div className="space-y-1 max-h-72 overflow-y-auto">
              {templates.map((t: any) => (
                <div
                  key={t.slug}
                  className="flex items-center gap-3 py-2 px-2 rounded-md hover:bg-muted/50 cursor-pointer text-xs"
                  onClick={() => openEditor(t)}
                  data-testid={`admin-template-${t.slug}`}
                >
                  <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{t.name}</p>
                    <p className="text-muted-foreground">{t.category} · Review: {t.defaultReviewCycle}</p>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editingSlug} onOpenChange={(open) => !open && setEditingSlug(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-sm">Edit: {editingTemplate?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Template Description</Label>
              <Textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                className="text-xs min-h-12 resize-none"
                data-testid="admin-template-description"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Default Review Cycle</Label>
                <Select value={editReviewCycle} onValueChange={setEditReviewCycle}>
                  <SelectTrigger data-testid="select-review-cycle">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                    <SelectItem value="bi-annual">Bi-annual</SelectItem>
                    <SelectItem value="annual">Annual</SelectItem>
                    <SelectItem value="every-2-years">Every 2 years</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">ISO Standards (comma-separated)</Label>
                <Input
                  value={(editCompliance.isoStandards || []).join(", ")}
                  onChange={(e) => setEditCompliance((prev: any) => ({ ...prev, isoStandards: e.target.value.split(",").map((s: string) => s.trim()).filter(Boolean) }))}
                  className="text-xs"
                  data-testid="admin-iso-standards"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Legal Drivers (comma-separated)</Label>
              <Input
                value={(editCompliance.legalDrivers || []).join(", ")}
                onChange={(e) => setEditCompliance((prev: any) => ({ ...prev, legalDrivers: e.target.value.split(",").map((s: string) => s.trim()).filter(Boolean) }))}
                className="text-xs"
                data-testid="admin-legal-drivers"
              />
            </div>

            <div className="space-y-3">
              <Label className="text-xs font-semibold">Section Clause Text & Prompt Hints</Label>
              {editSections.map((section: any, i: number) => (
                <Card key={section.key} className="p-3 space-y-2">
                  <p className="text-xs font-medium">{section.label}</p>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Default Clause Text</Label>
                    <Textarea
                      value={section.defaultClauseText || ""}
                      onChange={(e) => handleSectionChange(i, "defaultClauseText", e.target.value)}
                      placeholder="Default clause text (used as fallback if generation is not available)"
                      className="text-xs min-h-16 resize-none"
                      data-testid={`admin-clause-${section.key}`}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Prompt Hint</Label>
                    <Textarea
                      value={section.aiPromptHint || ""}
                      onChange={(e) => handleSectionChange(i, "aiPromptHint", e.target.value)}
                      className="text-xs min-h-12 resize-none"
                      data-testid={`admin-hint-${section.key}`}
                    />
                  </div>
                </Card>
              ))}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setEditingSlug(null)}>Cancel</Button>
              <Button size="sm" onClick={handleSave} disabled={updateMutation.isPending} data-testid="button-save-template-admin">
                <Save className="w-3.5 h-3.5 mr-1.5" />
                {updateMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
