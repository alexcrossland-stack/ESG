import { useState } from "react";
import { useBillingStatus, UpgradeButton } from "@/components/upgrade-prompt";
import { PageGuidance } from "@/components/page-guidance";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, authFetch } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  Download, FileText, BarChart3, Clock, CheckCircle, Leaf, Users, Shield, FileDown, Send,
  Check, X, AlertTriangle, Factory, ClipboardCheck, Eye, BookOpen, PenLine, TrendingUp,
  Gauge, Scale, ArrowUpDown, MapPin, Target, AlertOctagon, Building2, Network,
} from "lucide-react";
import { format, subMonths } from "date-fns";
import { Link } from "wouter";
import { usePermissions } from "@/lib/permissions";
import { WorkflowBadge } from "@/components/workflow-badge";
import { EvidenceCoverageCard } from "@/components/evidence-coverage-card";
import { useSiteContext } from "@/hooks/use-site-context";
import { EmptyState } from "@/components/empty-state";
import { trackEvent, AnalyticsEvents } from "@/lib/analytics";
import { useActivationState } from "@/hooks/use-activation-state";
import { EsgTooltip } from "@/components/esg-tooltip";

const ESG_EXPORT_TYPES = [
  {
    id: "esg_metrics_summary",
    label: "ESG Metrics Summary",
    description: "All tracked metrics with measured/derived/estimated/missing labels by category",
    icon: BarChart3,
    color: "text-green-600",
  },
  {
    id: "framework_readiness_summary",
    label: "Framework Readiness Summary",
    description: "Alignment/readiness assessment against selected ESG frameworks (no certification implied)",
    icon: Network,
    color: "text-blue-600",
  },
  {
    id: "target_progress_summary",
    label: "Target Progress Summary",
    description: "Progress against all ESG targets by pillar with status and completion rate",
    icon: Target,
    color: "text-purple-600",
  },
  {
    id: "policy_register_summary",
    label: "Policy Register Summary",
    description: "All policy records with type, owner, status, and review dates",
    icon: FileText,
    color: "text-amber-600",
  },
  {
    id: "risk_register_summary",
    label: "Risk Register Summary",
    description: "ESG risk register with likelihood, impact, score, and mitigation status",
    icon: AlertOctagon,
    color: "text-red-600",
  },
  {
    id: "site_comparison_summary",
    label: "Site Comparison Summary",
    description: "Side-by-side comparison of ESG data across all active sites",
    icon: Building2,
    color: "text-indigo-600",
  },
];

function EsgExportsSection() {
  const { toast } = useToast();
  const [selectedType, setSelectedType] = useState<string>("esg_metrics_summary");
  const [selectedFormat, setSelectedFormat] = useState<"pdf" | "docx">("pdf");
  const [selectedPeriod, setSelectedPeriod] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [useDateRange, setUseDateRange] = useState(false);
  const [exporting, setExporting] = useState(false);

  const { data: sitesData } = useQuery<any[]>({ queryKey: ["/api/sites"] });
  const [selectedSite, setSelectedSite] = useState<string>("all-sites");

  const periods = generatePeriods();

  const handleExport = async () => {
    setExporting(true);
    try {
      const body: any = {
        format: selectedFormat,
        period: (!useDateRange && selectedPeriod && selectedPeriod !== "all") ? selectedPeriod : undefined,
        siteId: selectedSite && selectedSite !== "all-sites" ? selectedSite : undefined,
        dateFrom: (useDateRange && dateFrom) ? dateFrom : undefined,
        dateTo: (useDateRange && dateTo) ? dateTo : undefined,
      };
      const res = await authFetch(`/api/reports/export/${selectedType}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Export failed" }));
        throw new Error(err.error || "Export failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const periodLabel = body.period || (body.dateFrom ? `${body.dateFrom}_to_${body.dateTo || "now"}` : format(new Date(), "yyyy-MM-dd"));
      a.download = `${selectedType}_${periodLabel}.${selectedFormat}`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Export downloaded successfully" });
    } catch (e: any) {
      toast({ title: "Export failed", description: e.message, variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const selectedTypeInfo = ESG_EXPORT_TYPES.find(t => t.id === selectedType);
  const showSiteScope = selectedType === "esg_metrics_summary" || selectedType === "site_comparison_summary";

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Download className="w-4 h-4" />
          ESG Report Exports
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Generate structured ESG reports as PDF or DOCX. All reports clearly label measured, derived, estimated, and missing values.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {ESG_EXPORT_TYPES.map(t => {
            const Icon = t.icon;
            const isSelected = selectedType === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setSelectedType(t.id)}
                data-testid={`button-export-type-${t.id}`}
                className={`text-left p-3 rounded-md border transition-colors ${
                  isSelected
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50 hover:bg-muted/30"
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Icon className={`w-4 h-4 ${t.color}`} />
                  <span className="text-xs font-medium">{t.label}</span>
                  {isSelected && <CheckCircle className="w-3 h-3 text-primary ml-auto" />}
                </div>
                <p className="text-xs text-muted-foreground leading-snug">{t.description}</p>
              </button>
            );
          })}
        </div>

        <div className="pt-2 border-t border-border space-y-3">
          {/* Scope mode toggle */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 text-xs">
              <button
                onClick={() => setUseDateRange(false)}
                data-testid="button-scope-period"
                className={`px-2.5 py-1 rounded-md border text-xs ${!useDateRange ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/50"}`}
              >
                By Period
              </button>
              <button
                onClick={() => setUseDateRange(true)}
                data-testid="button-scope-daterange"
                className={`px-2.5 py-1 rounded-md border text-xs ${useDateRange ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/50"}`}
              >
                Date Range
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {!useDateRange ? (
              <div>
                <Label className="text-xs mb-1.5 block">Reporting Period</Label>
                <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                  <SelectTrigger data-testid="select-export-period" className="h-8 text-xs">
                    <SelectValue placeholder="All periods" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All periods</SelectItem>
                    {periods.map(p => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <>
                <div>
                  <Label className="text-xs mb-1.5 block">Date From</Label>
                  <Input
                    type="date"
                    value={dateFrom}
                    onChange={e => setDateFrom(e.target.value)}
                    className="h-8 text-xs"
                    data-testid="input-export-date-from"
                  />
                </div>
                <div>
                  <Label className="text-xs mb-1.5 block">Date To</Label>
                  <Input
                    type="date"
                    value={dateTo}
                    onChange={e => setDateTo(e.target.value)}
                    className="h-8 text-xs"
                    data-testid="input-export-date-to"
                  />
                </div>
              </>
            )}

            {showSiteScope && (
              <div>
                <Label className="text-xs mb-1.5 block">Site Scope</Label>
                <Select value={selectedSite} onValueChange={setSelectedSite}>
                  <SelectTrigger data-testid="select-export-site" className="h-8 text-xs">
                    <SelectValue placeholder="All sites (org-wide)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all-sites">All sites (org-wide)</SelectItem>
                    {(sitesData || []).map((s: any) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div>
            <Label className="text-xs mb-1.5 block">Format</Label>
            <div className="flex gap-2 w-fit">
              <Button
                size="sm"
                variant={selectedFormat === "pdf" ? "default" : "outline"}
                onClick={() => setSelectedFormat("pdf")}
                data-testid="button-format-pdf"
                className="h-8 text-xs px-4"
              >
                PDF
              </Button>
              <Button
                size="sm"
                variant={selectedFormat === "docx" ? "default" : "outline"}
                onClick={() => setSelectedFormat("docx")}
                data-testid="button-format-docx"
                className="h-8 text-xs px-4"
              >
                DOCX
              </Button>
            </div>
          </div>
        </div>

        {selectedTypeInfo && (
          <div className="flex items-center justify-between pt-2 border-t border-border">
            <div className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{selectedTypeInfo.label}</span>
              {!useDateRange && selectedPeriod && selectedPeriod !== "all" && ` · ${selectedPeriod}`}
              {useDateRange && dateFrom && ` · ${dateFrom}`}
              {useDateRange && dateTo && ` to ${dateTo}`}
              {selectedSite && selectedSite !== "all-sites" && " · Single site"}
              {` · ${selectedFormat.toUpperCase()}`}
            </div>
            <Button
              size="sm"
              onClick={handleExport}
              disabled={exporting || (useDateRange && (!dateFrom || !dateTo))}
              data-testid="button-export-esg-report"
              className="gap-1.5"
            >
              {exporting ? (
                <div className="w-3.5 h-3.5 border border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              {exporting ? "Generating…" : "Download"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const REPORT_TEMPLATES = [
  {
    id: "board",
    label: "Board Summary",
    description: "One-page executive overview for board meetings and investor briefings",
    audience: "Board, investors, executives",
    timeEstimate: "~2 min",
    icon: "🏛️",
    defaults: { includeSummary: true, includePolicy: false, includeTopics: false, includeMetrics: true, includeCarbon: true, includeActions: true, includeEvidence: false, includeMethodology: false, includeSignoff: true, includeDataQualityAssessment: false, includeComplianceStatus: false, includePeriodComparison: true },
  },
  {
    id: "customer",
    label: "Customer Response Pack",
    description: "Concise ESG summary for responding to supply chain or procurement requests",
    audience: "Customers, procurement teams",
    timeEstimate: "~2 min",
    icon: "📦",
    defaults: { includeSummary: true, includePolicy: true, includeTopics: true, includeMetrics: true, includeCarbon: true, includeActions: false, includeEvidence: true, includeMethodology: false, includeSignoff: false, includeDataQualityAssessment: false, includeComplianceStatus: false, includePeriodComparison: false },
  },
  {
    id: "compliance",
    label: "Compliance Summary",
    description: "Detailed mapping against reporting frameworks for regulatory or audit purposes",
    audience: "Regulators, auditors, legal",
    timeEstimate: "~3 min",
    icon: "⚖️",
    defaults: { includeSummary: true, includePolicy: true, includeTopics: false, includeMetrics: true, includeCarbon: true, includeActions: false, includeEvidence: true, includeMethodology: true, includeSignoff: true, includeDataQualityAssessment: true, includeComplianceStatus: true, includePeriodComparison: false },
  },
  {
    id: "management",
    label: "Full ESG Report",
    description: "Comprehensive report covering all ESG areas for internal stakeholders",
    audience: "Management, sustainability team",
    timeEstimate: "~3 min",
    icon: "📋",
    defaults: { includeSummary: true, includePolicy: true, includeTopics: true, includeMetrics: true, includeCarbon: true, includeActions: true, includeEvidence: true, includeMethodology: true, includeSignoff: true, includeDataQualityAssessment: true, includeComplianceStatus: true, includePeriodComparison: true },
  },
];

const SECTIONS = [
  { key: "includeSummary", label: "Executive Summary", icon: BookOpen },
  { key: "includeMetrics", label: "ESG Metrics by Category", icon: BarChart3 },
  { key: "includeCarbon", label: "Carbon Summary", icon: Factory },
  { key: "includePolicy", label: "Policy Summary", icon: FileText },
  { key: "includeActions", label: "Progress Against Actions", icon: ClipboardCheck },
  { key: "includeTopics", label: "Data Quality Flags", icon: AlertTriangle },
  { key: "includeEvidence", label: "Evidence Coverage", icon: Eye },
  { key: "includeMethodology", label: "Methodology Notes", icon: BookOpen },
  { key: "includeSignoff", label: "Approval Sign-off", icon: PenLine },
  { key: "includeDataQualityAssessment", label: "Data Quality Assessment", icon: Gauge },
  { key: "includeComplianceStatus", label: "Compliance Status", icon: Scale },
  { key: "includePeriodComparison", label: "Period Comparison", icon: ArrowUpDown },
];

function generatePeriods() {
  const periods = [];
  const now = new Date();
  const start = new Date(2020, 0, 1);
  let d = new Date(now.getFullYear(), now.getMonth(), 1);
  while (d >= start) {
    periods.push(format(d, "yyyy-MM"));
    d = subMonths(d, 1);
  }
  return periods;
}

function StatusBadge({ status }: { status: string }) {
  if (status === "Approved") return <Badge className="text-[10px] bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-0">{status}</Badge>;
  if (status === "Submitted") return <Badge className="text-[10px] bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 border-0">{status}</Badge>;
  return <Badge variant="secondary" className="text-[10px]">{status}</Badge>;
}

function SourceBadge({ label }: { label: string }) {
  if (label === "Evidenced") return <Badge className="text-[10px] bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-0">{label}</Badge>;
  if (label === "Estimated") return <Badge className="text-[10px] bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 border-0">{label}</Badge>;
  return <Badge variant="secondary" className="text-[10px]">{label}</Badge>;
}

function TrafficDot({ status }: { status: string }) {
  const color = status === "green" ? "bg-green-500" : status === "amber" ? "bg-amber-500" : status === "red" ? "bg-red-500" : "bg-gray-300";
  return <span className={`inline-block w-2 h-2 rounded-full ${color}`} />;
}

function ReportPreview({ data, sections }: { data: any; sections: Record<string, boolean> }) {
  const {
    company, policySummary, selectedTopics, metricsByCategory, values,
    weightedScore, carbonSummary, actionsSummary, dataQualityFlags,
    evidenceCoverage, factorMethodology, period, generatedAt, generatedBy, reportTemplate,
    branding, dataQualityAssessment, complianceStatus, periodComparison,
  } = data;

  const templateLabel = REPORT_TEMPLATES.find(t => t.id === reportTemplate)?.label || "ESG Report";
  const brandColor = branding?.color || undefined;

  return (
    <div className="bg-white dark:bg-card border border-border rounded-md p-8 space-y-6 text-sm max-h-[700px] overflow-y-auto" data-testid="report-preview">
      <div className="text-center space-y-1 pb-4 border-b border-border">
        <div className="flex items-center justify-center gap-2 mb-3">
          <div className="p-2 rounded-lg" style={{ backgroundColor: brandColor || "hsl(var(--primary))" }}>
            <Leaf className="w-5 h-5 text-white" />
          </div>
        </div>
        <h1 className="text-xl font-bold" data-testid="text-report-title" style={brandColor ? { color: brandColor } : undefined}>
          {branding?.name || company?.name}
        </h1>
        {branding?.tagline && <p className="text-muted-foreground text-xs italic">{branding.tagline}</p>}
        <p className="text-muted-foreground font-medium">{templateLabel}</p>
        <p className="text-xs text-muted-foreground">Reporting Period: {period}</p>
        <p className="text-xs text-muted-foreground">Generated {generatedAt ? format(new Date(generatedAt), "dd MMMM yyyy 'at' HH:mm") : ""} by {generatedBy}</p>
        <div className="flex items-center justify-center gap-2 mt-2">
          <Badge variant="outline" className="text-[10px]">Factor Year: {factorMethodology?.factorYear || "2024"}</Badge>
          {factorMethodology?.source && <Badge variant="outline" className="text-[10px]">Source: {factorMethodology.source}</Badge>}
        </div>
      </div>

      {company && (
        <div>
          <h2 className="font-semibold text-base mb-2 flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" />
            Company Overview
          </h2>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {company.industry && <div><span className="text-muted-foreground">Industry:</span> {company.industry}</div>}
            {company.country && <div><span className="text-muted-foreground">Country:</span> {company.country}</div>}
            {company.employeeCount && <div><span className="text-muted-foreground">Employees:</span> {company.employeeCount}</div>}
            {company.revenueBand && <div><span className="text-muted-foreground">Revenue Band:</span> {company.revenueBand}</div>}
          </div>
        </div>
      )}

      {sections.includeSummary && (
        <div data-testid="section-executive-summary">
          <h2 className="font-semibold text-base mb-3 flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-primary" />
            Executive Summary
          </h2>
          <div className="space-y-3 text-xs">
            {weightedScore && (
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-muted/50 rounded-md p-3 text-center">
                  <p className="text-lg font-bold text-primary">{weightedScore.overallScore ?? "N/A"}</p>
                  <p className="text-muted-foreground">Overall ESG Score</p>
                </div>
                <div className="bg-muted/50 rounded-md p-3 text-center">
                  <p className="text-lg font-bold">{dataQualityFlags?.totalValues || 0}</p>
                  <p className="text-muted-foreground">Metrics Reported</p>
                </div>
                <div className="bg-muted/50 rounded-md p-3 text-center">
                  <p className="text-lg font-bold">{actionsSummary?.completionRate || 0}%</p>
                  <p className="text-muted-foreground">Actions Complete</p>
                </div>
              </div>
            )}
            {weightedScore?.categoryScores && (
              <div className="grid grid-cols-3 gap-3">
                {Object.entries(weightedScore.categoryScores).map(([cat, info]: [string, any]) => (
                  <div key={cat} className="border border-border rounded-md p-2">
                    <p className="font-medium capitalize flex items-center gap-1.5">
                      {cat === "environmental" && <Leaf className="w-3 h-3 text-green-600" />}
                      {cat === "social" && <Users className="w-3 h-3 text-blue-600" />}
                      {cat === "governance" && <Shield className="w-3 h-3 text-purple-600" />}
                      {cat}
                    </p>
                    <p className="text-lg font-bold">{info.score ?? "N/A"}</p>
                    <p className="text-muted-foreground">{info.scoredCount}/{info.metricCount} metrics scored</p>
                  </div>
                ))}
              </div>
            )}
            {carbonSummary && (
              <p>Total carbon emissions for the period: <strong>{carbonSummary.total.toFixed(1)} kgCO2e</strong>
                {carbonSummary.perEmployee ? ` (${carbonSummary.perEmployee} kgCO2e per employee)` : ""}.
              </p>
            )}
            <div className="flex flex-wrap gap-3">
              <span>Data approval rate: <strong>{dataQualityFlags?.approvalRate || 0}%</strong></span>
              <span>Evidence coverage: <strong>{evidenceCoverage?.coveragePercent || 0}%</strong></span>
              {dataQualityFlags?.missingCount > 0 && (
                <span className="text-amber-600 dark:text-amber-400">Missing data: <strong>{dataQualityFlags.missingCount} metrics</strong></span>
              )}
            </div>
          </div>
        </div>
      )}

      {sections.includeMetrics && values?.length > 0 && (
        <div data-testid="section-metrics">
          <h2 className="font-semibold text-base mb-3 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-primary" />
            ESG Metrics by Category
          </h2>
          {metricsByCategory && Object.entries(metricsByCategory).map(([category, catValues]: [string, any]) => (
            <div key={category} className="mb-4">
              <h3 className="text-xs font-semibold capitalize text-muted-foreground mb-1.5 flex items-center gap-1.5">
                {category === "environmental" && <Leaf className="w-3 h-3" />}
                {category === "social" && <Users className="w-3 h-3" />}
                {category === "governance" && <Shield className="w-3 h-3" />}
                {category}
              </h3>
              <table className="w-full text-xs border-collapse mb-2">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-1 font-medium text-muted-foreground">Metric</th>
                    <th className="text-left py-1 font-medium text-muted-foreground">Value</th>
                    <th className="text-left py-1 font-medium text-muted-foreground">Source</th>
                    <th className="text-left py-1 font-medium text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {catValues.map((v: any) => (
                    <tr key={v.id} className="border-b border-border/50" data-testid={`row-metric-${v.id}`}>
                      <td className="py-1">{v.metricName}</td>
                      <td className="py-1 font-medium">{v.value} {v.unit || ""}</td>
                      <td className="py-1"><SourceBadge label={v.dataSourceLabel} /></td>
                      <td className="py-1"><StatusBadge status={v.workflowLabel} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      {sections.includeCarbon && carbonSummary && (
        <div data-testid="section-carbon">
          <h2 className="font-semibold text-base mb-3 flex items-center gap-2">
            <Factory className="w-4 h-4 text-primary" />
            Carbon Summary
          </h2>
          <div className="grid grid-cols-4 gap-3 mb-3">
            {[
              { label: "Scope 1", value: carbonSummary.scope1 },
              { label: "Scope 2", value: carbonSummary.scope2 },
              { label: "Scope 3", value: carbonSummary.scope3 },
              { label: "Total", value: carbonSummary.total },
            ].map(s => (
              <div key={s.label} className="bg-muted/50 rounded-md p-2 text-center text-xs">
                <p className="font-bold text-sm">{s.value.toFixed(1)}</p>
                <p className="text-muted-foreground">{s.label} (kgCO2e)</p>
              </div>
            ))}
          </div>
          <div className="text-xs space-y-1.5">
            {carbonSummary.periodMismatch && (
              <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-md p-2 text-amber-800 dark:text-amber-400 mb-2">
                <AlertTriangle className="w-3 h-3 inline mr-1" />
                {carbonSummary.periodMismatch}
              </div>
            )}
            <p>Reporting period: {carbonSummary.period}</p>
            {carbonSummary.perEmployee && <p>Per employee: {carbonSummary.perEmployee} kgCO2e</p>}
            <p>Factor year: {carbonSummary.factorYear} <Badge variant="outline" className="text-[10px] ml-1">DEFRA {carbonSummary.factorYear}</Badge></p>
            {carbonSummary.lineItems?.length > 0 && (
              <div className="mt-2">
                <p className="font-medium mb-1">Emission Sources:</p>
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-1 font-medium text-muted-foreground">Source</th>
                      <th className="text-left py-1 font-medium text-muted-foreground">Scope</th>
                      <th className="text-right py-1 font-medium text-muted-foreground">kgCO2e</th>
                      <th className="text-left py-1 font-medium text-muted-foreground">Quality</th>
                    </tr>
                  </thead>
                  <tbody>
                    {carbonSummary.lineItems.map((item: any, i: number) => (
                      <tr key={i} className="border-b border-border/50">
                        <td className="py-1">{item.label}</td>
                        <td className="py-1">{item.scope}</td>
                        <td className="py-1 text-right font-medium">{item.emissions?.toFixed(1)}</td>
                        <td className="py-1">
                          <Badge variant="secondary" className={`text-[10px] ${item.dataQuality === "actual" ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" : item.dataQuality === "estimated" ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400" : "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400"} border-0`}>
                            {item.dataQuality}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {carbonSummary.assumptions?.length > 0 && (
              <div className="mt-2 bg-amber-50 dark:bg-amber-900/10 rounded-md p-2">
                <p className="font-medium text-amber-800 dark:text-amber-400 mb-1">Assumptions:</p>
                <ul className="list-disc list-inside text-muted-foreground">
                  {carbonSummary.assumptions.map((a: string, i: number) => <li key={i}>{a}</li>)}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {sections.includePolicy && policySummary && (
        <div data-testid="section-policy">
          <h2 className="font-semibold text-base mb-3 flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" />
            Policy Summary
            <StatusBadge status={policySummary.workflowStatus === "published" ? "Published" : "Draft"} />
          </h2>
          <div className="space-y-2 text-xs">
            {policySummary.purpose && (
              <div>
                <p className="font-medium text-muted-foreground mb-0.5">Purpose and Scope</p>
                <p className="line-clamp-3">{policySummary.purpose}</p>
              </div>
            )}
            {policySummary.environmentalCommitments && (
              <div>
                <p className="font-medium text-muted-foreground mb-0.5">Environmental Commitments</p>
                <p className="line-clamp-3">{policySummary.environmentalCommitments}</p>
              </div>
            )}
            {policySummary.socialCommitments && (
              <div>
                <p className="font-medium text-muted-foreground mb-0.5">Social Commitments</p>
                <p className="line-clamp-3">{policySummary.socialCommitments}</p>
              </div>
            )}
            {policySummary.governanceCommitments && (
              <div>
                <p className="font-medium text-muted-foreground mb-0.5">Governance Commitments</p>
                <p className="line-clamp-3">{policySummary.governanceCommitments}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {sections.includeActions && actionsSummary && (
        <div data-testid="section-actions">
          <h2 className="font-semibold text-base mb-3 flex items-center gap-2">
            <ClipboardCheck className="w-4 h-4 text-primary" />
            Progress Against Actions
          </h2>
          <div className="grid grid-cols-4 gap-3 mb-3">
            {[
              { label: "Complete", value: actionsSummary.complete, color: "text-green-600" },
              { label: "In Progress", value: actionsSummary.inProgress, color: "text-blue-600" },
              { label: "Not Started", value: actionsSummary.notStarted, color: "text-muted-foreground" },
              { label: "Overdue", value: actionsSummary.overdue, color: "text-red-600" },
            ].map(s => (
              <div key={s.label} className="bg-muted/50 rounded-md p-2 text-center text-xs">
                <p className={`font-bold text-sm ${s.color}`}>{s.value}</p>
                <p className="text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>
          {actionsSummary.total > 0 && (
            <div className="mb-2">
              <div className="w-full bg-muted rounded-full h-2">
                <div className="bg-primary h-2 rounded-full" style={{ width: `${actionsSummary.completionRate}%` }} />
              </div>
              <p className="text-xs text-muted-foreground mt-1">{actionsSummary.completionRate}% completion rate ({actionsSummary.complete} of {actionsSummary.total})</p>
            </div>
          )}
          {actionsSummary.items?.length > 0 && (
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-1 font-medium text-muted-foreground">Action</th>
                  <th className="text-left py-1 font-medium text-muted-foreground">Owner</th>
                  <th className="text-left py-1 font-medium text-muted-foreground">Due</th>
                  <th className="text-left py-1 font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {actionsSummary.items.map((a: any) => (
                  <tr key={a.id} className="border-b border-border/50">
                    <td className="py-1">{a.title}</td>
                    <td className="py-1 text-muted-foreground">{a.owner || "TBC"}</td>
                    <td className="py-1 text-muted-foreground">{a.dueDate ? format(new Date(a.dueDate), "dd MMM yyyy") : "No date"}</td>
                    <td className="py-1">
                      <Badge variant={a.status === "complete" ? "default" : a.status === "overdue" ? "destructive" : "secondary"} className="text-[10px]">
                        {a.status?.replace(/_/g, " ")}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {sections.includeTopics && dataQualityFlags && (
        <div data-testid="section-data-quality">
          <h2 className="font-semibold text-base mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-primary" />
            Data Quality and Missing Data Flags
          </h2>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div className="bg-muted/50 rounded-md p-2 text-center text-xs">
              <p className="font-bold text-sm">{dataQualityFlags.approvalRate}%</p>
              <p className="text-muted-foreground">Approved</p>
              <p className="text-muted-foreground">{dataQualityFlags.approvedCount} of {dataQualityFlags.totalValues}</p>
            </div>
            <div className="bg-muted/50 rounded-md p-2 text-center text-xs">
              <p className="font-bold text-sm">{dataQualityFlags.evidenceRate}%</p>
              <p className="text-muted-foreground">Evidenced</p>
              <p className="text-muted-foreground">{dataQualityFlags.evidencedCount} of {dataQualityFlags.totalValues}</p>
            </div>
            <div className={`rounded-md p-2 text-center text-xs ${dataQualityFlags.missingCount > 0 ? "bg-amber-50 dark:bg-amber-900/10" : "bg-muted/50"}`}>
              <p className={`font-bold text-sm ${dataQualityFlags.missingCount > 0 ? "text-amber-600 dark:text-amber-400" : ""}`}>{dataQualityFlags.missingCount}</p>
              <p className="text-muted-foreground">Missing</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 mb-3 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              <span>Evidenced: {dataQualityFlags.evidencedCount}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              <span>Estimated: {dataQualityFlags.estimatedCount}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-gray-400" />
              <span>Manual: {dataQualityFlags.manualCount}</span>
            </div>
          </div>
          {dataQualityFlags.missingMetrics?.length > 0 && (
            <div className="bg-amber-50 dark:bg-amber-900/10 rounded-md p-3 text-xs">
              <p className="font-medium text-amber-800 dark:text-amber-400 mb-1">Missing Data ({dataQualityFlags.missingCount} metrics):</p>
              <ul className="list-disc list-inside text-muted-foreground space-y-0.5">
                {dataQualityFlags.missingMetrics.map((m: any, i: number) => (
                  <li key={i}>{m.name} <span className="capitalize">({m.category})</span></li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {sections.includeEvidence && evidenceCoverage && (
        <div data-testid="section-evidence">
          <h2 className="font-semibold text-base mb-3 flex items-center gap-2">
            <Eye className="w-4 h-4 text-primary" />
            Evidence Coverage Summary
          </h2>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="bg-muted/50 rounded-md p-3 text-xs">
              <p className="font-bold text-lg">{evidenceCoverage.coveragePercent}%</p>
              <p className="text-muted-foreground">Metric Evidence Coverage</p>
              <p className="text-muted-foreground">{evidenceCoverage.evidencedCount} of {evidenceCoverage.totalMetrics} metrics</p>
            </div>
            <div className="bg-muted/50 rounded-md p-3 text-xs">
              <p className="font-bold text-lg">{evidenceCoverage.totalEvidence}</p>
              <p className="text-muted-foreground">Total Evidence Files</p>
              {evidenceCoverage.expiredCount > 0 && (
                <p className="text-red-600 dark:text-red-400 font-medium">{evidenceCoverage.expiredCount} expired</p>
              )}
            </div>
          </div>
          {evidenceCoverage.byStatus && (
            <div className="grid grid-cols-4 gap-2 text-xs">
              {Object.entries(evidenceCoverage.byStatus).map(([status, count]: [string, any]) => (
                <div key={status} className="text-center">
                  <p className="font-bold">{count}</p>
                  <p className="text-muted-foreground capitalize">{status}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {sections.includeMethodology && (
        <div data-testid="section-methodology">
          <h2 className="font-semibold text-base mb-3 flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-primary" />
            Methodology Notes
          </h2>
          <div className="space-y-2 text-xs">
            <div className="bg-muted/50 rounded-md p-3">
              <p className="font-medium mb-1">ESG Scoring Methodology</p>
              <ul className="list-disc list-inside text-muted-foreground space-y-0.5">
                <li>Weighted scoring with metric importance (Critical = 2x, High = 1.5x, Standard = 1x)</li>
                <li>Material topic categories receive a 25% weight boost</li>
                <li>Traffic light scoring: Green = 100, Amber = 50, Red = 0</li>
                <li>Missing metrics excluded from scoring (not penalised)</li>
              </ul>
              {weightedScore?.methodology?.length > 0 && (
                <ul className="list-disc list-inside text-muted-foreground space-y-0.5 mt-1">
                  {weightedScore.methodology.map((m: string, i: number) => <li key={i}>{m}</li>)}
                </ul>
              )}
            </div>
            {carbonSummary && (
              <div className="bg-muted/50 rounded-md p-3">
                <p className="font-medium mb-1">Carbon Methodology</p>
                <ul className="list-disc list-inside text-muted-foreground space-y-0.5">
                  <li>Emission factors: {factorMethodology?.source || "UK DEFRA"} {factorMethodology?.factorYear || "2024"}</li>
                  <li>Scope 1: Direct emissions (gas, fuel, refrigerants, vehicles)</li>
                  <li>Scope 2: Indirect energy (grid electricity, location-based)</li>
                  <li>Scope 3: Value chain (business travel, commuting, waste)</li>
                  <li>Data quality tracked per source: actual, estimated, or proxy</li>
                </ul>
              </div>
            )}
            <div className="bg-muted/50 rounded-md p-3">
              <p className="font-medium mb-1">Data Sources</p>
              <ul className="list-disc list-inside text-muted-foreground space-y-0.5">
                <li><strong>Evidenced:</strong> Metric value backed by uploaded evidence file</li>
                <li><strong>Estimated:</strong> Value derived from estimation or secondary data</li>
                <li><strong>Manual:</strong> Directly entered by user without supporting evidence</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {sections.includeSignoff && (
        <div data-testid="section-signoff">
          <h2 className="font-semibold text-base mb-3 flex items-center gap-2">
            <PenLine className="w-4 h-4 text-primary" />
            Approval Sign-off
          </h2>
          <div className="border border-border rounded-md p-4 space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-muted-foreground mb-1">Report Prepared By</p>
                <p className="font-medium">{generatedBy}</p>
                <p className="text-muted-foreground">{generatedAt ? format(new Date(generatedAt), "dd MMMM yyyy") : ""}</p>
              </div>
              <div>
                <p className="text-muted-foreground mb-1">Reporting Period</p>
                <p className="font-medium">{period}</p>
              </div>
            </div>
            <Separator />
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-muted-foreground mb-1">Reviewed By</p>
                <div className="border-b border-dashed border-border w-48 h-6" />
              </div>
              <div>
                <p className="text-muted-foreground mb-1">Date</p>
                <div className="border-b border-dashed border-border w-32 h-6" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-muted-foreground mb-1">Approved By</p>
                <div className="border-b border-dashed border-border w-48 h-6" />
              </div>
              <div>
                <p className="text-muted-foreground mb-1">Date</p>
                <div className="border-b border-dashed border-border w-32 h-6" />
              </div>
            </div>
            <div className="bg-muted/30 rounded p-2 text-muted-foreground">
              <p>Data quality summary: {dataQualityFlags?.approvalRate || 0}% approved, {dataQualityFlags?.evidenceRate || 0}% evidenced, {dataQualityFlags?.missingCount || 0} metrics missing data.</p>
              {dataQualityFlags?.estimatedCount > 0 && <p className="text-amber-600 dark:text-amber-400 mt-0.5">{dataQualityFlags.estimatedCount} metric values are based on estimated data.</p>}
            </div>
          </div>
        </div>
      )}

      {sections.includeDataQualityAssessment && dataQualityAssessment && (
        <div data-testid="section-data-quality-assessment">
          <h2 className="font-semibold text-base mb-3 flex items-center gap-2">
            <Gauge className="w-4 h-4 text-primary" />
            Data Quality Assessment
          </h2>
          <div className="grid grid-cols-4 gap-3 mb-3">
            <div className="bg-muted/50 rounded-md p-3 text-center text-xs col-span-1">
              <p className={`font-bold text-2xl ${dataQualityAssessment.overallScore >= 70 ? "text-emerald-600 dark:text-emerald-400" : dataQualityAssessment.overallScore >= 40 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"}`}>
                {dataQualityAssessment.overallScore}%
              </p>
              <p className="text-muted-foreground mt-1">Overall Quality</p>
            </div>
            {Object.entries(dataQualityAssessment.categoryBreakdown || {}).map(([cat, score]: [string, any]) => (
              <div key={cat} className="bg-muted/50 rounded-md p-3 text-center text-xs">
                <p className="font-bold text-lg">{score}%</p>
                <p className="text-muted-foreground capitalize">{cat}</p>
              </div>
            ))}
          </div>
          {dataQualityAssessment.recommendations?.length > 0 && (
            <div className="bg-blue-50 dark:bg-blue-900/10 rounded-md p-3 text-xs">
              <p className="font-medium text-blue-800 dark:text-blue-400 mb-1">Recommendations</p>
              <ul className="list-disc list-inside text-muted-foreground space-y-0.5">
                {dataQualityAssessment.recommendations.map((rec: string, i: number) => (
                  <li key={i}>{rec}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {sections.includeComplianceStatus && complianceStatus && (
        <div data-testid="section-compliance-status">
          <h2 className="font-semibold text-base mb-3 flex items-center gap-2">
            <Scale className="w-4 h-4 text-primary" />
            Compliance Status
          </h2>
          <div className="space-y-3">
            {complianceStatus.map((fw: any) => (
              <div key={fw.id} className="bg-muted/50 rounded-md p-3 text-xs">
                <div className="flex items-center justify-between mb-2">
                  <p className="font-medium">{fw.name} {fw.version && <span className="text-muted-foreground">(v{fw.version})</span>}</p>
                  <Badge variant={fw.compliancePercent >= 70 ? "default" : "secondary"} className={`text-[10px] ${fw.compliancePercent >= 70 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" : ""}`}>
                    {fw.compliancePercent}% compliant
                  </Badge>
                </div>
                <div className="w-full bg-muted rounded-full h-1.5 mb-2">
                  <div className={`h-1.5 rounded-full ${fw.compliancePercent >= 70 ? "bg-emerald-500" : fw.compliancePercent >= 40 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${fw.compliancePercent}%` }} />
                </div>
                <p className="text-muted-foreground">{fw.metRequirements}/{fw.totalRequirements} requirements met</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {sections.includePeriodComparison && periodComparison && (
        <div data-testid="section-period-comparison">
          <h2 className="font-semibold text-base mb-3 flex items-center gap-2">
            <ArrowUpDown className="w-4 h-4 text-primary" />
            Period Comparison
          </h2>
          <p className="text-xs text-muted-foreground mb-3">
            {periodComparison.currentPeriod} vs {periodComparison.previousPeriod}
          </p>
          <div className="border border-border rounded-md overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/50">
                  <th className="text-left p-2 font-medium">Metric</th>
                  <th className="text-right p-2 font-medium">Previous</th>
                  <th className="text-right p-2 font-medium">Current</th>
                  <th className="text-right p-2 font-medium">Change</th>
                </tr>
              </thead>
              <tbody>
                {periodComparison.metrics?.map((m: any, i: number) => (
                  <tr key={i} className="border-t border-border">
                    <td className="p-2">{m.name}</td>
                    <td className="p-2 text-right text-muted-foreground">{m.previousValue ?? "—"}</td>
                    <td className="p-2 text-right font-medium">{m.currentValue ?? "—"}</td>
                    <td className={`p-2 text-right font-medium ${m.delta > 0 ? "text-emerald-600 dark:text-emerald-400" : m.delta < 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`}>
                      {m.delta != null ? `${m.delta > 0 ? "+" : ""}${m.delta.toFixed(1)}` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {branding?.footer && (
        <div className="pt-3 border-t border-border text-center text-xs text-muted-foreground">
          <p>{branding.footer}</p>
        </div>
      )}

      <div className="pt-4 border-t border-border text-center text-xs text-muted-foreground space-y-1" data-testid="text-disclaimer">
        <p>This report was generated using ESG Manager. Data is provided by {company?.name}.</p>
        <p>Emission factors: {factorMethodology?.source || "UK DEFRA"} {factorMethodology?.factorYear || "2024"}. All data should be independently verified before external disclosure.</p>
      </div>
    </div>
  );
}

function buildTextExport(data: any, sections: Record<string, boolean>): string {
  const {
    company, policySummary, metricsByCategory, values,
    weightedScore, carbonSummary, actionsSummary, dataQualityFlags,
    evidenceCoverage, factorMethodology, period, generatedAt, generatedBy, reportTemplate,
    branding,
  } = data;

  const templateLabel = REPORT_TEMPLATES.find(t => t.id === reportTemplate)?.label || "ESG Report";
  const lines: string[] = [];
  const hr = "=".repeat(60);
  const sr = "-".repeat(40);

  lines.push(hr);
  lines.push(branding?.name || `${company?.name} - ${templateLabel}`);
  if (branding?.tagline) lines.push(branding.tagline);
  lines.push(`Reporting Period: ${period}`);
  lines.push(`Generated: ${generatedAt ? format(new Date(generatedAt), "dd MMMM yyyy HH:mm") : ""} by ${generatedBy}`);
  lines.push(`Factor Year: ${factorMethodology?.factorYear || "2024"} | Source: ${factorMethodology?.source || "UK DEFRA"}`);
  lines.push(hr);
  lines.push("");

  if (sections.includeSummary && weightedScore) {
    lines.push("EXECUTIVE SUMMARY");
    lines.push(sr);
    lines.push(`Overall ESG Score: ${weightedScore.overallScore ?? "N/A"}/100`);
    if (weightedScore.categoryScores) {
      for (const [cat, info] of Object.entries(weightedScore.categoryScores) as [string, any][]) {
        lines.push(`  ${cat}: ${info.score ?? "N/A"}/100 (${info.scoredCount}/${info.metricCount} metrics)`);
      }
    }
    lines.push(`Metrics Reported: ${dataQualityFlags?.totalValues || 0}`);
    lines.push(`Actions Completion: ${actionsSummary?.completionRate || 0}%`);
    lines.push(`Data Approval Rate: ${dataQualityFlags?.approvalRate || 0}%`);
    lines.push(`Evidence Coverage: ${evidenceCoverage?.coveragePercent || 0}%`);
    if (dataQualityFlags?.missingCount > 0) lines.push(`Missing Data: ${dataQualityFlags.missingCount} metrics`);
    if (carbonSummary) {
      lines.push(`Total Emissions: ${carbonSummary.total.toFixed(1)} kgCO2e`);
      if (carbonSummary.perEmployee) lines.push(`Per Employee: ${carbonSummary.perEmployee} kgCO2e`);
    }
    lines.push("");
  }

  if (sections.includeMetrics && metricsByCategory) {
    lines.push("ESG METRICS BY CATEGORY");
    lines.push(sr);
    for (const [category, catValues] of Object.entries(metricsByCategory) as [string, any[]][]) {
      lines.push(`\n[${category.toUpperCase()}]`);
      for (const v of catValues) {
        const statusTag = v.workflowLabel === "Approved" ? "[APPROVED]" : v.workflowLabel === "Submitted" ? "[SUBMITTED]" : "[DRAFT]";
        const sourceTag = v.dataSourceLabel === "Evidenced" ? "[EVIDENCED]" : v.dataSourceLabel === "Estimated" ? "[ESTIMATED]" : "[MANUAL]";
        lines.push(`  ${v.metricName}: ${v.value} ${v.unit || ""} ${statusTag} ${sourceTag}`);
      }
    }
    lines.push("");
  }

  if (sections.includeCarbon && carbonSummary) {
    lines.push("CARBON SUMMARY");
    lines.push(sr);
    lines.push(`Scope 1 (Direct): ${carbonSummary.scope1.toFixed(1)} kgCO2e`);
    lines.push(`Scope 2 (Energy): ${carbonSummary.scope2.toFixed(1)} kgCO2e`);
    lines.push(`Scope 3 (Value Chain): ${carbonSummary.scope3.toFixed(1)} kgCO2e`);
    lines.push(`Total: ${carbonSummary.total.toFixed(1)} kgCO2e`);
    if (carbonSummary.perEmployee) lines.push(`Per Employee: ${carbonSummary.perEmployee} kgCO2e`);
    lines.push(`Factor Year: ${carbonSummary.factorYear}`);
    if (carbonSummary.lineItems?.length > 0) {
      lines.push("\nEmission Sources:");
      for (const item of carbonSummary.lineItems) {
        lines.push(`  ${item.label} (Scope ${item.scope}): ${item.emissions?.toFixed(1)} kgCO2e [${item.dataQuality || "actual"}]`);
      }
    }
    if (carbonSummary.assumptions?.length > 0) {
      lines.push("\nAssumptions:");
      for (const a of carbonSummary.assumptions) lines.push(`  - ${a}`);
    }
    lines.push("");
  }

  if (sections.includePolicy && policySummary) {
    lines.push("POLICY SUMMARY");
    lines.push(sr);
    lines.push(`Status: ${policySummary.workflowStatus === "published" ? "Published" : "Draft"}`);
    if (policySummary.purpose) lines.push(`Purpose: ${policySummary.purpose}`);
    if (policySummary.environmentalCommitments) lines.push(`Environmental: ${policySummary.environmentalCommitments}`);
    if (policySummary.socialCommitments) lines.push(`Social: ${policySummary.socialCommitments}`);
    if (policySummary.governanceCommitments) lines.push(`Governance: ${policySummary.governanceCommitments}`);
    lines.push("");
  }

  if (sections.includeActions && actionsSummary) {
    lines.push("PROGRESS AGAINST ACTIONS");
    lines.push(sr);
    lines.push(`Total: ${actionsSummary.total} | Complete: ${actionsSummary.complete} | In Progress: ${actionsSummary.inProgress} | Not Started: ${actionsSummary.notStarted} | Overdue: ${actionsSummary.overdue}`);
    lines.push(`Completion Rate: ${actionsSummary.completionRate}%`);
    if (actionsSummary.items?.length > 0) {
      lines.push("");
      for (const a of actionsSummary.items) {
        const due = a.dueDate ? format(new Date(a.dueDate), "dd MMM yyyy") : "No date";
        lines.push(`  [${(a.status || "").replace(/_/g, " ").toUpperCase()}] ${a.title} - Owner: ${a.owner || "TBC"} - Due: ${due}`);
      }
    }
    lines.push("");
  }

  if (sections.includeTopics && dataQualityFlags) {
    lines.push("DATA QUALITY FLAGS");
    lines.push(sr);
    lines.push(`Total Values: ${dataQualityFlags.totalValues}`);
    lines.push(`Approved: ${dataQualityFlags.approvedCount} (${dataQualityFlags.approvalRate}%)`);
    lines.push(`Draft: ${dataQualityFlags.draftCount}`);
    lines.push(`Evidenced: ${dataQualityFlags.evidencedCount} (${dataQualityFlags.evidenceRate}%)`);
    lines.push(`Estimated: ${dataQualityFlags.estimatedCount}`);
    lines.push(`Manual: ${dataQualityFlags.manualCount}`);
    if (dataQualityFlags.missingMetrics?.length > 0) {
      lines.push(`\nMissing Data (${dataQualityFlags.missingCount} metrics):`);
      for (const m of dataQualityFlags.missingMetrics) {
        lines.push(`  - ${m.name} (${m.category})`);
      }
    }
    lines.push("");
  }

  if (sections.includeEvidence && evidenceCoverage) {
    lines.push("EVIDENCE COVERAGE SUMMARY");
    lines.push(sr);
    lines.push(`Coverage: ${evidenceCoverage.coveragePercent}% (${evidenceCoverage.evidencedCount} of ${evidenceCoverage.totalMetrics} metrics)`);
    lines.push(`Total Evidence Files: ${evidenceCoverage.totalEvidence}`);
    if (evidenceCoverage.expiredCount > 0) lines.push(`Expired Files: ${evidenceCoverage.expiredCount}`);
    if (evidenceCoverage.byStatus) {
      lines.push(`By Status: Uploaded=${evidenceCoverage.byStatus.uploaded}, Reviewed=${evidenceCoverage.byStatus.reviewed}, Approved=${evidenceCoverage.byStatus.approved}, Expired=${evidenceCoverage.byStatus.expired}`);
    }
    lines.push("");
  }

  if (sections.includeMethodology) {
    lines.push("METHODOLOGY NOTES");
    lines.push(sr);
    lines.push("ESG Scoring:");
    lines.push("  - Weighted scoring: Critical=2x, High=1.5x, Standard=1x");
    lines.push("  - Material topics receive 25% category weight boost");
    lines.push("  - Traffic light: Green=100, Amber=50, Red=0");
    lines.push("  - Missing metrics excluded from scoring (not penalised)");
    if (carbonSummary) {
      lines.push(`\nCarbon Methodology:`);
      lines.push(`  - Factors: ${factorMethodology?.source || "UK DEFRA"} ${factorMethodology?.factorYear || "2024"}`);
      lines.push("  - Scope 1: Direct (gas, fuel, vehicles)");
      lines.push("  - Scope 2: Indirect energy (grid electricity)");
      lines.push("  - Scope 3: Value chain (travel, commuting, waste)");
    }
    lines.push("\nData Source Definitions:");
    lines.push("  - Evidenced: Backed by uploaded evidence file");
    lines.push("  - Estimated: Derived from estimation or secondary data");
    lines.push("  - Manual: Directly entered without supporting evidence");
    lines.push("");
  }

  if (sections.includeSignoff) {
    lines.push("APPROVAL SIGN-OFF");
    lines.push(sr);
    lines.push(`Prepared By: ${generatedBy}`);
    lines.push(`Date: ${generatedAt ? format(new Date(generatedAt), "dd MMMM yyyy") : ""}`);
    lines.push(`Period: ${period}`);
    lines.push("");
    lines.push("Reviewed By: _________________________  Date: ___________");
    lines.push("Approved By: _________________________  Date: ___________");
    lines.push("");
    lines.push(`Data Quality: ${dataQualityFlags?.approvalRate || 0}% approved, ${dataQualityFlags?.evidenceRate || 0}% evidenced, ${dataQualityFlags?.missingCount || 0} missing.`);
    if (dataQualityFlags?.estimatedCount > 0) lines.push(`Note: ${dataQualityFlags.estimatedCount} values are based on estimated data.`);
    lines.push("");
  }

  if (branding?.footer) {
    lines.push(branding.footer);
    lines.push("");
  }

  lines.push(hr);
  lines.push(`Generated by ESG Manager | ${factorMethodology?.source || "UK DEFRA"} ${factorMethodology?.factorYear || "2024"}`);
  lines.push("All data should be independently verified before external disclosure.");
  lines.push(hr);

  return lines.join("\n");
}

export default function Reports() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const canApprove = can("report_generation");
  const { isPro } = useBillingStatus();
  const { activeSiteId, activeSite, sites: allSites } = useSiteContext();
  const activeSites = allSites.filter((s: any) => s.status === "active");
  const archivedSites = allSites.filter((s: any) => s.status === "archived");
  const hasMultipleSites = allSites.length >= 1;
  const [reportScopeId, setReportScopeId] = useState<string>(activeSiteId || "__org__");
  const periods = generatePeriods();
  const [selectedPeriod, setSelectedPeriod] = useState(periods[0]);
  const [reportType, setReportType] = useState("pdf");
  const [selectedTemplate, setSelectedTemplate] = useState("management");
  const [reportData, setReportData] = useState<any>(null);
  const effectiveSiteId = reportScopeId === "__org__" ? null : reportScopeId;

  const templateConfig = REPORT_TEMPLATES.find(t => t.id === selectedTemplate) || REPORT_TEMPLATES[0];
  const [sectionOverrides, setSectionOverrides] = useState<Record<string, boolean>>({});

  const effectiveSections = { ...templateConfig.defaults, ...sectionOverrides };

  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplate(templateId);
    setSectionOverrides({});
    setReportData(null);
  };

  const toggleSection = (key: string) => {
    setSectionOverrides(prev => ({
      ...prev,
      [key]: !(effectiveSections as any)[key],
    }));
  };

  const { data: reports = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/reports", effectiveSiteId ?? "all"],
    queryFn: async () => {
      const url = effectiveSiteId ? `/api/reports?siteId=${effectiveSiteId}` : "/api/reports";
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load reports");
      return res.json();
    },
  });
  const { data: companyData } = useQuery<any>({ queryKey: ["/api/company"] });
  const { data: metricsData = [] } = useQuery<any[]>({ queryKey: ["/api/metrics"] });
  const { data: complianceStatus } = useQuery<any>({ queryKey: ["/api/compliance/status"] });
  const { data: evidenceCoverageData } = useQuery<any>({ queryKey: ["/api/evidence/coverage"] });
  const { data: actionsData = [] } = useQuery<any[]>({ queryKey: ["/api/actions"] });
  const { data: policyData } = useQuery<any>({ queryKey: ["/api/policy"] });
  const [exportingAssurance, setExportingAssurance] = useState(false);

  const activation = useActivationState();

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/reports/generate", {
        period: selectedPeriod,
        reportType,
        reportTemplate: selectedTemplate,
        siteId: effectiveSiteId,
        ...effectiveSections,
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      const isFirstReport = !activation.hasGeneratedReport;
      setReportData(data.data);
      queryClient.invalidateQueries({ queryKey: ["/api/reports"] });
      queryClient.invalidateQueries({ queryKey: ["/api/onboarding/status"] });
      if (isFirstReport) trackEvent(AnalyticsEvents.FIRST_REPORT_GENERATED, { template: selectedTemplate, period: selectedPeriod });
      toast({ title: "Report generated", description: `${templateConfig.label} is ready to preview and export.` });
    },
    onError: (e: any) => toast({
      title: "Report generation failed",
      description: e?.message?.includes("data") || e?.message?.includes("metric")
        ? "Not enough data to generate a report. Add at least one month of data in Data Entry first."
        : "Something went wrong generating the report. Try selecting a different period or report type.",
      variant: "destructive",
    }),
  });

  const exportReport = () => {
    if (!reportData) return;
    const content = buildTextExport(reportData, effectiveSections);
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${selectedTemplate}-report-${selectedPeriod}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Report exported" });
  };

  const exportCsv = () => {
    if (!reportData?.values?.length) return;
    const rows = [["Metric", "Category", "Period", "Value", "Unit", "Data Source", "Workflow Status"]];
    reportData.values.forEach((v: any) => {
      rows.push([v.metricName, v.category, v.period, v.value, v.unit || "", v.dataSourceLabel || "Manual", v.workflowLabel || "Draft"]);
    });
    const csv = rows.map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `esg-metrics-${selectedPeriod}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "CSV exported" });
  };

  const generateFileMutation = useMutation({
    mutationFn: async ({ reportId, format }: { reportId: string; format: "pdf" | "docx" }) => {
      const res = await apiRequest("POST", `/api/reports/${reportId}/generate-file`, { format });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/reports"] });
      if (data.fileId) {
        handleDownloadFile(reportId, data.fileId, data.filename);
      }
      toast({ title: `${data.fileType?.toUpperCase() || "File"} generated` });
    },
    onError: () => toast({ title: "File generation failed", variant: "destructive" }),
  });

  const latestReportId = reports.length > 0 ? String(reports[0].id) : null;

  const { data: generatedFiles = [] } = useQuery<any[]>({
    queryKey: ["/api/reports", latestReportId, "files"],
    queryFn: () => latestReportId ? authFetch(`/api/reports/${latestReportId}/files`).then(r => r.json()) : Promise.resolve([]),
    enabled: !!latestReportId,
  });

  const handleDownloadFile = async (reportId: string, fileId: string, filename: string) => {
    try {
      const res = await authFetch(`/api/reports/${reportId}/download/${fileId}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: "Download failed", variant: "destructive" });
    }
  };

  const handleGenerateFile = (format: "pdf" | "docx") => {
    if (!latestReportId) {
      toast({ title: "Generate a report first", variant: "destructive" });
      return;
    }
    generateFileMutation.mutate({ reportId: latestReportId, format });
  };

  const downloadTextFile = (content: string, filename: string) => {
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportBoardPack = () => {
    const hr = "=".repeat(60);
    const sr = "-".repeat(40);
    const companyName = companyData?.name || "Company";
    const esgScore = reportData?.weightedScore?.overallScore ?? "N/A";
    const categoryScores = reportData?.weightedScore?.categoryScores || {};
    const carbon = reportData?.carbonSummary;
    const actions = actionsData || [];
    const topActions = actions.slice(0, 5);
    const frameworks = complianceStatus || [];
    const overallCompliance = Array.isArray(frameworks) && frameworks.length > 0
      ? Math.round(frameworks.reduce((sum: number, fw: any) => sum + (fw.compliancePercent || 0), 0) / frameworks.length)
      : 0;

    const dataStatus = reportData ? "[APPROVED]" : companyData ? "[DRAFT]" : "[MISSING]";

    const pack = {
      companyName,
      esgScore,
      categoryScores,
      carbonSummary: carbon ? { scope1: carbon.scope1, scope2: carbon.scope2, scope3: carbon.scope3, total: carbon.total } : null,
      topActions: topActions.map((a: any) => ({ title: a.title, status: a.status, dueDate: a.dueDate })),
      compliancePercent: overallCompliance,
      dataStatus,
    };

    const lines: string[] = [];
    lines.push(hr);
    lines.push(`BOARD PACK - ${pack.companyName}`);
    lines.push(`Generated: ${format(new Date(), "dd MMMM yyyy 'at' HH:mm")}`);
    lines.push(`Status: ${pack.dataStatus}`);
    lines.push(hr);
    lines.push("");
    lines.push("ESG SCORE");
    lines.push(sr);
    lines.push(`Overall Score: ${pack.esgScore}`);
    for (const [cat, info] of Object.entries(pack.categoryScores) as [string, any][]) {
      lines.push(`  ${cat.charAt(0).toUpperCase() + cat.slice(1)}: ${info.score ?? "N/A"} (${info.scoredCount}/${info.metricCount} metrics)`);
    }
    lines.push("");
    if (pack.carbonSummary) {
      lines.push("CARBON SUMMARY");
      lines.push(sr);
      lines.push(`Scope 1: ${pack.carbonSummary.scope1?.toFixed(1) || "0.0"} kgCO2e`);
      lines.push(`Scope 2: ${pack.carbonSummary.scope2?.toFixed(1) || "0.0"} kgCO2e`);
      lines.push(`Scope 3: ${pack.carbonSummary.scope3?.toFixed(1) || "0.0"} kgCO2e`);
      lines.push(`Total: ${pack.carbonSummary.total?.toFixed(1) || "0.0"} kgCO2e`);
      lines.push("");
    }
    lines.push("TOP 5 ACTION ITEMS");
    lines.push(sr);
    if (pack.topActions.length === 0) {
      lines.push("  No actions recorded.");
    } else {
      pack.topActions.forEach((a: any, i: number) => {
        const status = a.status === "complete" ? "[APPROVED]" : a.status === "not_started" ? "[MISSING]" : "[DRAFT]";
        const due = a.dueDate ? format(new Date(a.dueDate), "dd MMM yyyy") : "No date";
        lines.push(`  ${i + 1}. ${a.title} ${status} - Due: ${due}`);
      });
    }
    lines.push("");
    lines.push("COMPLIANCE");
    lines.push(sr);
    lines.push(`Requirements Met: ${pack.compliancePercent}%`);
    lines.push("");
    lines.push(hr);

    downloadTextFile(lines.join("\n"), `board-pack-${format(new Date(), "yyyy-MM-dd")}.txt`);
    toast({ title: "Board Pack exported" });
  };

  const exportCustomerPack = () => {
    const hr = "=".repeat(60);
    const sr = "-".repeat(40);
    const metrics = metricsData || [];
    const policy = policyData;
    const evidCoverage = evidenceCoverageData;
    const frameworks = complianceStatus || [];
    const overallCompliance = Array.isArray(frameworks) && frameworks.length > 0
      ? Math.round(frameworks.reduce((sum: number, fw: any) => sum + (fw.compliancePercent || 0), 0) / frameworks.length)
      : 0;

    const pack = {
      metrics: metrics.map((m: any) => ({ name: m.name, category: m.category, unit: m.unit, enabled: m.enabled })),
      policySummary: policy ? { status: policy.workflowStatus || "draft", purpose: policy.purpose } : null,
      evidenceCoverage: evidCoverage?.coveragePercent ?? 0,
      compliancePercent: overallCompliance,
      dataQuality: {
        evidenced: evidCoverage?.evidencedCount ?? 0,
        total: evidCoverage?.totalMetrics ?? 0,
      },
    };

    const lines: string[] = [];
    lines.push(hr);
    lines.push(`CUSTOMER PACK - ${companyData?.name || "Company"}`);
    lines.push(`Generated: ${format(new Date(), "dd MMMM yyyy 'at' HH:mm")}`);
    lines.push(hr);
    lines.push("");
    lines.push("METRIC SUMMARY");
    lines.push(sr);
    lines.push(`${"Metric".padEnd(35)} ${"Category".padEnd(15)} ${"Unit".padEnd(10)}`);
    lines.push("-".repeat(60));
    const enabledMetrics = pack.metrics.filter((m: any) => m.enabled !== false);
    if (enabledMetrics.length === 0) {
      lines.push("  No metrics configured.");
    } else {
      enabledMetrics.forEach((m: any) => {
        lines.push(`${(m.name || "").padEnd(35)} ${(m.category || "").padEnd(15)} ${(m.unit || "").padEnd(10)}`);
      });
    }
    lines.push("");
    lines.push("POLICY SUMMARY");
    lines.push(sr);
    if (pack.policySummary) {
      lines.push(`Status: ${pack.policySummary.status === "published" ? "Published" : "Draft"}`);
      if (pack.policySummary.purpose) lines.push(`Purpose: ${pack.policySummary.purpose}`);
    } else {
      lines.push("  No policy configured.");
    }
    lines.push("");
    lines.push("DATA QUALITY INDICATORS");
    lines.push(sr);
    lines.push(`Evidence Coverage: ${pack.evidenceCoverage}%`);
    lines.push(`Compliance: ${pack.compliancePercent}%`);
    lines.push(`Evidenced Metrics: ${pack.dataQuality.evidenced} of ${pack.dataQuality.total}`);
    lines.push("");
    lines.push(hr);

    downloadTextFile(lines.join("\n"), `customer-pack-${format(new Date(), "yyyy-MM-dd")}.txt`);
    toast({ title: "Customer Pack exported" });
  };

  const exportComplianceSummary = () => {
    const hr = "=".repeat(60);
    const sr = "-".repeat(40);
    const frameworks = complianceStatus || [];

    const pack = Array.isArray(frameworks)
      ? frameworks.map((fw: any) => ({
          name: fw.name,
          compliancePercent: fw.compliancePercent || 0,
          requirements: (fw.requirements || []).map((r: any) => ({
            code: r.code, title: r.title, isMet: r.isMet,
          })),
        }))
      : [];

    const lines: string[] = [];
    lines.push(hr);
    lines.push(`COMPLIANCE SUMMARY - ${companyData?.name || "Company"}`);
    lines.push(`Generated: ${format(new Date(), "dd MMMM yyyy 'at' HH:mm")}`);
    lines.push(hr);
    lines.push("");

    if (pack.length === 0) {
      lines.push("No compliance frameworks configured.");
    } else {
      pack.forEach((fw: any) => {
        lines.push(`${fw.name} (${fw.compliancePercent}% met)`);
        lines.push(sr);
        if (fw.requirements.length === 0) {
          lines.push("  No requirements defined.");
        } else {
          fw.requirements.forEach((r: any) => {
            const status = r.isMet ? "[MET]" : "[UNMET]";
            lines.push(`  ${status} ${r.code} - ${r.title}`);
          });
        }
        lines.push("");
      });
    }
    lines.push(hr);

    downloadTextFile(lines.join("\n"), `compliance-summary-${format(new Date(), "yyyy-MM-dd")}.txt`);
    toast({ title: "Compliance Summary exported" });
  };

  const exportAssurancePack = async () => {
    setExportingAssurance(true);
    try {
      const res = await apiRequest("GET", "/api/assurance-pack");
      const data = await res.json();

      const hr = "=".repeat(60);
      const sr = "-".repeat(40);

      const pack = {
        auditLogs: data.auditLogs || [],
        approvalHistory: data.approvalHistory || [],
        evidenceHistory: data.evidenceHistory || [],
        policyVersions: data.policyVersions || [],
        periodSubmissions: data.periodSubmissions || [],
      };

      const lines: string[] = [];
      lines.push(hr);
      lines.push(`ASSURANCE PACK - ${companyData?.name || "Company"}`);
      lines.push(`Generated: ${format(new Date(), "dd MMMM yyyy 'at' HH:mm")}`);
      lines.push(hr);
      lines.push("");

      lines.push("1. AUDIT LOGS");
      lines.push(sr);
      if (pack.auditLogs.length === 0) {
        lines.push("  No audit logs recorded.");
      } else {
        pack.auditLogs.forEach((log: any) => {
          const ts = log.createdAt ? format(new Date(log.createdAt), "dd MMM yyyy HH:mm") : "";
          lines.push(`  [${ts}] ${log.actor || log.userId} - ${log.action} ${log.entityType ? `(${log.entityType})` : ""}`);
        });
      }
      lines.push("");

      lines.push("2. APPROVAL HISTORY");
      lines.push(sr);
      if (pack.approvalHistory.length === 0) {
        lines.push("  No approval history recorded.");
      } else {
        pack.approvalHistory.forEach((entry: any) => {
          const ts = entry.createdAt ? format(new Date(entry.createdAt), "dd MMM yyyy HH:mm") : "";
          lines.push(`  [${ts}] ${entry.actor || entry.userId} - ${entry.action} ${entry.entityType ? `(${entry.entityType})` : ""}`);
        });
      }
      lines.push("");

      lines.push("3. EVIDENCE HISTORY");
      lines.push(sr);
      if (pack.evidenceHistory.length === 0) {
        lines.push("  No evidence files recorded.");
      } else {
        pack.evidenceHistory.forEach((ev: any) => {
          const uploaded = ev.uploadedAt ? format(new Date(ev.uploadedAt), "dd MMM yyyy") : "";
          const expiry = ev.expiryDate ? format(new Date(ev.expiryDate), "dd MMM yyyy") : "N/A";
          lines.push(`  ${ev.fileName} - Status: ${ev.status || "uploaded"} - Module: ${ev.linkedModule || "N/A"} - Uploaded: ${uploaded} - Expires: ${expiry}`);
        });
      }
      lines.push("");

      lines.push("4. POLICY VERSIONS");
      lines.push(sr);
      if (pack.policyVersions.length === 0) {
        lines.push("  No policy versions recorded.");
      } else {
        pack.policyVersions.forEach((v: any) => {
          const ts = v.createdAt ? format(new Date(v.createdAt), "dd MMM yyyy HH:mm") : "";
          lines.push(`  Version ${v.versionNumber} - Created: ${ts} - Sections: ${(v.sections || []).join(", ") || "N/A"}`);
        });
      }
      lines.push("");

      lines.push("5. PERIOD SUBMISSIONS");
      lines.push(sr);
      if (pack.periodSubmissions.length === 0) {
        lines.push("  No period submissions recorded.");
      } else {
        pack.periodSubmissions.forEach((ps: any) => {
          lines.push(`  ${ps.period}: ${ps.totalValues} values (Approved: ${ps.approved}, Submitted: ${ps.submitted}, Draft: ${ps.draft})`);
        });
      }
      lines.push("");
      lines.push(hr);

      downloadTextFile(lines.join("\n"), `assurance-pack-${format(new Date(), "yyyy-MM-dd")}.txt`);
      toast({ title: "Assurance Pack exported" });
    } catch {
      toast({ title: "Failed to export Assurance Pack", variant: "destructive" });
    } finally {
      setExportingAssurance(false);
    }
  };

  const submitReportMutation = useMutation({
    mutationFn: async (reportId: string) => {
      await apiRequest("POST", "/api/workflow/submit", { entityType: "report", entityIds: [reportId] });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reports"] });
      toast({ title: "Report submitted for review" });
    },
    onError: (e: any) => toast({ title: "Submit failed", description: e.message, variant: "destructive" }),
  });

  const reviewReportMutation = useMutation({
    mutationFn: async ({ reportId, action }: { reportId: string; action: "approve" | "reject" }) => {
      const comment = window.prompt(`Enter a comment for ${action}:`) || "";
      await apiRequest("POST", "/api/workflow/review", {
        entityType: "report",
        entityId: reportId,
        action,
        comment,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reports"] });
      toast({ title: "Review action completed" });
    },
    onError: (e: any) => toast({ title: "Review failed", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <PageGuidance
        pageKey="reports"
        title="ESG Reports — what this page does"
        summary="This page generates structured ESG reports from your data, policies, and evidence. Use them for board meetings, bank or investor requests, procurement questionnaires, or public sustainability disclosures."
        goodLooksLike="At least one report generated and shared per quarter, covering the metrics and policies most relevant to your audience."
        steps={[
          "Choose the report template that matches your audience (board, supply chain, etc.)",
          "Select the time period and the data you want to include",
          "Generate the report and review it before sharing",
          "Download as PDF or share a link directly with stakeholders",
        ]}
      />
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2" data-testid="text-page-title">
          <Download className="w-5 h-5 text-primary" />
          ESG Reports
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Generate structured ESG reports for internal review or external stakeholders
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-1.5">
                Report Type
                <EsgTooltip term="framework" />
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {REPORT_TEMPLATES.map(t => {
                const isLocked = !isPro && t.id !== "management";
                return (
                <div
                  key={t.id}
                  onClick={() => !isLocked && handleTemplateChange(t.id)}
                  className={`p-3 rounded-md border transition-colors ${isLocked ? "opacity-60 cursor-not-allowed bg-muted/30" : "cursor-pointer"} ${selectedTemplate === t.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}
                  data-testid={`template-${t.id}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-base">{(t as any).icon}</span>
                      <div>
                        <p className="text-sm font-medium flex items-center gap-1.5">
                          {t.label}
                          {isLocked && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded border border-amber-400 text-amber-700 dark:border-amber-600 dark:text-amber-400">Pro</span>}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">{t.description}</p>
                      </div>
                    </div>
                    {selectedTemplate === t.id && (
                      <div className="w-4 h-4 rounded-full bg-primary flex items-center justify-center shrink-0 mt-0.5">
                        <Check className="w-2.5 h-2.5 text-primary-foreground" />
                      </div>
                    )}
                  </div>
                  {selectedTemplate === t.id && (
                    <div className="flex items-center gap-3 mt-2 pt-2 border-t border-primary/20">
                      <span className="text-xs text-muted-foreground">
                        <span className="font-medium">For:</span> {(t as any).audience}
                      </span>
                      <span className="text-xs text-muted-foreground">{(t as any).timeEstimate}</span>
                    </div>
                  )}
                </div>
                );
              })}
            </CardContent>
          </Card>

          <EvidenceCoverageCard />

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Report Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {hasMultipleSites && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Report Scope</Label>
                  <Select value={reportScopeId} onValueChange={(v) => { setReportScopeId(v); setReportData(null); }}>
                    <SelectTrigger data-testid="select-report-scope"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__org__">Whole organisation</SelectItem>
                      {activeSites.length > 0 && (
                        <>
                          <div className="px-2 py-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Active Sites</div>
                          {activeSites.map((s: any) => (
                            <SelectItem key={s.id} value={s.id} data-testid={`option-report-scope-${s.id}`}>{s.name}</SelectItem>
                          ))}
                        </>
                      )}
                      {archivedSites.length > 0 && (
                        <>
                          <div className="px-2 py-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Archived Sites</div>
                          {archivedSites.map((s: any) => (
                            <SelectItem key={s.id} value={s.id} data-testid={`option-report-scope-${s.id}`}>{s.name} (Archived)</SelectItem>
                          ))}
                        </>
                      )}
                    </SelectContent>
                  </Select>
                  {reportScopeId !== "__org__" && archivedSites.some((s: any) => s.id === reportScopeId) && (
                    <p className="text-[11px] text-amber-600 dark:text-amber-400">Reporting on archived site — historical data only</p>
                  )}
                </div>
              )}

              <div className="space-y-1.5">
                <Label className="text-xs">Reporting Period</Label>
                <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                  <SelectTrigger data-testid="select-report-period"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {periods.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Export Format</Label>
                <Select value={reportType} onValueChange={setReportType}>
                  <SelectTrigger data-testid="select-report-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pdf">PDF Document</SelectItem>
                    <SelectItem value="word">Word Document</SelectItem>
                    <SelectItem value="csv">CSV Data</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Separator />

              <div className="space-y-2.5">
                <Label className="text-xs font-medium">Report Sections</Label>
                {SECTIONS.map(({ key, label, icon: Icon }) => (
                  <div key={key} className="flex items-center gap-2">
                    <Checkbox
                      id={key}
                      checked={(effectiveSections as any)[key]}
                      onCheckedChange={() => toggleSection(key)}
                      data-testid={`checkbox-${key}`}
                    />
                    <Label htmlFor={key} className="text-xs cursor-pointer flex items-center gap-1.5">
                      <Icon className="w-3 h-3 text-muted-foreground" />
                      {label}
                    </Label>
                  </div>
                ))}
              </div>

              {can("report_generation") && (
                <>
                  {!activation.isLoading && !activation.isError && !activation.hasAddedData && (
                    <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-md px-3 py-2">
                      <strong>Data required:</strong> add figures in Data Entry before generating a report.{" "}
                      <Link href="/data-entry" className="underline font-medium">Go to Data Entry →</Link>
                    </p>
                  )}
                  <Button
                    className="w-full"
                    onClick={() => generateMutation.mutate()}
                    disabled={generateMutation.isPending || activation.isLoading || !activation.hasAddedData}
                    data-testid="button-generate-report"
                    title={!activation.isLoading && !activation.hasAddedData ? "Add data in Data Entry first" : undefined}
                  >
                    <FileText className="w-3.5 h-3.5 mr-1.5" />
                    {generateMutation.isPending ? "Generating..." : "Generate Report"}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2 space-y-4">
          {reportData ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-medium">Report Preview</h2>
                  <p className="text-xs text-muted-foreground">{templateConfig.label} — {selectedPeriod}</p>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Button size="sm" variant="outline" onClick={exportCsv} disabled={!reportData?.values?.length} data-testid="button-export-csv">
                    <FileDown className="w-3.5 h-3.5 mr-1.5" />
                    CSV
                  </Button>
                  <Button size="sm" variant="outline" onClick={exportReport} data-testid="button-export-report">
                    <Download className="w-3.5 h-3.5 mr-1.5" />
                    Text
                  </Button>
                  {isPro ? (
                    <>
                      <Button
                        size="sm"
                        onClick={() => handleGenerateFile("pdf")}
                        disabled={generateFileMutation.isPending || !latestReportId}
                        data-testid="button-download-pdf"
                      >
                        <FileDown className="w-3.5 h-3.5 mr-1.5" />
                        {generateFileMutation.isPending && generateFileMutation.variables?.format === "pdf" ? "Generating..." : "PDF"}
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleGenerateFile("docx")}
                        disabled={generateFileMutation.isPending || !latestReportId}
                        data-testid="button-download-docx"
                      >
                        <FileDown className="w-3.5 h-3.5 mr-1.5" />
                        {generateFileMutation.isPending && generateFileMutation.variables?.format === "docx" ? "Generating..." : "DOCX"}
                      </Button>
                    </>
                  ) : (
                    <UpgradeButton
                      feature="Report Export"
                      size="sm"
                      valueMessage="Share boardroom-ready reports with your board, investors, or lenders."
                      data-testid="button-download-upgrade"
                    >
                      Download PDF / DOCX
                    </UpgradeButton>
                  )}
                </div>
              </div>
              <ReportPreview data={reportData} sections={effectiveSections} />
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 border border-dashed border-border rounded-md space-y-3 text-center px-6" data-testid="empty-state-report-preview">
              <FileText className="w-10 h-10 text-muted-foreground/50" />
              <div>
                <p className="text-sm font-medium">No report generated yet</p>
                {(activation.isLoading || activation.isError) ? (
                  <Skeleton className="h-4 w-48 mt-2 mx-auto" />
                ) : !activation.hasAddedData ? (
                  <>
                    <p className="text-xs text-muted-foreground mt-1">
                      <strong>Missing: data entry</strong> — you need at least one month of figures before you can generate a report.
                      {!activation.hasUploadedEvidence && " Once you've added data, also upload an evidence file to improve report quality."}
                    </p>
                    <Link href="/data-entry">
                      <Button size="sm" variant="outline" className="mt-3" data-testid="button-report-empty-add-data">
                        Go to Data Entry
                      </Button>
                    </Link>
                  </>
                ) : (
                  <>
                    <p className="text-xs text-muted-foreground mt-1">Your data is ready. Select a template on the left and click Generate Report to create your first ESG report.</p>
                    <Button
                      size="sm"
                      variant="default"
                      className="mt-3"
                      data-testid="button-report-empty-generate"
                      disabled={generateMutation.isPending}
                      onClick={() => generateMutation.mutate()}
                    >
                      {generateMutation.isPending ? "Generating..." : "Generate report now"}
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Clock className="w-4 h-4" />
          Report History
        </h2>
        {isLoading ? (
          <Skeleton className="h-24" />
        ) : reports.length === 0 ? (
          <EmptyState
            icon={FileText}
            title={activeSite ? `No reports for ${activeSite.name} yet` : "No reports generated yet"}
            description="Generate your first ESG report using the form above. Reports summarise your performance and can be shared with customers, lenders, or your own team."
            helpText="Tip: you need at least one period of data entered before you can generate a meaningful report."
          />
        ) : (
          <div className="space-y-2">
            {reports.map((report: any) => (
              <div key={report.id} className="flex flex-wrap items-center gap-3 p-3 rounded-md border border-border" data-testid={`report-history-${report.id}`}>
                <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">
                    {REPORT_TEMPLATES.find(t => t.id === report.reportTemplate)?.label || "ESG Report"} — {report.period || "All Periods"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Generated {format(new Date(report.generatedAt), "dd MMM yyyy 'at' HH:mm")}
                  </p>
                </div>
                <WorkflowBadge status={report.workflowStatus} size="sm" />
                <Badge variant="outline" className="text-xs">{report.reportType?.toUpperCase()}</Badge>
                {report.reportTemplate && <Badge variant="secondary" className="text-xs capitalize">{report.reportTemplate}</Badge>}
                {report.siteId && (
                  <Badge variant="outline" className="text-xs flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    {report.siteName || "Site"}
                  </Badge>
                )}
                {report.workflowStatus !== "approved" && report.workflowStatus !== "submitted" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => submitReportMutation.mutate(String(report.id))}
                    disabled={submitReportMutation.isPending}
                    data-testid={`button-submit-report-${report.id}`}
                  >
                    <Send className="w-3.5 h-3.5 mr-1.5" />
                    Send for review
                  </Button>
                )}
                {canApprove && report.workflowStatus === "submitted" && (
                  <>
                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => reviewReportMutation.mutate({ reportId: String(report.id), action: "approve" })}
                      disabled={reviewReportMutation.isPending}
                      data-testid={`button-approve-report-${report.id}`}
                    >
                      <Check className="w-3.5 h-3.5 mr-1.5" />
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => reviewReportMutation.mutate({ reportId: String(report.id), action: "reject" })}
                      disabled={reviewReportMutation.isPending}
                      data-testid={`button-reject-report-${report.id}`}
                    >
                      <X className="w-3.5 h-3.5 mr-1.5" />
                      Reject
                    </Button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {generatedFiles.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <FileDown className="w-4 h-4" />
            Generated Files
          </h2>
          <div className="space-y-2">
            {generatedFiles.map((file: any) => (
              <div key={file.id} className="flex items-center gap-3 p-3 rounded-md border border-border" data-testid={`generated-file-${file.id}`}>
                <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{file.filename}</p>
                  <p className="text-xs text-muted-foreground">
                    {file.fileType?.toUpperCase()} | {file.fileSize ? `${(file.fileSize / 1024).toFixed(1)} KB` : ""} | {file.generatedAt ? format(new Date(file.generatedAt), "dd MMM yyyy 'at' HH:mm") : ""}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleDownloadFile(file.reportRunId, file.id, file.filename)}
                  data-testid={`button-redownload-${file.id}`}
                >
                  <Download className="w-3.5 h-3.5 mr-1.5" />
                  Download
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Download className="w-4 h-4" />
            Export Packs
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Button
              variant="outline"
              onClick={exportBoardPack}
              disabled={isLoading}
              data-testid="button-export-board-pack"
            >
              <Download className="w-3.5 h-3.5 mr-1.5" />
              Board Pack
            </Button>
            <Button
              variant="outline"
              onClick={exportCustomerPack}
              disabled={isLoading}
              data-testid="button-export-customer-pack"
            >
              <Users className="w-3.5 h-3.5 mr-1.5" />
              Customer Pack
            </Button>
            <Button
              variant="outline"
              onClick={exportComplianceSummary}
              disabled={isLoading}
              data-testid="button-export-compliance"
            >
              <Shield className="w-3.5 h-3.5 mr-1.5" />
              Compliance Summary
            </Button>
            <Button
              variant="outline"
              onClick={exportAssurancePack}
              disabled={isLoading || exportingAssurance}
              data-testid="button-export-assurance-pack"
            >
              <FileText className="w-3.5 h-3.5 mr-1.5" />
              Assurance Pack
            </Button>
          </div>
        </CardContent>
      </Card>

      <EsgExportsSection />
    </div>
  );
}