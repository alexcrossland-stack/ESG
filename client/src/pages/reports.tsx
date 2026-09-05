import { useEffect, useState } from "react";
import { useReportingMonth } from "@/hooks/use-reporting-month";
import { useBillingStatus, UpgradeButton } from "@/components/upgrade-prompt";
import { EsgStatusBadge, type EsgStatusData } from "@/components/esg-status-badge";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, authFetch } from "@/lib/queryClient";
import { resolveApiError } from "@/lib/errorResolver";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  Download, FileText, BarChart3, Clock, CheckCircle, Leaf, Users, Shield, FileDown, Send,
  Check, X, AlertTriangle, Factory, ClipboardCheck, Eye, BookOpen, PenLine, TrendingUp,
  Gauge, Scale, ArrowUpDown, MapPin, Target, AlertOctagon, Building2, Network, Sparkles, Info, FileCheck, PartyPopper,
  Loader2, ChevronDown,
} from "lucide-react";
import { ValueSourceBadge } from "@/components/value-source-badge";
import { format, subMonths } from "date-fns";
import { Link } from "wouter";
import { usePermissions } from "@/lib/permissions";
import { WorkflowBadge } from "@/components/workflow-badge";
import { PermissionBanner, OwnershipHint } from "@/components/permission-gate";
import { EvidenceCoverageCard } from "@/components/evidence-coverage-card";
import { useSiteContext } from "@/hooks/use-site-context";
import { EmptyState } from "@/components/empty-state";
import { trackEvent, AnalyticsEvents } from "@/lib/analytics";
import { useActivationState } from "@/hooks/use-activation-state";
import { EsgTooltip } from "@/components/esg-tooltip";
import { ContextualHelpLink } from "@/components/help";
import { ReportReadinessPanel } from "@/components/report-readiness-panel";
import { buildReportPeriodSelection, reportPeriodYears, type ReportPeriodSelection, type ReportPeriodType } from "@shared/report-periods";
import { CURRENT_UK_FACTOR_SOURCE, CURRENT_UK_FACTOR_YEAR } from "@shared/emission-factor-metadata";
import type { ReportTemplateId } from "@shared/report-templates";

type ReportHistoryEntry = {
  id: string;
  period?: string | null;
  periodType?: string | null;
  periodLabel?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  reportType?: string | null;
  reportTemplate?: string | null;
  generatedAt?: string | Date | null;
  workflowStatus?: string | null;
  includePolicy?: boolean | null;
  includeTopics?: boolean | null;
  includeMetrics?: boolean | null;
  includeActions?: boolean | null;
  includeSummary?: boolean | null;
  includeCarbon?: boolean | null;
  includeEvidence?: boolean | null;
  includeMethodology?: boolean | null;
  includeSignoff?: boolean | null;
  includePeriodComparison?: boolean | null;
  generatedBy?: string | null;
  generatedByName?: string | null;
  companyName?: string | null;
  reportData?: any;
  siteId?: string | null;
  siteName?: string | null;
  latestFileId?: string | null;
  latestFilename?: string | null;
  latestFileType?: string | null;
  latestFileSize?: number | null;
  latestFileGeneratedAt?: string | Date | null;
  latestDownloadUrl?: string | null;
  fileAvailability?: "available" | "unavailable" | null;
  fileUnavailableReason?: "expired" | "missing" | "retained_history_only" | null;
  trendMetadata?: {
    currentPeriod?: string | null;
    currentPeriodLabel?: string | null;
    previousPeriod?: string | null;
    previousPeriodLabel?: string | null;
    comparisonLabel?: string | null;
    availableComparisons?: number;
    unavailableComparisons?: number;
  } | null;
};

type DownloadableHistoryEntry = ReportHistoryEntry & {
  latestFileId: string;
  latestFilename?: string | null;
  latestDownloadUrl: string;
};

type SavedReportingPeriod = {
  id: string;
  name: string;
  periodType: ReportPeriodType;
  startDate: string | Date;
  endDate: string | Date;
  status?: string | null;
};

function reportingPeriodDate(value: string | Date): string {
  if (typeof value === "string") {
    const calendarDate = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (calendarDate) return calendarDate[1];
  }
  return format(new Date(value), "yyyy-MM-dd");
}

type ReportLibraryResponse = {
  reports: ReportHistoryEntry[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
};

const ESG_EXPORT_TYPES = [
  {
    id: "esg_metrics_summary",
    label: "ESG Metrics Summary",
    description: "A full breakdown of all your tracked metrics, showing which are measured, estimated, or missing",
    icon: BarChart3,
    color: "text-green-600",
  },
  {
    id: "framework_readiness_summary",
    label: "Framework Readiness Summary",
    description: "See how your data lines up with common ESG frameworks — no certification required",
    icon: Network,
    color: "text-blue-600",
  },
  {
    id: "target_progress_summary",
    label: "Target Progress Summary",
    description: "See how you're progressing against your ESG targets across environment, social, and governance",
    icon: Target,
    color: "text-purple-600",
  },
  {
    id: "policy_register_summary",
    label: "Policy Register Summary",
    description: "A list of all your ESG policies with their status, owner, and when they were last reviewed",
    icon: FileText,
    color: "text-amber-600",
  },
  {
    id: "risk_register_summary",
    label: "Risk Register Summary",
    description: "Your ESG risks in one place — with likelihood, impact, and what you're doing to manage them",
    icon: AlertOctagon,
    color: "text-red-600",
  },
  {
    id: "site_comparison_summary",
    label: "Site Comparison Summary",
    description: "Compare ESG performance across all your sites in one view",
    icon: Building2,
    color: "text-indigo-600",
  },
];

const REPORT_MONTHS = [
  { value: 1, label: "January" },
  { value: 2, label: "February" },
  { value: 3, label: "March" },
  { value: 4, label: "April" },
  { value: 5, label: "May" },
  { value: 6, label: "June" },
  { value: 7, label: "July" },
  { value: 8, label: "August" },
  { value: 9, label: "September" },
  { value: 10, label: "October" },
  { value: 11, label: "November" },
  { value: 12, label: "December" },
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
  const { data: savedReportingPeriods = [] } = useQuery<Array<{
    id: string;
    name: string;
    periodType?: string | null;
    status?: string | null;
  }>>({ queryKey: ["/api/reporting-periods"] });
  const [selectedSite, setSelectedSite] = useState<string>("all-sites");

  const periods = generatePeriods();
  const frameworkPeriodOptions = [
    ...savedReportingPeriods.map((reportingPeriod) => ({
      value: reportingPeriod.id,
      label: reportingPeriod.name,
    })),
    ...periods
      .filter((calendarPeriod) => !savedReportingPeriods.some((reportingPeriod) => reportingPeriod.name === calendarPeriod))
      .map((calendarPeriod) => ({ value: calendarPeriod, label: calendarPeriod })),
  ];
  const selectedExportPeriodLabel = frameworkPeriodOptions.find((periodOption) => periodOption.value === selectedPeriod)?.label
    ?? selectedPeriod;

  const handleExport = async () => {
    if (selectedType === "framework_readiness_summary" && (!selectedPeriod || selectedPeriod === "all")) {
      toast({
        title: "Choose a reporting period",
        description: "Framework readiness must be calculated for one reporting period.",
        variant: "destructive",
      });
      return;
    }
    setExporting(true);
    try {
      const body: any = {
        format: selectedFormat,
        period: (!useDateRange && selectedPeriod && selectedPeriod !== "all") ? selectedPeriod : undefined,
        siteId: selectedSite === "organisation-only"
          ? "__org__"
          : selectedSite && selectedSite !== "all-sites"
            ? selectedSite
            : undefined,
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
  const showSiteScope = selectedType === "esg_metrics_summary"
    || selectedType === "framework_readiness_summary"
    || selectedType === "site_comparison_summary";
  const frameworkPeriodOnly = selectedType === "framework_readiness_summary";

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
                onClick={() => {
                  setSelectedType(t.id);
                  if (t.id === "framework_readiness_summary") {
                    setUseDateRange(false);
                    if (!selectedPeriod || selectedPeriod === "all") {
                      setSelectedPeriod(frameworkPeriodOptions[0]?.value ?? format(new Date(), "yyyy-MM"));
                    }
                  } else if (savedReportingPeriods.some((reportingPeriod) => reportingPeriod.id === selectedPeriod)) {
                    setSelectedPeriod("all");
                  }
                }}
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
                disabled={frameworkPeriodOnly}
                title={frameworkPeriodOnly ? "Framework readiness is evaluated against a reporting period, not an arbitrary date range." : undefined}
                data-testid="button-scope-daterange"
                className={`px-2.5 py-1 rounded-md border text-xs disabled:cursor-not-allowed disabled:opacity-50 ${useDateRange ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/50"}`}
              >
                Date Range
              </button>
            </div>
            {frameworkPeriodOnly && (
              <p className="text-xs text-muted-foreground">
                Framework readiness is period-specific so evidence and responses cannot be credited outside their reporting period.
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {!useDateRange ? (
              <div>
                <Label className="text-xs mb-1.5 block">Reporting Period</Label>
                <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                  <SelectTrigger data-testid="select-export-period" className="h-8 text-xs">
                    <SelectValue placeholder={frameworkPeriodOnly ? "Choose period" : "All periods"} />
                  </SelectTrigger>
                  <SelectContent>
                    {!frameworkPeriodOnly && <SelectItem value="all">All periods</SelectItem>}
                    {(frameworkPeriodOnly
                      ? frameworkPeriodOptions
                      : periods.map((calendarPeriod) => ({ value: calendarPeriod, label: calendarPeriod }))
                    ).map((periodOption) => (
                      <SelectItem key={periodOption.value} value={periodOption.value}>{periodOption.label}</SelectItem>
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
                    <SelectItem value="all-sites">Whole organisation (org + active sites)</SelectItem>
                    <SelectItem value="organisation-only">Organisation records only</SelectItem>
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
              {!useDateRange && selectedPeriod && selectedPeriod !== "all" && ` · ${selectedExportPeriodLabel}`}
              {useDateRange && dateFrom && ` · ${dateFrom}`}
              {useDateRange && dateTo && ` to ${dateTo}`}
              {selectedSite === "organisation-only" && " · Organisation records only"}
              {selectedSite && selectedSite !== "all-sites" && selectedSite !== "organisation-only" && " · Single site"}
              {` · ${selectedFormat.toUpperCase()}`}
            </div>
            <Button
              size="sm"
              onClick={handleExport}
              disabled={exporting || (useDateRange && (!dateFrom || !dateTo)) || (frameworkPeriodOnly && (!selectedPeriod || selectedPeriod === "all"))}
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

const REPORT_TEMPLATES: Array<{
  id: ReportTemplateId;
  label: string;
  description: string;
  audience: string;
  timeEstimate: string;
  icon: string;
  defaults: Record<string, boolean>;
}> = [
  {
    id: "vsme",
    label: "VSME Readiness & Draft Pack",
    description: "A draft VSME-aligned pack with visible requirement gaps and evidence status; not a completed statutory disclosure",
    audience: "Customers, banks, investors",
    timeEstimate: "~3 min",
    icon: "🌱",
    defaults: { includeSummary: true, includePolicy: true, includeTopics: true, includeMetrics: true, includeCarbon: true, includeActions: true, includeEvidence: true, includeMethodology: true, includeSignoff: true, includeDataQualityAssessment: true, includeComplianceStatus: true, includePeriodComparison: true },
  },
  {
    id: "ppn006",
    label: "PPN 006 Readiness Pack",
    description: "A UK procurement readiness pack for Carbon Reduction Plan inputs; it identifies missing requirements and is not a compliance certificate",
    audience: "UK public procurement teams",
    timeEstimate: "~3 min",
    icon: "🇬🇧",
    defaults: { includeSummary: true, includePolicy: false, includeTopics: false, includeMetrics: true, includeCarbon: true, includeActions: true, includeEvidence: true, includeMethodology: true, includeSignoff: true, includeDataQualityAssessment: true, includeComplianceStatus: true, includePeriodComparison: true },
  },
  {
    id: "annual",
    label: "Annual ESG Report",
    description: "A year-end report covering ESG performance, evidence, actions and data-quality limitations",
    audience: "Management, customers, lenders",
    timeEstimate: "~3 min",
    icon: "📅",
    defaults: { includeSummary: true, includePolicy: true, includeTopics: true, includeMetrics: true, includeCarbon: true, includeActions: true, includeEvidence: true, includeMethodology: true, includeSignoff: true, includeDataQualityAssessment: true, includeComplianceStatus: true, includePeriodComparison: true },
  },
  {
    id: "board",
    label: "Board Summary",
    description: "A concise overview of your ESG performance for your board or investors",
    audience: "Board, investors, executives",
    timeEstimate: "~2 min",
    icon: "🏛️",
    defaults: { includeSummary: true, includePolicy: false, includeTopics: false, includeMetrics: true, includeCarbon: true, includeActions: true, includeEvidence: false, includeMethodology: false, includeSignoff: true, includeDataQualityAssessment: false, includeComplianceStatus: false, includePeriodComparison: true },
  },
  {
    id: "customer",
    label: "Customer Response Pack",
    description: "A quick ESG summary for customers or procurement teams asking about your sustainability",
    audience: "Customers, procurement teams",
    timeEstimate: "~2 min",
    icon: "📦",
    defaults: { includeSummary: true, includePolicy: true, includeTopics: true, includeMetrics: true, includeCarbon: true, includeActions: false, includeEvidence: true, includeMethodology: false, includeSignoff: false, includeDataQualityAssessment: false, includeComplianceStatus: false, includePeriodComparison: false },
  },
  {
    id: "compliance",
    label: "Framework Readiness Summary",
    description: "A transparent view of ready, in-progress, and missing framework requirements",
    audience: "Advisers, auditors, management",
    timeEstimate: "~3 min",
    icon: "⚖️",
    defaults: { includeSummary: true, includePolicy: true, includeTopics: false, includeMetrics: true, includeCarbon: true, includeActions: false, includeEvidence: true, includeMethodology: true, includeSignoff: true, includeDataQualityAssessment: true, includeComplianceStatus: true, includePeriodComparison: false },
  },
  {
    id: "management",
    label: "Full ESG Report",
    description: "A full report covering everything — environmental, social, and governance",
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
  { key: "includeComplianceStatus", label: "Framework Readiness", icon: Scale },
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

function reportTemplateLabel(template?: string | null) {
  return REPORT_TEMPLATES.find(t => t.id === template)?.label || "ESG Report";
}

function reportLibraryTitle(report: ReportHistoryEntry) {
  return report.reportData?.reportTitle || `${reportTemplateLabel(report.reportTemplate)} — ${report.periodLabel || report.period || "All Periods"}`;
}

function reportSectionsFromEntry(report: ReportHistoryEntry) {
  const templateDefaults = REPORT_TEMPLATES.find(t => t.id === report.reportTemplate)?.defaults || REPORT_TEMPLATES[0].defaults;
  return {
    ...templateDefaults,
    includePolicy: report.includePolicy ?? templateDefaults.includePolicy,
    includeTopics: report.includeTopics ?? templateDefaults.includeTopics,
    includeMetrics: report.includeMetrics ?? templateDefaults.includeMetrics,
    includeActions: report.includeActions ?? templateDefaults.includeActions,
    includeSummary: report.includeSummary ?? templateDefaults.includeSummary,
    includeCarbon: report.includeCarbon ?? templateDefaults.includeCarbon,
    includeEvidence: report.includeEvidence ?? templateDefaults.includeEvidence,
    includeMethodology: report.includeMethodology ?? templateDefaults.includeMethodology,
    includeSignoff: report.includeSignoff ?? templateDefaults.includeSignoff,
    includeDataQualityAssessment: report.reportData?.dataQualityAssessment ? templateDefaults.includeDataQualityAssessment : false,
    includeComplianceStatus: report.reportData?.complianceStatus ? templateDefaults.includeComplianceStatus : false,
    includePeriodComparison: (report.reportData?.trendSummary || report.reportData?.periodComparison)
      ? (report.includePeriodComparison ?? true)
      : false,
  };
}

function historicalMetricCount(reportData: any) {
  if (Array.isArray(reportData?.values)) return reportData.values.length;
  if (reportData?.metricsByCategory && typeof reportData.metricsByCategory === "object") {
    return Object.values(reportData.metricsByCategory).reduce((total: number, values: any) => (
      total + (Array.isArray(values) ? values.length : 0)
    ), 0);
  }
  return 0;
}

function historicalEvidenceCount(reportData: any) {
  if (typeof reportData?.evidenceCoverage?.totalEvidence === "number") return reportData.evidenceCoverage.totalEvidence;
  if (Array.isArray(reportData?.evidence)) return reportData.evidence.length;
  return 0;
}

function historicalEnabledSectionCount(report: ReportHistoryEntry) {
  return Object.values(reportSectionsFromEntry(report)).filter(Boolean).length;
}

function reportFileUnavailableMessage(reason?: string | null) {
  if (reason === "expired") {
    return "The generated file has expired, but the historical report snapshot can still be viewed and regenerated when permitted.";
  }
  if (reason === "retained_history_only") {
    return "The history entry remains for audit purposes, but the file is no longer available.";
  }
  return "No current file is available for this report entry.";
}

function StatusBadge({ status }: { status: string }) {
  if (status === "Approved") return <Badge className="text-[10px] bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-0">{status}</Badge>;
  if (status === "Submitted") return <Badge className="text-[10px] bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 border-0">{status}</Badge>;
  return <Badge variant="secondary" className="text-[10px]">{status}</Badge>;
}

function SourceBadge({ label }: { label: string }) {
  if (label === "Evidenced") return <Badge className="text-[10px] bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-0">{label}</Badge>;
  if (label === "Estimated") return <Badge className="text-[10px] bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 border-0">{label}</Badge>;
  if (label === "Derived") return <Badge className="text-[10px] bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 border-0">{label}</Badge>;
  return <Badge variant="secondary" className="text-[10px]">{label}</Badge>;
}

function TrafficDot({ status }: { status: string }) {
  const color = status === "green" ? "bg-green-500" : status === "amber" ? "bg-amber-500" : status === "red" ? "bg-red-500" : "bg-gray-300";
  return <span className={`inline-block w-2 h-2 rounded-full ${color}`} />;
}

function formatTrendDisplayValue(value: unknown, unit?: string | null) {
  if (value === null || value === undefined || value === "") return "—";
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return String(value);
  const formatted = Math.abs(numeric) >= 100
    ? numeric.toLocaleString(undefined, { maximumFractionDigits: 1 })
    : numeric.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return unit ? `${formatted} ${unit}` : formatted;
}

function trendReasonLabel(reason?: string) {
  switch (reason) {
    case "missing_current": return "No current-period data available";
    case "missing_previous": return "No prior-period data available";
    case "not_applicable_yes_no": return "Not applicable for Yes/No metric";
    case "non_numeric": return "Trend unavailable for non-numeric value";
    case "zero_previous": return "Percentage change unavailable because the prior value is zero";
    default: return "Trend unavailable";
  }
}

function ReportTrendSections({ trendSummary }: { trendSummary: any }) {
  if (!trendSummary) return null;
  const available = Array.isArray(trendSummary.metrics)
    ? trendSummary.metrics.filter((trend: any) => trend?.reason === "ok")
    : [];
  const unavailable = Array.isArray(trendSummary.unavailable) ? trendSummary.unavailable : [];
  const notes = Array.isArray(trendSummary.notes) ? trendSummary.notes : [];
  const visibleUnavailable = unavailable.slice(0, Math.max(0, 8 - Math.min(8, available.length)));

  return (
    <div data-testid="section-trend-summary" className="space-y-4">
      <div>
        <h2 className="font-semibold text-base mb-2 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-primary" />
          Trend Summary
        </h2>
        <div className="grid grid-cols-3 gap-3 text-xs">
          <div className="bg-muted/50 rounded-md p-3">
            <p className="text-muted-foreground">Comparison</p>
            <p className="font-medium" data-testid="text-report-trend-comparison">
              {trendSummary.comparisonLabel || "Compared with previous period"}
            </p>
            <p className="text-muted-foreground mt-1">
              {trendSummary.currentPeriodLabel || trendSummary.currentPeriod || "Current period"} vs {trendSummary.previousPeriodLabel || trendSummary.previousPeriod || "previous period"}
            </p>
          </div>
          <div className="bg-muted/50 rounded-md p-3">
            <p className="text-muted-foreground">Improvements</p>
            <p className="font-semibold text-lg">{trendSummary.improvements?.length || 0}</p>
          </div>
          <div className="bg-muted/50 rounded-md p-3">
            <p className="text-muted-foreground">Worsening areas</p>
            <p className="font-semibold text-lg">{trendSummary.worsening?.length || 0}</p>
          </div>
        </div>
      </div>

      {available.length > 0 && (
        <div data-testid="section-metric-trends">
          <h3 className="text-xs font-semibold text-muted-foreground mb-1.5">Metric Trends</h3>
          <div className="border border-border rounded-md overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/50">
                  <th className="text-left p-2 font-medium">Metric</th>
                  <th className="text-right p-2 font-medium">Previous</th>
                  <th className="text-right p-2 font-medium">Current</th>
                  <th className="text-right p-2 font-medium">Change</th>
                  <th className="text-left p-2 font-medium">Direction</th>
                </tr>
              </thead>
              <tbody>
                {available.slice(0, 12).map((trend: any, i: number) => (
                  <tr key={trend.metricId || trend.metricName || i} className="border-t border-border">
                    <td className="p-2">{trend.metricName || "Metric"}</td>
                    <td className="p-2 text-right text-muted-foreground">{formatTrendDisplayValue(trend.previousValue, trend.unit)}</td>
                    <td className="p-2 text-right font-medium">{formatTrendDisplayValue(trend.currentValue, trend.unit)}</td>
                    <td className="p-2 text-right">
                      <span className="font-medium">{formatTrendDisplayValue(trend.absoluteDelta, trend.unit)}</span>
                      {trend.percentageDelta !== null && trend.percentageDelta !== undefined && (
                        <span className="text-muted-foreground ml-1">({Number(trend.percentageDelta).toFixed(1)}%)</span>
                      )}
                    </td>
                    <td className="p-2">
                      <Badge variant="secondary" className="text-[10px]">{trend.changeLabel || trend.direction || "Trend unavailable"}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {available.length > 12 && (
            <p className="text-xs text-muted-foreground mt-1">Showing 12 of {available.length} available metric comparisons.</p>
          )}
        </div>
      )}

      {(notes.length > 0 || visibleUnavailable.length > 0) && (
        <div data-testid="section-trend-notes" className="bg-muted/30 rounded-md p-3 text-xs">
          <h3 className="font-semibold mb-1.5">Trend Notes</h3>
          <ul className="list-disc list-inside space-y-0.5 text-muted-foreground">
            {notes.map((note: string, i: number) => <li key={`note-${i}`}>{note}</li>)}
            {visibleUnavailable.map((trend: any, i: number) => (
              <li key={`unavailable-${trend.metricId || i}`}>
                {trend.metricName || "Metric"}: {trendReasonLabel(trend.reason)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ReportPreview({ data, sections }: { data: any; sections: Record<string, boolean> }) {
  const {
    company, policySummary, selectedTopics, metricsByCategory, values,
    weightedScore, carbonSummary, actionsSummary, dataQualityFlags,
    evidenceCoverage, factorMethodology, period, generatedAt, generatedBy, reportTemplate,
    branding, dataQualityAssessment, complianceStatus, periodComparison, trendSummary,
    reportTitle, dataQualitySummary,
  } = data;

  const templateLabel = reportTitle || (REPORT_TEMPLATES.find(t => t.id === reportTemplate)?.label || "ESG Report");
  const brandColor = branding?.color || undefined;

  return (
    <div className="bg-white dark:bg-card border border-border rounded-md p-8 space-y-6 text-sm max-h-[700px] overflow-y-auto" data-testid="report-preview">
      {dataQualitySummary?.isDraftQuality && (
        <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-md text-xs text-amber-700 dark:text-amber-300 mb-2" data-testid="report-draft-quality-banner">
          <Info className="w-3.5 h-3.5 shrink-0" />
          <span>{dataQualitySummary.methodologyNote}</span>
        </div>
      )}
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
        {dataQualitySummary?.isDraftQuality && (
          <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-600 dark:border-amber-700 dark:text-amber-400" data-testid="badge-draft-report">
            Draft — contains estimated data
          </Badge>
        )}
        <p className="text-xs text-muted-foreground">Reporting Period: {period}</p>
        <p className="text-xs text-muted-foreground">Generated {generatedAt ? format(new Date(generatedAt), "dd MMMM yyyy 'at' HH:mm") : ""} by {generatedBy}</p>
        <div className="flex items-center justify-center gap-2 mt-2">
          <Badge variant="outline" className="text-[10px]">Factor Year: {factorMethodology?.factorYear || CURRENT_UK_FACTOR_YEAR}</Badge>
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
                    <tr key={v.id} className={`border-b border-border/50 ${v.dataSourceLabel === "Estimated" ? "bg-amber-50/50 dark:bg-amber-950/10" : ""}`} data-testid={`row-metric-${v.id}`}>
                      <td className="py-1">
                        <span className="flex items-center gap-1.5">
                          {v.metricName}
                          <ValueSourceBadge
                            source={!v.value && v.value !== 0
                              ? "missing"
                              : v.sourceClassification === "derived" || v.dataSourceLabel === "Derived"
                                ? "derived"
                                : v.sourceClassification === "estimated" || v.dataSourceLabel === "Estimated"
                                  ? "estimated"
                                  : "actual"}
                            explanation={(v.sourceClassification === "estimated" || v.dataSourceLabel === "Estimated") && v.notes ? v.notes : undefined}
                          />
                        </span>
                      </td>
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
                  <li>Emission factors: {factorMethodology?.source || CURRENT_UK_FACTOR_SOURCE} {factorMethodology?.factorYear || CURRENT_UK_FACTOR_YEAR}</li>
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

      {dataQualitySummary && (
        <div data-testid="section-data-quality-methodology" className="bg-muted/30 rounded-md p-4 space-y-2 text-xs">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <Info className="w-3.5 h-3.5 text-primary" />
            Data Quality & Methodology
          </h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="flex items-center gap-2">
              <ValueSourceBadge source="actual" />
              <span className="text-muted-foreground">{dataQualitySummary.actualPercent ?? 0}% of metrics</span>
            </div>
            <div className="flex items-center gap-2">
              <ValueSourceBadge source="derived" />
              <span className="text-muted-foreground">{dataQualitySummary.derivedPercent ?? 0}% of metrics</span>
            </div>
            <div className="flex items-center gap-2">
              <ValueSourceBadge source="estimated" />
              <span className="text-muted-foreground">{dataQualitySummary.estimatedPercent ?? 0}% of metrics</span>
            </div>
            <div className="flex items-center gap-2">
              <ValueSourceBadge source="missing" />
              <span className="text-muted-foreground">{dataQualitySummary.missingPercent ?? 0}% of metrics</span>
            </div>
          </div>
          {dataQualitySummary.methodologyNote && (
            <p className="text-muted-foreground italic mt-2">{dataQualitySummary.methodologyNote}</p>
          )}
          {dataQualitySummary.isDraftQuality && (
            <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-md p-2 text-amber-700 dark:text-amber-300 mt-2">
              <AlertTriangle className="w-3 h-3 inline mr-1" />
              This report has material estimates or gaps. Replace estimates with measured values or well-supported calculations to improve confidence.
            </div>
          )}
        </div>
      )}

      {sections.includeComplianceStatus && complianceStatus && (
        <div data-testid="section-compliance-status">
          <h2 className="font-semibold text-base mb-3 flex items-center gap-2">
            <Scale className="w-4 h-4 text-primary" />
            Framework Readiness
          </h2>
          <p className="text-xs text-muted-foreground mb-3">
            Readiness is based on saved data, review status, and linked evidence. It does not constitute certification, assurance, or legal compliance.
          </p>
          <div className="space-y-3">
            {complianceStatus.map((fw: any) => {
              const readinessPercent = fw.readinessPercent ?? fw.compliancePercent ?? fw.completionPercent ?? 0;
              const readyRequirements = fw.readyRequirements ?? fw.metRequirements ?? 0;
              return (
              <div key={fw.id} className="bg-muted/50 rounded-md p-3 text-xs">
                <div className="flex items-center justify-between mb-2">
                  <p className="font-medium">{fw.name} {fw.version && <span className="text-muted-foreground">(v{fw.version})</span>}</p>
                  <Badge variant={readinessPercent >= 70 ? "default" : "secondary"} className={`text-[10px] ${readinessPercent >= 70 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" : ""}`}>
                    {readinessPercent}% ready
                  </Badge>
                </div>
                <div className="w-full bg-muted rounded-full h-1.5 mb-2">
                  <div className={`h-1.5 rounded-full ${readinessPercent >= 70 ? "bg-emerald-500" : readinessPercent >= 40 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${readinessPercent}%` }} />
                </div>
                <p className="text-muted-foreground">
                  {readyRequirements}/{fw.totalRequirements} ready · {fw.partialRequirements || 0} in progress · {fw.missingRequirements || 0} missing
                </p>
              </div>
              );
            })}
          </div>
        </div>
      )}

      {sections.includePeriodComparison && (trendSummary || periodComparison) && (
        <ReportTrendSections trendSummary={trendSummary || periodComparison} />
      )}

      {sections.includePeriodComparison && periodComparison && !trendSummary && (
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
        <p>This report was generated using SimplyESG. Data is provided by {company?.name}.</p>
        <p>Emission factors: {factorMethodology?.source || CURRENT_UK_FACTOR_SOURCE} {factorMethodology?.factorYear || CURRENT_UK_FACTOR_YEAR}. All data should be independently verified before external disclosure.</p>
      </div>
    </div>
  );
}

function buildTextExport(data: any, sections: Record<string, boolean>, esgMeta?: any): string {
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

  // ── Status label from shared ESG evaluator (same source as UI panel) ──
  const statusLabelMap: Record<string, string> = {
    IN_PROGRESS: "Baseline — In Progress",
    DRAFT: "Baseline — Draft",
    PROVISIONAL: "Provisional",
    CONFIRMED: "Confirmed",
  };
  const esgState: string = esgMeta?.esgState || "DRAFT";
  const statusLabel = statusLabelMap[esgState] || "Draft";
  const completenessPercent: number = esgMeta?.completenessPercent ?? dataQualityFlags?.completenessPercent ?? 0;
  const evidencePercent: number = esgMeta?.evidenceCoveragePercent ?? evidenceCoverage?.coveragePercent ?? 0;
  const estimatedPercent: number = esgMeta?.missingCategories?.estimatedPercent ?? dataQualityFlags?.estimatedPercent ?? 0;

  lines.push(hr);
  lines.push(branding?.name || `${company?.name} - ${templateLabel}`);
  if (branding?.tagline) lines.push(branding.tagline);
  lines.push(`Report Status: ${statusLabel}`);
  lines.push(`Reporting Period: ${period}`);
  lines.push(`Generated: ${generatedAt ? format(new Date(generatedAt), "dd MMMM yyyy HH:mm") : ""} by ${generatedBy}`);
  lines.push(`Factor Year: ${factorMethodology?.factorYear || CURRENT_UK_FACTOR_YEAR} | Source: ${factorMethodology?.source || CURRENT_UK_FACTOR_SOURCE}`);
  lines.push(hr);
  lines.push("");

  // ── Report scope & confidence preamble ──
  lines.push("REPORT SCOPE & CONFIDENCE");
  lines.push(sr);
  const orgName = company?.name || "the organisation";
  lines.push(`Organisation: ${orgName}`);
  lines.push(`Scope: This report covers the ESG performance of ${orgName} for the reporting period ${period}. It includes data from all active sites and organisational-level metric entries.`);
  lines.push(`Data Completeness: ${completenessPercent}%`);
  lines.push(`Evidence Coverage: ${evidencePercent}%`);
  lines.push(`Estimated Values: ${estimatedPercent}%`);
  if (esgState === "CONFIRMED") {
    lines.push(`Confidence: Your data is solid and ready to share. All key metrics are based on real, evidenced figures.`);
  } else if (esgState === "PROVISIONAL") {
    lines.push(`Confidence: Results should be treated as indicative. ${estimatedPercent}% of values are estimated. Pending further data collection.`);
  } else {
    lines.push(`Confidence: This is a ${statusLabel} document. It should not be used for external disclosure without further data improvement.`);
  }
  lines.push("");

  // ── Material caveats ──
  const caveats: string[] = [];
  if (estimatedPercent > 20) {
    caveats.push(`${estimatedPercent}% of metric values are estimated. These should be replaced with direct measurements as data collection matures.`);
  }
  if (evidencePercent < 30) {
    caveats.push("Supporting evidence is available for fewer than 30% of reported metrics. Evidence should be uploaded to strengthen report credibility.");
  }
  if (esgState === "DRAFT" || esgState === "IN_PROGRESS") {
    caveats.push("This is a baseline document intended to establish a starting point for ESG performance tracking. It does not constitute a formal ESG audit or regulatory compliance certificate.");
  }
  if (completenessPercent < 60) {
    caveats.push(`Data completeness is ${completenessPercent}%. Metrics without data are excluded from score calculations.`);
  }
  if (caveats.length > 0) {
    lines.push("MATERIAL CAVEATS");
    lines.push(sr);
    caveats.forEach((c, i) => lines.push(`${i + 1}. ${c}`));
    lines.push("");
  }

  // ── Recommended next steps (from readiness detail if available) ──
  if (esgMeta?.blockingFactors?.length > 0 && esgState !== "CONFIRMED") {
    lines.push("RECOMMENDED IMPROVEMENTS");
    lines.push(sr);
    esgMeta.blockingFactors.forEach((f: string, i: number) => lines.push(`${i + 1}. ${f}`));
    lines.push("");
  }

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
      lines.push(`  - Factors: ${factorMethodology?.source || CURRENT_UK_FACTOR_SOURCE} ${factorMethodology?.factorYear || CURRENT_UK_FACTOR_YEAR}`);
      lines.push("  - Scope 1: Direct (gas, fuel, vehicles)");
      lines.push("  - Scope 2: Indirect energy (grid electricity)");
      lines.push("  - Scope 3: Value chain (travel, commuting, waste)");
    }
    lines.push("\nData Source Definitions:");
    lines.push("  - Evidenced: Backed by uploaded evidence file");
    lines.push("  - Derived: Calculated from saved company inputs");
    lines.push("  - Estimated: Approximated from partial or secondary data");
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
  lines.push(`Generated by SimplyESG | ${factorMethodology?.source || CURRENT_UK_FACTOR_SOURCE} ${factorMethodology?.factorYear || CURRENT_UK_FACTOR_YEAR}`);
  lines.push("All data should be independently verified before external disclosure.");
  lines.push(hr);

  return lines.join("\n");
}

export default function Reports() {
  const reporting = useReportingMonth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const canApprove = can("report_generation");
  const canGenerateReportFiles = can("report_generation");
  const [reportsView, setReportsView] = useState("create");
  const { isPro } = useBillingStatus();
  const { activeSiteId, sites: allSites } = useSiteContext();
  const activeSites = allSites.filter((s: any) => s.status === "active");
  const archivedSites = allSites.filter((s: any) => s.status === "archived");
  const hasMultipleSites = allSites.length >= 1;
  const [reportScopeId, setReportScopeId] = useState<string>(activeSiteId || "__org__");
  const periodYears = reportPeriodYears();
  const { data: savedReportPeriods = [] } = useQuery<SavedReportingPeriod[]>({ queryKey: ["/api/reporting-periods"] });
  const [reportPeriodType, setReportPeriodType] = useState<ReportPeriodType | "saved">("monthly");
  const [savedReportPeriodId, setSavedReportPeriodId] = useState("");
  const [reportYear, setReportYear] = useState<number>(Number(reporting.month.slice(0, 4)));
  const [reportMonth, setReportMonth] = useState<number>(Number(reporting.month.slice(5, 7)));
  const [reportQuarter, setReportQuarter] = useState<1 | 2 | 3 | 4>(
    (Math.floor(new Date().getMonth() / 3) + 1) as 1 | 2 | 3 | 4
  );
  useEffect(() => {
    setReportYear(Number(reporting.month.slice(0, 4)));
    setReportMonth(Number(reporting.month.slice(5, 7)));
    setReportQuarter(Math.ceil(Number(reporting.month.slice(5, 7)) / 3) as 1 | 2 | 3 | 4);
  }, [reporting.month]);
  const selectedSavedReportPeriod = reportPeriodType === "saved"
    ? savedReportPeriods.find((reportingPeriod) => reportingPeriod.id === savedReportPeriodId) ?? savedReportPeriods[0]
    : undefined;
  const calendarReportPeriodType = reportPeriodType === "saved" ? "quarterly" : reportPeriodType;
  const selectedReportPeriod: ReportPeriodSelection = selectedSavedReportPeriod
    ? {
        periodType: selectedSavedReportPeriod.periodType,
        year: new Date(selectedSavedReportPeriod.startDate).getUTCFullYear(),
        period: selectedSavedReportPeriod.id,
        label: selectedSavedReportPeriod.name,
        dateFrom: reportingPeriodDate(selectedSavedReportPeriod.startDate),
        dateTo: reportingPeriodDate(selectedSavedReportPeriod.endDate),
      }
    : buildReportPeriodSelection(calendarReportPeriodType, reportYear, reportQuarter, reportMonth);
  const selectedPeriod = selectedReportPeriod.period;
  const selectedPeriodLabel = selectedReportPeriod.label;
  const selectedPeriodFilename = selectedPeriodLabel.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "reporting-period";
  const isSavedReportPeriod = Boolean(selectedSavedReportPeriod);
  const [reportType, setReportType] = useState("pdf");
  const [selectedTemplate, setSelectedTemplate] = useState("management");
  const [showAllTemplates, setShowAllTemplates] = useState(false);
  const [reportData, setReportData] = useState<any>(null);
  const [downloadingReportId, setDownloadingReportId] = useState<string | null>(null);
  const [downloadErrorReportId, setDownloadErrorReportId] = useState<string | null>(null);
  const [selectedLibraryReportId, setSelectedLibraryReportId] = useState<string | null>(null);
  const [librarySearch, setLibrarySearch] = useState("");
  const [libraryTemplate, setLibraryTemplate] = useState("all");
  const [libraryStatus, setLibraryStatus] = useState("all");
  const [libraryGeneratedBy, setLibraryGeneratedBy] = useState("");
  const [libraryDateFrom, setLibraryDateFrom] = useState("");
  const [libraryDateTo, setLibraryDateTo] = useState("");
  const [librarySort, setLibrarySort] = useState("generated_desc");
  const [libraryOffset, setLibraryOffset] = useState(0);
  const [currentReportRunId, setCurrentReportRunId] = useState<string | null>(null);
  const libraryLimit = 10;
  const effectiveSiteId = reportScopeId === "__org__" ? null : reportScopeId;
  const reportScopeSite = reportScopeId === "__org__" ? null : allSites.find((s: any) => s.id === reportScopeId) ?? null;

  useEffect(() => {
    if (reportPeriodType !== "saved" || savedReportPeriodId || savedReportPeriods.length === 0) return;
    setSavedReportPeriodId(savedReportPeriods[0].id);
  }, [reportPeriodType, savedReportPeriodId, savedReportPeriods]);

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

  useEffect(() => {
    setLibraryOffset(0);
  }, [effectiveSiteId, librarySearch, libraryTemplate, libraryStatus, libraryGeneratedBy, libraryDateFrom, libraryDateTo, librarySort]);

  useEffect(() => {
    setSelectedLibraryReportId(null);
  }, [effectiveSiteId, librarySearch, libraryTemplate, libraryStatus, libraryGeneratedBy, libraryDateFrom, libraryDateTo, librarySort, libraryOffset]);

  const { data: reportLibraryData, isLoading } = useQuery<ReportLibraryResponse>({
    queryKey: [
      "/api/reports/library",
      effectiveSiteId ?? "all",
      librarySearch,
      libraryTemplate,
      libraryStatus,
      libraryGeneratedBy,
      libraryDateFrom,
      libraryDateTo,
      librarySort,
      libraryOffset,
    ],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: String(libraryLimit),
        offset: String(libraryOffset),
        sort: librarySort,
      });
      if (effectiveSiteId) params.set("siteId", effectiveSiteId);
      if (librarySearch.trim()) params.set("search", librarySearch.trim());
      if (libraryTemplate !== "all") params.set("reportTemplate", libraryTemplate);
      if (libraryStatus !== "all") params.set("status", libraryStatus);
      if (libraryGeneratedBy.trim()) params.set("generatedBy", libraryGeneratedBy.trim());
      if (libraryDateFrom) params.set("dateFrom", libraryDateFrom);
      if (libraryDateTo) params.set("dateTo", libraryDateTo);
      const res = await authFetch(`/api/reports/library?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load reports");
      return res.json();
    },
  });
  const reports = reportLibraryData?.reports ?? [];
  const libraryTotal = reportLibraryData?.total ?? 0;
  const libraryPageStart = libraryTotal === 0 ? 0 : libraryOffset + 1;
  const libraryPageEnd = Math.min(libraryOffset + reports.length, libraryTotal);
  const { data: selectedLibraryReport, isLoading: isLibraryReportLoading } = useQuery<ReportHistoryEntry>({
    queryKey: ["/api/reports/detail", selectedLibraryReportId],
    queryFn: async () => {
      const res = await authFetch(`/api/reports/${selectedLibraryReportId}`);
      if (!res.ok) throw new Error("Failed to load report");
      return res.json();
    },
    enabled: !!selectedLibraryReportId,
  });
  const { data: companyData } = useQuery<any>({ queryKey: ["/api/company"] });
  const { data: metricsData = [] } = useQuery<any[]>({ queryKey: ["/api/metrics"] });
  const { data: complianceStatus, isFetching: isComplianceLoading } = useQuery<any>({
    queryKey: ["/api/compliance/status", selectedPeriod, effectiveSiteId ?? "__all__"],
    queryFn: async () => {
      const params = new URLSearchParams({
        period: selectedPeriod,
        siteId: effectiveSiteId ?? "__all__",
      });
      const res = await authFetch(`/api/compliance/status?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load period-specific framework readiness");
      return res.json();
    },
    enabled: isPro,
  });
  const { data: evidenceCoverageData } = useQuery<any>({ queryKey: ["/api/evidence/coverage"] });
  const activation = useActivationState();

  const { data: preflight } = useQuery<{
    canGenerate: boolean;
    code?: string;
    message?: string;
    metricsWithData: number;
    totalMetrics: number;
    resolvedPeriod: string;
  }>({
    queryKey: ["/api/reports/preflight", selectedPeriod, selectedReportPeriod.dateFrom, selectedReportPeriod.dateTo, effectiveSiteId ?? "all"],
    queryFn: async () => {
      const params = new URLSearchParams({ period: selectedPeriod });
      if (!isSavedReportPeriod) params.set("periodType", selectedReportPeriod.periodType);
      params.set("dateFrom", selectedReportPeriod.dateFrom);
      params.set("dateTo", selectedReportPeriod.dateTo);
      params.set("siteId", reportScopeId === "__org__" ? "__all__" : effectiveSiteId!);
      const res = await authFetch(`/api/reports/preflight?${params}`);
      if (!res.ok) throw new Error("preflight check failed");
      return res.json();
    },
    enabled: activation.hasAddedData,
    staleTime: 10_000,
  });
  const canGenerate = !activation.hasAddedData ? false : !preflight || preflight.canGenerate;
  const { data: actionsData = [] } = useQuery<any[]>({ queryKey: ["/api/actions"] });
  const { data: policyData } = useQuery<any>({ queryKey: ["/api/policy"] });
  const [exportingAssurance, setExportingAssurance] = useState(false);
  const [showFirstReportMilestone, setShowFirstReportMilestone] = useState(false);
  const { data: readiness } = useQuery<any>({ queryKey: ["/api/dashboard/readiness"] });
  const reportReadinessScopeParam = reportScopeId === "__org__" ? "__all__" : effectiveSiteId;
  const reportReadinessScopeLabel = reportScopeId === "__org__"
    ? "All scopes (whole organisation)"
    : reportScopeSite
      ? `Site: ${reportScopeSite.name}`
      : "Selected site";
  const { data: readinessDetail } = useQuery<any>({
    queryKey: [
      "/api/reports/readiness-detail",
      reportReadinessScopeParam ?? "__all__",
      selectedPeriod,
      selectedReportPeriod.dateFrom,
      selectedReportPeriod.dateTo,
    ],
    queryFn: () => {
      const params = new URLSearchParams({ period: selectedPeriod });
      params.set("siteId", reportReadinessScopeParam ?? "__all__");
      params.set("dateFrom", selectedReportPeriod.dateFrom);
      params.set("dateTo", selectedReportPeriod.dateTo);
      return authFetch(`/api/reports/readiness-detail?${params.toString()}`).then((r) => r.json());
    },
    staleTime: 30_000,
  });

  const invalidateReportLibrary = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/reports"] });
    queryClient.invalidateQueries({ queryKey: ["/api/reports/library"] });
  };

  const generateMutation = useMutation({
    mutationFn: async () => {
      const periodPayload = isSavedReportPeriod
        ? { period: selectedPeriod }
        : {
            period: selectedPeriod,
            periodType: selectedReportPeriod.periodType,
            year: selectedReportPeriod.year,
            month: selectedReportPeriod.month,
            quarter: selectedReportPeriod.quarter,
            dateFrom: selectedReportPeriod.dateFrom,
            dateTo: selectedReportPeriod.dateTo,
          };
      const res = await apiRequest("POST", "/api/reports/generate", {
        ...periodPayload,
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
      setCurrentReportRunId(data.report?.id ? String(data.report.id) : null);
      invalidateReportLibrary();
      queryClient.invalidateQueries({ queryKey: ["/api/onboarding/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/readiness"] });
      if (isFirstReport) {
        trackEvent(AnalyticsEvents.FIRST_REPORT_GENERATED, { template: selectedTemplate, period: selectedPeriod, periodType: selectedReportPeriod.periodType });
        setShowFirstReportMilestone(true);
      }
      toast({ title: "Report generated", description: `${templateConfig.label} is ready to preview and export.` });
    },
    onError: (e: any) => {
      const r = resolveApiError(e);
      toast({ title: r.title, description: `${r.description} ${r.nextStep}`, variant: "destructive" });
    },
  });

  const exportReport = () => {
    if (!reportData) return;
    const content = buildTextExport(reportData, effectiveSections, readinessDetail);
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${selectedTemplate}-report-${selectedPeriodFilename}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Report exported as plain text" });
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
    a.download = `esg-metrics-${selectedPeriodFilename}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "CSV exported" });
  };

  const generateFileMutation = useMutation({
    mutationFn: async ({ reportId, format }: { reportId: string; format: "pdf" | "docx" }) => {
      const res = await apiRequest("POST", `/api/reports/${reportId}/generate-file`, { format });
      return res.json();
    },
    onSuccess: (data: any, variables) => {
      invalidateReportLibrary();
      queryClient.invalidateQueries({ queryKey: ["/api/reports/detail", variables.reportId] });
      if (data.downloadUrl) {
        handleDownloadFile(data.downloadUrl, data.filename, variables.reportId);
      }
      toast({ title: `${data.fileType?.toUpperCase() || "File"} generated` });
    },
    onError: () => toast({ title: "File generation failed", variant: "destructive" }),
  });

  const latestReportId = currentReportRunId ?? (reports.length > 0 ? String(reports[0].id) : null);
  const availableHistoryFiles = Array.from(
    new Map(
      reports
        .filter((report): report is DownloadableHistoryEntry =>
          report.fileAvailability === "available"
          && !!report.latestFileId
          && !!report.latestDownloadUrl
        )
        .map((report) => [report.latestFileId, report])
    ).values()
  );

  const handleDownloadFile = async (downloadUrl: string, filename: string, reportId?: string) => {
    if (reportId) {
      setDownloadingReportId(reportId);
      setDownloadErrorReportId(null);
    }
    try {
      if (!downloadUrl) {
        throw new Error("File unavailable");
      }
      const res = await authFetch(downloadUrl);
      if (!res.ok) {
        invalidateReportLibrary();
        const errorBody = await res.json().catch(() => null);
        throw new Error(errorBody?.error || "Download failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      if (reportId) setDownloadErrorReportId(null);
    } catch (error: any) {
      if (reportId) setDownloadErrorReportId(reportId);
      toast({
        title: error?.message === "File not found" ? "File unavailable" : "Download failed",
        description: error?.message === "File not found" ? "This report entry is still in history, but the file is no longer available." : undefined,
        variant: "destructive",
      });
    } finally {
      if (reportId) setDownloadingReportId(current => current === reportId ? null : current);
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
    const overallReadiness = Array.isArray(frameworks) && frameworks.length > 0
      ? Math.round(frameworks.reduce((sum: number, fw: any) => sum + (fw.readinessPercent || 0), 0) / frameworks.length)
      : 0;

    const dataStatus = reportData ? "[APPROVED]" : companyData ? "[DRAFT]" : "[MISSING]";

    const pack = {
      companyName,
      reportingPeriod: selectedPeriodLabel,
      esgScore,
      categoryScores,
      carbonSummary: carbon ? { scope1: carbon.scope1, scope2: carbon.scope2, scope3: carbon.scope3, total: carbon.total } : null,
      topActions: topActions.map((a: any) => ({ title: a.title, status: a.status, dueDate: a.dueDate })),
      readinessPercent: overallReadiness,
      dataStatus,
    };

    const lines: string[] = [];
    lines.push(hr);
    lines.push(`BOARD PACK - ${pack.companyName}`);
    lines.push(`Generated: ${format(new Date(), "dd MMMM yyyy 'at' HH:mm")}`);
    lines.push(`Reporting period: ${pack.reportingPeriod}`);
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
    lines.push("FRAMEWORK READINESS");
    lines.push(sr);
    lines.push(`Strict readiness: ${pack.readinessPercent}%`);
    lines.push("Readiness is not certification, assurance, or legal compliance.");
    lines.push("");
    lines.push(hr);

    downloadTextFile(lines.join("\n"), `board-pack-${selectedPeriodFilename}.txt`);
    toast({ title: "Board Pack exported" });
  };

  const exportCustomerPack = () => {
    const hr = "=".repeat(60);
    const sr = "-".repeat(40);
    const metrics = metricsData || [];
    const policy = policyData;
    const evidCoverage = evidenceCoverageData;
    const frameworks = complianceStatus || [];
    const overallReadiness = Array.isArray(frameworks) && frameworks.length > 0
      ? Math.round(frameworks.reduce((sum: number, fw: any) => sum + (fw.readinessPercent || 0), 0) / frameworks.length)
      : 0;

    const pack = {
      reportingPeriod: selectedPeriodLabel,
      metrics: metrics.map((m: any) => ({ name: m.name, category: m.category, unit: m.unit, enabled: m.enabled })),
      policySummary: policy ? { status: policy.workflowStatus || "draft", purpose: policy.purpose } : null,
      evidenceCoverage: evidCoverage?.coveragePercent ?? 0,
      readinessPercent: overallReadiness,
      dataQuality: {
        evidenced: evidCoverage?.evidencedCount ?? 0,
        total: evidCoverage?.totalMetrics ?? 0,
      },
    };

    const lines: string[] = [];
    lines.push(hr);
    lines.push(`CUSTOMER PACK - ${companyData?.name || "Company"}`);
    lines.push(`Generated: ${format(new Date(), "dd MMMM yyyy 'at' HH:mm")}`);
    lines.push(`Reporting period: ${pack.reportingPeriod}`);
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
    lines.push(`Framework readiness: ${pack.readinessPercent}%`);
    lines.push("Readiness is not certification, assurance, or legal compliance.");
    lines.push(`Evidenced Metrics: ${pack.dataQuality.evidenced} of ${pack.dataQuality.total}`);
    lines.push("");
    lines.push(hr);

    downloadTextFile(lines.join("\n"), `customer-pack-${selectedPeriodFilename}.txt`);
    toast({ title: "Customer Pack exported" });
  };

  const exportComplianceSummary = () => {
    const hr = "=".repeat(60);
    const sr = "-".repeat(40);
    const frameworks = complianceStatus || [];

    const pack = Array.isArray(frameworks)
      ? frameworks.map((fw: any) => ({
          name: fw.name,
          readinessPercent: fw.readinessPercent || 0,
          requirements: (fw.requirements || []).map((r: any) => ({
            code: r.code, title: r.title, isMet: r.isMet,
          })),
        }))
      : [];

    const lines: string[] = [];
    lines.push(hr);
    lines.push(`FRAMEWORK READINESS SUMMARY - ${companyData?.name || "Company"}`);
    lines.push(`Generated: ${format(new Date(), "dd MMMM yyyy 'at' HH:mm")}`);
    lines.push(`Reporting period: ${selectedPeriodLabel}`);
    lines.push(hr);
    lines.push("");

    if (pack.length === 0) {
      lines.push("No frameworks selected.");
    } else {
      pack.forEach((fw: any) => {
        lines.push(`${fw.name} (${fw.readinessPercent}% ready)`);
        lines.push(sr);
        if (fw.requirements.length === 0) {
          lines.push("  No requirements defined.");
        } else {
          fw.requirements.forEach((r: any) => {
            const status = r.isMet ? "[READY]" : "[NOT READY]";
            lines.push(`  ${status} ${r.code} - ${r.title}`);
          });
        }
        lines.push("");
      });
    }
    lines.push("Readiness is not certification, assurance, or legal compliance.");
    lines.push(hr);

    downloadTextFile(lines.join("\n"), `framework-readiness-summary-${selectedPeriodFilename}.txt`);
    toast({ title: "Framework Readiness Summary exported" });
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
      invalidateReportLibrary();
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
      invalidateReportLibrary();
      toast({ title: "Review action completed" });
    },
    onError: (e: any) => toast({ title: "Review failed", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2" data-testid="text-page-title">
          <Download className="w-5 h-5 text-primary" />
          Reports
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Create, review and export clear ESG information for the people who need it.
        </p>
      </div>

      <Tabs value={reportsView} onValueChange={setReportsView} className="space-y-5">
        <p className="text-sm text-muted-foreground">Need a reusable company summary? <Link href="/esg-profile" className="text-primary underline">Open your SME ESG Passport</Link>.</p>
        <TabsList className="grid h-auto w-full grid-cols-3" data-testid="tabs-reports">
          <TabsTrigger value="create" data-testid="tab-reports-create">Create</TabsTrigger>
          <TabsTrigger value="library" data-testid="tab-reports-library">Report library</TabsTrigger>
          <TabsTrigger value="exports" data-testid="tab-reports-exports">Exports</TabsTrigger>
        </TabsList>

        <TabsContent value="create" className="space-y-5">
          <ReportReadinessPanel
        siteId={reportReadinessScopeParam ?? "__all__"}
        period={selectedPeriod}
        dateFrom={selectedReportPeriod.dateFrom}
        dateTo={selectedReportPeriod.dateTo}
        scopeLabel={reportReadinessScopeLabel}
          />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-1.5">
                1. What do you need to share?
                <EsgTooltip term="framework" />
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {[...REPORT_TEMPLATES].filter(template => showAllTemplates || template.id === "management" || template.id === selectedTemplate).sort((a, b) => Number(b.id === "management") - Number(a.id === "management")).map(t => {
                const isLocked = !isPro && t.id !== "management";
                return (
                <div
                  key={t.id}
                  role="button"
                  tabIndex={isLocked ? -1 : 0}
                  aria-disabled={isLocked}
                  aria-pressed={selectedTemplate === t.id}
                  onKeyDown={event => { if (!isLocked && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); handleTemplateChange(t.id); } }}
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
              <Button size="sm" variant="ghost" className="w-full" onClick={() => setShowAllTemplates(value => !value)} data-testid="button-more-report-types">{showAllTemplates ? "Show selected report" : "Browse other report types"}</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">2. Confirm scope and reporting period</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {hasMultipleSites && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Report Scope</Label>
                  <Select value={reportScopeId} onValueChange={(v) => { setReportScopeId(v); setReportData(null); setSelectedLibraryReportId(null); }}>
                    <SelectTrigger data-testid="select-report-scope"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__org__">All scopes (whole organisation)</SelectItem>
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
                <Select value={reportPeriodType} onValueChange={(value) => {
                  setReportPeriodType(value as ReportPeriodType | "saved");
                  if (value === "saved" && !savedReportPeriodId && savedReportPeriods[0]) {
                    setSavedReportPeriodId(savedReportPeriods[0].id);
                  }
                  setReportData(null);
                  setSelectedLibraryReportId(null);
                }}>
                  <SelectTrigger data-testid="select-report-period-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="annual">Annual</SelectItem>
                    {savedReportPeriods.length > 0 && (
                      <SelectItem value="saved">Saved / fiscal period</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>

              {reportPeriodType === "saved" ? (
                <div className="space-y-1.5">
                  <Label className="text-xs">Saved reporting period</Label>
                  <Select value={selectedSavedReportPeriod?.id ?? ""} onValueChange={(value) => {
                    setSavedReportPeriodId(value);
                    setReportData(null);
                    setSelectedLibraryReportId(null);
                  }}>
                    <SelectTrigger data-testid="select-saved-report-period"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {savedReportPeriods.map((reportingPeriod) => (
                        <SelectItem key={reportingPeriod.id} value={reportingPeriod.id}>
                          {reportingPeriod.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Year</Label>
                    <Select value={String(reportYear)} onValueChange={(value) => {
                      setReportYear(Number(value));
                      reporting.setMonth(`${value}-${String(reportMonth).padStart(2, "0")}`);
                      setReportData(null);
                      setSelectedLibraryReportId(null);
                    }}>
                      <SelectTrigger data-testid="select-report-year"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {periodYears.map(yearOption => (
                          <SelectItem key={yearOption} value={String(yearOption)}>{yearOption}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {reportPeriodType === "monthly" && (
                    <div className="space-y-1.5">
                      <Label className="text-xs">Month</Label>
                      <Select value={String(reportMonth)} onValueChange={(value) => {
                        setReportMonth(Number(value));
                        reporting.setMonth(`${reportYear}-${String(value).padStart(2, "0")}`);
                        setReportData(null);
                        setSelectedLibraryReportId(null);
                      }}>
                        <SelectTrigger data-testid="select-report-month"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {REPORT_MONTHS.map(monthOption => (
                            <SelectItem key={monthOption.value} value={String(monthOption.value)}>{monthOption.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {reportPeriodType === "quarterly" && (
                    <div className="space-y-1.5">
                      <Label className="text-xs">Quarter</Label>
                      <Select value={String(reportQuarter)} onValueChange={(value) => {
                        setReportQuarter(Number(value) as 1 | 2 | 3 | 4);
                        setReportData(null);
                        setSelectedLibraryReportId(null);
                      }}>
                        <SelectTrigger data-testid="select-report-quarter"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">Q1 Jan-Mar</SelectItem>
                          <SelectItem value="2">Q2 Apr-Jun</SelectItem>
                          <SelectItem value="3">Q3 Jul-Sep</SelectItem>
                          <SelectItem value="4">Q4 Oct-Dec</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              )}

              <div className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground" data-testid="text-report-period-range">
                {selectedReportPeriod.label} · {selectedReportPeriod.dateFrom} to {selectedReportPeriod.dateTo}
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

              <details className="group rounded-md border border-border" data-testid="disclosure-report-sections">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-xs font-medium [&::-webkit-details-marker]:hidden">
                  <span>Customise report sections <span className="font-normal text-muted-foreground">(optional)</span></span>
                  <span className="text-muted-foreground group-open:hidden">{Object.values(effectiveSections).filter(Boolean).length} included</span>
                  <ChevronDown className="hidden h-3.5 w-3.5 text-muted-foreground transition-transform group-open:block group-open:rotate-180" />
                </summary>
                <div className="space-y-2.5 border-t border-border px-3 py-3">
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
              </details>

              {!can("report_generation") && (
                <PermissionBanner
                  module="report_generation"
                  action="generate or approve reports"
                  data-testid="banner-report-permission"
                />
              )}

              {can("report_generation") && (
                <>
                  {!activation.isLoading && !activation.isError && !activation.hasAddedData && (
                    <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-md px-3 py-2">
                      <strong>Data required:</strong> add figures in Data Entry before generating a report.{" "}
                      <Link href="/data-entry" className="underline font-medium">Go to Data Entry →</Link>
                    </p>
                  )}
                  {activation.hasAddedData && preflight && !preflight.canGenerate && (
                    <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-md px-3 py-2" data-testid="warning-preflight">
                      {preflight.code === "no_metrics_configured" ? (
                        <><strong>No metrics are set up yet.</strong> Ask your administrator to enable metrics before generating a report.</>
                      ) : (
                        <><strong>No data for {preflight.resolvedPeriod}.</strong> Choose a period that has data, or{" "}
                        <Link href="/data-entry" className="underline font-medium">go to Data Entry</Link> and add your figures first.</>
                      )}
                    </p>
                  )}
                  <Button
                    className="w-full"
                    onClick={() => generateMutation.mutate()}
                    disabled={generateMutation.isPending || activation.isLoading || !canGenerate}
                    data-testid="button-generate-report"
                    title={
                      !activation.isLoading && !activation.hasAddedData
                        ? "Add data in Data Entry first"
                        : preflight && !preflight.canGenerate
                        ? `No data for ${preflight.resolvedPeriod} — select a different period`
                        : undefined
                    }
                  >
                    <FileText className="w-3.5 h-3.5 mr-1.5" />
                    {generateMutation.isPending ? "Generating..." : "Generate Report"}
                  </Button>
                  <div className="flex justify-center">
                    <ContextualHelpLink slug="generate-your-first-report" label="How to generate a report" />
                  </div>
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
                  <h2 className="text-base font-semibold">3. Review before sharing</h2>
                  <p className="text-xs text-muted-foreground">{templateConfig.label} — {selectedReportPeriod.label}</p>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Button size="sm" variant="outline" onClick={exportCsv} disabled={!reportData?.values?.length} data-testid="button-export-csv">
                    <FileDown className="w-3.5 h-3.5 mr-1.5" />
                    CSV
                  </Button>
                  <Button size="sm" variant="outline" onClick={exportReport} data-testid="button-export-report">
                    <Download className="w-3.5 h-3.5 mr-1.5" />
                    Plain Text
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
              {showFirstReportMilestone && (
                <Card className="border-emerald-200 bg-gradient-to-r from-emerald-50 to-emerald-100 dark:from-emerald-950/30 dark:to-emerald-900/20 dark:border-emerald-800" data-testid="card-first-report-milestone">
                  <CardContent className="p-5">
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-full bg-emerald-100 dark:bg-emerald-900/50">
                        <PartyPopper className="w-5 h-5 text-emerald-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">Your first ESG report is ready!</h3>
                        <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-0.5">
                          This is a great starting point. Review the report below, then keep improving your data to strengthen your score.
                        </p>
                        <div className="flex items-center gap-2 mt-3">
                          <Link href="/data-entry">
                            <Button size="sm" variant="outline" className="h-7 text-xs border-emerald-300 text-emerald-700" data-testid="button-milestone-add-data">
                              Add more data
                            </Button>
                          </Link>
                          <Link href="/data-entry?highlight=estimated">
                            <Button size="sm" variant="outline" className="h-7 text-xs border-emerald-300 text-emerald-700" data-testid="button-milestone-review-estimates">
                              Review estimates
                            </Button>
                          </Link>
                          <Button size="sm" variant="ghost" className="h-7 text-xs text-emerald-600" onClick={() => setShowFirstReportMilestone(false)} data-testid="button-milestone-dismiss">
                            <X className="w-3.5 h-3.5 mr-1" />
                            Dismiss
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
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
                      <strong>No data yet.</strong> Add at least one month of figures first, then come back to generate your report.
                      {!activation.hasUploadedEvidence && " Adding a supporting document will also make your report more credible."}
                    </p>
                    <Link href="/data-entry">
                      <Button size="sm" variant="outline" className="mt-3" data-testid="button-report-empty-add-data">
                        Go to Data Entry
                      </Button>
                    </Link>
                  </>
                ) : (
                  <>
                    <p className="text-xs text-muted-foreground mt-1">Choose your report and period, check any gaps above, then generate a preview to review before sharing.</p>
                    <Button
                      size="sm"
                      variant="default"
                      className="mt-3"
                      data-testid="button-report-empty-generate"
                      disabled={generateMutation.isPending || !canGenerate}
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
        </TabsContent>

        <TabsContent value="library" className="space-y-5">
          <div>
        <div className="flex items-center justify-between mb-3 gap-3">
          <div>
            <h2 className="text-sm font-semibold flex items-center gap-2" data-testid="heading-report-library">
              <Clock className="w-4 h-4" />
              Report Library
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Browse generated report snapshots and open available historical files.
            </p>
          </div>
          <OwnershipHint owner="Approvers or Company Admins" action="Final sign-off" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-2 mb-3" data-testid="panel-report-library-filters">
          <Input
            value={librarySearch}
            onChange={(event) => setLibrarySearch(event.target.value)}
            placeholder="Search reports"
            data-testid="input-report-library-search"
            className="h-9 text-xs xl:col-span-2"
          />
          <Select value={libraryTemplate} onValueChange={setLibraryTemplate}>
            <SelectTrigger className="h-9 text-xs" data-testid="select-report-library-template">
              <SelectValue placeholder="Framework" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All frameworks</SelectItem>
              {REPORT_TEMPLATES.map(template => (
                <SelectItem key={template.id} value={template.id}>{template.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={libraryStatus} onValueChange={setLibraryStatus}>
            <SelectTrigger className="h-9 text-xs" data-testid="select-report-library-status">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="available">Available files</SelectItem>
              <SelectItem value="unavailable">Unavailable files</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="submitted">Submitted</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
          <Input
            value={libraryGeneratedBy}
            onChange={(event) => setLibraryGeneratedBy(event.target.value)}
            placeholder="Generated by"
            data-testid="input-report-library-generated-by"
            className="h-9 text-xs"
          />
          <Select value={librarySort} onValueChange={setLibrarySort}>
            <SelectTrigger className="h-9 text-xs" data-testid="select-report-library-sort">
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="generated_desc">Newest first</SelectItem>
              <SelectItem value="generated_asc">Oldest first</SelectItem>
              <SelectItem value="title_asc">Title A-Z</SelectItem>
              <SelectItem value="title_desc">Title Z-A</SelectItem>
              <SelectItem value="framework_asc">Framework A-Z</SelectItem>
            </SelectContent>
          </Select>
          <Input
            value={libraryDateFrom}
            onChange={(event) => setLibraryDateFrom(event.target.value)}
            type="date"
            aria-label="Generated from"
            data-testid="input-report-library-date-from"
            className="h-9 text-xs"
          />
          <Input
            value={libraryDateTo}
            onChange={(event) => setLibraryDateTo(event.target.value)}
            type="date"
            aria-label="Generated to"
            data-testid="input-report-library-date-to"
            className="h-9 text-xs"
          />
          <div className="flex items-center gap-2 text-xs text-muted-foreground xl:col-span-4">
            <span data-testid="text-report-library-count">
              {libraryTotal === 0 ? "No reports" : `${libraryPageStart}-${libraryPageEnd} of ${libraryTotal} reports`}
            </span>
            {(librarySearch || libraryTemplate !== "all" || libraryStatus !== "all" || libraryGeneratedBy || libraryDateFrom || libraryDateTo) && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={() => {
                  setLibrarySearch("");
                  setLibraryTemplate("all");
                  setLibraryStatus("all");
                  setLibraryGeneratedBy("");
                  setLibraryDateFrom("");
                  setLibraryDateTo("");
                }}
                data-testid="button-report-library-clear-filters"
              >
                Clear filters
              </Button>
            )}
          </div>
        </div>
        {isLoading ? (
          <Skeleton className="h-24" />
        ) : reports.length === 0 ? (
          <EmptyState
            icon={FileText}
            title={reportScopeSite ? `No reports for ${reportScopeSite.name} yet` : "No reports generated yet"}
            description="Generate your first report using the form above. Once done, you can download it as a PDF or share it directly with whoever needs it."
            helpText="You'll need at least one period of data entered before your report will have meaningful figures."
          />
        ) : (
          <div className="space-y-2" data-testid="section-report-library">
            {reports.map((report: ReportHistoryEntry) => {
              const reportId = String(report.id);
              const reportTitle = reportLibraryTitle(report);
              const downloadName = report.latestFilename || `${report.reportTemplate || "report"}-${report.period || "latest"}`;
              const hasReportFile = report.fileAvailability === "available" && !!report.latestDownloadUrl;
              const isDownloading = downloadingReportId === reportId;
              const hasDownloadError = downloadErrorReportId === reportId;
              const canViewSnapshot = !!report.reportData;
              const isSelected = selectedLibraryReportId === reportId;

              return (
                <div key={report.id} className={`flex flex-wrap items-center gap-3 p-3 rounded-md border ${isSelected ? "border-primary bg-primary/5" : "border-border"}`} data-testid={`report-history-${report.id}`}>
                  <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    {hasReportFile ? (
                      <button
                        type="button"
                        className="text-sm font-medium text-left text-primary underline-offset-4 hover:underline disabled:opacity-70"
                        onClick={() => handleDownloadFile(report.latestDownloadUrl || "", downloadName, reportId)}
                        disabled={isDownloading}
                        data-testid={`link-report-file-${report.id}`}
                      >
                        <span data-testid={`text-report-library-title-${report.id}`}>{reportTitle}</span>
                        {report.reportTemplate && (
                          <span className="sr-only"> — {reportTemplateLabel(report.reportTemplate)}</span>
                        )}
                      </button>
                    ) : (
                      <p className="text-sm font-medium" data-testid={`text-report-library-title-${report.id}`}>{reportTitle}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {report.companyName || companyData?.name || "Company"} · Generated {report.generatedAt ? format(new Date(report.generatedAt), "dd MMM yyyy 'at' HH:mm") : "Unknown date"}
                      {report.generatedByName ? ` by ${report.generatedByName}` : ""}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>{report.reportTemplate ? reportTemplateLabel(report.reportTemplate) : "ESG Report"}</span>
                      <span>{report.periodLabel || report.period || "All periods"}</span>
                      {report.periodType && <span className="capitalize">{report.periodType}</span>}
                      {report.trendMetadata?.comparisonLabel && (
                        <span data-testid={`text-report-trend-metadata-${report.id}`}>
                          {report.trendMetadata.comparisonLabel}
                        </span>
                      )}
                      {report.siteId ? <span>{report.siteName || "Site"}</span> : <span>All scopes</span>}
                    </div>
                    {hasReportFile ? (
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span className="font-medium">{report.latestFilename || "Generated report file"}</span>
                        <span>{report.latestFileType?.toUpperCase()}</span>
                        {report.latestFileSize ? <span>{`${(report.latestFileSize / 1024).toFixed(1)} KB`}</span> : null}
                        {hasDownloadError && (
                          <span className="text-destructive" data-testid={`report-download-error-${report.id}`}>
                            Download failed. Try again.
                          </span>
                        )}
                      </div>
                    ) : (
                      <p className="mt-1 text-xs text-muted-foreground" data-testid={`report-file-status-${report.id}`}>
                        <span className="font-medium">Unavailable.</span> {reportFileUnavailableMessage(report.fileUnavailableReason)}
                      </p>
                    )}
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
                      onClick={() => submitReportMutation.mutate(reportId)}
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
                        onClick={() => reviewReportMutation.mutate({ reportId, action: "approve" })}
                        disabled={reviewReportMutation.isPending}
                        data-testid={`button-approve-report-${report.id}`}
                      >
                        <Check className="w-3.5 h-3.5 mr-1.5" />
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => reviewReportMutation.mutate({ reportId, action: "reject" })}
                        disabled={reviewReportMutation.isPending}
                        data-testid={`button-reject-report-${report.id}`}
                      >
                        <X className="w-3.5 h-3.5 mr-1.5" />
                        Reject
                      </Button>
                    </>
                  )}
                  <Button
                    size="sm"
                    variant={isSelected ? "default" : "outline"}
                    onClick={() => setSelectedLibraryReportId(reportId)}
                    disabled={!canViewSnapshot}
                    data-testid={`button-view-report-${report.id}`}
                  >
                    <Eye className="w-3.5 h-3.5 mr-1.5" />
                    View report
                  </Button>
                  {hasReportFile ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDownloadFile(report.latestDownloadUrl || "", downloadName, reportId)}
                      disabled={isDownloading}
                      data-testid={`button-download-report-file-${report.id}`}
                    >
                      {isDownloading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Download className="w-3.5 h-3.5 mr-1.5" />}
                      {isDownloading ? "Opening..." : "Open report"}
                    </Button>
                  ) : (
                    <Badge variant="secondary" className="text-xs" data-testid={`badge-report-file-unavailable-${report.id}`}>
                      Unavailable
                    </Badge>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {libraryTotal > libraryLimit && (
          <div className="flex items-center justify-end gap-2 mt-3" data-testid="controls-report-library-pagination">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setLibraryOffset(Math.max(0, libraryOffset - libraryLimit))}
              disabled={libraryOffset === 0}
              data-testid="button-report-library-prev"
            >
              Previous
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setLibraryOffset(libraryOffset + libraryLimit)}
              disabled={!reportLibraryData?.hasMore}
              data-testid="button-report-library-next"
            >
              Next
            </Button>
          </div>
        )}
        {selectedLibraryReportId && (
          <Card className="mt-4" data-testid="card-report-library-detail">
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-sm flex items-center gap-2">
                    Historical Report
                    <Badge variant="outline" className="text-[10px]">Read-only snapshot</Badge>
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Read-only snapshot from the selected report history entry.
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setSelectedLibraryReportId(null)}
                  data-testid="button-close-report-library-detail"
                >
                  <X className="w-3.5 h-3.5 mr-1.5" />
                  Close
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {isLibraryReportLoading ? (
                <Skeleton className="h-40" />
              ) : selectedLibraryReport ? (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs" data-testid="panel-report-library-metadata">
                    <div className="rounded-md border border-border p-3">
                      <p className="text-muted-foreground">Report</p>
                      <p className="font-medium">{reportLibraryTitle(selectedLibraryReport)}</p>
                    </div>
                    <div className="rounded-md border border-border p-3">
                      <p className="text-muted-foreground">Company</p>
                      <p className="font-medium">{selectedLibraryReport.companyName || companyData?.name || "Company"}</p>
                    </div>
                    <div className="rounded-md border border-border p-3">
                      <p className="text-muted-foreground">Period</p>
                      <p className="font-medium">{selectedLibraryReport.periodLabel || selectedLibraryReport.period || "All periods"}</p>
                    </div>
                    <div className="rounded-md border border-border p-3">
                      <p className="text-muted-foreground">Generated by</p>
                      <p className="font-medium">{selectedLibraryReport.generatedByName || "Unknown user"}</p>
                    </div>
                    <div className="rounded-md border border-border p-3">
                      <p className="text-muted-foreground">File</p>
                      <p className="font-medium">
                        {selectedLibraryReport.fileAvailability === "available"
                          ? `${selectedLibraryReport.latestFileType?.toUpperCase() || "FILE"} available`
                          : "Unavailable"}
                      </p>
                    </div>
                  </div>
                  {selectedLibraryReport.trendMetadata && (
                    <div className="rounded-md border border-border p-3 text-xs" data-testid="panel-report-library-trend-metadata">
                      <p className="text-muted-foreground">Trend comparison</p>
                      <p className="font-medium">
                        {selectedLibraryReport.trendMetadata.comparisonLabel}: {selectedLibraryReport.trendMetadata.currentPeriodLabel || selectedLibraryReport.trendMetadata.currentPeriod} vs {selectedLibraryReport.trendMetadata.previousPeriodLabel || selectedLibraryReport.trendMetadata.previousPeriod}
                      </p>
                      <p className="text-muted-foreground mt-1">
                        {selectedLibraryReport.trendMetadata.availableComparisons || 0} metric comparisons available · {selectedLibraryReport.trendMetadata.unavailableComparisons || 0} unavailable
                      </p>
                    </div>
                  )}
                  {selectedLibraryReport.reportData && (
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs" data-testid="panel-report-library-summary">
                      <div className="rounded-md bg-muted/40 p-3">
                        <p className="text-muted-foreground">Metric values</p>
                        <p className="text-lg font-semibold">{historicalMetricCount(selectedLibraryReport.reportData)}</p>
                      </div>
                      <div className="rounded-md bg-muted/40 p-3">
                        <p className="text-muted-foreground">Evidence files</p>
                        <p className="text-lg font-semibold">{historicalEvidenceCount(selectedLibraryReport.reportData)}</p>
                      </div>
                      <div className="rounded-md bg-muted/40 p-3">
                        <p className="text-muted-foreground">ESG score</p>
                        <p className="text-lg font-semibold">{selectedLibraryReport.reportData?.weightedScore?.overallScore ?? "N/A"}</p>
                      </div>
                      <div className="rounded-md bg-muted/40 p-3">
                        <p className="text-muted-foreground">Sections</p>
                        <p className="text-lg font-semibold">{historicalEnabledSectionCount(selectedLibraryReport)}</p>
                      </div>
                    </div>
                  )}
                  {selectedLibraryReport.fileAvailability === "available" && selectedLibraryReport.latestDownloadUrl ? (
                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDownloadFile(
                          selectedLibraryReport.latestDownloadUrl || "",
                          selectedLibraryReport.latestFilename || "report-file",
                          selectedLibraryReport.id,
                        )}
                        data-testid="button-library-detail-download"
                      >
                        <Download className="w-3.5 h-3.5 mr-1.5" />
                        {downloadingReportId === String(selectedLibraryReport.id) ? "Downloading..." : "Download file"}
                      </Button>
                    </div>
                  ) : selectedLibraryReport.reportData ? (
                    <div className="rounded-md border border-dashed border-border p-3 text-xs" data-testid="panel-library-detail-file-actions">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium">No generated file attached</p>
                          <p className="text-muted-foreground mt-0.5">
                            {reportFileUnavailableMessage(selectedLibraryReport.fileUnavailableReason)}
                          </p>
                        </div>
                        {canGenerateReportFiles ? (
                          <div className="flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => generateFileMutation.mutate({ reportId: String(selectedLibraryReport.id), format: "pdf" })}
                              disabled={generateFileMutation.isPending}
                              data-testid="button-library-detail-generate-pdf"
                            >
                              {generateFileMutation.isPending
                                && generateFileMutation.variables?.reportId === String(selectedLibraryReport.id)
                                && generateFileMutation.variables?.format === "pdf"
                                ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                                : <FileDown className="w-3.5 h-3.5 mr-1.5" />}
                              PDF
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => generateFileMutation.mutate({ reportId: String(selectedLibraryReport.id), format: "docx" })}
                              disabled={generateFileMutation.isPending}
                              data-testid="button-library-detail-generate-docx"
                            >
                              {generateFileMutation.isPending
                                && generateFileMutation.variables?.reportId === String(selectedLibraryReport.id)
                                && generateFileMutation.variables?.format === "docx"
                                ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                                : <FileDown className="w-3.5 h-3.5 mr-1.5" />}
                              DOCX
                            </Button>
                          </div>
                        ) : (
                          <p className="text-muted-foreground" data-testid="text-library-detail-file-generation-permission">
                            File generation is available to approvers or company admins.
                          </p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground" data-testid="text-library-detail-file-unavailable">
                      {reportFileUnavailableMessage(selectedLibraryReport.fileUnavailableReason)}
                    </p>
                  )}
                  {selectedLibraryReport.reportData ? (
                    <div data-testid="historical-report-preview">
                      <ReportPreview data={selectedLibraryReport.reportData} sections={reportSectionsFromEntry(selectedLibraryReport)} />
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground" data-testid="text-report-library-no-snapshot">
                      This historical entry does not include a stored JSON snapshot.
                    </p>
                  )}
                </>
              ) : (
                <p className="text-xs text-muted-foreground">Report could not be loaded.</p>
              )}
            </CardContent>
          </Card>
        )}
          </div>

          {availableHistoryFiles.length > 0 && (
            <div>
          <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <FileDown className="w-4 h-4" />
            Available Files
          </h2>
          <div className="space-y-2">
            {availableHistoryFiles.map((report) => (
              <div key={report.latestFileId} className="flex items-center gap-3 p-3 rounded-md border border-border" data-testid={`generated-file-${report.latestFileId}`}>
                <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{report.latestFilename}</p>
                  <p className="text-xs text-muted-foreground">
                    {report.latestFileType?.toUpperCase()} | {report.latestFileSize ? `${(report.latestFileSize / 1024).toFixed(1)} KB` : ""} | {report.latestFileGeneratedAt ? format(new Date(report.latestFileGeneratedAt), "dd MMM yyyy 'at' HH:mm") : ""}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleDownloadFile(report.latestDownloadUrl, report.latestFilename || "report-file")}
                  data-testid={`button-redownload-${report.latestFileId}`}
                >
                  <Download className="w-3.5 h-3.5 mr-1.5" />
                  Download
                </Button>
              </div>
            ))}
          </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="exports" className="space-y-5">
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
              disabled={isLoading || (isPro && isComplianceLoading)}
              data-testid="button-export-board-pack"
            >
              <Download className="w-3.5 h-3.5 mr-1.5" />
              Board Pack
            </Button>
            <Button
              variant="outline"
              onClick={exportCustomerPack}
              disabled={isLoading || (isPro && isComplianceLoading)}
              data-testid="button-export-customer-pack"
            >
              <Users className="w-3.5 h-3.5 mr-1.5" />
              Customer Pack
            </Button>
            <Button
              variant="outline"
              onClick={exportComplianceSummary}
              disabled={isLoading || (isPro && isComplianceLoading)}
              data-testid="button-export-compliance"
            >
              <Shield className="w-3.5 h-3.5 mr-1.5" />
              Framework Readiness
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
        </TabsContent>
      </Tabs>
    </div>
  );
}
