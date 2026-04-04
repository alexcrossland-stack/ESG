import { useState, useEffect, useRef } from "react";
import { EmptyState } from "@/components/empty-state";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useBillingStatus, UpgradeButton } from "@/components/upgrade-prompt";
import { apiRequest, queryClient, authFetch } from "@/lib/queryClient";
import { resolveApiError } from "@/lib/errorResolver";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  ClipboardList, Lock, Save, Leaf, Users, Shield,
  AlertCircle, Calculator, CheckCircle2, Zap, Info,
  Upload, Download, FileSpreadsheet, Table, Eye,
  Send, Check, X, FileCheck, Loader2, ArrowRight, Sparkles, Pencil,
} from "lucide-react";
import { format, subMonths } from "date-fns";
import * as XLSX from "xlsx";
import { usePermissions } from "@/lib/permissions";
import { WorkflowBadge } from "@/components/workflow-badge";
import { useSiteContext } from "@/hooks/use-site-context";
import { DataSourceBadge } from "@/pages/evidence";
import { SourceBadge } from "@/components/source-badge";
import { EvidenceSuggestions } from "@/components/evidence-suggestions";
import { trackEvent, AnalyticsEvents } from "@/lib/analytics";
import { useActivationState } from "@/hooks/use-activation-state";
import { EsgTooltip } from "@/components/esg-tooltip";
import { ContextualHelpLink } from "@/components/help";
import { Link } from "wouter";
import { ValueSourceBadge } from "@/components/value-source-badge";
import { useSearch } from "wouter";
import { InlineGuidanceTrigger } from "@/components/metric-guidance-panel";
import { getRawFieldPriority, getManualMetricPriority, PRIORITY_LABELS, CONTEXTUAL_PROMPTS } from "@/lib/metric-guidance";
import { PermissionBanner, OwnershipHint } from "@/components/permission-gate";

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
    { key: "annual_revenue", label: "Annual Revenue", unit: "GBP", help: "Annual revenue for carbon intensity calculation" },
  ],
};

const AUTO_CALC_METRICS = [
  "Scope 1 Emissions", "Scope 2 Emissions", "Recycling Rate", "Business Travel Emissions",
  "Carbon Intensity", "Employee Turnover Rate", "Absence Rate", "Training Hours per Employee",
  "Management Gender Diversity", "Living Wage Coverage", "Data Privacy Training Completion",
  "Supplier Code of Conduct Adoption",
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

const CATEGORY_ICONS = {
  environmental: { icon: Leaf, color: "text-primary", bg: "bg-primary/10", label: "Environmental" },
  social: { icon: Users, color: "text-blue-500", bg: "bg-blue-500/10", label: "Social" },
  governance: { icon: Shield, color: "text-purple-500", bg: "bg-purple-500/10", label: "Governance" },
};

function QualityBadge({ score, metricId }: { score: number; metricId: string }) {
  const variant = score > 70 ? "default" : score >= 40 ? "secondary" : "outline";
  const color = score > 70 ? "text-emerald-600 dark:text-emerald-400" : score >= 40 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400";
  return (
    <Badge variant={variant} className={`text-xs gap-0.5 ${color}`} data-testid={`badge-quality-${metricId}`}>
      Q:{score}
    </Badge>
  );
}

export default function DataEntry() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { can, isApprover } = usePermissions();
  const { isPro } = useBillingStatus();
  const { activeSiteId } = useSiteContext();
  const searchString = useSearch();
  const searchParams = new URLSearchParams(searchString);
  const highlightEstimated = searchParams.get("highlight") === "estimated";
  const canApprove = can("report_generation");
  const canEdit = can("metrics_data_entry");
  const periods = generatePeriods();
  const [selectedPeriod, setSelectedPeriod] = useState(periods[0]);
  const [selectedReportingPeriodId, setSelectedReportingPeriodId] = useState<string>("__all__");
  const [rawInputs, setRawInputs] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState("raw");
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

  const { data: evidenceCoverage } = useQuery<any>({
    queryKey: ["/api/evidence/coverage"],
  });

  const { data: dataQuality } = useQuery<any>({
    queryKey: ["/api/data-quality"],
  });

  const { data: reportingPeriods = [] } = useQuery<any[]>({
    queryKey: ["/api/reporting-periods"],
  });

  const activeReportingPeriod = reportingPeriods.find((rp: any) => rp.id === selectedReportingPeriodId);
  const isReportingPeriodLocked = activeReportingPeriod?.status === "locked";

  const { data: rawData, isLoading: rawLoading } = useQuery<any[]>({
    queryKey: ["/api/raw-data", selectedPeriod],
    queryFn: () => {
        return authFetch(`/api/raw-data/${selectedPeriod}`).then(r => r.json()).then(d => Array.isArray(d) ? d : []);
      },
  });

  const { data: entryData, isLoading: entryLoading } = useQuery<any>({
    queryKey: ["/api/data-entry", selectedPeriod],
    queryFn: () => {
        return authFetch(`/api/data-entry/${selectedPeriod}`).then(r => r.json());
      },
  });

  useEffect(() => {
    if (rawData && Array.isArray(rawData)) {
      const inputs: Record<string, string> = {};
      rawData.forEach((d: any) => {
        inputs[d.inputName] = d.value ? String(Number(d.value)) : "";
      });
      setRawInputs(inputs);
    }
  }, [rawData]);

  useEffect(() => {
    if (entryData?.values) {
      const vals: Record<string, { value: string; notes: string }> = {};
      const dsTypes: Record<string, string> = {};
      entryData.values.forEach((v: any) => {
        vals[v.metricId] = { value: v.value ? String(Number(v.value)) : "", notes: v.notes || "" };
        if (v.dataSourceType) dsTypes[v.metricId] = v.dataSourceType;
      });
      setManualValues(vals);
      setManualDataSourceTypes(dsTypes);
    }
  }, [entryData]);

  const activation = useActivationState();

  const saveRawMutation = useMutation({
    mutationFn: (data: { inputs: Record<string, string>; period: string; siteId?: string | null }) =>
      apiRequest("POST", "/api/raw-data", data),
    onSuccess: () => {
      const isFirstData = !activation.hasAddedData;
      queryClient.invalidateQueries({ queryKey: ["/api/raw-data", selectedPeriod] });
      queryClient.invalidateQueries({ queryKey: ["/api/onboarding/status"] });
      if (isFirstData) trackEvent(AnalyticsEvents.FIRST_DATA_ADDED, { period: selectedPeriod });
      toast({
        title: "Data saved",
        description: isFirstData
          ? "Great start — add a supporting document to back this up."
          : "Your figures have been saved and metrics recalculated.",
      });
    },
    onError: () => toast({
      title: "Save failed",
      description: "We couldn't save your data. Check your internet connection and try again. If the problem persists, refresh the page.",
      variant: "destructive",
    }),
  });

  const recalcMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/metrics/recalculate/${selectedPeriod}`, {}).then(r => r.json()),
    onSuccess: (data: any) => {
      setRecalcResults(data.updated || []);
      queryClient.invalidateQueries({ queryKey: ["/api/data-entry", selectedPeriod] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/enhanced"] });
      toast({ title: "Metrics recalculated", description: `${data.updated?.length || 0} metrics updated` });
    },
    onError: () => toast({ title: "Recalculation failed", description: "Data was saved but metrics couldn't be recalculated. Try clicking Save again.", variant: "destructive" }),
  });

  const saveManualMutation = useMutation({
    mutationFn: (data: { metricId: string; period: string; value: string; notes: string; dataSourceType?: string; siteId?: string | null }) =>
      apiRequest("POST", "/api/data-entry", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/data-entry", selectedPeriod] });
    },
  });

  const fetchEstimatesMutation = useMutation({
    mutationFn: (opts?: { force?: boolean }) => apiRequest("POST", "/api/data-entries/estimate", { period: selectedPeriod, force: opts?.force }).then((r: any) => r.json()),
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
      apiRequest("POST", "/api/data-entry", { ...estimate, period: selectedPeriod, dataSourceType: "estimated", siteId: activeSiteId || null }),
    onSuccess: (_, vars) => {
      setAcceptedEstimates(prev => new Set([...prev, vars.metricId]));
      queryClient.invalidateQueries({ queryKey: ["/api/data-entry", selectedPeriod] });
    },
    onError: () => toast({ title: "Could not save estimate", variant: "destructive" }),
  });

  const replaceEstimateMutation = useMutation({
    mutationFn: (data: { metricId: string; value: number; notes: string; saveAsActual: boolean }) =>
      apiRequest("POST", "/api/data-entry", { metricId: data.metricId, value: data.value, notes: data.notes, period: selectedPeriod, dataSourceType: data.saveAsActual ? "manual" : "estimated", siteId: activeSiteId || null }),
    onSuccess: (_, vars) => {
      setAcceptedEstimates(prev => new Set([...prev, vars.metricId]));
      setEditingEstimate(null);
      setEditEstimateValue("");
      setEditSaveAsActual(false);
      queryClient.invalidateQueries({ queryKey: ["/api/data-entry", selectedPeriod] });
      toast({ title: "Value saved", description: vars.saveAsActual ? "Saved as actual data." : "Saved as edited estimate." });
    },
    onError: () => toast({ title: "Could not save value", variant: "destructive" }),
  });

  useEffect(() => {
    if (autoEstimateTriggered || estimateBannerDismissed) return;
    if (!entryData || entryLoading) return;
    const prefillKey = `estimate_prefill_shown_${selectedPeriod}`;
    if (localStorage.getItem(prefillKey) === "true") return;
    const allMetrics = entryData?.metrics || [];
    const filledValues = (entryData?.values || []).filter((v: any) => v.value !== null && v.value !== undefined);
    const filledMetricIds = new Set(filledValues.map((v: any) => v.metricId));
    const manualMetrics = allMetrics.filter((m: any) => m.metricType === "manual" || !m.metricType);
    const emptyMetrics = manualMetrics.filter((m: any) => !filledMetricIds.has(m.id));
    if (manualMetrics.length > 0 && emptyMetrics.length > 0) {
      setAutoEstimateTriggered(true);
      localStorage.setItem(prefillKey, "true");
      fetchEstimatesMutation.mutate();
    }
  }, [entryData, entryLoading, autoEstimateTriggered, estimateBannerDismissed, selectedPeriod]);

  const lockMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/data-entry/${selectedPeriod}/lock`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/data-entry", selectedPeriod] });
      toast({ title: `Period ${selectedPeriod} locked` });
    },
  });

  const submitWorkflowMutation = useMutation({
    mutationFn: async () => {
      const metricValueIds = existingValues.map((v: any) => String(v.id));
      const rawDataIds = (rawData || []).map((d: any) => String(d.id));
      if (metricValueIds.length > 0) {
        await apiRequest("POST", "/api/workflow/submit", { entityType: "metric_value", entityIds: metricValueIds });
      }
      if (rawDataIds.length > 0) {
        await apiRequest("POST", "/api/workflow/submit", { entityType: "raw_data", entityIds: rawDataIds });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/data-entry", selectedPeriod] });
      queryClient.invalidateQueries({ queryKey: ["/api/raw-data", selectedPeriod] });
      toast({ title: "Period submitted for review" });
    },
    onError: (e: any) => {
      const r = resolveApiError(e);
      toast({ title: r.title, description: r.description + " " + r.nextStep, variant: "destructive" });
    },
  });

  const approveWorkflowMutation = useMutation({
    mutationFn: async (action: "approve" | "reject") => {
      const comment = window.prompt(`Enter a comment for ${action}:`) || "";
      const allIds = [
        ...existingValues.map((v: any) => ({ entityType: "metric_value", entityId: String(v.id) })),
        ...(rawData || []).map((d: any) => ({ entityType: "raw_data", entityId: String(d.id) })),
      ];
      for (const item of allIds) {
        await apiRequest("POST", "/api/workflow/review", {
          entityType: item.entityType,
          entityId: item.entityId,
          action,
          comment,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/data-entry", selectedPeriod] });
      queryClient.invalidateQueries({ queryKey: ["/api/raw-data", selectedPeriod] });
      toast({ title: "Review action completed" });
    },
    onError: (e: any) => {
      const r = resolveApiError(e);
      toast({ title: r.title, description: r.description + " " + r.nextStep, variant: "destructive" });
    },
  });

  const handleSaveRawAndRecalc = async () => {
    const nonEmpty: Record<string, string> = {};
    for (const [k, v] of Object.entries(rawInputs)) {
      if (v !== undefined && v !== null && v.trim() !== "") nonEmpty[k] = v;
    }
    await saveRawMutation.mutateAsync({ inputs: nonEmpty, period: selectedPeriod, siteId: activeSiteId || null });
    await recalcMutation.mutateAsync();
  };

  const handleSaveManual = async (metricId: string) => {
    const val = manualValues[metricId];
    if (!val?.value) return;
    const dataSourceType = manualDataSourceTypes[metricId] || "manual";
    await saveManualMutation.mutateAsync({ metricId, period: selectedPeriod, value: val.value, notes: val.notes, dataSourceType, siteId: activeSiteId || null });
    const isFirstData = !activation.hasAddedData;
    if (isFirstData) {
      trackEvent(AnalyticsEvents.FIRST_DATA_ADDED, { period: selectedPeriod, source: "manual" });
      queryClient.invalidateQueries({ queryKey: ["/api/onboarding/status"] });
    }
    toast({
      title: "Value saved",
      description: isFirstData ? "First data point recorded. Next: add an evidence file to support this entry." : "Metric updated for this period.",
    });
  };

  const metrics = entryData?.metrics || [];
  const existingValues = entryData?.values || [];
  const isLocked = existingValues.some((v: any) => v.locked);
  const isApproved = existingValues.some((v: any) => v.workflowStatus === "approved");
  const periodWorkflowStatus = existingValues.length > 0 ? existingValues[0]?.workflowStatus : null;
  const manualMetrics = metrics.filter((m: any) => m.metricType === "manual" || !m.metricType);
  const editDisabled = isLocked || isApproved || !canEdit || isReportingPeriodLocked;

  const isLoading = rawLoading || entryLoading;
  if (isLoading) {
    return <div className="p-6 space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-20" />)}</div>;
  }

  const filledRawCount = Object.values(rawInputs).filter(v => v !== undefined && v !== null && v !== "").length;
  const totalRawFields = Object.values(RAW_DATA_FIELDS).reduce((sum, fields) => sum + fields.length, 0);
  const rawCompletion = Math.round((filledRawCount / totalRawFields) * 100);

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-4xl mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-lg sm:text-xl font-semibold flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-primary" />
            Data Entry
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Enter raw data and record manual metric values
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canEdit && (
            <Button
              size="sm"
              variant={highlightEstimated ? "secondary" : "outline"}
              className="h-8 text-xs gap-1.5"
              onClick={() => {
                if (highlightEstimated) {
                  window.history.replaceState({}, "", "/data-entry");
                } else {
                  window.history.replaceState({}, "", "/data-entry?highlight=estimated");
                }
                window.dispatchEvent(new PopStateEvent("popstate"));
                window.location.reload();
              }}
              data-testid="button-review-estimates"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Review estimates
            </Button>
          )}
          {!canEdit && (
            <Badge variant="secondary" className="gap-1" data-testid="badge-read-only">
              <Eye className="w-3 h-3" />
              Read Only
            </Badge>
          )}
          <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
            <SelectTrigger className="w-36" data-testid="select-period">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {periods.map(p => (
                <SelectItem key={p} value={p}>{p}</SelectItem>
              ))}
            </SelectContent>
          </Select>
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
              {evidenceCoverage.metricCoverage?.filter((m: any) => m.hasEvidence).length || 0}/{evidenceCoverage.metricCoverage?.length || 0} evidenced
            </Badge>
          )}
          {periodWorkflowStatus && <WorkflowBadge status={periodWorkflowStatus} />}
          {isLocked ? (
            <Badge variant="secondary" className="gap-1">
              <Lock className="w-3 h-3" />
              Locked
            </Badge>
          ) : (
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
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {canEdit && !isApproved && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => submitWorkflowMutation.mutate()}
            disabled={submitWorkflowMutation.isPending || existingValues.length === 0}
            data-testid="button-submit-period"
          >
            <Send className="w-3.5 h-3.5 mr-1.5" />
            {submitWorkflowMutation.isPending ? "Submitting..." : "Submit Period for Review"}
          </Button>
        )}
        {canApprove && periodWorkflowStatus === "submitted" && (
          <>
            <Button
              variant="default"
              size="sm"
              onClick={() => approveWorkflowMutation.mutate("approve")}
              disabled={approveWorkflowMutation.isPending}
              data-testid="button-approve-period"
            >
              <Check className="w-3.5 h-3.5 mr-1.5" />
              Approve
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => approveWorkflowMutation.mutate("reject")}
              disabled={approveWorkflowMutation.isPending}
              data-testid="button-reject-period"
            >
              <X className="w-3.5 h-3.5 mr-1.5" />
              Reject
            </Button>
          </>
        )}
      </div>

      {highlightEstimated && Object.keys(pendingEstimates).length === 0 && !fetchEstimatesMutation.isPending && !estimateBannerDismissed && (
        <Alert className="border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800" data-testid="banner-highlight-estimated">
          <Sparkles className="w-4 h-4 text-amber-600" />
          <AlertDescription className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-amber-900 dark:text-amber-200">Review your estimated values</p>
              <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">Fields with estimated data are highlighted below. Replace them with actual figures, or load new estimates for any remaining empty fields.</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                size="sm"
                variant="outline"
                className="border-amber-300 text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-300"
                onClick={() => fetchEstimatesMutation.mutate()}
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
                onClick={() => { setAutoEstimateTriggered(false); fetchEstimatesMutation.mutate({ force: true }); }}
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

      {Object.keys(pendingEstimates).length > 0 && !estimateBannerDismissed && (
        <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800" data-testid="card-estimate-prefill">
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
                              setAcceptedEstimates(prev => new Set([...prev, key]));
                              if (est.inputKey) {
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
                          onClick={() => setSkippedEstimates(prev => new Set([...prev, key]))}
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
      )}

      {!canEdit && (
        <PermissionBanner
          module="metrics_data_entry"
          action="enter or edit data"
          data-testid="banner-data-entry-permission"
        />
      )}

      {canEdit && (
        <OwnershipHint owner="Finance, Operations, or HR — depending on the metric" action="Data entry" />
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="raw" data-testid="tab-raw-data">
            <Calculator className="w-3.5 h-3.5 mr-1.5" />
            Raw Data
          </TabsTrigger>
          <TabsTrigger value="manual" data-testid="tab-manual-entry">
            <ClipboardList className="w-3.5 h-3.5 mr-1.5" />
            Manual
          </TabsTrigger>
          <TabsTrigger value="upload" data-testid="tab-excel-upload">
            <FileSpreadsheet className="w-3.5 h-3.5 mr-1.5" />
            Excel Upload
          </TabsTrigger>
        </TabsList>

        <TabsContent value="raw" className="mt-4 space-y-4">
          <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-md border border-border">
            <div className="flex-1">
              <p className="text-sm font-medium">Raw Data Completion</p>
              <p className="text-xs text-muted-foreground">{filledRawCount} of {totalRawFields} fields entered</p>
            </div>
            <div className="flex items-center gap-2">
              {canEdit && isPro && (
                <Button variant="outline" size="sm" onClick={() => setImportDialogOpen(true)} data-testid="button-open-carbon-import">
                  <Upload className="w-3.5 h-3.5 mr-1.5" />
                  Import Data
                </Button>
              )}
              {canEdit && !isPro && (
                <UpgradeButton
                  feature="CSV Import"
                  size="sm"
                  variant="outline"
                  valueMessage="Import a full year of ESG data from Excel or CSV in one upload — no manual field entry."
                  data-testid="button-import-upgrade"
                >
                  Import Data
                </UpgradeButton>
              )}
              <div className="text-lg font-bold text-primary">{rawCompletion}%</div>
            </div>
          </div>

          <CarbonImportDialog open={importDialogOpen} onClose={() => setImportDialogOpen(false)} period={selectedPeriod} />

          <Alert className="border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-800">
            <Calculator className="w-4 h-4 text-blue-500" />
            <AlertDescription className="text-sm">
              Enter your raw operational data below. When you save, the following metrics will be automatically calculated:{" "}
              <span className="font-medium">{AUTO_CALC_METRICS.join(", ")}</span>
            </AlertDescription>
          </Alert>

          {(Object.entries(RAW_DATA_FIELDS) as [keyof typeof CATEGORY_ICONS, typeof RAW_DATA_FIELDS.environmental][]).map(([cat, fields]) => {
            const config = CATEGORY_ICONS[cat];
            const Icon = config.icon;

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
                    {fields.map(field => {
                      const fieldPriority = getRawFieldPriority(field.key);
                      const pc = PRIORITY_LABELS[fieldPriority];
                      const existingRaw = rawData?.find((d: any) => d.inputName === field.key);
                      const fieldPrompts = CONTEXTUAL_PROMPTS[field.key];
                      return (
                        <div key={field.key} className="space-y-1.5" data-testid={`raw-field-${field.key}`}>
                          <Label className="text-sm flex items-center gap-1.5 flex-wrap">
                            {field.label}
                            <span className="text-xs text-muted-foreground">({field.unit})</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${pc.color}`} data-testid={`badge-priority-${field.key}`}>{pc.label}</span>
                            {existingRaw?.dataSourceType && <DataSourceBadge type={existingRaw.dataSourceType} />}
                          </Label>
                          <Input
                            type="number"
                            step="any"
                            value={rawInputs[field.key] || ""}
                            onChange={e => setRawInputs(prev => ({ ...prev, [field.key]: e.target.value }))}
                            placeholder={`Enter ${field.unit}`}
                            disabled={editDisabled}
                            className="h-8 text-sm"
                            data-testid={`input-raw-${field.key}`}
                          />
                          <p className="text-xs text-muted-foreground">{field.help}</p>
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

          {!activation.isLoading && !activation.isError && activation.hasAddedData && !activation.hasUploadedEvidence && (
            <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-800" data-testid="banner-upload-evidence">
              <div className="flex items-center gap-2 min-w-0">
                <CheckCircle2 className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                <p className="text-sm text-blue-800 dark:text-blue-200 leading-snug">
                  Data saved! Back it up with an evidence file — an invoice or utility bill proves the figure is accurate.
                </p>
              </div>
              <Link href="/evidence">
                <Button size="sm" variant="outline" className="shrink-0 border-blue-300 text-blue-700 hover:bg-blue-100 dark:border-blue-700 dark:text-blue-300" data-testid="button-goto-evidence">
                  Upload evidence <ArrowRight className="w-3.5 h-3.5 ml-1" />
                </Button>
              </Link>
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
        </TabsContent>

        <TabsContent value="manual" className="mt-4 space-y-4">
          <Alert className="border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-800">
            <Sparkles className="w-4 h-4 text-emerald-600" />
            <AlertDescription className="text-sm">
              <span className="font-medium text-emerald-800 dark:text-emerald-300">You can start with estimates.</span>{" "}
              <span className="text-emerald-700 dark:text-emerald-400">Set &ldquo;Type of data&rdquo; to <strong>Estimated</strong> when you don&apos;t have an exact figure yet. You can replace it with an actual value later — every data point improves your baseline.</span>
            </AlertDescription>
          </Alert>

          {isLocked && (
            <Alert>
              <Lock className="w-4 h-4" />
              <AlertDescription>
                This period is locked. Data cannot be edited.
              </AlertDescription>
            </Alert>
          )}

          {(["environmental", "social", "governance"] as const).map(cat => {
            const PRIORITY_ORDER: Record<string, number> = { essential: 0, recommended: 1, optional: 2 };
            const catMetrics = (manualMetrics as any[])
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
                    const localVal = manualValues[metric.metricId] || { value: "", notes: "" };
                    const hasValue = localVal.value && localVal.value !== "";
                    const metricValue = existingValues.find((v: any) => v.metricId === metric.metricId);
                    const metricPriority = getManualMetricPriority(metric.name);
                    const mpc = PRIORITY_LABELS[metricPriority];
                    const currentSourceType = manualDataSourceTypes[metric.metricId] || metricValue?.dataSourceType || "manual";
                    const isCurrentlyEstimated = currentSourceType === "estimated";

                    return (
                      <div
                        key={metric.metricId}
                        className={`grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 p-3 rounded-md border ${highlightEstimated && metricValue?.dataSourceType === "estimated" ? "border-amber-400 bg-amber-50/50 dark:bg-amber-950/20 ring-1 ring-amber-300" : hasValue ? "border-primary/20 bg-primary/5" : "border-border"}`}
                        data-testid={`manual-row-${metric.metricId}`}
                      >
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <Label className="text-sm font-medium">{metric.name}</Label>
                            <Badge variant="outline" className="text-xs">{metric.unit || "—"}</Badge>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${mpc.color}`} data-testid={`badge-priority-metric-${metric.metricId}`}>{mpc.label}</span>
                            <ValueSourceBadge source={!hasValue ? "missing" : metricValue?.dataSourceType === "estimated" ? "estimated" : "actual"} explanation={metricValue?.dataSourceType === "estimated" && metricValue?.notes ? metricValue.notes : undefined} />
                            <DataSourceBadge type={metricValue?.dataSourceType} />
                            {hasValue && <CheckCircle2 className="w-3.5 h-3.5 text-primary" />}
                            {metricValue?.workflowStatus && <WorkflowBadge status={metricValue.workflowStatus} size="sm" />}
                            {dataQuality?.perMetric?.find((q: any) => q.metricId === metric.metricId) && (
                              <QualityBadge
                                score={dataQuality.perMetric.find((q: any) => q.metricId === metric.metricId).score}
                                metricId={metric.metricId}
                              />
                            )}
                            <SourceBadge
                              entityType="metric"
                              entityId={metric.metricId}
                              status={metricValue?.workflowStatus}
                              owner={metricValue?.owner || metricValue?.submittedBy}
                              reviewedAt={metricValue?.approvedAt || metricValue?.updatedAt}
                              dataSourceType={metricValue?.dataSourceType}
                              hasEvidence={metricValue?.dataSourceType === "evidenced"}
                            />
                          </div>
                          <EvidenceSuggestions metricId={metric.metricId} category={metric.category} />
                          {metric.helpText && (
                            <p className="text-xs text-muted-foreground">{metric.helpText}</p>
                          )}
                          {isCurrentlyEstimated && (
                            <p className="text-[11px] text-amber-700 dark:text-amber-400 flex items-center gap-1" data-testid={`hint-estimated-${metric.metricId}`}>
                              <span className="text-amber-500">›</span> You can update this with an actual value when you have it — every improvement counts.
                            </p>
                          )}
                          <InlineGuidanceTrigger metricName={metric.name} />
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <div className="space-y-1">
                              <Label className="text-xs text-muted-foreground">Value</Label>
                              <Input
                                type="number"
                                step="any"
                                value={localVal.value}
                                onChange={e => setManualValues(prev => ({
                                  ...prev,
                                  [metric.metricId]: { ...prev[metric.metricId] || { notes: "" }, value: e.target.value }
                                }))}
                                placeholder={`Enter ${metric.unit || "value"}`}
                                disabled={editDisabled}
                                className="h-8 text-sm"
                                data-testid={`input-manual-${metric.metricId}`}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs text-muted-foreground">Notes</Label>
                              <Input
                                value={localVal.notes}
                                onChange={e => setManualValues(prev => ({
                                  ...prev,
                                  [metric.metricId]: { ...prev[metric.metricId] || { value: "" }, notes: e.target.value }
                                }))}
                                placeholder="Optional note"
                                disabled={editDisabled}
                                className="h-8 text-sm"
                                data-testid={`input-notes-${metric.metricId}`}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                                Type of data <EsgTooltip term="dataType" />
                              </Label>
                              <Select
                                value={manualDataSourceTypes[metric.metricId] || "manual"}
                                onValueChange={(val) => setManualDataSourceTypes(prev => ({ ...prev, [metric.metricId]: val }))}
                                disabled={editDisabled}
                              >
                                <SelectTrigger className="w-32 h-8" data-testid={`select-source-type-${metric.metricId}`}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="manual">Manual — entered directly</SelectItem>
                                  <SelectItem value="estimated">Estimated — approximate</SelectItem>
                                  <SelectItem value="evidenced">Evidenced — backed by a file</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        </div>
                        {!editDisabled && (
                          <div className="flex items-end">
                            <Button
                              size="sm"
                              variant={hasValue ? "secondary" : "default"}
                              onClick={() => handleSaveManual(metric.metricId)}
                              disabled={saveManualMutation.isPending || !localVal.value}
                              data-testid={`button-save-manual-${metric.metricId}`}
                            >
                              <Save className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            );
          })}

          {manualMetrics.length === 0 && (
            <EmptyState
              icon={ClipboardList}
              title="No manual metrics configured"
              description="Your company hasn't set up any manual entry metrics yet. Contact your admin to add metrics."
            />
          )}

          {manualMetrics.length > 0 && activeSiteId && existingValues.filter((v: any) => v.siteId === activeSiteId).length === 0 && (
            <EmptyState
              icon={ClipboardList}
              title="No data entered for this site"
              description="You haven't added any figures for this site in the selected period yet."
              helpText={canEdit
                ? "Use the metric cards above to start entering your data."
                : "Ask an admin or data entry user to add data for this site"}
            />
          )}

        </TabsContent>

        <TabsContent value="upload" className="mt-4 space-y-4">
          {canEdit ? <ExcelUploadTab /> : (
            <div className="text-center py-12 space-y-2">
              <Eye className="w-8 h-8 text-muted-foreground mx-auto" />
              <p className="text-sm text-muted-foreground">You do not have permission to upload data.</p>
            </div>
          )}
        </TabsContent>
      </Tabs>
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
  const { activeSiteId, activeSites } = useSiteContext();
  const isMultiSite = activeSites.length >= 1;
  const [selectedSiteId, setSelectedSiteId] = useState<string>(activeSiteId || "");
  const [step, setStep] = useState<"upload" | "preview" | "result">("upload");
  const [parsedResult, setParsedResult] = useState<any>(null);
  const [mappings, setMappings] = useState<{ column: string; inputKey: string | null }[]>([]);
  const [importResult, setImportResult] = useState<any>(null);
  const [selectedTemplate, setSelectedTemplate] = useState("all");
  const fileRef = useRef<HTMLInputElement>(null);

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
      const resolvedSiteId = isMultiSite ? (selectedSiteId || null) : (activeSiteId || null);
      const res = await apiRequest("POST", "/api/raw-data/import/confirm", {
        mappings,
        rows: parsedResult?.rows || [],
        period,
        siteId: resolvedSiteId,
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      setImportResult(data);
      setStep("result");
      qc.invalidateQueries({ queryKey: ["/api/raw-data"] });
      qc.invalidateQueries({ queryKey: ["/api/data-entry"] });
      qc.invalidateQueries({ queryKey: ["/api/dashboard/enhanced"] });
      toast({ title: `Imported ${data.imported} values` });
    },
    onError: () => toast({ title: "Import failed", variant: "destructive" }),
  });

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const base64 = btoa(new Uint8Array(evt.target?.result as ArrayBuffer).reduce((d, b) => d + String.fromCharCode(b), ""));
      const format = file.name.endsWith(".csv") ? "csv" : "xlsx";
      const resolvedSiteId = isMultiSite ? (selectedSiteId || null) : (activeSiteId || null);
      parseMutation.mutate({ format, content: base64, siteId: resolvedSiteId });
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
    setStep("upload");
    setParsedResult(null);
    setMappings([]);
    setImportResult(null);
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
            Import Carbon / Raw Data
          </DialogTitle>
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Upload a CSV or Excel file with your raw operational data. Column names will be automatically mapped to input fields.</p>

            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Download a template to get started</p>
              <div className="grid grid-cols-2 gap-2">
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

            <div className="border-2 border-dashed rounded-lg p-8 text-center">
              <FileSpreadsheet className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground mb-3">Drop a CSV or Excel file here</p>
              <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={parseMutation.isPending || (isMultiSite && !selectedSiteId)} data-testid="button-import-choose-file">
                {parseMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Upload className="w-3.5 h-3.5 mr-1.5" />}
                {parseMutation.isPending ? "Parsing..." : "Choose File"}
              </Button>
              <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleFileUpload} />
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
            <p className="text-sm font-medium">{parsedResult.rows?.length || 0} rows parsed, {parsedResult.columns?.length || 0} columns detected</p>

            <div className="space-y-2">
              <Label className="text-xs font-medium">Column Mappings</Label>
              {mappings.map((m, i) => {
                const confidence = parsedResult.mappings?.[i]?.confidence || 0;
                return (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <span className="w-40 truncate font-medium">{m.column}</span>
                    <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />
                    <Select value={m.inputKey || "__skip__"} onValueChange={(v) => updateMapping(i, v === "__skip__" ? null : v)}>
                      <SelectTrigger className="w-48 h-8 text-xs" data-testid={`select-mapping-${i}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__skip__">Skip</SelectItem>
                        {allInputKeys.map(k => (
                          <SelectItem key={k.key} value={k.key}>{k.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Badge variant={confidence >= 70 ? "default" : confidence >= 40 ? "secondary" : "outline"} className="text-[10px]">
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
                {confirmMutation.isPending ? "Importing..." : `Import ${mappings.filter(m => m.inputKey).length} columns`}
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
            <DialogFooter>
              <Button onClick={handleClose} data-testid="button-import-done">Done</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ExcelUploadTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [parsedData, setParsedData] = useState<{ name: string; period: string; value: number }[] | null>(null);
  const [previewRows, setPreviewRows] = useState<Record<string, Record<string, number | null>>>({});
  const [previewPeriods, setPreviewPeriods] = useState<string[]>([]);
  const [fileName, setFileName] = useState<string>("");
  const [unmatchedNames, setUnmatchedNames] = useState<string[]>([]);
  const [uploadResult, setUploadResult] = useState<{ rawSaved: number; metricSaved: number; rejected: { name: string; period: string; reason: string }[]; periodsRecalculated: number } | null>(null);
  const [showRejected, setShowRejected] = useState(false);

  const { data: templateData } = useQuery<{ rows: string[]; periods: string[]; categories: { raw: string[]; manual: string[] } }>({
    queryKey: ["/api/data-entry/template"],
  });

  const uploadMutation = useMutation({
    mutationFn: (rows: { name: string; period: string; value: number }[]) =>
      apiRequest("POST", "/api/data-entry/bulk-upload", { rows }).then(r => r.json()),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/raw-data"] });
      queryClient.invalidateQueries({ queryKey: ["/api/data-entry"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/enhanced"] });
      queryClient.invalidateQueries({ queryKey: ["/api/metrics"] });
      setUploadResult(data);
      setParsedData(null);
      setPreviewRows({});
      setPreviewPeriods([]);
      setFileName("");
      setUnmatchedNames([]);
      setShowRejected(false);
    },
    onError: (e: any) => { const r = resolveApiError(e); toast({ title: r.title || "Upload failed", description: r.description, variant: "destructive" }); },
  });

  const handleDownloadTemplate = () => {
    if (!templateData?.periods || !templateData?.categories) return;
    const ws_data: (string | number | null)[][] = [];
    const headerRow = ["Metric / Input", ...templateData.periods];
    ws_data.push(headerRow);

    ws_data.push(["--- RAW DATA INPUTS ---", ...templateData.periods.map(() => null)]);
    for (const name of templateData.categories.raw) {
      ws_data.push([name, ...templateData.periods.map(() => null)]);
    }
    ws_data.push(["--- MANUAL METRICS ---", ...templateData.periods.map(() => null)]);
    for (const name of templateData.categories.manual) {
      ws_data.push([name, ...templateData.periods.map(() => null)]);
    }

    const ws = XLSX.utils.aoa_to_sheet(ws_data);
    const colWidths = [{ wch: 35 }, ...templateData.periods.map(() => ({ wch: 12 }))];
    ws["!cols"] = colWidths;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "ESG Data");
    XLSX.writeFile(wb, "esg_data_template.xlsx");
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json<any>(sheet, { header: 1 });

        if (jsonData.length < 2) {
          toast({ title: "Empty spreadsheet", description: "No data rows found", variant: "destructive" });
          return;
        }

        const headers = (jsonData[0] as any[]).map((h: any) => String(h || "").trim());
        const periodColumns: { index: number; period: string }[] = [];
        for (let i = 1; i < headers.length; i++) {
          const h = headers[i];
          const match = h.match(/^(\d{4})-(\d{2})$/);
          if (match) {
            periodColumns.push({ index: i, period: h });
          }
        }

        if (periodColumns.length === 0) {
          toast({
            title: "No period columns found",
            description: "Column headers should be in YYYY-MM format (e.g. 2025-01, 2025-02)",
            variant: "destructive",
          });
          return;
        }

        const allNames = new Set((templateData?.rows || []).map(r => r.toLowerCase()));
        const rows: { name: string; period: string; value: number }[] = [];
        const preview: Record<string, Record<string, number | null>> = {};
        const unmatched = new Set<string>();
        const periods = periodColumns.map(p => p.period);

        for (let r = 1; r < jsonData.length; r++) {
          const row = jsonData[r] as any[];
          const name = String(row[0] || "").trim();
          if (!name || name.startsWith("---")) continue;

          preview[name] = {};
          const isKnown = allNames.has(name.toLowerCase());
          if (!isKnown) unmatched.add(name);

          for (const pc of periodColumns) {
            const cellValue = row[pc.index];
            if (cellValue !== undefined && cellValue !== null && cellValue !== "" && !isNaN(Number(cellValue))) {
              rows.push({ name, period: pc.period, value: Number(cellValue) });
              preview[name][pc.period] = Number(cellValue);
            } else {
              preview[name][pc.period] = null;
            }
          }
        }

        setParsedData(rows);
        setPreviewRows(preview);
        setPreviewPeriods(periods);
        setUnmatchedNames([...unmatched]);

        toast({ title: `Parsed ${rows.length} data points from ${Object.keys(preview).length} rows` });
      } catch (err: any) {
        toast({ title: "Failed to parse file", description: err.message, variant: "destructive" });
      }
    };
    reader.readAsArrayBuffer(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const dataPointCount = parsedData?.length || 0;
  const rowCount = Object.keys(previewRows).length;

  return (
    <div className="space-y-4">
      <Alert className="border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-800">
        <FileSpreadsheet className="w-4 h-4 text-blue-500" />
        <AlertDescription className="text-sm">
          Upload an Excel file with metric names down the left column and monthly periods (YYYY-MM) across the top.
          This allows you to upload historical and ongoing data in bulk.
        </AlertDescription>
      </Alert>

      {uploadResult && (
        <Card className={`border ${uploadResult.rejected.length > 0 ? "border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-700" : "border-emerald-300 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-700"}`} data-testid="upload-result-card">
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className={`text-sm flex items-center gap-2 ${uploadResult.rejected.length > 0 ? "text-amber-800 dark:text-amber-200" : "text-emerald-800 dark:text-emerald-200"}`}>
                {uploadResult.rejected.length > 0 ? <AlertCircle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                Upload {uploadResult.rejected.length > 0 ? "Completed with Issues" : "Successful"}
              </CardTitle>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setUploadResult(null)} data-testid="button-dismiss-result">Dismiss</Button>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-3">
            <div className="flex flex-wrap gap-4 text-sm">
              <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300" data-testid="upload-result-saved">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span><strong>{uploadResult.rawSaved + uploadResult.metricSaved}</strong> data points saved</span>
              </div>
              <div className="text-muted-foreground text-xs flex items-center gap-1">
                <span>{uploadResult.rawSaved} raw inputs</span>
                <span>·</span>
                <span>{uploadResult.metricSaved} metrics</span>
                <span>·</span>
                <span>{uploadResult.periodsRecalculated} periods recalculated</span>
              </div>
              {uploadResult.rejected.length > 0 && (
                <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-300" data-testid="upload-result-rejected">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span><strong>{uploadResult.rejected.length}</strong> rows rejected</span>
                  <Button variant="ghost" size="sm" className="h-5 px-1.5 text-[11px]" onClick={() => setShowRejected(v => !v)} data-testid="button-toggle-rejected">
                    {showRejected ? "Hide" : "Show"} details
                  </Button>
                </div>
              )}
            </div>
            {showRejected && uploadResult.rejected.length > 0 && (
              <div className="rounded-md border border-amber-200 dark:border-amber-700 overflow-hidden" data-testid="upload-rejected-table">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-amber-100 dark:bg-amber-900/40 border-b border-amber-200 dark:border-amber-700">
                      <th className="text-left p-2 font-medium text-amber-800 dark:text-amber-200">Row / Metric</th>
                      <th className="text-left p-2 font-medium text-amber-800 dark:text-amber-200">Period</th>
                      <th className="text-left p-2 font-medium text-amber-800 dark:text-amber-200">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {uploadResult.rejected.map((r, i) => (
                      <tr key={i} className="border-b last:border-0 hover:bg-amber-50 dark:hover:bg-amber-900/20">
                        <td className="p-2 font-medium truncate max-w-[180px]" title={r.name}>{r.name}</td>
                        <td className="p-2 tabular-nums">{r.period}</td>
                        <td className="p-2 text-muted-foreground">{r.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleDownloadTemplate}
          disabled={!templateData}
          data-testid="button-download-template"
        >
          <Download className="w-3.5 h-3.5 mr-1.5" />
          Download Template
        </Button>

        <Button
          variant={parsedData ? "outline" : "default"}
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          data-testid="button-choose-file"
        >
          <Upload className="w-3.5 h-3.5 mr-1.5" />
          {fileName ? "Choose Different File" : "Choose Excel File"}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={handleFileChange}
          data-testid="input-file-upload"
        />
      </div>

      {parsedData && parsedData.length > 0 && (
        <>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Table className="w-4 h-4 text-primary" />
                Preview: {fileName}
              </CardTitle>
              <CardDescription className="text-xs">
                {rowCount} rows, {previewPeriods.length} periods, {dataPointCount} data points
              </CardDescription>
            </CardHeader>
            <CardContent>
              {unmatchedNames.length > 0 && (
                <Alert variant="destructive" className="mb-3">
                  <AlertCircle className="w-4 h-4" />
                  <AlertDescription className="text-xs">
                    {unmatchedNames.length} row(s) not matched to known metrics and will be skipped:{" "}
                    <span className="font-medium">{unmatchedNames.join(", ")}</span>
                  </AlertDescription>
                </Alert>
              )}

              <div className="overflow-x-auto border rounded-md">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted/50 border-b">
                      <th className="text-left p-2 font-medium sticky left-0 bg-muted/50 min-w-[180px]">Metric / Input</th>
                      {previewPeriods.map(p => (
                        <th key={p} className="text-right p-2 font-medium min-w-[80px]">{p}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(previewRows).map(([name, periods]) => {
                      const isUnmatched = unmatchedNames.includes(name);
                      return (
                        <tr key={name} className={`border-b last:border-0 ${isUnmatched ? "bg-red-50 dark:bg-red-950/20 opacity-60" : "hover:bg-muted/30"}`}>
                          <td className={`p-2 font-medium sticky left-0 bg-background ${isUnmatched ? "bg-red-50 dark:bg-red-950/20 line-through" : ""}`}>
                            {name}
                          </td>
                          {previewPeriods.map(p => (
                            <td key={p} className="text-right p-2 tabular-nums">
                              {periods[p] != null ? periods[p]!.toLocaleString() : <span className="text-muted-foreground">-</span>}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {dataPointCount - (unmatchedNames.length > 0 ? parsedData.filter(r => unmatchedNames.includes(r.name)).length : 0)} data points will be uploaded
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setParsedData(null); setPreviewRows({}); setPreviewPeriods([]); setFileName(""); setUnmatchedNames([]); }}
                data-testid="button-clear-upload"
              >
                Clear
              </Button>
              <Button
                size="sm"
                onClick={() => uploadMutation.mutate(parsedData)}
                disabled={uploadMutation.isPending}
                data-testid="button-upload-data"
              >
                <Upload className="w-3.5 h-3.5 mr-1.5" />
                {uploadMutation.isPending ? "Uploading..." : "Upload Data"}
              </Button>
            </div>
          </div>
        </>
      )}

      {parsedData && parsedData.length === 0 && (
        <Alert>
          <AlertCircle className="w-4 h-4" />
          <AlertDescription>No numeric data found in the file. Make sure values are in the cells.</AlertDescription>
        </Alert>
      )}

      <Card className="bg-muted/30">
        <CardContent className="pt-4">
          <h3 className="text-sm font-medium mb-2">Expected Format</h3>
          <div className="overflow-x-auto border rounded-md bg-background">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/50 border-b">
                  <th className="text-left p-2 font-medium">Metric / Input</th>
                  <th className="text-right p-2 font-medium">2025-01</th>
                  <th className="text-right p-2 font-medium">2025-02</th>
                  <th className="text-right p-2 font-medium">2025-03</th>
                  <th className="text-right p-2 font-medium">...</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b"><td className="p-2">Electricity Consumption</td><td className="text-right p-2 text-muted-foreground">45200</td><td className="text-right p-2 text-muted-foreground">43800</td><td className="text-right p-2 text-muted-foreground">41500</td><td className="text-right p-2">...</td></tr>
                <tr className="border-b"><td className="p-2">Gas / Fuel Consumption</td><td className="text-right p-2 text-muted-foreground">12400</td><td className="text-right p-2 text-muted-foreground">11800</td><td className="text-right p-2 text-muted-foreground">9600</td><td className="text-right p-2">...</td></tr>
                <tr className="border-b"><td className="p-2">Employee Headcount</td><td className="text-right p-2 text-muted-foreground">48</td><td className="text-right p-2 text-muted-foreground">50</td><td className="text-right p-2 text-muted-foreground">51</td><td className="text-right p-2">...</td></tr>
                <tr><td className="p-2">Lost Time Incidents</td><td className="text-right p-2 text-muted-foreground">1</td><td className="text-right p-2 text-muted-foreground">0</td><td className="text-right p-2 text-muted-foreground">0</td><td className="text-right p-2">...</td></tr>
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Row names should match the labels shown in Raw Data Inputs or your metric names.
            Empty cells will be skipped. Column headers must be in YYYY-MM format.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
