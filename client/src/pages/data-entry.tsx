import { useState, useEffect, useRef } from "react";
import { useReportingMonth, isReportingMonth } from "@/hooks/use-reporting-month";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { EmptyState } from "@/components/empty-state";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useBillingStatus, UpgradeButton } from "@/components/upgrade-prompt";
import { apiRequest, queryClient, authFetch, type ApiRequestError } from "@/lib/queryClient";
import { invalidateEsgReadinessQueries } from "@/lib/esg-query-invalidation";
import { resolveApiError } from "@/lib/errorResolver";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  ClipboardList, Lock, Save, Leaf, Users, Shield,
  AlertCircle, Calculator, CheckCircle2, Zap, Info,
  Upload, Download, FileSpreadsheet, Table, Eye,
  Send, Check, X, FileCheck, Loader2, ArrowRight, Sparkles, Pencil,
  Paperclip, Trash2, ExternalLink, FileText, Globe, MapPin, ChevronDown,
  ArrowLeft, Search, Settings2,
} from "lucide-react";
import { format, subMonths } from "date-fns";
import { usePermissions } from "@/lib/permissions";
import { WorkflowBadge } from "@/components/workflow-badge";
import { useSiteContext } from "@/hooks/use-site-context";
import { DataSourceBadge } from "@/pages/evidence";
import { EvidenceSuggestions } from "@/components/evidence-suggestions";
import { trackEvent, AnalyticsEvents } from "@/lib/analytics";
import { useActivationState } from "@/hooks/use-activation-state";
import { EsgTooltip } from "@/components/esg-tooltip";
import { ContextualHelpLink } from "@/components/help";
import { ValueSourceBadge } from "@/components/value-source-badge";
import { Link, useLocation, useSearch } from "wouter";
import { InlineGuidanceTrigger } from "@/components/metric-guidance-panel";
import { getRawFieldPriority, getManualMetricPriority, PRIORITY_LABELS, CONTEXTUAL_PROMPTS } from "@/lib/metric-guidance";
import { PermissionBanner } from "@/components/permission-gate";
import { buildCanonicalEnabledMetrics, buildCanonicalEvidenceMetrics } from "@/lib/metric-activation";
import { PasteFromExcelTab } from "@/components/paste-from-excel-tab";
import { formatMetricDisplayValue, isBooleanMetricDataType, isEditableDataEntryMetricType } from "@shared/data-entry-metrics";
import {
  INLINE_METRIC_EVIDENCE_LABELS,
  getInlineMetricEvidenceState,
  isUsableMetricEvidence,
  type InlineMetricEvidenceState,
} from "@/lib/metric-evidence-state";
import { buildGuidedRawDataMutation } from "@/lib/guided-raw-data-mutation";
import {
  combineWorkflowSubmitResponses,
  normalizeDataEntryWorkflowStatus,
  selectDataEntryWorkflowItems,
  summarizeDataEntryWorkflow,
  workflowReviewNotice,
  workflowSubmitNotice,
  type DataEntryWorkflowItem,
  type WorkflowSubmitResponse,
} from "@/lib/workflow-outcomes";
import { GUIDED_RAW_INPUT_NAME_SET } from "@shared/guided-raw-inputs";
import { MetricsLibraryContent } from "@/pages/metrics-library";
import {
  classifyMetricDataState,
  resolveMetricWorkspacePeriod,
  summarizeMetricDataStates,
  type MetricDataWorkspaceState,
} from "@/lib/metrics-data-workspace";

const RAW_DATA_FIELDS = {
  environmental: [
    { key: "electricity_kwh", label: "Electricity Consumption", unit: "kWh", help: "Total electricity from utility bills" },
    { key: "gas_kwh", label: "Gas / Fuel Consumption", unit: "kWh", help: "Natural gas from gas bills" },
    { key: "vehicle_fuel_litres", label: "Company Vehicle Fuel", unit: "litres", help: "Total fuel purchased for company vehicles" },
    { key: "total_waste_tonnes", label: "Total Waste Generated", unit: "tonnes", help: "Total waste from collection records" },
    { key: "recycled_waste_tonnes", label: "Recycled Waste", unit: "tonnes", help: "Waste sent for recycling" },
    { key: "water_m3", label: "Water Consumption", unit: "m³", help: "Water from utility bills" },
    { key: "domestic_flight_km", label: "Domestic Flights", unit: "km", help: "Total domestic flight distance" },
    { key: "short_haul_flight_km", label: "Short-Haul Flights", unit: "km", help: "Short-haul flight distance (<3,700km)" },
    { key: "long_haul_flight_km", label: "Long-Haul Flights", unit: "km", help: "Long-haul flight distance (>3,700km)" },
    { key: "rail_km", label: "Rail Travel", unit: "km", help: "Business rail travel distance" },
    { key: "hotel_nights", label: "Hotel Nights", unit: "nights", help: "Business hotel stays" },
    { key: "car_miles", label: "Business Car Miles", unit: "miles", help: "Business car mileage" },
  ],
  social: [
    { key: "employee_headcount", label: "Employee Headcount", unit: "people", help: "Total employees at period end" },
    { key: "employee_leavers", label: "Employee Leavers", unit: "people", help: "Staff who left during period" },
    { key: "absence_days", label: "Absence Days", unit: "days", help: "Total sick/absence days" },
    { key: "total_working_days", label: "Total Working Days", unit: "days", help: "Total available working days" },
    { key: "total_training_hours", label: "Total Training Hours", unit: "hours", help: "All training hours delivered" },
    { key: "female_managers", label: "Female Managers", unit: "people", help: "Women in management positions" },
    { key: "total_managers", label: "Total Managers", unit: "people", help: "Total management positions" },
    { key: "living_wage_employees", label: "Living Wage Employees", unit: "people", help: "Employees paid at or above living wage" },
  ],
  governance: [
    { key: "trained_staff", label: "Privacy-Trained Staff", unit: "people", help: "Staff who completed data privacy training" },
    { key: "total_staff", label: "Total Staff (for training %)", unit: "people", help: "Total staff for training completion %" },
    { key: "signed_suppliers", label: "Suppliers Signed CoC", unit: "suppliers", help: "Suppliers who signed code of conduct" },
    { key: "total_suppliers", label: "Total Suppliers", unit: "suppliers", help: "Total number of suppliers" },
  ],
};

const GUIDED_RAW_DATA_INPUT_KEYS = GUIDED_RAW_INPUT_NAME_SET;
const EMPTY_DEFINITIONS: MetricDefinitionActivation[] = [];
const EMPTY_COMPANY_METRICS: any[] = [];

type DataWorkspaceMode = "overview" | "manual" | "raw" | "paste" | "manage";

function resolveInitialWorkspaceMode(searchParams: URLSearchParams): DataWorkspaceMode {
  const requestedMode = searchParams.get("mode");
  if (searchParams.get("manage") === "metrics" || requestedMode === "manage") return "manage";
  if (requestedMode === "guided" || requestedMode === "raw") return "raw";
  if (requestedMode === "import" || requestedMode === "paste") return "paste";
  if (
    requestedMode === "manual"
    || searchParams.has("metric")
    || searchParams.has("metricId")
    || searchParams.get("focus") === "evidence"
    || searchParams.get("highlight") === "estimated"
  ) return "manual";
  return "overview";
}

const SME_STARTER_INPUT_KEYS = new Set([
  "electricity_kwh",
  "gas_kwh",
  "total_waste_tonnes",
  "employee_headcount",
  "employee_leavers",
  "trained_staff",
  "total_staff",
]);

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

const CATEGORY_ICONS = {
  environmental: { icon: Leaf, color: "text-primary", bg: "bg-primary/10", label: "Environmental" },
  social: { icon: Users, color: "text-blue-500", bg: "bg-blue-500/10", label: "Social" },
  governance: { icon: Shield, color: "text-purple-500", bg: "bg-purple-500/10", label: "Governance" },
};

type MetricDefinitionActivation = {
  id: string;
  code?: string | null;
  name: string;
  pillar: "environmental" | "social" | "governance";
  category?: string | null;
  description?: string | null;
  unit?: string | null;
  dataType?: string | null;
  inputFrequency?: string | null;
  isCore?: boolean | null;
  isActive: boolean;
  isDerived?: boolean;
  formulaJson?: Record<string, unknown> | null;
  metricType?: string | null;
  formulaText?: string | null;
  evidenceRequired?: boolean | null;
};

type EvidenceAttachment = {
  id: string;
  filename: string;
  fileUrl: string | null;
  fileType: string | null;
  description: string | null;
  linkedModule: string | null;
  linkedEntityId: string | null;
  linkedPeriod: string | null;
  evidenceStatus: string | null;
  expiryDate?: string | null;
  uploadedAt: string | null;
};

const METRIC_EVIDENCE_ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.png,.jpg,.jpeg,.gif,.webp,.svg,.ppt,.pptx,.odt,.ods,.odp,.zip,.eml,.msg";

function formatAttachmentSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function unavailableEvidenceLabel(evidence: EvidenceAttachment): string | null {
  if (isUsableMetricEvidence(evidence)) return null;
  if (evidence.expiryDate) {
    const expiry = new Date(evidence.expiryDate);
    if (!Number.isNaN(expiry.getTime()) && expiry.getTime() < Date.now()) return "Expired";
  }
  const status = evidence.evidenceStatus?.trim();
  return status ? `${status.charAt(0).toUpperCase()}${status.slice(1).toLowerCase()}` : "Unavailable";
}

function InlineMetricEvidenceBadge({ state, metricKey }: { state: InlineMetricEvidenceState; metricKey: string }) {
  const styles: Record<InlineMetricEvidenceState, string> = {
    missing: "border-slate-300 text-slate-600 dark:border-slate-700 dark:text-slate-300",
    source_linked: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-300",
    reviewed: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300",
    evidence_backed: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300",
  };
  const Icon = state === "evidence_backed"
    ? CheckCircle2
    : state === "reviewed"
      ? Eye
      : state === "source_linked"
        ? FileCheck
        : Paperclip;

  return (
    <Badge
      variant="outline"
      className={`h-5 gap-1 px-1.5 py-0 text-[10px] ${styles[state]}`}
      data-testid={`badge-inline-evidence-${metricKey}`}
    >
      <Icon className="h-3 w-3" />
      {INLINE_METRIC_EVIDENCE_LABELS[state]}
    </Badge>
  );
}

export default function DataEntry() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { can, isAdmin, isApprover } = usePermissions();
  const { isPro } = useBillingStatus();
  const { activeSiteId, activeSite, activeSites, setActiveSiteId, isLoading: sitesLoading } = useSiteContext();
  const hasActiveSites = activeSites.length > 0;
  const selectedScopeSiteId = activeSiteId ?? null;
  const selectedScopeKey = activeSiteId ?? "__org__";
  const selectedScopeParam = activeSiteId ?? "null";
  const selectedScopeLabel = activeSite ? activeSite.name : "Organisation-wide";
  const searchString = useSearch();
  const reporting = useReportingMonth();
  const searchParams = new URLSearchParams(searchString);
  const highlightEstimated = searchParams.get("highlight") === "estimated";
  const focusEvidence = searchParams.get("focus") === "evidence";
  const focusedMetricId = searchParams.get("metricId") || searchParams.get("metric");
  const requestedPeriod = searchParams.get("period");
  const requestedSiteScope = searchParams.get("siteId");
  const canApprove = can("report_generation");
  const canEdit = can("metrics_data_entry");
  const periods = generatePeriods();

  const invalidateReadinessQueries = () => {
    invalidateEsgReadinessQueries(queryClient);
  };
  const [selectedPeriod, setSelectedPeriod] = useState(
    isReportingMonth(requestedPeriod) ? requestedPeriod : reporting.month,
  );
  const [dirtyKeys, setDirtyKeys] = useState<Record<string, boolean>>({});
  const [lastSavedPeriod, setLastSavedPeriod] = useState<string | null>(null);
  const dirtyRef = useRef(dirtyKeys);
  dirtyRef.current = dirtyKeys;
  const markDirty = (key: string) => {
    dirtyRef.current = { ...dirtyRef.current, [key]: true };
    setDirtyKeys(dirtyRef.current);
    setLastSavedPeriod(null);
  };
  const markSaved = (key: string) => {
    dirtyRef.current = { ...dirtyRef.current, [key]: false };
    setDirtyKeys(dirtyRef.current);
  };
  const selectedQuarterPeriod = resolveMetricWorkspacePeriod(selectedPeriod, "quarterly");
  const selectedAnnualPeriod = resolveMetricWorkspacePeriod(selectedPeriod, "annual");
  const [selectedReportingPeriodId, setSelectedReportingPeriodId] = useState<string>("__all__");
  const [rawInputs, setRawInputs] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<DataWorkspaceMode>(() => resolveInitialWorkspaceMode(searchParams));
  const [metricSearch, setMetricSearch] = useState("");
  const [metricStatusFilter, setMetricStatusFilter] = useState<MetricDataWorkspaceState | "all">("all");
  const [focusedEntryMetricId, setFocusedEntryMetricId] = useState<string | null>(focusedMetricId);
  const [showAllInputs, setShowAllInputs] = useState(searchParams.has("sourceMetric"));
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [recalcResults, setRecalcResults] = useState<any[] | null>(null);
  const [manualValues, setManualValues] = useState<Record<string, { value: string; notes: string }>>({});
  const [manualDataSourceTypes, setManualDataSourceTypes] = useState<Record<string, string>>({});
  const [estimateBannerDismissed, setEstimateBannerDismissed] = useState(false);
  const [pendingEstimates, setPendingEstimates] = useState<Record<string, { value: number; label: string; unit: string; metricId: string; inputKey?: string; source: string; explanation: string; methodology: string }>>({});
  const [acceptedEstimates, setAcceptedEstimates] = useState<Set<string>>(new Set());
  const [skippedEstimates, setSkippedEstimates] = useState<Set<string>>(new Set());
  const [autoEstimateTriggered, setAutoEstimateTriggered] = useState(false);
  const [editingEstimate, setEditingEstimate] = useState<string | null>(null);
  const [editEstimateValue, setEditEstimateValue] = useState("");
  const [editSaveAsActual, setEditSaveAsActual] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<Record<string, File[]>>({});
  const confirmLeave = useUnsavedChanges(Object.values(dirtyKeys).some(Boolean) || Object.values(pendingAttachments).some(files => files.length > 0), () => {
    dirtyRef.current = {};
    setDirtyKeys({});
    setPendingAttachments({});
  });
  useEffect(() => {
    if (!requestedPeriod && !Object.values(dirtyRef.current).some(Boolean)) setSelectedPeriod(reporting.month);
  }, [reporting.month, requestedPeriod]);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const { data: evidenceCoverage } = useQuery<any>({
    queryKey: ["/api/evidence/coverage", selectedScopeKey],
    queryFn: () => {
      const params = new URLSearchParams();
      if (hasActiveSites) params.set("siteId", selectedScopeParam);
      const qs = params.toString();
      return authFetch(`/api/evidence/coverage${qs ? `?${qs}` : ""}`).then((r) => r.json());
    },
    enabled: !sitesLoading,
  });

  const { data: monthlyEvidenceFiles = [], isLoading: monthlyEvidenceLoading } = useQuery<EvidenceAttachment[]>({
    queryKey: ["/api/evidence", selectedPeriod, selectedScopeKey],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set("period", selectedPeriod);
      if (hasActiveSites) params.set("siteId", selectedScopeParam);
      return authFetch(`/api/evidence?${params.toString()}`).then((r) => r.json());
    },
    enabled: !sitesLoading,
  });

  const { data: quarterlyEvidenceFiles = [], isLoading: quarterlyEvidenceLoading } = useQuery<EvidenceAttachment[]>({
    queryKey: ["/api/evidence", selectedQuarterPeriod, selectedScopeKey],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set("period", selectedQuarterPeriod);
      if (hasActiveSites) params.set("siteId", selectedScopeParam);
      return authFetch(`/api/evidence?${params.toString()}`).then((r) => r.json());
    },
    enabled: !sitesLoading,
  });

  const { data: annualEvidenceFiles = [], isLoading: annualEvidenceLoading } = useQuery<EvidenceAttachment[]>({
    queryKey: ["/api/evidence", selectedAnnualPeriod, selectedScopeKey],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set("period", selectedAnnualPeriod);
      if (hasActiveSites) params.set("siteId", selectedScopeParam);
      return authFetch(`/api/evidence?${params.toString()}`).then((r) => r.json());
    },
    enabled: !sitesLoading,
  });

  const { data: reportingPeriods = [] } = useQuery<any[]>({
    queryKey: ["/api/reporting-periods"],
  });

  const { data: metricDefinitions = EMPTY_DEFINITIONS, isLoading: definitionsLoading } = useQuery<MetricDefinitionActivation[]>({
    queryKey: ["/api/metric-definitions"],
    queryFn: () => authFetch("/api/metric-definitions").then((r) => r.json()),
  });

  const { data: companyMetrics = EMPTY_COMPANY_METRICS, isLoading: companyMetricsLoading } = useQuery<any[]>({
    queryKey: ["/api/metrics"],
    queryFn: () => authFetch("/api/metrics").then((r) => r.json()),
  });

  const activeReportingPeriod = reportingPeriods.find((rp: any) => rp.id === selectedReportingPeriodId);
  const isReportingPeriodLocked = activeReportingPeriod?.status === "locked";

  const { data: rawData, isLoading: rawLoading } = useQuery<any[]>({
    queryKey: ["/api/raw-data", selectedPeriod, selectedScopeKey],
    queryFn: () => {
        const params = new URLSearchParams();
        if (hasActiveSites) params.set("siteId", selectedScopeParam);
        const qs = params.toString();
        return authFetch(`/api/raw-data/${selectedPeriod}${qs ? `?${qs}` : ""}`).then(r => r.json()).then(d => Array.isArray(d) ? d : []);
      },
    enabled: !sitesLoading,
  });

  const { data: entryData, isLoading: entryLoading } = useQuery<any>({
    queryKey: ["/api/data-entry", selectedPeriod, selectedScopeKey],
    queryFn: () => {
        const params = new URLSearchParams();
        if (hasActiveSites) params.set("siteId", selectedScopeParam);
        const qs = params.toString();
        return authFetch(`/api/data-entry/${selectedPeriod}${qs ? `?${qs}` : ""}`).then(r => r.json());
      },
    enabled: !sitesLoading,
  });

  const { data: quarterlyEntryData, isLoading: quarterlyEntryLoading } = useQuery<any>({
    queryKey: ["/api/data-entry", selectedQuarterPeriod, selectedScopeKey],
    queryFn: () => {
      const params = new URLSearchParams();
      if (hasActiveSites) params.set("siteId", selectedScopeParam);
      const qs = params.toString();
      return authFetch(`/api/data-entry/${selectedQuarterPeriod}${qs ? `?${qs}` : ""}`).then((r) => r.json());
    },
    enabled: !sitesLoading,
  });

  const { data: annualEntryData, isLoading: annualEntryLoading } = useQuery<any>({
    queryKey: ["/api/data-entry", selectedAnnualPeriod, selectedScopeKey],
    queryFn: () => {
      const params = new URLSearchParams();
      if (hasActiveSites) params.set("siteId", selectedScopeParam);
      const qs = params.toString();
      return authFetch(`/api/data-entry/${selectedAnnualPeriod}${qs ? `?${qs}` : ""}`).then((r) => r.json());
    },
    enabled: !sitesLoading,
  });

  useEffect(() => {
    if (dirtyRef.current.raw) return;
    if (rawData && Array.isArray(rawData)) {
      const inputs: Record<string, string> = {};
      rawData.forEach((d: any) => {
        inputs[d.inputName] = d.value !== null && d.value !== undefined ? String(Number(d.value)) : "";
      });
      setRawInputs(inputs);
    }
  }, [rawData, dirtyKeys]);

  useEffect(() => {
    if (Object.entries(dirtyRef.current).some(([key, dirty]) => key !== "raw" && dirty)) return;
    const periodValues = [entryData, quarterlyEntryData, annualEntryData].flatMap((data) => data?.values || []);
    const metricPeriodsById = new Map(
      buildCanonicalEnabledMetrics(metricDefinitions, companyMetrics)
        .filter((metric) => metric.id)
        .map((metric) => [metric.id as string, resolveMetricWorkspacePeriod(selectedPeriod, metric.frequency, metric.metricType)]),
    );
    const selectedMetricPeriodValues = periodValues.filter((value: any) => (
      metricPeriodsById.get(value.metricId) === value.period
    ));
    if (selectedMetricPeriodValues.length > 0) {
      const vals: Record<string, { value: string; notes: string }> = {};
      const dsTypes: Record<string, string> = {};
      selectedMetricPeriodValues.forEach((v: any) => {
        vals[v.metricId] = { value: formatMetricDisplayValue(v), notes: v.notes || "" };
        if (v.dataSourceType) dsTypes[v.metricId] = v.dataSourceType;
      });
      setManualValues(vals);
      setManualDataSourceTypes(dsTypes);
    } else {
      setManualValues({});
      setManualDataSourceTypes({});
    }
  }, [entryData, quarterlyEntryData, annualEntryData, metricDefinitions, companyMetrics, selectedPeriod, dirtyKeys]);

  useEffect(() => {
    const requestedMode = resolveInitialWorkspaceMode(searchParams);
    setActiveTab(requestedMode);
    if (requestedMode === "manual") setFocusedEntryMetricId(focusedMetricId);
    else if (requestedMode === "overview") setFocusedEntryMetricId(null);
    if (isReportingMonth(requestedPeriod)) setSelectedPeriod(requestedPeriod);
  }, [focusedMetricId, searchString]);

  useEffect(() => {
    if (!requestedSiteScope || sitesLoading) return;
    if (requestedSiteScope === "__org__" || requestedSiteScope === "null") {
      if (activeSiteId !== null) setActiveSiteId(null);
      return;
    }
    if (activeSites.some((site: any) => site.id === requestedSiteScope) && activeSiteId !== requestedSiteScope) {
      setActiveSiteId(requestedSiteScope);
    }
  }, [activeSiteId, activeSites, requestedSiteScope, setActiveSiteId, sitesLoading]);

  const activation = useActivationState();

  const saveRawMutation = useMutation({
    mutationFn: (data: { inputs: Record<string, string>; clearInputs?: string[]; period: string; siteId?: string | null }) =>
      apiRequest("POST", "/api/raw-data", data),
    onSuccess: () => {
      const isFirstData = !activation.hasAddedData;
      queryClient.invalidateQueries({ queryKey: ["/api/raw-data", selectedPeriod] });
      queryClient.invalidateQueries({ queryKey: ["/api/onboarding/status"] });
      invalidateReadinessQueries();
      if (isFirstData) trackEvent(AnalyticsEvents.FIRST_DATA_ADDED, { period: selectedPeriod });
      toast({
        title: "Data saved",
        description: isFirstData
          ? "Great start — add a supporting document to back this up."
          : "Your figures have been saved. Recalculating your metrics now.",
      });
    },
    onError: (error: Error) => toast({
      title: "Save failed",
      description: error.message || "We couldn't save your data. Check your internet connection and try again.",
      variant: "destructive",
    }),
  });

  const recalcMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/metrics/recalculate/${selectedPeriod}`, { siteId: selectedScopeSiteId }).then(r => r.json()),
    onSuccess: (data: any) => {
      setRecalcResults(data.updated || []);
      queryClient.invalidateQueries({ queryKey: ["/api/data-entry"] });
      invalidateReadinessQueries();
      const protectedCount = (data.guidedMetricSync?.skippedProtected?.length || 0)
        + (data.guidedMetricSync?.skippedLocked?.length || 0)
        + (data.calculatedSkippedLocked?.length || 0)
        + (data.calculatedSkippedProtected?.length || 0);
      toast({
        title: protectedCount > 0 ? "Metrics recalculated with protected values" : "Metrics recalculated",
        description: protectedCount > 0
          ? `${data.updated?.length || 0} metrics updated. ${protectedCount} locked, evidenced or reviewed value${protectedCount === 1 ? " was" : "s were"} left unchanged.`
          : `${data.updated?.length || 0} metrics updated`,
      });
    },
    onError: () => toast({ title: "Recalculation failed", description: "Data was saved but metrics couldn't be recalculated. Try clicking Save again.", variant: "destructive" }),
  });

  const saveManualMutation = useMutation({
    mutationFn: async (data: { metricId: string; period: string; value: string; notes: string; dataSourceType?: string; siteId?: string | null; attachments?: File[] }) => {
      if (data.attachments?.length) {
        const formData = new FormData();
        formData.append("metricId", data.metricId);
        formData.append("period", data.period);
        formData.append("value", data.value);
        formData.append("notes", data.notes || "");
        if (data.dataSourceType) formData.append("dataSourceType", data.dataSourceType);
        formData.append("siteId", data.siteId ?? "__org__");
        data.attachments.forEach((file) => formData.append("attachments", file, file.name));
        return apiRequest("POST", "/api/data-entry", formData).then((response) => response.json());
      }

      return apiRequest("POST", "/api/data-entry", {
        metricId: data.metricId,
        period: data.period,
        value: data.value,
        notes: data.notes,
        dataSourceType: data.dataSourceType,
        siteId: data.siteId,
      }).then((response) => response.json());
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/data-entry"] });
      queryClient.invalidateQueries({ queryKey: ["/api/evidence"] });
      queryClient.invalidateQueries({ queryKey: ["/api/evidence/coverage"] });
      invalidateReadinessQueries();
    },
    onError: (error: ApiRequestError) => {
      if (error.code === "EVIDENCE_PROVENANCE_PARTIAL_SUCCESS" && error.partialSuccess) {
        queryClient.invalidateQueries({ queryKey: ["/api/data-entry"] });
        queryClient.invalidateQueries({ queryKey: ["/api/evidence"] });
        queryClient.invalidateQueries({ queryKey: ["/api/evidence/coverage"] });
        invalidateReadinessQueries();
        toast({
          title: "Value and evidence saved",
          description: `${error.message} Unlock the period before changing this value again.`,
          variant: "destructive",
        });
        return;
      }
      if (error.code === "ATTACHMENT_PARTIAL_SUCCESS" && error.partialSuccess) {
        queryClient.invalidateQueries({ queryKey: ["/api/data-entry"] });
        queryClient.invalidateQueries({ queryKey: ["/api/evidence"] });
        queryClient.invalidateQueries({ queryKey: ["/api/evidence/coverage"] });
        invalidateReadinessQueries();
        toast({
          title: "Value saved; evidence not attached",
          description: `${error.message} The selected file remains queued so you can try the upload again.`,
          variant: "destructive",
        });
        return;
      }
      toast({
        title: "Value not saved",
        description: error.message || "We couldn't save this metric. Please try again.",
        variant: "destructive",
      });
    },
  });

  const deleteEvidenceMutation = useMutation({
    mutationFn: (evidenceId: string) => apiRequest("DELETE", `/api/evidence/${evidenceId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/evidence"] });
      queryClient.invalidateQueries({ queryKey: ["/api/evidence/coverage"] });
      queryClient.invalidateQueries({ queryKey: ["/api/data-entry"] });
      invalidateReadinessQueries();
      toast({ title: "Evidence removed" });
    },
    onError: (error: Error) => {
      toast({ title: "Could not remove evidence", description: error.message, variant: "destructive" });
    },
  });

  const fetchEstimatesMutation = useMutation({
    mutationFn: (opts?: { force?: boolean }) => apiRequest("POST", "/api/data-entries/estimate", {
      period: selectedPeriod,
      force: opts?.force ?? false,
      siteId: selectedScopeSiteId,
    }).then((r: any) => r.json()),
    onSuccess: (data: any) => {
      const estimates: Record<string, { value: number; label: string; unit: string; metricId: string; inputKey?: string; source: string; explanation: string; methodology: string }> = {};
      if (data?.estimates && Array.isArray(data.estimates)) {
        for (const e of data.estimates) {
          if (!e.shouldPrefill) continue;
          const key = e.metricId || e.metricName;
          estimates[key] = {
            value: e.estimatedValue,
            label: e.metricName,
            unit: e.unit || "",
            metricId: e.metricId || "",
            inputKey: "",
            source: `${data.industry || "sector"} average (${e.confidence} confidence)`,
            explanation: e.explanation || "",
            methodology: e.methodology || "",
          };
        }
      }
      if (Object.keys(estimates).length === 0) {
        toast({ title: "No estimates available", description: "All fields are already filled in, or we don't have sector data for your company type." });
      } else {
        setPendingEstimates(estimates);
        setEstimateBannerDismissed(false);
        setAcceptedEstimates(new Set());
        setSkippedEstimates(new Set());
      }
    },
    onError: () => toast({ title: "Could not load estimates", variant: "destructive" }),
  });

  const acceptEstimateMutation = useMutation({
    mutationFn: (estimate: { metricId: string; value: number; notes: string }) =>
      apiRequest("POST", "/api/data-entry", { ...estimate, period: selectedPeriod, dataSourceType: "estimated", siteId: selectedScopeSiteId }),
    onSuccess: (_, vars) => {
      setAcceptedEstimates(prev => new Set([...Array.from(prev), vars.metricId]));
      queryClient.invalidateQueries({ queryKey: ["/api/data-entry"] });
      invalidateReadinessQueries();
    },
    onError: () => toast({ title: "Could not save estimate", variant: "destructive" }),
  });

  const replaceEstimateMutation = useMutation({
    mutationFn: (data: { metricId: string; value: number; notes: string; saveAsActual: boolean }) =>
      apiRequest("POST", "/api/data-entry", { metricId: data.metricId, value: data.value, notes: data.notes, period: selectedPeriod, dataSourceType: data.saveAsActual ? "manual" : "estimated", siteId: selectedScopeSiteId }),
    onSuccess: (_, vars) => {
      setAcceptedEstimates(prev => new Set([...Array.from(prev), vars.metricId]));
      setEditingEstimate(null);
      setEditEstimateValue("");
      setEditSaveAsActual(false);
      queryClient.invalidateQueries({ queryKey: ["/api/data-entry"] });
      invalidateReadinessQueries();
      toast({ title: "Value saved", description: vars.saveAsActual ? "Saved as actual data." : "Saved as edited estimate." });
    },
    onError: () => toast({ title: "Could not save value", variant: "destructive" }),
  });

  useEffect(() => {
    if (!canEdit || focusEvidence || autoEstimateTriggered || estimateBannerDismissed) return;
    if (!entryData || entryLoading) return;
    const prefillKey = `estimate_prefill_shown_${selectedPeriod}_${selectedScopeKey}`;
    if (localStorage.getItem(prefillKey) === "true") return;
    const allMetrics = entryData?.metrics || [];
    const filledValues = (entryData?.values || []).filter((v: any) => formatMetricDisplayValue(v) !== "");
    const filledMetricIds = new Set(filledValues.map((v: any) => v.metricId));
    const entryEligibleMetrics = allMetrics.filter((m: any) => m.metricType === "manual" || !m.metricType);
    const emptyMetrics = entryEligibleMetrics.filter((m: any) => !filledMetricIds.has(m.id));
    if (entryEligibleMetrics.length > 0 && emptyMetrics.length > 0) {
      setAutoEstimateTriggered(true);
      localStorage.setItem(prefillKey, "true");
      fetchEstimatesMutation.mutate({});
    }
  }, [canEdit, entryData, entryLoading, focusEvidence, autoEstimateTriggered, estimateBannerDismissed, selectedPeriod, selectedScopeKey]);

  const lockMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/data-entry/${selectedPeriod}/lock`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/data-entry"] });
      toast({ title: `Period ${selectedPeriod} locked` });
    },
    onError: (error: unknown) => {
      const resolved = resolveApiError(error);
      toast({
        title: resolved.title || "Could not lock period",
        description: [resolved.description, resolved.nextStep].filter(Boolean).join(" "),
        variant: "destructive",
      });
    },
  });

  const submitWorkflowMutation = useMutation({
    mutationFn: async () => {
      const items = selectDataEntryWorkflowItems(scopedExistingValues, rawData || [], ["draft"]);
      const response = await apiRequest("POST", "/api/workflow/submit", { items });
      const result = await response.json() as WorkflowSubmitResponse;
      return combineWorkflowSubmitResponses(items.length, [result]);
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/data-entry"] });
      queryClient.invalidateQueries({ queryKey: ["/api/raw-data", selectedPeriod] });
      invalidateReadinessQueries();
      const notice = workflowSubmitNotice(result);
      toast({
        title: notice.title,
        description: notice.description,
        variant: notice.isPartial ? "destructive" : undefined,
      });
    },
    onError: (e: any) => {
      const r = resolveApiError(e);
      toast({ title: r.title, description: r.description + " " + r.nextStep, variant: "destructive" });
    },
  });

  const approveWorkflowMutation = useMutation({
    mutationFn: async ({ action, comment }: { action: "approve" | "reject"; comment?: string }) => {
      const items = selectDataEntryWorkflowItems(scopedExistingValues, rawData || [], ["submitted"]);
      const response = await apiRequest("POST", "/api/workflow/bulk-review", { items, action, comment });
      return response.json() as Promise<{
        requested: number;
        reviewed: number;
        notSubmitted: number;
        notFound: number;
        duplicates: number;
      }>;
    },
    onSuccess: (result, { action }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/data-entry"] });
      queryClient.invalidateQueries({ queryKey: ["/api/raw-data", selectedPeriod] });
      invalidateReadinessQueries();
      const notice = workflowReviewNotice(result, action);
      toast({
        title: notice.title,
        description: notice.description,
        variant: notice.isPartial ? "destructive" : undefined,
      });
    },
    onError: (e: any) => {
      const r = resolveApiError(e);
      toast({ title: r.title, description: r.description + " " + r.nextStep, variant: "destructive" });
    },
  });

  const reviseWorkflowMutation = useMutation({
    mutationFn: (item: DataEntryWorkflowItem) =>
      apiRequest("POST", "/api/workflow/revise", item).then((response) => response.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/data-entry"] });
      queryClient.invalidateQueries({ queryKey: ["/api/raw-data", selectedPeriod] });
      invalidateReadinessQueries();
      toast({ title: "Revision started", description: "Correct the rejected item, save it, then submit it again." });
    },
    onError: (error: any) => {
      const resolved = resolveApiError(error);
      toast({ title: resolved.title, description: `${resolved.description} ${resolved.nextStep}`, variant: "destructive" });
    },
  });

  const handleWorkflowReview = (action: "approve" | "reject") => {
    if (action === "approve") {
      approveWorkflowMutation.mutate({ action });
      return;
    }
    const comment = window.prompt("Explain what must be corrected before this data can be resubmitted:");
    if (comment === null) return;
    if (!comment.trim()) {
      toast({ title: "Rejection comment required", description: "Add clear correction guidance before rejecting these items.", variant: "destructive" });
      return;
    }
    approveWorkflowMutation.mutate({ action, comment: comment.trim() });
  };

  const handleSaveRawAndRecalc = async () => {
    const mutation = buildGuidedRawDataMutation({
      rawInputs,
      persistedRawData: rawData || [],
      visibleInputKeys: GUIDED_RAW_DATA_INPUT_KEYS,
    });
    const blockedInputNames = new Set(
      (rawData || [])
        .filter((row: any) => normalizeDataEntryWorkflowStatus(row.workflowStatus) !== "draft")
        .map((row: any) => String(row.inputName)),
    );
    const inputs = Object.fromEntries(
      Object.entries(mutation.inputs).filter(([inputName]) => !blockedInputNames.has(inputName)),
    );
    const clearInputs = mutation.clearInputs.filter((inputName) => !blockedInputNames.has(inputName));
    await saveRawMutation.mutateAsync({
      inputs,
      clearInputs,
      period: selectedPeriod,
      siteId: selectedScopeSiteId,
    });
    markSaved("raw");
    setLastSavedPeriod(selectedPeriod);
    await recalcMutation.mutateAsync();
  };

  const handleSaveManual = async (metricKey: string, metricId: string, metricPeriod: string) => {
    const val = manualValues[metricKey];
    if (!val?.value) return;
    const selectedSourceType = manualDataSourceTypes[metricKey] || "manual";
    // Evidence provenance is assigned by the server only after a file is
    // durably stored. Existing evidenced rows omit this field so an exact
    // no-op can append another attachment without spoofing provenance.
    const dataSourceType = selectedSourceType === "evidenced" ? undefined : selectedSourceType;
    const attachments = pendingAttachments[metricKey] || [];
    try {
      await saveManualMutation.mutateAsync({
        metricId,
        period: metricPeriod,
        value: val.value,
        notes: val.notes,
        dataSourceType,
        siteId: selectedScopeSiteId,
        attachments,
      });
    } catch (error) {
      // useMutation's onError renders the truthful server outcome, including
      // the retained-value attachment partial-success case.
      const requestError = error as ApiRequestError;
      if (
        attachments.length > 0
        && requestError.code === "EVIDENCE_PROVENANCE_PARTIAL_SUCCESS"
        && requestError.partialSuccess
      ) {
        // The server confirms these files are already durable, so keeping
        // them queued would invite a duplicate upload on the next save.
        setPendingAttachments((prev) => ({ ...prev, [metricKey]: [] }));
      }
      return;
    }
    if (attachments.length > 0) {
      setPendingAttachments((prev) => ({ ...prev, [metricKey]: [] }));
    }
    markSaved(metricKey);
    setLastSavedPeriod(selectedPeriod);
    const isFirstData = !activation.hasAddedData;
    if (isFirstData) {
      trackEvent(AnalyticsEvents.FIRST_DATA_ADDED, { period: metricPeriod, source: "manual" });
      queryClient.invalidateQueries({ queryKey: ["/api/onboarding/status"] });
    }
    toast({
      title: "Value saved",
      description: attachments.length > 0
        ? `${attachments.length} evidence file${attachments.length === 1 ? "" : "s"} uploaded with this metric.`
        : isFirstData
          ? "First data point recorded. Next: add an evidence file to support this entry."
          : "Metric updated for this period.",
    });
  };

  const monthlyExistingValues = entryData?.values || [];
  const existingValues = [
    ...monthlyExistingValues,
    ...(quarterlyEntryData?.values || []),
    ...(annualEntryData?.values || []),
  ];
  const evidenceFiles = [
    ...monthlyEvidenceFiles,
    ...quarterlyEvidenceFiles,
    ...annualEvidenceFiles,
  ];
  const isSelectedScopeValue = (value: any) =>
    selectedScopeSiteId === null
      ? value?.siteId === null || value?.siteId === undefined
      : value?.siteId === selectedScopeSiteId;
  const allEnabledMetrics = buildCanonicalEnabledMetrics(metricDefinitions, companyMetrics);
  const selectedMetricPeriodsById = new Map(
    allEnabledMetrics
      .filter((metric) => metric.id)
      .map((metric) => [
        metric.id as string,
        resolveMetricWorkspacePeriod(selectedPeriod, metric.frequency, metric.metricType),
      ]),
  );
  const scopedExistingValues = existingValues.filter((value: any) => (
    isSelectedScopeValue(value) && selectedMetricPeriodsById.get(value.metricId) === value.period
  ));
  const scopedMonthlyExistingValues = monthlyExistingValues.filter(isSelectedScopeValue);
  const isLocked = Boolean(entryData?.periodLocked) || scopedMonthlyExistingValues.some((v: any) => v.locked);
  const workflowCounts = summarizeDataEntryWorkflow(scopedExistingValues, rawData || []);
  const draftWorkflowItems = selectDataEntryWorkflowItems(scopedExistingValues, rawData || [], ["draft"]);
  const submittedWorkflowItems = selectDataEntryWorkflowItems(scopedExistingValues, rawData || [], ["submitted"]);
  const canonicalEvidenceMetrics = buildCanonicalEvidenceMetrics(allEnabledMetrics, evidenceCoverage?.metricCoverage || []);
  const isMetricEntryEligible = (metric: any) => !metric.missingCompanyMetric && isEditableDataEntryMetricType(metric.metricType);
  const eligibleMetrics = allEnabledMetrics.filter(isMetricEntryEligible);
  const editDisabled = isLocked || !canEdit || isReportingPeriodLocked || saveRawMutation.isPending || recalcMutation.isPending;
  const getMetricEvidence = (metricValueId: string | undefined, metricId: string | null | undefined, metricPeriod: string) =>
    evidenceFiles.filter((file: any) => (
      (metricValueId && file.linkedModule === "metric_value" && file.linkedEntityId === metricValueId) ||
      (
        metricId
        && file.linkedPeriod === metricPeriod
        && (file.metricId === metricId || (file.linkedModule === "metric" && file.linkedEntityId === metricId))
      )
    ));
  const queueMetricAttachments = (metricKey: string, files: FileList | null) => {
    if (!files || files.length === 0) return;
    setPendingAttachments((prev) => ({
      ...prev,
      [metricKey]: [...(prev[metricKey] || []), ...Array.from(files)],
    }));
  };
  const removePendingAttachment = (metricKey: string, index: number) => {
    setPendingAttachments((prev) => ({
      ...prev,
      [metricKey]: (prev[metricKey] || []).filter((_, fileIndex) => fileIndex !== index),
    }));
  };
  const focusedManualMetrics = focusedEntryMetricId
    ? allEnabledMetrics.filter((metric: any) => (
        metric.id === focusedEntryMetricId
        || metric.definitionId === focusedEntryMetricId
        || metric.key === focusedEntryMetricId
      ))
    : [];
  const unresolvedFocusedDefinition = focusedEntryMetricId && focusedManualMetrics.length === 0
    ? metricDefinitions.find((definition) => definition.id === focusedEntryMetricId) || null
    : null;
  const visibleManualMetrics = focusedEntryMetricId ? focusedManualMetrics : eligibleMetrics;
  const focusedHistoryMetric = focusedEntryMetricId
    ? focusedManualMetrics.find((metric: any) => metric.id) || null
    : null;
  const focusedHistoryMetricId = focusedHistoryMetric?.id || null;
  const focusedHistoryPeriod = focusedHistoryMetric
    ? resolveMetricWorkspacePeriod(selectedPeriod, focusedHistoryMetric.frequency, focusedHistoryMetric.metricType)
    : selectedPeriod;
  const metricWorkspaceRows = allEnabledMetrics.map((metric: any) => {
    const metricId = metric.id || metric.metricId || null;
    const metricKey = metricId || metric.key || metric.name;
    const metricPeriod = resolveMetricWorkspacePeriod(selectedPeriod, metric.frequency, metric.metricType);
    const metricValue = metricId
      ? existingValues.find((value: any) => value.metricId === metricId && value.period === metricPeriod && isSelectedScopeValue(value))
      : undefined;
    const attachedEvidence = getMetricEvidence(metricValue?.id, metricId, metricPeriod);
    const usableEvidence = attachedEvidence.filter((file) => isUsableMetricEvidence(file));
    const displayValue = metricValue ? formatMetricDisplayValue(metricValue) : "";
    const isEligible = isMetricEntryEligible(metric);
    // Calculated/derived outputs do not require duplicate output-row evidence;
    // their editable source rows carry the assurance requirements instead.
    const evidenceRequiredForWorkspace = isEligible && Boolean(metric.evidenceRequired);
    const state = classifyMetricDataState({
      value: displayValue,
      evidenceCount: usableEvidence.length,
      evidenceRequired: evidenceRequiredForWorkspace,
      requiresCorrection: normalizeDataEntryWorkflowStatus(metricValue?.workflowStatus) === "rejected",
    });
    return { metric, metricId, metricKey, metricPeriod, metricValue, displayValue, attachedEvidence, usableEvidence, state };
  });
  const metricWorkspaceSummary = summarizeMetricDataStates(metricWorkspaceRows.map((row) => row.state));
  const normalizedMetricSearch = metricSearch.trim().toLowerCase();
  const filteredMetricWorkspaceRows = metricWorkspaceRows.filter((row) => {
    const matchesSearch = !normalizedMetricSearch
      || row.metric.name.toLowerCase().includes(normalizedMetricSearch)
      || (row.metric.description || "").toLowerCase().includes(normalizedMetricSearch);
    const matchesStatus = metricStatusFilter === "all" || row.state === metricStatusFilter;
    return matchesSearch && matchesStatus;
  });
  const evidenceFocusStates = visibleManualMetrics.flatMap((metric: any) => {
    if (!metric.evidenceRequired) return [];
    const metricId = metric.id || metric.metricId || null;
    if (!metricId) return [];
    const metricPeriod = resolveMetricWorkspacePeriod(selectedPeriod, metric.frequency, metric.metricType);
    const metricValue = existingValues.find((value: any) => value.metricId === metricId && value.period === metricPeriod && isSelectedScopeValue(value));
    if (!metricValue || formatMetricDisplayValue(metricValue) === "") return [];
    return [getInlineMetricEvidenceState(getMetricEvidence(metricValue.id, metricId, metricPeriod))];
  });
  const evidenceFocusGapCount = evidenceFocusStates.filter(state => state === "missing").length;
  const evidenceFocusLinkedCount = evidenceFocusStates.length - evidenceFocusGapCount;

  const isLoading = rawLoading
    || entryLoading
    || quarterlyEntryLoading
    || annualEntryLoading
    || monthlyEvidenceLoading
    || quarterlyEvidenceLoading
    || annualEvidenceLoading
    || definitionsLoading
    || companyMetricsLoading
    || sitesLoading;
  if (isLoading) {
    return <div className="p-6 space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-20" />)}</div>;
  }

  const allRawFields = Object.values(RAW_DATA_FIELDS).flat();
  const starterRawFields = allRawFields.filter(field => SME_STARTER_INPUT_KEYS.has(field.key));
  const filledStarterRawCount = starterRawFields.filter(field => {
    const value = rawInputs[field.key];
    return value !== undefined && value !== null && value !== "";
  }).length;
  const filledTrackedMetricCount = metricWorkspaceRows.filter((row) => row.displayValue !== "").length;
  const returnToMetricsOverview = () => {
    if (!confirmLeave()) return;
    setFocusedEntryMetricId(null);
    setActiveTab("overview");
    setLocation(`/data-entry?period=${encodeURIComponent(selectedPeriod)}&siteId=${encodeURIComponent(selectedScopeKey)}`, { replace: true });
  };
  const navigateToWorkspaceMode = (mode: Exclude<DataWorkspaceMode, "overview">, metricId?: string) => {
    if (!confirmLeave()) return;
    const params = new URLSearchParams({ period: selectedPeriod, siteId: selectedScopeKey });
    if (mode === "manage") params.set("manage", "metrics");
    else if (mode === "raw") params.set("mode", "guided");
    else if (mode === "paste") params.set("mode", "import");
    else if (metricId) params.set("metric", metricId);
    else params.set("mode", "manual");
    setFocusedEntryMetricId(metricId ?? null);
    setActiveTab(mode);
    setLocation(`/data-entry?${params.toString()}`);
  };
  const changeWorkspacePeriod = (period: string) => {
    if (!confirmLeave()) return;
    setSelectedPeriod(period);
    reporting.setMonth(period);
    const params = new URLSearchParams(searchString);
    params.set("period", period);
    params.set("siteId", selectedScopeKey);
    setLocation(`/data-entry?${params.toString()}`, { replace: true });
  };
  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-lg sm:text-xl font-semibold flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-primary" />
            Data &amp; evidence
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            See what needs updating, add figures and keep the evidence behind every result.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!canEdit && (
            <Badge variant="secondary" className="gap-1" data-testid="badge-read-only">
              <Eye className="w-3 h-3" />
              Read Only
            </Badge>
          )}
          {activeTab !== "manage" && <Select value={selectedPeriod} onValueChange={changeWorkspacePeriod}>
            <SelectTrigger className="w-36" data-testid="select-period">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from(new Set([selectedPeriod, ...periods])).map(p => (
                <SelectItem key={p} value={p}>{p}</SelectItem>
              ))}
            </SelectContent>
          </Select>}
        </div>
      </div>

      <nav
        className="grid h-auto w-full grid-cols-2 rounded-lg bg-muted p-1"
        aria-label="Data and evidence workspace"
      >
        <Link
          href={`/data-entry?period=${encodeURIComponent(selectedPeriod)}&siteId=${encodeURIComponent(selectedScopeKey)}`}
          aria-current="page"
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-background px-3 py-2 text-sm font-medium shadow-sm"
          onClick={returnToMetricsOverview}
          data-testid="tab-metrics-data"
        >
          <ClipboardList className="h-4 w-4" />
          Metrics &amp; data
        </Link>
        <Link
          href={`/evidence?period=${encodeURIComponent(selectedPeriod)}&siteId=${encodeURIComponent(selectedScopeKey)}`}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-background/70 hover:text-foreground"
          data-testid="tab-documents"
        >
          <FileCheck className="h-4 w-4" />
          Documents
        </Link>
      </nav>

      {activeTab !== "manage" && hasActiveSites && (
        <div className="rounded-md border border-primary/20 bg-primary/5 p-3" data-testid="data-entry-site-scope-panel">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium flex items-center gap-1.5">
                {activeSite ? <MapPin className="w-3.5 h-3.5 text-primary" /> : <Globe className="w-3.5 h-3.5 text-muted-foreground" />}
                Data scope *
              </Label>
              <p className="text-xs text-muted-foreground">
                Values and evidence on this page are saved to {selectedScopeLabel}.
              </p>
            </div>
            <Select
              value={selectedScopeKey}
              onValueChange={(value) => {
                if (!confirmLeave()) return;
                setActiveSiteId(value === "__org__" ? null : value);
                const params = new URLSearchParams(searchString);
                params.set("period", selectedPeriod);
                params.set("siteId", value);
                setLocation(`/data-entry?${params.toString()}`, { replace: true });
                setManualValues({});
                setManualDataSourceTypes({});
                setRawInputs({});
                setPendingAttachments({});
                setRecalcResults(null);
              }}
            >
              <SelectTrigger className="w-full sm:w-64 bg-background" data-testid="select-data-entry-site-scope">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__org__">
                  <span className="flex items-center gap-1.5"><Globe className="w-3 h-3" /> Organisation-wide</span>
                </SelectItem>
                {activeSites.map((site) => (
                  <SelectItem key={site.id} value={site.id} data-testid={`option-data-entry-site-${site.id}`}>
                    <span className="flex items-center gap-1.5"><MapPin className="w-3 h-3" /> {site.name}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {focusEvidence && (
        <Alert
          className="border-blue-300 bg-blue-50 ring-1 ring-blue-200 dark:border-blue-800 dark:bg-blue-950/30 dark:ring-blue-900"
          data-testid="panel-measure-evidence-focus"
        >
          <FileCheck className="h-4 w-4 text-blue-600 dark:text-blue-300" />
          <AlertDescription className="space-y-2 text-blue-950 dark:text-blue-100">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm font-semibold">Add evidence where the value lives</p>
                <p className="mt-0.5 text-xs text-blue-800 dark:text-blue-200">
                  {canEdit
                    ? evidenceFocusStates.length === 0
                      ? "Enter or confirm a tracked value below, attach its bill, payroll report, certificate or other source, then save once."
                      : evidenceFocusGapCount > 0
                        ? `${evidenceFocusGapCount} saved metric value${evidenceFocusGapCount === 1 ? "" : "s"} still need a source. Use Attach evidence in a highlighted row; the file stays linked to this metric, period and scope.`
                        : "Every saved tracked value in this view has a linked source. You can still add another file or review its status below."
                    : "You can review linked evidence and its status here. Upload controls remain read-only because your role cannot edit metric data."}
                </p>
              </div>
              <Badge variant="outline" className="w-fit shrink-0 border-blue-300 bg-background/70 text-blue-800 dark:border-blue-700 dark:text-blue-200" data-testid="badge-evidence-focus-summary">
                {evidenceFocusStates.length > 0
                  ? `${evidenceFocusLinkedCount}/${evidenceFocusStates.length} linked`
                  : "Choose a metric"}
              </Badge>
            </div>
            <div className="flex flex-wrap items-center gap-1.5" aria-label="Evidence status guide">
              <span className="text-[11px] font-medium text-blue-800 dark:text-blue-200">Status:</span>
              <Badge variant="outline" className="h-5 border-blue-200 bg-background/70 px-1.5 py-0 text-[10px]">Source linked</Badge>
              <Badge variant="outline" className="h-5 border-amber-200 bg-amber-50 px-1.5 py-0 text-[10px] text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">Reviewed</Badge>
              <Badge variant="outline" className="h-5 border-emerald-200 bg-emerald-50 px-1.5 py-0 text-[10px] text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">Evidence-backed</Badge>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {activeTab !== "manage" && <details className="group rounded-md border border-border bg-card" data-testid="disclosure-period-review-controls">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 text-sm [&::-webkit-details-marker]:hidden">
          <span>
            <span className="font-medium">Period and review controls</span>
            <span className="ml-2 text-xs text-muted-foreground">Optional workflow, evidence and locking tools</span>
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <div className="flex flex-wrap items-center gap-2 border-t border-border p-3">
          {canEdit && (
            <Button
              size="sm"
              variant={highlightEstimated ? "secondary" : "outline"}
              className="h-8 text-xs gap-1.5"
              onClick={() => {
                const nextParams = new URLSearchParams(searchString);
                nextParams.set("period", selectedPeriod);
                nextParams.set("siteId", selectedScopeKey);
                if (highlightEstimated) nextParams.delete("highlight");
                else nextParams.set("highlight", "estimated");
                setLocation(`/data-entry?${nextParams.toString()}`, { replace: true });
              }}
              data-testid="button-review-estimates"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Review estimates
            </Button>
          )}
          {reportingPeriods.length > 0 && (
            <Select value={selectedReportingPeriodId} onValueChange={setSelectedReportingPeriodId}>
              <SelectTrigger className="w-44" data-testid="select-reporting-period">
                <SelectValue placeholder="All Periods" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Periods</SelectItem>
                {reportingPeriods.map((rp: any) => (
                  <SelectItem key={rp.id} value={rp.id}>{rp.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {activeReportingPeriod && (
            <Badge
              variant={activeReportingPeriod.status === "locked" ? "secondary" : activeReportingPeriod.status === "closed" ? "outline" : "default"}
              className="text-xs gap-1"
              data-testid="badge-period-status"
            >
              {activeReportingPeriod.status === "locked" && <Lock className="w-3 h-3" />}
              {activeReportingPeriod.status}
            </Badge>
          )}
          {isReportingPeriodLocked && (
            <Badge variant="destructive" className="text-xs gap-1" data-testid="text-period-locked">
              <Lock className="w-3 h-3" />
              Period Locked
            </Badge>
          )}
          {evidenceCoverage && (
            <Badge variant="outline" className="text-xs gap-1" data-testid="badge-evidence-summary">
              <FileCheck className="w-3 h-3" />
              All-time evidence: {canonicalEvidenceMetrics.filter((m) => m.hasEvidence).length}/{allEnabledMetrics.length} enabled metrics
            </Badge>
          )}
          {workflowCounts.total > 0 && (
            <div className="flex flex-wrap items-center gap-1.5" data-testid="workflow-status-counts">
              {(["draft", "submitted", "approved", "rejected"] as const).map((status) => workflowCounts[status] > 0 && (
                <span key={status} className="inline-flex items-center gap-1" data-testid={`workflow-count-${status}`}>
                  <WorkflowBadge status={status} size="sm" />
                  <span className="text-xs text-muted-foreground">{workflowCounts[status]}</span>
                </span>
              ))}
            </div>
          )}
          {isLocked ? (
            <Badge variant="secondary" className="gap-1">
              <Lock className="w-3 h-3" />
              Locked
            </Badge>
          ) : isAdmin ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => lockMutation.mutate()}
              disabled={lockMutation.isPending}
              data-testid="button-lock-period-header"
            >
              <Lock className="w-3.5 h-3.5 mr-1.5" />
              {lockMutation.isPending ? "Locking..." : "Lock Period"}
            </Button>
          ) : null}
          {canEdit && draftWorkflowItems.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => submitWorkflowMutation.mutate()}
              disabled={submitWorkflowMutation.isPending}
              data-testid="button-submit-period"
            >
              <Send className="w-3.5 h-3.5 mr-1.5" />
              {submitWorkflowMutation.isPending ? "Submitting..." : `Submit ${draftWorkflowItems.length} draft item${draftWorkflowItems.length === 1 ? "" : "s"}`}
            </Button>
          )}
          {canApprove && submittedWorkflowItems.length > 0 && (
            <>
              <Button
                variant="default"
                size="sm"
                onClick={() => handleWorkflowReview("approve")}
                disabled={approveWorkflowMutation.isPending}
                data-testid="button-approve-period"
              >
                <Check className="w-3.5 h-3.5 mr-1.5" />
                Approve {submittedWorkflowItems.length}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => handleWorkflowReview("reject")}
                disabled={approveWorkflowMutation.isPending}
                data-testid="button-reject-period"
              >
                <X className="w-3.5 h-3.5 mr-1.5" />
                Reject {submittedWorkflowItems.length}
              </Button>
            </>
          )}
        </div>
      </details>}

      {activeTab !== "manage" && highlightEstimated && Object.keys(pendingEstimates).length === 0 && !fetchEstimatesMutation.isPending && !estimateBannerDismissed && (
        <Alert className="border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800" data-testid="banner-highlight-estimated">
          <Sparkles className="w-4 h-4 text-amber-600" />
          <AlertDescription className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-amber-900 dark:text-amber-200">Review your estimated values</p>
              <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">Fields with estimated data are highlighted below. Replace them with actual figures, or load new estimates for any remaining empty fields.</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                size="sm"
                variant="outline"
                className="border-amber-300 text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-300"
                onClick={() => fetchEstimatesMutation.mutate({})}
                disabled={fetchEstimatesMutation.isPending}
                data-testid="button-load-estimates"
              >
                <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                {fetchEstimatesMutation.isPending ? "Loading..." : "Load new estimates"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="border-amber-300 text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-300"
                onClick={() => fetchEstimatesMutation.mutate({ force: true })}
                disabled={fetchEstimatesMutation.isPending}
                data-testid="button-recalculate-estimates"
              >
                <Calculator className="w-3.5 h-3.5 mr-1.5" />
                Recalculate
              </Button>
              <Button size="sm" variant="ghost" className="text-amber-700 dark:text-amber-300 h-7 px-2" onClick={() => setEstimateBannerDismissed(true)} data-testid="button-dismiss-estimate-banner">
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {(activeTab === "raw" || highlightEstimated) && Object.keys(pendingEstimates).length > 0 && !estimateBannerDismissed && (
        <details className="group rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20" data-testid="card-estimate-prefill">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
            <div className="flex min-w-0 items-center gap-2">
              <Sparkles className="h-4 w-4 shrink-0 text-amber-600" />
              <span className="truncate text-sm font-medium">Review {Object.keys(pendingEstimates).length} pre-filled estimate{Object.keys(pendingEstimates).length === 1 ? "" : "s"}</span>
              <Badge variant="outline" className="hidden shrink-0 border-amber-300 text-xs text-amber-700 dark:border-amber-700 dark:text-amber-300 sm:inline-flex">
                Optional
              </Badge>
            </div>
            <ChevronDown className="h-4 w-4 shrink-0 text-amber-700 transition-transform group-open:rotate-180 dark:text-amber-300" />
          </summary>
        <Card className="rounded-t-none border-x-0 border-b-0 border-amber-200 bg-transparent shadow-none dark:border-amber-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-600" />
                <span>Pre-filled Estimates</span>
                <Badge variant="outline" className="text-xs border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-300">
                  Estimated
                </Badge>
              </div>
              <Button size="sm" variant="ghost" className="h-6 px-2 text-muted-foreground" onClick={() => setEstimateBannerDismissed(true)} data-testid="button-close-estimates">
                <X className="w-3.5 h-3.5" />
              </Button>
            </CardTitle>
            <p className="text-xs text-amber-700 dark:text-amber-300">
              These sector-based estimates fill empty fields only — your actual data is never overwritten.
              Accept to use as a starting point, or skip to enter your own figures.
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {Object.entries(pendingEstimates).map(([key, est]) => {
              const isAccepted = acceptedEstimates.has(key);
              const isSkipped = skippedEstimates.has(key);
              if (isSkipped) return null;
              return (
                <div
                  key={key}
                  className={`flex items-center justify-between gap-3 p-3 rounded-md border bg-white dark:bg-amber-950/30 ${isAccepted ? "border-emerald-300 dark:border-emerald-700" : "border-amber-200 dark:border-amber-800"}`}
                  data-testid={`estimate-row-${key}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{est.label}</span>
                      <ValueSourceBadge source="estimated" />
                      <span className="text-xs text-muted-foreground">{est.unit}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-base font-bold">{est.value.toLocaleString()}</span>
                      <span className="text-xs text-muted-foreground">from {est.source}</span>
                    </div>
                    {est.explanation && (
                      <p className="text-xs text-amber-700/80 dark:text-amber-400/80 mt-1">{est.explanation}</p>
                    )}
                    {est.methodology && (
                      <p className="text-[10px] text-muted-foreground mt-0.5 italic">{est.methodology}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {isAccepted ? (
                      <Badge variant="secondary" className="text-xs gap-1 text-emerald-600 dark:text-emerald-400" data-testid={`estimate-accepted-${key}`}>
                        <CheckCircle2 className="w-3 h-3" />
                        Accepted
                      </Badge>
                    ) : editingEstimate === key ? (
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            value={editEstimateValue}
                            onChange={(e) => setEditEstimateValue(e.target.value)}
                            className="h-7 w-24 text-xs"
                            data-testid={`input-edit-estimate-${key}`}
                            autoFocus
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-300"
                            onClick={() => {
                              const val = parseFloat(editEstimateValue);
                              if (!isNaN(val) && est.metricId) {
                                replaceEstimateMutation.mutate({ metricId: est.metricId, value: val, notes: editSaveAsActual ? "Actual value" : `Edited estimate (${est.source})`, saveAsActual: editSaveAsActual });
                              }
                            }}
                            disabled={replaceEstimateMutation.isPending}
                            data-testid={`button-save-edited-${key}`}
                          >
                            Save
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs"
                            onClick={() => { setEditingEstimate(null); setEditEstimateValue(""); setEditSaveAsActual(false); }}
                            data-testid={`button-cancel-edit-${key}`}
                          >
                            Cancel
                          </Button>
                        </div>
                        <label className="flex items-center gap-1.5 cursor-pointer" data-testid={`toggle-save-as-actual-${key}`}>
                          <input
                            type="checkbox"
                            checked={editSaveAsActual}
                            onChange={(e) => setEditSaveAsActual(e.target.checked)}
                            className="rounded border-gray-300"
                          />
                          <span className="text-[10px] text-muted-foreground">Save as actual (not estimate)</span>
                        </label>
                      </div>
                    ) : (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-300"
                          onClick={() => {
                            if (est.metricId) {
                              const noteText = [est.explanation, est.methodology].filter(Boolean).join(" | ") || `Sector estimate (${est.source})`;
                              acceptEstimateMutation.mutate({ metricId: est.metricId, value: est.value, notes: noteText });
                            } else {
                              setAcceptedEstimates(prev => new Set([...Array.from(prev), key]));
                              if (est.inputKey) {
                                markDirty("raw");
                                setRawInputs(prev => ({ ...prev, [est.inputKey!]: String(est.value) }));
                              }
                            }
                          }}
                          disabled={acceptEstimateMutation.isPending}
                          data-testid={`button-accept-estimate-${key}`}
                        >
                          <Check className="w-3 h-3 mr-1" />
                          Accept
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => { setEditingEstimate(key); setEditEstimateValue(String(est.value)); }}
                          data-testid={`button-edit-estimate-${key}`}
                        >
                          <Pencil className="w-3 h-3 mr-1" />
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs text-muted-foreground"
                          onClick={() => setSkippedEstimates(prev => new Set([...Array.from(prev), key]))}
                          data-testid={`button-skip-estimate-${key}`}
                        >
                          Skip
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
            {Object.keys(pendingEstimates).length > 0 && (
              <div className="flex items-center justify-between pt-2">
                <p className="text-xs text-muted-foreground">
                  {acceptedEstimates.size} of {Object.keys(pendingEstimates).length - skippedEstimates.size} estimates accepted
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs h-7"
                  onClick={() => {
                    const allAccepted = new Set<string>();
                    for (const [key, est] of Object.entries(pendingEstimates)) {
                      if (!skippedEstimates.has(key)) {
                        allAccepted.add(key);
                        if (est.metricId) {
                          const noteText = [est.explanation, est.methodology].filter(Boolean).join(" | ") || `Sector estimate (${est.source})`;
                          acceptEstimateMutation.mutate({ metricId: est.metricId, value: est.value, notes: noteText });
                        } else if (est.inputKey) {
                          markDirty("raw");
                                setRawInputs(prev => ({ ...prev, [est.inputKey!]: String(est.value) }));
                        }
                      }
                    }
                    setAcceptedEstimates(allAccepted);
                  }}
                  data-testid="button-accept-all-estimates"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                  Accept All
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
        </details>
      )}

      {activeTab !== "manage" && !canEdit && (
        <PermissionBanner
          module="metrics_data_entry"
          customMessage="Your role can review metrics, values and evidence here, but cannot update them."
          testId="banner-data-entry-permission"
        />
      )}

      <CarbonImportDialog open={importDialogOpen} onClose={() => setImportDialogOpen(false)} period={selectedPeriod} />

      <div>
        {activeTab === "overview" && <section className="space-y-4">
          <Card data-testid="metrics-data-overview">
            <CardHeader className="gap-4 pb-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1">
                <CardTitle className="text-base">What needs updating?</CardTitle>
                <CardDescription data-testid="metrics-data-summary">
                  {metricWorkspaceSummary.complete} of {metricWorkspaceSummary.total} tracked items ready · {metricWorkspaceSummary.needsData} need a figure · {metricWorkspaceSummary.needsEvidence} need evidence
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                {canEdit && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button data-testid="button-update-data">
                        Add or update data
                        <ChevronDown className="ml-2 h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-64" data-testid="menu-update-data">
                      <DropdownMenuItem
                        className="items-start gap-3 py-3"
                        onSelect={() => navigateToWorkspaceMode("raw")}
                        data-testid="action-guided-entry"
                      >
                        <Calculator className="mt-0.5 h-4 w-4 text-primary" />
                        <span>
                          <span className="block font-medium" data-testid="tab-raw-data">Guided entry</span>
                          <span className="block text-xs text-muted-foreground">Use bills, payroll and records to update related metrics.</span>
                        </span>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="items-start gap-3 py-3"
                        onSelect={() => navigateToWorkspaceMode("paste")}
                        data-testid="action-spreadsheet-import"
                      >
                        <FileSpreadsheet className="mt-0.5 h-4 w-4 text-primary" />
                        <span>
                          <span className="block font-medium" data-testid="tab-paste-excel">Import spreadsheet</span>
                          <span className="block text-xs text-muted-foreground">Paste a table or upload a prepared CSV file.</span>
                        </span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigateToWorkspaceMode("manage")}
                  data-testid="button-manage-metrics"
                >
                  <Settings2 className="mr-2 h-4 w-4" />
                  {canEdit ? "Choose what we track" : "View metric set"}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Metric completion filters">
                {([
                  { key: "all", label: "All", value: metricWorkspaceSummary.total },
                  { key: "needs-data", label: "Needs a figure", value: metricWorkspaceSummary.needsData },
                  { key: "needs-evidence", label: "Needs evidence", value: metricWorkspaceSummary.needsEvidence },
                  { key: "complete", label: "Ready", value: metricWorkspaceSummary.complete },
                ] as const).map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    className={`rounded-md border px-3 py-2 text-left transition-colors ${metricStatusFilter === item.key ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
                    onClick={() => setMetricStatusFilter(item.key)}
                    aria-pressed={metricStatusFilter === item.key}
                    data-testid={`filter-metrics-${item.key}`}
                  >
                    <span className="mr-2 text-sm font-semibold">{item.value}</span>
                    <span className="text-xs text-muted-foreground">{item.label}</span>
                  </button>
                ))}
              </div>

              <div className="relative">
                <Label htmlFor="metrics-data-search" className="sr-only">Search tracked metrics</Label>
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="metrics-data-search"
                  value={metricSearch}
                  onChange={(event) => setMetricSearch(event.target.value)}
                  placeholder="Search tracked metrics"
                  className="pl-9"
                  data-testid="input-search-tracked-metrics"
                />
              </div>

              <div className="space-y-5">
                {(["environmental", "social", "governance"] as const).map((category) => {
                  const categoryRows = filteredMetricWorkspaceRows.filter((row) => row.metric.category === category).sort((a, b) => Number(isMetricEntryEligible(b.metric)) - Number(isMetricEntryEligible(a.metric)));
                  if (categoryRows.length === 0) return null;
                  const config = CATEGORY_ICONS[category];
                  const Icon = config.icon;
                  return (
                    <section key={category} className="space-y-2" aria-labelledby={`metrics-data-${category}`}>
                      <div className="flex items-center gap-2 px-1">
                        <div className={`rounded-md p-1.5 ${config.bg}`}><Icon className={`h-3.5 w-3.5 ${config.color}`} /></div>
                        <h2 id={`metrics-data-${category}`} className="text-sm font-semibold">{config.label}</h2>
                        <span className="text-xs text-muted-foreground">{categoryRows.length}</span>
                      </div>
                      <div className="divide-y rounded-lg border bg-card">
                        {categoryRows.map(({ metric, metricId, metricKey, metricPeriod, metricValue, displayValue, attachedEvidence, usableEvidence, state }) => {
                          const isEligible = isMetricEntryEligible(metric);
                          const stateLabel = state === "needs-data" ? "Needs update" : state === "needs-evidence" ? "Needs evidence" : "Complete";
                          const stateClass = state === "needs-data"
                            ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300"
                            : state === "needs-evidence"
                              ? "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-300"
                              : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300";
                          return (
                            <div
                              key={metricKey}
                              className="grid gap-3 p-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center"
                              data-testid={`metric-data-row-${metricKey}`}
                            >
                              <div className="min-w-0 space-y-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="truncate text-sm font-medium">{metric.name}</p>
                                  {!isEligible && (
                                    <Badge variant="secondary" className="text-[10px]">
                                      <Calculator className="mr-1 h-3 w-3" />
                                      {metric.metricType === "derived" ? "Derived" : "Calculated"}
                                    </Badge>
                                  )}
                                  {metricValue?.dataSourceType === "estimated" && <ValueSourceBadge source="estimated" />}
                                  {metric.frequency && metric.frequency !== "monthly" && (
                                    <Badge variant="outline" className="text-[10px] capitalize">{metric.frequency}</Badge>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  {displayValue !== "" ? `${displayValue}${metric.unit && !isBooleanMetricDataType(metric.dataType) ? ` ${metric.unit}` : ""} · ${metricPeriod}` : `No value for ${metricPeriod}`}
                                </p>
                                {!isEligible && metric.formulaText && (
                                  <p className="truncate text-[11px] text-muted-foreground">Calculated from: {metric.formulaText}</p>
                                )}
                              </div>
                              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                                <Badge variant="outline" className={`text-[10px] ${stateClass}`} data-testid={`metric-data-state-${metricKey}`}>
                                  {stateLabel}
                                </Badge>
                                {usableEvidence.length > 0 ? (
                                  <Badge variant="outline" className="text-[10px] text-emerald-700 dark:text-emerald-300">
                                    <FileCheck className="mr-1 h-3 w-3" /> Evidence attached
                                  </Badge>
                                ) : attachedEvidence.length > 0 && metric.evidenceRequired ? (
                                  <Badge variant="outline" className="text-[10px] text-amber-700 dark:text-amber-300">
                                    <AlertCircle className="mr-1 h-3 w-3" /> Evidence needs replacing
                                  </Badge>
                                ) : !isEligible && displayValue !== "" ? (
                                  <Badge variant="outline" className="text-[10px] text-blue-700 dark:text-blue-300">
                                    <Calculator className="mr-1 h-3 w-3" /> Source inputs used
                                  </Badge>
                                ) : displayValue !== "" && metric.evidenceRequired && state !== "needs-evidence" ? (
                                  <Badge variant="outline" className="text-[10px] text-muted-foreground">
                                    <Paperclip className="mr-1 h-3 w-3" /> Evidence needed
                                  </Badge>
                                ) : null}
                              </div>
                              {metricId ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={state === "needs-data" && canEdit ? "default" : "outline"}
                                  onClick={() => navigateToWorkspaceMode("manual", metricId)}
                                  data-testid={`button-open-metric-${metricKey}`}
                                >
                                  {!isEligible ? "View calculation" : !canEdit ? "View" : displayValue !== "" ? "Update" : "Add data"}
                                </Button>
                              ) : (
                                <Badge variant="outline" className="text-[10px]">Awaiting setup</Badge>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  );
                })}
              </div>

              {filteredMetricWorkspaceRows.length === 0 && (
                <EmptyState
                  icon={metricWorkspaceSummary.total === 0 ? Settings2 : Search}
                  title={metricWorkspaceSummary.total === 0 ? "Choose the metrics that matter" : "No metrics match"}
                  description={metricWorkspaceSummary.total === 0
                    ? "Start with the recommended set for your business, then add or remove metrics whenever your requirements change."
                    : "Try another search or choose a different completion filter."}
                  actionLabel={metricWorkspaceSummary.total === 0 ? "Choose metrics" : "Clear filters"}
                  onAction={() => {
                    if (metricWorkspaceSummary.total === 0) navigateToWorkspaceMode("manage");
                    else {
                      setMetricSearch("");
                      setMetricStatusFilter("all");
                    }
                  }}
                />
              )}
            </CardContent>
          </Card>
        </section>}

        {activeTab === "manage" && <section data-testid="panel-manage-metrics">
          <MetricsLibraryContent embedded onBack={returnToMetricsOverview} />
        </section>}

        {activeTab === "paste" && <section className="space-y-4" data-testid="panel-spreadsheet-import">
          <div className="flex flex-wrap items-start gap-3 rounded-lg border bg-card p-4">
            <Button type="button" variant="ghost" size="sm" onClick={returnToMetricsOverview} data-testid="button-back-from-spreadsheet-import">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back
            </Button>
            <div>
              <h2 className="font-semibold">Import spreadsheet</h2>
              <p className="text-sm text-muted-foreground">Update several metrics at once, with a review before anything is saved.</p>
            </div>
          </div>
          {canEdit ? (
            <>
              <div className="flex flex-col gap-3 rounded-md border border-border bg-background p-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium">Bring in an existing spreadsheet</p>
                  <p className="text-xs text-muted-foreground">Paste values into the grid below, or upload a prepared CSV file.</p>
                </div>
                {isPro ? (
                  <Button variant="outline" size="sm" onClick={() => setImportDialogOpen(true)} data-testid="button-open-carbon-import">
                    <Upload className="w-3.5 h-3.5 mr-1.5" />
                    Upload CSV file
                  </Button>
                ) : (
                  <UpgradeButton
                    feature="CSV Import"
                    size="sm"
                    variant="outline"
                    valueMessage="Import a full year from CSV, or paste values from Excel — no row-by-row entry."
                    data-testid="button-import-upgrade"
                  >
                    Upload CSV file
                  </UpgradeButton>
                )}
              </div>
              <PasteFromExcelTab selectedPeriod={selectedPeriod} />
            </>
          ) : (
            <div className="text-center py-12 space-y-2">
              <Eye className="w-8 h-8 text-muted-foreground mx-auto" />
              <p className="text-sm text-muted-foreground">You do not have permission to paste data.</p>
            </div>
          )}
        </section>}

        {activeTab === "raw" && <section className="space-y-4" data-testid="panel-guided-entry">
          <div className="flex flex-wrap items-start gap-3 rounded-lg border bg-card p-4">
            <Button type="button" variant="ghost" size="sm" onClick={returnToMetricsOverview} data-testid="button-back-from-guided-entry">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back
            </Button>
            <div>
              <h2 className="font-semibold">Guided entry</h2>
              <p className="text-sm text-muted-foreground">Add familiar business figures and let SimplyESG update the related metrics.</p>
              {searchParams.get("sourceMetric") && <p className="mt-2 text-sm font-medium text-primary">Source figures for {companyMetrics.find(metric => metric.id === searchParams.get("sourceMetric"))?.name || "your selected calculation"}: {companyMetrics.find(metric => metric.id === searchParams.get("sourceMetric"))?.formulaText || "enter the relevant business figures below; the result is calculated for you."}</p>}
            </div>
          </div>
          <div className="flex flex-col gap-3 rounded-md border border-border bg-muted/50 p-3 sm:flex-row sm:items-center">
            <div className="flex-1">
              <p className="text-sm font-medium">Guided calculation inputs</p>
              <p className="text-xs text-muted-foreground">
                {filledStarterRawCount}/{starterRawFields.length} guided inputs added.
                {filledTrackedMetricCount > 0
                  ? ` You already have ${filledTrackedMetricCount} tracked figure${filledTrackedMetricCount === 1 ? "" : "s"} saved for this month.`
                  : " Start with one or two figures you can find easily."}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-sm font-semibold text-primary">{filledStarterRawCount}/{starterRawFields.length} guided</div>
            </div>
          </div>

          <Alert className="border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-800">
            <Calculator className="w-4 h-4 text-blue-500" />
            <AlertDescription className="text-sm">
              Start with the figures you can find easily. Saving these inputs automatically updates emissions, workforce and governance indicators; calculated results remain read-only.
            </AlertDescription>
          </Alert>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-background p-3" data-testid="priority-inputs-disclosure">
            <div>
              <p className="text-sm font-medium">Keep the first baseline focused</p>
              <p className="text-xs text-muted-foreground">
                Seven useful inputs are shown first across environment, people and governance. Enter 0 where there was no activity; leave a figure blank only when it is not yet known.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowAllInputs(value => !value)}
              aria-expanded={showAllInputs}
              data-testid="button-toggle-optional-inputs"
            >
              {showAllInputs ? "Show starter inputs" : "Show all inputs"}
            </Button>
          </div>

          {(Object.entries(RAW_DATA_FIELDS) as [keyof typeof CATEGORY_ICONS, typeof RAW_DATA_FIELDS.environmental][]).map(([cat, fields]) => {
            const config = CATEGORY_ICONS[cat];
            const Icon = config.icon;
            const visibleFields = showAllInputs
              ? fields
              : fields.filter(field => SME_STARTER_INPUT_KEYS.has(field.key));

            return (
              <Card key={cat}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <div className={`p-1.5 rounded-md ${config.bg}`}>
                      <Icon className={`w-3.5 h-3.5 ${config.color}`} />
                    </div>
                    {config.label} Inputs
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {visibleFields.map(field => {
                      const fieldPriority = getRawFieldPriority(field.key);
                      const pc = PRIORITY_LABELS[fieldPriority];
                      const existingRaw = rawData?.find((d: any) => d.inputName === field.key);
                      const rawWorkflowStatus = normalizeDataEntryWorkflowStatus(existingRaw?.workflowStatus);
                      const rawWorkflowLocked = Boolean(existingRaw) && rawWorkflowStatus !== "draft";
                      const fieldPrompts = CONTEXTUAL_PROMPTS[field.key];
                      return (
                        <div key={field.key} className="space-y-1.5" data-testid={`raw-field-${field.key}`}>
                          <Label htmlFor={`raw-input-${field.key}`} className="text-sm flex items-center gap-1.5 flex-wrap">
                            {field.label}
                            <span className="text-xs text-muted-foreground">({field.unit})</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${pc.color}`} data-testid={`badge-priority-${field.key}`}>{pc.label}</span>
                            {existingRaw?.dataSourceType && <DataSourceBadge type={existingRaw.dataSourceType} />}
                            {existingRaw?.workflowStatus && <WorkflowBadge status={rawWorkflowStatus} size="sm" />}
                            {rawWorkflowStatus === "rejected" && existingRaw?.id && !editDisabled && (
                              <Button
                                type="button"
                                variant="outline"
                                className="h-6 px-2 text-[11px]"
                                disabled={reviseWorkflowMutation.isPending}
                                onClick={() => reviseWorkflowMutation.mutate({ entityType: "raw_data", entityId: String(existingRaw.id) })}
                                data-testid={`button-revise-raw-${field.key}`}
                              >
                                <Pencil className="mr-1 h-3 w-3" />
                                Revise
                              </Button>
                            )}
                          </Label>
                          <Input
                            id={`raw-input-${field.key}`}
                            type="number"
                            step="any"
                            value={rawInputs[field.key] ?? ""}
                            onChange={e => { const value = e.target.value; markDirty("raw"); setRawInputs(prev => ({ ...prev, [field.key]: value })); }}
                            placeholder={`Enter ${field.unit}`}
                            disabled={editDisabled || rawWorkflowLocked}
                            className="h-8 text-sm"
                            data-testid={`input-raw-${field.key}`}
                          />
                          <p className="text-xs text-muted-foreground">{field.help}</p>
                          {rawWorkflowStatus === "rejected" && existingRaw?.reviewComment && (
                            <p className="text-xs text-destructive" data-testid={`text-rejection-raw-${field.key}`}>
                              Reviewer feedback: {existingRaw.reviewComment}
                            </p>
                          )}
                          {fieldPrompts && (
                            <div className="space-y-0.5">
                              {fieldPrompts.map((prompt, i) => (
                                <p key={i} className="text-[11px] text-muted-foreground/70 flex items-center gap-1">
                                  <span className="text-primary/50">›</span> {prompt}
                                </p>
                              ))}
                            </div>
                          )}
                          <InlineGuidanceTrigger metricKey={field.key} />
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {!editDisabled && (
            <div className="flex items-center justify-end gap-4">
              <ContextualHelpLink slug="add-first-esg-data-point" label="How to enter data" />
              <Button
                onClick={handleSaveRawAndRecalc}
                disabled={saveRawMutation.isPending || recalcMutation.isPending}
                data-testid="button-save-recalculate"
              >
                <Calculator className="w-4 h-4 mr-2" />
                {saveRawMutation.isPending || recalcMutation.isPending ? "Saving..." : "Save data"}
              </Button>
            </div>
          )}

          {lastSavedPeriod === selectedPeriod && !activation.hasUploadedEvidence && (
            <div className="flex flex-col gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 dark:border-blue-800 dark:bg-blue-950/20 sm:flex-row sm:items-center sm:justify-between" data-testid="banner-upload-evidence">
              <div className="flex items-center gap-2 min-w-0">
                <CheckCircle2 className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                <p className="text-sm text-blue-800 dark:text-blue-200 leading-snug">
                  Data saved for {selectedPeriod}. Open a metric to attach evidence to its exact value and period.
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="shrink-0 border-blue-300 text-blue-700 hover:bg-blue-100 dark:border-blue-700 dark:text-blue-300"
                onClick={() => navigateToWorkspaceMode("manual")}
                data-testid="button-open-manual-entry-for-evidence"
              >
                Open metric rows <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </div>
          )}

          {recalcResults && recalcResults.length > 0 && (
            <Card className="border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="w-4 h-4" />
                  Calculated Results
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {recalcResults.map((r: any, i: number) => (
                    <div key={i} className="flex items-center justify-between p-2 bg-white dark:bg-emerald-950/30 rounded border border-emerald-100 dark:border-emerald-900">
                      <span className="text-sm flex items-center gap-1">
                        {r.metric}
                        {r.metric === "Scope 1 Emissions" && <EsgTooltip term="scope1" />}
                        {r.metric === "Scope 2 Emissions" && <EsgTooltip term="scope2" />}
                        {r.metric === "Scope 3 Emissions" && <EsgTooltip term="scope3" />}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold">{typeof r.value === "number" ? r.value.toFixed(2) : r.value}</span>
                        <div className={`w-2 h-2 rounded-full ${r.status === "green" ? "bg-emerald-500" : r.status === "amber" ? "bg-amber-500" : "bg-red-500"}`} />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </section>}

        {activeTab === "manual" && <section className="space-y-4" data-testid="panel-manual-metric-entry">
          <div className="flex flex-wrap items-start gap-3 rounded-lg border bg-card p-4">
            <Button type="button" variant="ghost" size="sm" onClick={returnToMetricsOverview} data-testid="button-back-from-manual-entry">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back
            </Button>
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold" data-testid="heading-metric-details">
                {focusedEntryMetricId ? "Metric details" : "Enter metric values"}
              </h2>
              <p className="text-sm text-muted-foreground">
                {focusedEntryMetricId
                  ? "Review this metric, its value and linked evidence for the selected period."
                  : "Enter a value directly when it is not updated through guided inputs."}
              </p>
            </div>
            {focusedHistoryMetricId && (
              <Link href={`/metrics?metric=${encodeURIComponent(focusedHistoryMetricId)}&period=${encodeURIComponent(selectedPeriod)}&metricPeriod=${encodeURIComponent(focusedHistoryPeriod)}&siteId=${encodeURIComponent(selectedScopeKey)}`}>
                <Button type="button" variant="outline" size="sm" data-testid="button-view-metric-history">
                  <ExternalLink className="mr-2 h-3.5 w-3.5" /> History &amp; trend
                </Button>
              </Link>
            )}
          </div>
          {!focusedEntryMetricId && canEdit && visibleManualMetrics.some(isMetricEntryEligible) && <Alert className="border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-800">
            <Sparkles className="w-4 h-4 text-emerald-600" />
            <AlertDescription className="text-sm">
              <span className="font-medium text-emerald-800 dark:text-emerald-300">You can start with estimates.</span>{" "}
              <span className="text-emerald-700 dark:text-emerald-400">Set &ldquo;Type of data&rdquo; to <strong>Estimated</strong> when you don&apos;t have an exact figure yet. You can replace it with an actual value later — every data point improves your baseline.</span>
            </AlertDescription>
          </Alert>}

          {isLocked && (
            <Alert>
              <Lock className="w-4 h-4" />
              <AlertDescription>
                This period is locked. Data cannot be edited.
              </AlertDescription>
            </Alert>
          )}

          <div className={focusedEntryMetricId ? "hidden" : "flex items-center justify-between gap-3 p-3 bg-muted/50 rounded-md border border-border"} data-testid="manual-metric-summary">
            <div>
              <p className="text-sm font-medium">{focusedEntryMetricId ? "Selected metric" : "Direct-entry metrics"}</p>
              <p className="text-xs text-muted-foreground">
                {focusedEntryMetricId
                  ? "Values, evidence, workflow state and calculation details stay together here."
                  : `${visibleManualMetrics.length} enabled metrics accept direct data entry. Calculated and derived results remain read-only.`}
              </p>
            </div>
            <Badge variant="outline" className="text-xs" data-testid="badge-enabled-metric-denominator">
              {focusedEntryMetricId ? `${visibleManualMetrics.length} selected` : `${visibleManualMetrics.length} editable`}
            </Badge>
          </div>

          {(["environmental", "social", "governance"] as const).map(cat => {
            const PRIORITY_ORDER: Record<string, number> = { essential: 0, recommended: 1, optional: 2 };
            const catMetrics = (visibleManualMetrics as any[])
              .filter((m: any) => m.category === cat)
              .sort((a: any, b: any) =>
                (PRIORITY_ORDER[getManualMetricPriority(a.name)] ?? 2) -
                (PRIORITY_ORDER[getManualMetricPriority(b.name)] ?? 2)
              );
            if (catMetrics.length === 0) return null;
            const config = CATEGORY_ICONS[cat];
            const Icon = config.icon;

            return (
              <Card key={cat}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <div className={`p-1.5 rounded-md ${config.bg}`}>
                      <Icon className={`w-3.5 h-3.5 ${config.color}`} />
                    </div>
                    {config.label}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {catMetrics.map((metric: any) => {
                    const metricId = metric.id || metric.metricId || null;
                    const metricKey = metricId || metric.key || metric.name;
                    const metricPeriod = resolveMetricWorkspacePeriod(selectedPeriod, metric.frequency, metric.metricType);
                    const isEligible = isMetricEntryEligible(metric);
                    const localVal = manualValues[metricKey] || { value: "", notes: "" };
                    const hasValue = localVal.value && localVal.value !== "";
                    const isBooleanMetric = isBooleanMetricDataType(metric.dataType);
                    const metricValue = metricId ? existingValues.find((v: any) => v.metricId === metricId && v.period === metricPeriod && isSelectedScopeValue(v)) : undefined;
                    const metricWorkflowStatus = normalizeDataEntryWorkflowStatus(metricValue?.workflowStatus);
                    const metricWorkflowLocked = Boolean(metricValue) && metricWorkflowStatus !== "draft";
                    const metricPeriodData = metricPeriod === selectedAnnualPeriod
                      ? annualEntryData
                      : metricPeriod === selectedQuarterPeriod
                        ? quarterlyEntryData
                        : entryData;
                    const rowEditDisabled = Boolean(metricPeriodData?.periodLocked)
                      || Boolean(metricValue?.locked)
                      || !canEdit
                      || isReportingPeriodLocked
                      || saveManualMutation.isPending
                      || metricWorkflowLocked;
                    const currentSourceType = manualDataSourceTypes[metricKey] || metricValue?.dataSourceType || "manual";
                    const isCurrentlyEstimated = currentSourceType === "estimated";
                    const attachedEvidence = getMetricEvidence(metricValue?.id, metricId, metricPeriod);
                    const queuedAttachments = pendingAttachments[metricKey] || [];
                    const evidenceState = getInlineMetricEvidenceState(attachedEvidence);
                    const isFocusedEvidenceRow = focusEvidence
                      && Boolean(hasValue)
                      && evidenceState === "missing"
                      && (!focusedMetricId || focusedMetricId === metricId);

                    return (
                      <div
                        key={metricKey}
                        className={`grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 p-3 rounded-md border ${isFocusedEvidenceRow ? "border-blue-400 bg-blue-50/60 ring-1 ring-blue-300 dark:border-blue-700 dark:bg-blue-950/20 dark:ring-blue-800" : highlightEstimated && metricValue?.dataSourceType === "estimated" ? "border-amber-400 bg-amber-50/50 dark:bg-amber-950/20 ring-1 ring-amber-300" : hasValue ? "border-primary/20 bg-primary/5" : "border-border"}`}
                        data-testid={`manual-row-${metricKey}`}
                        data-evidence-focus={isFocusedEvidenceRow ? "true" : undefined}
                      >
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <Label className="text-sm font-medium">{metric.name}</Label>
                            <Badge variant="outline" className="text-xs">{metric.unit || "—"}</Badge>
                            <Badge variant="outline" className="text-[10px]">{metricPeriod}</Badge>
                            {!isEligible && (
                              <Badge variant="secondary" className="text-[10px]" data-testid={`badge-ineligible-${metricKey}`}>
                                {metric.missingCompanyMetric ? "Awaiting sync" : metric.metricType === "derived" ? "Derived automatically" : "Calculated automatically"}
                              </Badge>
                            )}
                            <ValueSourceBadge source={!hasValue ? "missing" : metricValue?.dataSourceType === "estimated" ? "estimated" : "actual"} explanation={metricValue?.dataSourceType === "estimated" && metricValue?.notes ? metricValue.notes : undefined} />
                            {isEligible && (hasValue || attachedEvidence.length > 0) && (
                              <InlineMetricEvidenceBadge state={evidenceState} metricKey={metricKey} />
                            )}
                            {!isEligible && hasValue && (
                              <Badge variant="outline" className="text-[10px] text-blue-700 dark:text-blue-300" data-testid={`badge-calculation-sources-${metricKey}`}>
                                <Calculator className="mr-1 h-3 w-3" /> Source inputs used
                              </Badge>
                            )}
                            {hasValue && <CheckCircle2 className="w-3.5 h-3.5 text-primary" />}
                            {metricValue?.workflowStatus && isEligible && <WorkflowBadge status={metricWorkflowStatus} size="sm" />}
                            {metricWorkflowStatus === "rejected" && metricValue?.id && !rowEditDisabled && (
                              <Button
                                type="button"
                                variant="outline"
                                className="h-6 px-2 text-[11px]"
                                disabled={reviseWorkflowMutation.isPending}
                                onClick={() => reviseWorkflowMutation.mutate({ entityType: "metric_value", entityId: String(metricValue.id) })}
                                data-testid={`button-revise-metric-${metricKey}`}
                              >
                                <Pencil className="mr-1 h-3 w-3" />
                                Revise
                              </Button>
                            )}
                          </div>
                          {metricId && isEligible && <EvidenceSuggestions metricId={metricId} category={metric.category} siteId={selectedScopeSiteId} />}
                          {metric.helpText && (
                            <p className="text-xs text-muted-foreground">{metric.helpText}</p>
                          )}
                          {!isEligible && metric.formulaText && (
                            <div className="rounded-md border border-blue-200 bg-blue-50 p-2 text-xs text-blue-800 dark:border-blue-800 dark:bg-blue-950/20 dark:text-blue-200" data-testid={`calculation-detail-${metricKey}`}>
                              <span className="font-medium">How it is calculated: </span>
                              {metric.formulaText}
                            </div>
                          )}
                          {metricWorkflowStatus === "rejected" && metricValue?.reviewComment && (
                            <p className="text-xs text-destructive" data-testid={`text-rejection-metric-${metricKey}`}>
                              Reviewer feedback: {metricValue.reviewComment}
                            </p>
                          )}
                          {!isEligible && (
                            <p className="text-[11px] text-muted-foreground" data-testid={`hint-ineligible-${metricKey}`}>
                              {metric.missingCompanyMetric
                                ? "This metric is enabled in Manage metrics, but the company metric record is still synchronising. It stays visible so your tracked set remains consistent."
                                : "This metric is enabled for your company and included in your reporting set, but it updates automatically from raw data or other metrics instead of direct manual entry."}
                            </p>
                          )}
                          {isCurrentlyEstimated && (
                            <p className="text-[11px] text-amber-700 dark:text-amber-400 flex items-center gap-1" data-testid={`hint-estimated-${metricKey}`}>
                              <span className="text-amber-500">›</span> You can update this with an actual value when you have it — every improvement counts.
                            </p>
                          )}
                          <InlineGuidanceTrigger metricName={metric.name} />
                          {isEligible ? <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <div className="space-y-1">
                              <Label className="text-xs text-muted-foreground">Value</Label>
                              {isBooleanMetric ? (
                                <Select
                                  value={localVal.value === "Yes" ? "yes" : localVal.value === "No" ? "no" : ""}
                                  onValueChange={(value) => { markDirty(metricKey); setManualValues(prev => ({
                                    ...prev,
                                    [metricKey]: { ...prev[metricKey] || { notes: "" }, value: value === "yes" ? "Yes" : "No" }
                                  })); }}
                                  disabled={rowEditDisabled || !isEligible}
                                >
                                  <SelectTrigger className="h-8 text-sm" data-testid={`input-manual-${metricKey}`}>
                                    <SelectValue placeholder={isEligible ? "Select Yes or No" : "Calculated automatically"} />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="yes">Yes</SelectItem>
                                    <SelectItem value="no">No</SelectItem>
                                  </SelectContent>
                                </Select>
                              ) : (
                                <Input
                                  type="number"
                                  step="any"
                                  value={localVal.value}
                                  onChange={e => { const value = e.target.value; markDirty(metricKey); setManualValues(prev => ({
                                    ...prev,
                                    [metricKey]: { ...prev[metricKey] || { notes: "" }, value }
                                  })); }}
                                  placeholder={isEligible ? `Enter ${metric.unit || "value"}` : "Calculated automatically"}
                                  disabled={rowEditDisabled || !isEligible}
                                  className="h-8 text-sm"
                                  data-testid={`input-manual-${metricKey}`}
                                />
                              )}
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs text-muted-foreground">Notes</Label>
                              <Input
                                value={localVal.notes}
                                onChange={e => { const notes = e.target.value; markDirty(metricKey); setManualValues(prev => ({
                                  ...prev,
                                  [metricKey]: { ...prev[metricKey] || { value: "" }, notes }
                                })); }}
                                placeholder="Optional note"
                                disabled={rowEditDisabled || !isEligible}
                                className="h-8 text-sm"
                                data-testid={`input-notes-${metricKey}`}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                                Type of data <EsgTooltip term="dataType" />
                              </Label>
                              <Select
                                value={manualDataSourceTypes[metricKey] || "manual"}
                                onValueChange={(val) => { markDirty(metricKey); setManualDataSourceTypes(prev => ({ ...prev, [metricKey]: val })); }}
                                disabled={rowEditDisabled || !isEligible}
                              >
                                <SelectTrigger className="w-32 h-8" data-testid={`select-source-type-${metricKey}`}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="manual">Manual — entered directly</SelectItem>
                                  <SelectItem value="estimated">Estimated — approximate</SelectItem>
                                  <SelectItem value="evidenced" disabled>Evidenced — set automatically by a linked file</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div> : (
                            <div className="flex flex-wrap items-end justify-between gap-3 rounded-md border bg-muted/40 p-3" data-testid={`calculated-value-${metricKey}`}>
                              <div>
                                <p className="text-xs text-muted-foreground">Calculated result for {metricPeriod}</p>
                                <p className="mt-1 text-lg font-semibold">
                                  {localVal.value || "Not calculated yet"}{localVal.value && metric.unit ? ` ${metric.unit}` : ""}
                                </p>
                              </div>
                              <Badge variant="secondary" className="text-xs">Read only</Badge>
                            </div>
                          )}
                          {(isEligible || attachedEvidence.length > 0) && <div className="space-y-2">
                            {isEligible && <div className="space-y-1">
                              <div className="flex items-center justify-between gap-2">
                                <Label className="text-xs text-muted-foreground flex items-center gap-1">
                                  <Paperclip className="w-3 h-3" />
                                  Evidence files
                                </Label>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={focusEvidence && evidenceState === "missing" ? "default" : "outline"}
                                  className="h-8 text-xs"
                                  disabled={rowEditDisabled || !isEligible}
                                  onClick={() => fileInputRefs.current[metricKey]?.click()}
                                  data-testid={`button-attach-evidence-${metricKey}`}
                                >
                                  <Paperclip className="w-3.5 h-3.5 mr-1.5" />
                                  {focusEvidence ? "Attach source" : "Attach evidence"}
                                  {(attachedEvidence.length > 0 || queuedAttachments.length > 0) && (
                                    <span className="ml-1 text-[10px] text-muted-foreground">
                                      {attachedEvidence.length + queuedAttachments.length}
                                    </span>
                                  )}
                                </Button>
                              </div>
                              <input
                                ref={(node) => {
                                  fileInputRefs.current[metricKey] = node;
                                }}
                                type="file"
                                multiple
                                accept={METRIC_EVIDENCE_ACCEPT}
                                disabled={rowEditDisabled || !isEligible}
                                className="hidden"
                                data-testid={`input-evidence-files-${metricKey}`}
                                onChange={(e) => {
                                  queueMetricAttachments(metricKey, e.target.files);
                                  e.target.value = "";
                                }}
                              />
                              <p className="text-[11px] text-muted-foreground">
                                Add one or more supporting files. They’ll upload and link to this metric when you save.
                              </p>
                            </div>}

                            {queuedAttachments.length > 0 && (
                              <div className="space-y-1">
                                <p className="text-[11px] font-medium text-muted-foreground">Ready to upload</p>
                                {queuedAttachments.map((file, index) => (
                                  <div
                                    key={`${file.name}-${file.size}-${index}`}
                                    className="flex items-center gap-2 rounded-md border border-dashed border-primary/30 bg-primary/5 px-2 py-1.5 text-xs"
                                    data-testid={`pending-evidence-${metricKey}-${index}`}
                                  >
                                    <Upload className="w-3 h-3 text-primary shrink-0" />
                                    <span className="flex-1 truncate font-medium">{file.name}</span>
                                    <span className="shrink-0 text-muted-foreground">{formatAttachmentSize(file.size)}</span>
                                    {!rowEditDisabled && (
                                      <Button
                                        type="button"
                                        size="icon"
                                        variant="ghost"
                                        className="h-5 w-5"
                                        onClick={() => removePendingAttachment(metricKey, index)}
                                        data-testid={`button-remove-pending-evidence-${metricKey}-${index}`}
                                      >
                                        <X className="w-3 h-3" />
                                      </Button>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}

                            {attachedEvidence.length > 0 && (
                              <div className="space-y-1">
                                <p className="text-[11px] font-medium text-muted-foreground">Attached to this metric</p>
                                {attachedEvidence.map((evidence) => (
                                  <div
                                    key={evidence.id}
                                    className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-2 py-1.5 text-xs"
                                    data-testid={`metric-evidence-${metricKey}-${evidence.id}`}
                                  >
                                    <FileText className="w-3 h-3 text-muted-foreground shrink-0" />
                                    <span className="flex-1 truncate font-medium">{evidence.filename}</span>
                                    <span className="shrink-0 text-muted-foreground">{evidence.fileType || "file"}</span>
                                    {unavailableEvidenceLabel(evidence) && (
                                      <Badge variant="outline" className="text-[10px] capitalize text-amber-700 dark:text-amber-300">
                                        {unavailableEvidenceLabel(evidence)}
                                      </Badge>
                                    )}
                                    {evidence.fileUrl && (
                                      <a href={evidence.fileUrl} target="_blank" rel="noopener noreferrer">
                                        <Button type="button" size="icon" variant="ghost" className="h-5 w-5" data-testid={`button-open-evidence-${metricKey}-${evidence.id}`}>
                                          <ExternalLink className="w-3 h-3" />
                                        </Button>
                                      </a>
                                    )}
                                    {!rowEditDisabled && (
                                      <Button
                                        type="button"
                                        size="icon"
                                        variant="ghost"
                                        className="h-5 w-5 text-destructive hover:text-destructive"
                                        disabled={deleteEvidenceMutation.isPending}
                                        onClick={() => deleteEvidenceMutation.mutate(evidence.id)}
                                        data-testid={`button-delete-evidence-${metricKey}-${evidence.id}`}
                                      >
                                        <Trash2 className="w-3 h-3" />
                                      </Button>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>}
                        </div>
                        {!rowEditDisabled && isEligible && (
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant={hasValue ? "secondary" : "default"}
                              onClick={() => metricId && handleSaveManual(metricKey, metricId, metricPeriod)}
                              disabled={saveManualMutation.isPending || !metricId || !localVal.value || !isEligible}
                              data-testid={`button-save-manual-${metricKey}`}
                            >
                              <Save className="w-3.5 h-3.5" />
                              <span className="ml-1">{queuedAttachments.length > 0 ? "Save & upload" : "Save"}</span>
                            </Button>
                            {dirtyKeys[metricKey] === false && lastSavedPeriod === selectedPeriod && (
                              <span role="status" className="text-xs text-emerald-700 dark:text-emerald-300" data-testid={`saved-manual-${metricKey}`}>Saved</span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            );
          })}

          {visibleManualMetrics.length === 0 && (
            <EmptyState
              icon={ClipboardList}
              title={unresolvedFocusedDefinition ? "Enable this metric first" : "No direct-entry metrics configured"}
              description={unresolvedFocusedDefinition
                ? `${unresolvedFocusedDefinition.name} is in the metric catalogue but is not currently enabled for your company.`
                : "Your company hasn't enabled any manual metrics yet. Return to Metrics & data and use Manage metrics to choose what you want to track."}
              actionLabel={unresolvedFocusedDefinition && canEdit ? "Manage metrics" : undefined}
              onAction={unresolvedFocusedDefinition && canEdit ? () => navigateToWorkspaceMode("manage") : undefined}
            />
          )}

          {visibleManualMetrics.length > 0 && activeSiteId && existingValues.filter(isSelectedScopeValue).length === 0 && (
            <EmptyState
              icon={ClipboardList}
              title="No data entered for this site"
              description="You haven't added any figures for this site in the selected period yet."
              helpText={canEdit
                ? "Use the metric cards above to start entering your data."
                : "Ask an admin or data entry user to add data for this site"}
            />
          )}

        </section>}
      </div>
    </div>
  );
}

const TEMPLATE_OPTIONS = [
  { key: "energy", name: "Energy & Emissions", description: "Electricity, gas, fuel, water", columns: 8 },
  { key: "travel", name: "Travel & Transport", description: "Flights, rail, hotel, company cars", columns: 7 },
  { key: "workforce", name: "Workforce & People", description: "Headcount, diversity, training", columns: 9 },
  { key: "all", name: "All Data (Combined)", description: "Complete set of ESG raw data fields", columns: 14 },
];

function CarbonImportDialog({ open, onClose, period }: { open: boolean; onClose: () => void; period: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const { activeSiteId, activeSites, setActiveSiteId } = useSiteContext();
  const isMultiSite = activeSites.length >= 1;
  const [selectedSiteId, setSelectedSiteId] = useState<string>(activeSiteId || "");
  const [step, setStep] = useState<"upload" | "preview" | "result">("upload");
  const [parsedResult, setParsedResult] = useState<any>(null);
  const [mappings, setMappings] = useState<{ column: string; inputKey: string | null }[]>([]);
  const [importResult, setImportResult] = useState<any>(null);
  const [importedSiteId, setImportedSiteId] = useState<string | null | undefined>(undefined);
  const [selectedTemplate, setSelectedTemplate] = useState("all");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) setSelectedSiteId(activeSiteId || "");
  }, [activeSiteId, open]);

  const parseMutation = useMutation({
    mutationFn: async (data: { format: string; content: string; siteId?: string | null }) => {
      const res = await apiRequest("POST", "/api/raw-data/import/parse", data);
      return res.json();
    },
    onSuccess: (data: any) => {
      setParsedResult(data);
      setMappings((data.mappings || []).map((m: any) => ({ column: m.column, inputKey: m.inputKey })));
      setStep("preview");
    },
    onError: () => toast({ title: "Failed to parse file", variant: "destructive" }),
  });

  const confirmMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/raw-data/import/confirm", {
        mappings,
        rows: parsedResult?.rows || [],
        period,
        siteId: isMultiSite ? selectedSiteId : (activeSiteId || null),
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      const resolvedImportedSiteId = isMultiSite ? selectedSiteId : activeSiteId;
      setImportResult(data);
      setImportedSiteId(resolvedImportedSiteId || null);
      setStep("result");
      qc.invalidateQueries({ queryKey: ["/api/raw-data"] });
      qc.invalidateQueries({ queryKey: ["/api/data-entry"] });
      invalidateEsgReadinessQueries(qc);
      toast({
        title: data.partialSuccess
          ? `Imported ${data.imported} values with a recalculation warning`
          : `Imported ${data.imported} values`,
        description: data.recalculationWarning?.message,
      });
    },
    onError: () => toast({ title: "Import failed", variant: "destructive" }),
  });

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const base64 = btoa(new Uint8Array(evt.target?.result as ArrayBuffer).reduce((d, b) => d + String.fromCharCode(b), ""));
      parseMutation.mutate({
        format: "csv",
        content: base64,
        siteId: isMultiSite ? selectedSiteId : (activeSiteId || null),
      });
    };
    reader.readAsArrayBuffer(file);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleDownloadTemplate = async (type?: string) => {
    try {
      const t = type || selectedTemplate;
      const res = await authFetch(`/api/raw-data/import/template?type=${t}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const templateInfo = TEMPLATE_OPTIONS.find(o => o.key === t);
      a.download = `${t}_data_template.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: `${templateInfo?.name || "Template"} downloaded` });
    } catch {
      toast({ title: "Template download failed", variant: "destructive" });
    }
  };

  const handleClose = () => {
    if (step === "result" && importedSiteId !== undefined && importedSiteId !== activeSiteId) {
      setActiveSiteId(importedSiteId);
      const params = new URLSearchParams(searchString);
      params.set("period", period);
      params.set("siteId", importedSiteId || "__org__");
      setLocation(`/data-entry?${params.toString()}`, { replace: true });
    }
    setStep("upload");
    setParsedResult(null);
    setMappings([]);
    setImportResult(null);
    setImportedSiteId(undefined);
    onClose();
  };

  const updateMapping = (index: number, inputKey: string | null) => {
    setMappings(prev => prev.map((m, i) => i === index ? { ...m, inputKey } : m));
  };

  const allInputKeys = Object.values(RAW_DATA_FIELDS).flatMap(fields => fields.map(f => ({ key: f.key, label: f.label })));

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="w-4 h-4" />
            Upload a CSV file
          </DialogTitle>
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Upload a CSV of operational figures such as energy, travel or workforce data. We map the columns for you and show a review before saving.</p>

            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Download a template to get started</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {TEMPLATE_OPTIONS.map(tmpl => (
                  <button
                    key={tmpl.key}
                    onClick={() => { setSelectedTemplate(tmpl.key); handleDownloadTemplate(tmpl.key); }}
                    className={`text-left p-3 rounded-lg border transition-colors hover:bg-muted/60 ${selectedTemplate === tmpl.key ? "border-primary bg-primary/5" : "border-border"}`}
                    data-testid={`button-template-${tmpl.key}`}
                  >
                    <div className="flex items-start justify-between gap-1">
                      <p className="text-xs font-medium leading-tight">{tmpl.name}</p>
                      <Download className="w-3 h-3 text-muted-foreground shrink-0 mt-0.5" />
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-tight">{tmpl.description}</p>
                    <p className="text-xs text-muted-foreground mt-1">{tmpl.columns} columns</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-lg border-2 border-dashed p-4 text-center sm:p-8">
              <FileSpreadsheet className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground mb-3">Drop a CSV file here</p>
              <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={parseMutation.isPending || (isMultiSite && !selectedSiteId)} data-testid="button-import-choose-file">
                {parseMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Upload className="w-3.5 h-3.5 mr-1.5" />}
                {parseMutation.isPending ? "Parsing..." : "Choose File"}
              </Button>
              <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Period: {period}</span>
              {!isMultiSite && activeSiteId && <span>Site: {activeSites.find(s => s.id === activeSiteId)?.name}</span>}
            </div>
            {isMultiSite && (
              <div>
                <Label className="text-xs">Site * <span className="text-muted-foreground font-normal">(required for import)</span></Label>
                <Select value={selectedSiteId} onValueChange={setSelectedSiteId}>
                  <SelectTrigger className="mt-1 h-8 text-sm" data-testid="select-import-site">
                    <SelectValue placeholder="Select a site" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeSites.map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        )}

        {step === "preview" && parsedResult && (
          <div className="space-y-4">
            <p className="text-sm font-medium">
              {parsedResult.rows?.length || 0} {(parsedResult.rows?.length || 0) === 1 ? "row" : "rows"} parsed, {parsedResult.columns?.length || 0} {(parsedResult.columns?.length || 0) === 1 ? "column" : "columns"} detected
            </p>

            <div className="space-y-2">
              <Label className="text-xs font-medium">Column Mappings</Label>
              {mappings.map((m, i) => {
                const confidence = parsedResult.mappings?.[i]?.confidence || 0;
                return (
                  <div key={i} className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-[10rem_auto_12rem_auto] sm:items-center">
                    <span className="min-w-0 truncate font-medium">{m.column}</span>
                    <ArrowRight className="hidden h-3 w-3 shrink-0 text-muted-foreground sm:block" />
                    <Select value={m.inputKey || "__skip__"} onValueChange={(v) => updateMapping(i, v === "__skip__" ? null : v)}>
                      <SelectTrigger className="h-8 w-full text-xs" data-testid={`select-mapping-${i}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__skip__">Skip</SelectItem>
                        {allInputKeys.map(k => (
                          <SelectItem key={k.key} value={k.key}>{k.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Badge variant={confidence >= 70 ? "default" : confidence >= 40 ? "secondary" : "outline"} className="w-fit text-[10px]">
                      {confidence}%
                    </Badge>
                  </div>
                );
              })}
            </div>

            {parsedResult.rows?.length > 0 && (
              <div className="overflow-x-auto border rounded-md max-h-48">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted/50 border-b">
                      {(parsedResult.columns || []).map((c: string) => (
                        <th key={c} className="text-left p-2 font-medium">{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {parsedResult.rows.slice(0, 5).map((row: any, i: number) => (
                      <tr key={i} className="border-b">
                        {(parsedResult.columns || []).map((c: string) => (
                          <td key={c} className="p-2">{row[c] ?? "-"}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("upload")}>Back</Button>
              <Button
                onClick={() => confirmMutation.mutate()}
                disabled={confirmMutation.isPending || mappings.every(m => !m.inputKey) || (isMultiSite && !selectedSiteId)}
                data-testid="button-confirm-import"
              >
                {confirmMutation.isPending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Check className="w-4 h-4 mr-1.5" />}
                {confirmMutation.isPending
                  ? "Importing..."
                  : `Import ${mappings.filter(m => m.inputKey).length} ${mappings.filter(m => m.inputKey).length === 1 ? "column" : "columns"}`}
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "result" && importResult && (
          <div className="space-y-4">
            <div className="p-4 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <span className="font-medium text-emerald-800 dark:text-emerald-300">Import Complete</span>
              </div>
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div><span className="text-muted-foreground">Imported:</span> <span className="font-bold">{importResult.imported}</span></div>
                <div><span className="text-muted-foreground">Skipped:</span> <span className="font-bold">{importResult.skipped}</span></div>
                <div><span className="text-muted-foreground">Period:</span> <span className="font-bold">{importResult.period}</span></div>
              </div>
              {importResult.unmatched?.length > 0 && (
                <p className="text-xs text-muted-foreground mt-2">Unmatched columns: {importResult.unmatched.join(", ")}</p>
              )}
            </div>
            {importResult.recalculationWarning && (
              <Alert className="border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-100">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{importResult.recalculationWarning.message}</AlertDescription>
              </Alert>
            )}
            <DialogFooter>
              <Button onClick={handleClose} data-testid="button-import-done">Done</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
