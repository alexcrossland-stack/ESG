import { useState, useEffect, useRef } from "react";
import { rememberReportingMonth } from "@/hooks/use-reporting-month";
import { isBooleanMetricDataType } from "@shared/data-entry-metrics";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { resolveApiError } from "@/lib/errorResolver";
import { trackEvent, AnalyticsEvents } from "@/lib/analytics";
import {
  Leaf, Users, ArrowRight, ArrowLeft, CheckCircle2,
  Building2, BarChart3, Zap, Factory, Truck, Briefcase,
  Globe, ClipboardList, AlertCircle, FileText, Upload,
  Lightbulb, LayoutGrid,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { EsgStatusBadge, EsgStatusCard, type EsgStatusData } from "@/components/esg-status-badge";
import {
  buildOnboardingMetricSubmission,
  formatOnboardingMetricPeriod,
  isEditableStarterMetric,
  resolveOnboardingMetricPeriod,
  resolveOnboardingReportingRange,
  selectEditableStarterMetrics,
  type LabelledOnboardingMetric,
  type MetricLabel,
  type OnboardingMetric,
} from "@/lib/onboarding-metrics";

const WIZARD_STEPS = [
  {
    key: "company_basics",
    label: "Company Basics",
    icon: Building2,
    desc: "Tell us a little about your business — we use this to set up the right metrics and benchmarks for your sector.",
  },
  {
    key: "operations",
    label: "Your Operations",
    icon: Factory,
    desc: "Tick what applies to your business — this shapes which metrics are most relevant for you.",
  },
  {
    key: "what_to_track",
    label: "What You'll Track",
    icon: BarChart3,
    desc: "Here are the metrics we've selected for you. These are the ones that matter most given what you told us.",
  },
  {
    key: "enter_data",
    label: "Enter Your Data",
    icon: Zap,
    desc: "Enter a few key numbers — this gives you a real starting point for your first report. Rough figures are fine.",
  },
  {
    key: "baseline_ready",
    label: "You're Ready",
    icon: CheckCircle2,
    desc: "You've completed the essentials. Here's what you can do next.",
  },
];

const INDUSTRIES = [
  "Manufacturing", "Professional Services", "Technology", "Retail",
  "Construction", "Healthcare", "Education", "Hospitality",
  "Financial Services", "Logistics & Transport", "Agriculture", "Other",
];

const COUNTRIES = [
  "United Kingdom", "Ireland", "United States", "Germany",
  "France", "Netherlands", "Australia", "Canada", "Other",
];

const EMPLOYEE_SIZES = [
  { value: "1-10", label: "1–10 people" },
  { value: "11-50", label: "11–50 people" },
  { value: "51-250", label: "51–250 people" },
  { value: "251-500", label: "251–500 people" },
  { value: "500+", label: "500+ people" },
];

const SITE_COUNTS = [
  { value: "1", label: "1 site" },
  { value: "2-5", label: "2–5 sites" },
  { value: "6-20", label: "6–20 sites" },
  { value: "20+", label: "20+ sites" },
];

const ESG_PROFILE_ITEMS = [
  {
    key: "hasOffices",
    label: "We have office space",
    desc: "A permanent workplace where staff are based",
    icon: Briefcase,
  },
  {
    key: "hasVehicles",
    label: "We operate vehicles or a fleet",
    desc: "Company cars, vans, lorries, or delivery vehicles",
    icon: Truck,
  },
  {
    key: "hasManufacturing",
    label: "We have manufacturing or production",
    desc: "We make, assemble, or process physical goods",
    icon: Factory,
  },
  {
    key: "hasEnergyIntensive",
    label: "We use large amounts of energy",
    desc: "Machinery, data centres, industrial equipment",
    icon: Zap,
  },
  {
    key: "hasDistributedWorkforce",
    label: "We have remote or distributed staff",
    desc: "Employees working from home or across multiple locations",
    icon: Users,
  },
  {
    key: "hasContractors",
    label: "We use contractors or a supply chain",
    desc: "Third parties, freelancers, or sub-contractors",
    icon: ClipboardList,
  },
];

const REPORTING_YEARS = [
  String(new Date().getFullYear() - 2),
  String(new Date().getFullYear() - 1),
  String(new Date().getFullYear()),
];

type EsgProfile = {
  hasOffices: boolean;
  hasVehicles: boolean;
  hasManufacturing: boolean;
  hasEnergyIntensive: boolean;
  hasDistributedWorkforce: boolean;
  hasContractors: boolean;
};

function getMetricLabel(metric: OnboardingMetric, profile: EsgProfile): MetricLabel {
  const name = (metric.name || "").toLowerCase();
  const cat = (metric.category || "").toLowerCase();

  if (!isEditableStarterMetric(metric)) return "Calculated for you";

  if (name.includes("electricity") || name.includes("energy consumption")) return "Essential";
  if (
    name.includes("carbon") ||
    name.includes("emissions") ||
    name.includes("co2") ||
    name.includes("scope")
  ) return "Essential";
  if (
    name.includes("headcount") ||
    name.includes("total employee") ||
    name.includes("employees") && cat === "social"
  ) return "Essential";
  if (
    cat === "governance" &&
    (name.includes("anti-bribery") || name.includes("responsibility assigned"))
  ) return "Essential";
  if (
    profile.hasVehicles &&
    (name.includes("fleet") || name.includes("vehicle") || name.includes("fuel") || name.includes("diesel") || name.includes("mileage"))
  ) return "Essential";
  if (
    profile.hasManufacturing &&
    (name.includes("waste") || name.includes("water"))
  ) return "Essential";
  if (profile.hasEnergyIntensive && name.includes("gas")) return "Essential";

  if (cat === "environmental" || cat === "social") return "Recommended next";
  return "Optional later";
}

function labelTier(label: MetricLabel): number {
  if (label === "Essential") return 0;
  if (label === "Recommended next") return 1;
  if (label === "Optional later") return 2;
  return 3;
}

const LABEL_COLORS: Record<MetricLabel, string> = {
  "Essential": "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  "Recommended next": "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  "Optional later": "bg-muted text-muted-foreground",
  "Calculated for you": "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300",
};

const LABEL_DOT: Record<MetricLabel, string> = {
  "Essential": "bg-emerald-500",
  "Recommended next": "bg-blue-500",
  "Optional later": "bg-muted-foreground",
  "Calculated for you": "bg-violet-500",
};

const PILLAR_ICONS: Record<string, any> = {
  environmental: Leaf,
  social: Users,
  governance: LayoutGrid,
};

const DATA_ENTRY_EXAMPLES: Record<string, string> = {
  electricity: "e.g. 15,000",
  energy: "e.g. 15,000",
  gas: "e.g. 8,000",
  carbon: "e.g. 8.5",
  emissions: "e.g. 8.5",
  scope: "e.g. 8.5",
  headcount: "e.g. 45",
  employee: "e.g. 45",
  fleet: "e.g. 2,400",
  fuel: "e.g. 2,400",
  vehicle: "e.g. 2,400",
  waste: "e.g. 12",
  water: "e.g. 850",
};

function getExample(name: string): string {
  const lower = name.toLowerCase();
  for (const [key, val] of Object.entries(DATA_ENTRY_EXAMPLES)) {
    if (lower.includes(key)) return val;
  }
  return "Enter a number";
}

export default function Onboarding() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [currentStep, setCurrentStep] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [preflightError, setPreflightError] = useState<any>(null);

  const [step1, setStep1] = useState({
    name: "",
    industry: "",
    employeeCount: "",
    country: "United Kingdom",
    locations: "1",
    reportingYearStart: String(new Date().getFullYear() - 1),
  });

  const [esgProfile, setEsgProfile] = useState<EsgProfile>({
    hasOffices: false,
    hasVehicles: false,
    hasManufacturing: false,
    hasEnergyIntensive: false,
    hasDistributedWorkforce: false,
    hasContractors: false,
  });

  const [dataEntries, setDataEntries] = useState<Record<string, string>>({});
  const [dataSourceTypes, setDataSourceTypes] = useState<Record<string, "manual" | "estimated">>({});
  const [savedMetricIds, setSavedMetricIds] = useState<Set<string>>(new Set());
  const [failedMetrics, setFailedMetrics] = useState<Record<string, string>>({});

  const { data: companyData, isLoading: companyLoading } = useQuery({ queryKey: ["/api/company"] });
  const company = (companyData as any)?.company ?? companyData as any;
  const hydratedCompanyId = useRef<string | null>(null);

  const { data: rawMetrics = [], isLoading: metricsLoading } = useQuery<OnboardingMetric[]>({
    queryKey: ["/api/metrics"],
    enabled: currentStep >= 2,
  });

  const defaultPeriod = step1.reportingYearStart;

  const {
    data: preflight,
    isLoading: preflightLoading,
  } = useQuery({
    queryKey: ["/api/reports/preflight", defaultPeriod],
    queryFn: async () => {
      const reportingRange = resolveOnboardingReportingRange(defaultPeriod);
      const params = new URLSearchParams({
        period: defaultPeriod,
        dateFrom: reportingRange.dateFrom,
        dateTo: reportingRange.dateTo,
      });
      const r = await fetch(`/api/reports/preflight?${params.toString()}`);
      const json = await r.json();
      if (!r.ok) {
        const e = new Error(json.error || "Preflight check failed");
        (e as any).code = json.code;
        throw e;
      }
      return json;
    },
    enabled: currentStep === 4,
    retry: false,
  });

  useEffect(() => {
    if (!company || hydratedCompanyId.current === company.id) return;
    hydratedCompanyId.current = company.id;
    setStep1({
      name: company.name || "",
      industry: company.industry || "",
      employeeCount: String(company.onboardingAnswers?.employeeSizeBand || company.employeeCount || ""),
      country: company.country || "United Kingdom",
      locations: String(company.locations || "1"),
      reportingYearStart: String(company.reportingYearStart || (new Date().getFullYear() - 1)),
    });
    const answers = (company.onboardingAnswers as any) || {};
    if (answers.esgProfile) {
      setEsgProfile(prev => ({ ...prev, ...answers.esgProfile }));
    } else if (typeof company.hasVehicles === "boolean") {
      setEsgProfile(prev => ({ ...prev, hasVehicles: company.hasVehicles }));
    }
    if (company.onboardingVersion === 3 && company.onboardingStep > 0) {
      setCurrentStep(Math.min(company.onboardingStep - 1, 4));
    }
  }, [company]);

  const stepMutation = useMutation({
    mutationFn: (data: any) => apiRequest("PUT", "/api/onboarding/step", data).then((r: any) => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/company"] }),
  });

  const dataMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/data-entry", data).then((r: any) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/metrics"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reports/preflight"] });
    },
  });

  const completeMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/onboarding/complete", data).then((r: any) => r.json()),
    onSuccess: async () => {
      rememberReportingMonth(company.id, `${step1.reportingYearStart}-12`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/company"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] }),
      ]);
      setLocation("/");
    },
  });

  const labelledMetrics: LabelledOnboardingMetric[] = [...rawMetrics]
    .map((metric) => ({ ...metric, wizardLabel: getMetricLabel(metric, esgProfile) }))
    .sort((a, b) => labelTier(a.wizardLabel) - labelTier(b.wizardLabel));

  const displayMetrics = labelledMetrics.slice(0, 10);
  const essentialMetrics = selectEditableStarterMetrics(labelledMetrics);

  async function saveStep(nextStepIndex: number) {
    const payload: any = {
      step: nextStepIndex + 1,
      onboardingVersion: 3,
      path: "guided",
    };
    if (currentStep === 0) {
      payload.companyProfile = { ...step1 };
    }
    if (currentStep === 1) {
      payload.companyProfile = { hasVehicles: esgProfile.hasVehicles };
      payload.onboardingAnswers = { esgProfile };
    }
    await stepMutation.mutateAsync(payload);
  }

  async function handleNext() {
    if (currentStep === 3) {
      await handleSaveDataEntries();
      return;
    }
    setIsSaving(true);
    try {
      await saveStep(currentStep + 1);
      setCurrentStep(s => s + 1);
    } catch (e: any) {
      const { title, description } = resolveApiError(e);
      toast({ title, description, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSaveDataEntries() {
    setIsSaving(true);
    try {
      const entries = Object.entries(dataEntries).filter(([metricId, value]) => (
        value.trim() !== "" && !savedMetricIds.has(metricId)
      ));
      const results = await Promise.allSettled(
        entries.map(([metricId, value]) => {
          const metric = essentialMetrics.find((candidate) => candidate.id === metricId);
          const metricPeriod = resolveOnboardingMetricPeriod(defaultPeriod, metric?.frequency);

          return dataMutation.mutateAsync(buildOnboardingMetricSubmission(
            metricId,
            value,
            metricPeriod,
            dataSourceTypes[metricId] ?? "estimated",
          ));
        })
      );
      const saved = entries
        .filter((_, i) => results[i].status === "fulfilled")
        .map(([id]) => id);
      setSavedMetricIds(prev => new Set([...Array.from(prev), ...saved]));
      const failures = entries.reduce<Record<string, string>>((acc, [metricId], index) => {
        const result = results[index];
        if (result.status === "rejected") {
          acc[metricId] = resolveApiError(result.reason).description || "This figure could not be saved. Please try again.";
        }
        return acc;
      }, {});
      setFailedMetrics(failures);
      if (saved.length > 0) {
        trackEvent(AnalyticsEvents.FIRST_DATA_ADDED, { source: "wizard", count: saved.length });
      }
      if (Object.keys(failures).length > 0) {
        toast({
          title: "Some figures were not saved",
          description: `${Object.keys(failures).length} figure${Object.keys(failures).length === 1 ? "" : "s"} still need attention. Your successful saves are preserved; retry the highlighted rows.`,
          variant: "destructive",
        });
        return;
      }
      await saveStep(4);
      setCurrentStep(4);
    } catch (e: any) {
      const { title, description } = resolveApiError(e);
      toast({ title, description, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  }

  function handleBack() {
    if (currentStep > 0) setCurrentStep(s => s - 1);
  }

  async function handleComplete() {
    setIsSaving(true);
    try {
      await completeMutation.mutateAsync({
        path: "guided",
        onboardingVersion: 3,
        onboardingAnswers: { esgProfile },
        companyProfile: {
          ...step1,
          hasVehicles: esgProfile.hasVehicles,
        },
      });
    } catch (e: any) {
      const { title, description } = resolveApiError(e);
      toast({ title, description, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  }

  function handleSkipStep() {
    if (currentStep < 4) {
      saveStep(currentStep + 1).catch(() => {});
      setCurrentStep(s => s + 1);
    }
  }

  const progressPercent = Math.round(((currentStep + 1) / 5) * 100);
  const stepInfo = WIZARD_STEPS[currentStep];
  const StepIcon = stepInfo.icon;

  const step1Valid =
    step1.name.trim().length >= 2 &&
    !!step1.industry &&
    !!step1.employeeCount;

  const canGoNext =
    currentStep === 0 ? step1Valid :
    currentStep === 1 ? true :
    currentStep === 2 ? true :
    currentStep === 3 ? true :
    false;

  if (companyLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-full max-w-2xl px-4 space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-2 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <WizardHeader
        currentStep={currentStep}
        progressPercent={progressPercent}
        StepIcon={StepIcon}
        stepInfo={stepInfo}
      />

      <main className="flex-1 flex items-start justify-center px-4 py-8">
        <div className="w-full max-w-2xl">
          {currentStep === 0 && (
            <Step1CompanyBasics
              values={step1}
              onChange={setStep1}
            />
          )}
          {currentStep === 1 && (
            <Step2EsgProfile
              profile={esgProfile}
              onChange={setEsgProfile}
            />
          )}
          {currentStep === 2 && (
            <Step3StarterMetrics
              metrics={displayMetrics}
              isLoading={metricsLoading}
              esgProfile={esgProfile}
            />
          )}
          {currentStep === 3 && (
            <Step4DataEntry
              metrics={essentialMetrics}
              isLoading={metricsLoading}
              period={defaultPeriod}
              entries={dataEntries}
              sourceTypes={dataSourceTypes}
              savedIds={savedMetricIds}
              failedMetrics={failedMetrics}
              onChange={(metricId, value) => {
                setDataEntries(current => ({ ...current, [metricId]: value }));
                setFailedMetrics(current => {
                  if (!(metricId in current)) return current;
                  const next = { ...current };
                  delete next[metricId];
                  return next;
                });
              }}
              onSourceTypeChange={(metricId, sourceType) => setDataSourceTypes(current => ({
                ...current,
                [metricId]: sourceType,
              }))}
            />
          )}
          {currentStep === 4 && (
            <Step5BaselineReady
              preflight={preflight}
              isLoading={preflightLoading}
              savedCount={savedMetricIds.size}
              period={defaultPeriod}
            />
          )}
        </div>
      </main>

      <WizardFooter
        currentStep={currentStep}
        totalSteps={5}
        canGoNext={canGoNext}
        isSaving={isSaving || stepMutation.isPending || dataMutation.isPending || completeMutation.isPending}
        isLastStep={currentStep === 4}
        onBack={handleBack}
        onNext={handleNext}
        onComplete={handleComplete}
        onSkip={currentStep === 3 ? handleSkipStep : undefined}
      />
    </div>
  );
}

function WizardHeader({
  currentStep,
  progressPercent,
  StepIcon,
  stepInfo,
}: {
  currentStep: number;
  progressPercent: number;
  StepIcon: any;
  stepInfo: typeof WIZARD_STEPS[0];
}) {
  return (
    <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border">
      <div className="max-w-2xl mx-auto px-4 py-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
              <Leaf className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-semibold text-sm text-foreground">SimplyESG</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              Step {currentStep + 1} of 5
            </span>
            <span className="text-xs font-semibold text-primary">{progressPercent}%</span>
          </div>
        </div>
        <Progress value={progressPercent} className="h-1.5 mb-3" />
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
            <StepIcon className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-foreground" data-testid="text-onboarding-title">{stepInfo.label}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{stepInfo.desc}</p>
          </div>
        </div>
      </div>
    </header>
  );
}

function WizardFooter({
  currentStep,
  totalSteps,
  canGoNext,
  isSaving,
  isLastStep,
  onBack,
  onNext,
  onComplete,
  onSkip,
}: {
  currentStep: number;
  totalSteps: number;
  canGoNext: boolean;
  isSaving: boolean;
  isLastStep: boolean;
  onBack: () => void;
  onNext: () => void;
  onComplete: () => void;
  onSkip?: () => void;
}) {
  return (
    <footer className="sticky bottom-0 bg-background/95 backdrop-blur border-t border-border">
      <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {currentStep > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onBack}
              disabled={isSaving}
              data-testid="button-wizard-back"
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              Back
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {onSkip && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onSkip}
              disabled={isSaving}
              data-testid="button-wizard-skip"
              className="text-muted-foreground"
            >
              Skip for now
            </Button>
          )}
          {isLastStep ? (
            <Button
              size="sm"
              onClick={onComplete}
              disabled={isSaving}
              data-testid="button-wizard-complete"
            >
              {isSaving ? "Finishing up…" : "Finish setup"}
              <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={onNext}
              disabled={!canGoNext || isSaving}
              data-testid="button-wizard-next"
            >
              {isSaving ? "Saving…" : currentStep === 3 ? "Save & Continue" : "Next"}
              <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          )}
        </div>
      </div>
    </footer>
  );
}

function Step1CompanyBasics({
  values,
  onChange,
}: {
  values: {
    name: string;
    industry: string;
    employeeCount: string;
    country: string;
    locations: string;
    reportingYearStart: string;
  };
  onChange: (v: typeof values) => void;
}) {
  function set(field: string, val: string) {
    onChange({ ...values, [field]: val });
  }

  return (
    <div className="space-y-6" data-testid="step-company-basics">
      <div className="space-y-1">
        <Label htmlFor="company-name">
          Company name <span className="text-destructive">*</span>
        </Label>
        <Input
          id="company-name"
          placeholder="e.g. Acme Ltd"
          value={values.name}
          onChange={e => set("name", e.target.value)}
          data-testid="input-company-name"
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="industry">
          Sector / Industry <span className="text-destructive">*</span>
        </Label>
        <p className="text-xs text-muted-foreground">
          We use this to choose the most relevant metrics for your type of business.
        </p>
        <Select value={values.industry} onValueChange={v => set("industry", v)}>
          <SelectTrigger id="industry" data-testid="select-industry">
            <SelectValue placeholder="Choose your sector" />
          </SelectTrigger>
          <SelectContent>
            {INDUSTRIES.map(ind => (
              <SelectItem key={ind} value={ind}>{ind}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label htmlFor="employee-count">
            How many people work here? <span className="text-destructive">*</span>
          </Label>
          <Select value={values.employeeCount} onValueChange={v => set("employeeCount", v)}>
            <SelectTrigger id="employee-count" data-testid="select-employee-count">
              <SelectValue placeholder="Select size" />
            </SelectTrigger>
            <SelectContent>
              {EMPLOYEE_SIZES.map(s => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label htmlFor="locations">Number of sites</Label>
          <Select value={values.locations} onValueChange={v => set("locations", v)}>
            <SelectTrigger id="locations" data-testid="select-locations">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SITE_COUNTS.map(s => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label htmlFor="country">Primary country</Label>
          <Select value={values.country} onValueChange={v => set("country", v)}>
            <SelectTrigger id="country" data-testid="select-country">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COUNTRIES.map(c => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label htmlFor="reporting-year">Reporting year</Label>
          <p className="text-xs text-muted-foreground">
            The year you want to report on first.
          </p>
          <Select value={values.reportingYearStart} onValueChange={v => set("reportingYearStart", v)}>
            <SelectTrigger id="reporting-year" data-testid="select-reporting-year">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REPORTING_YEARS.map(y => (
                <SelectItem key={y} value={y}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 flex gap-2">
        <Lightbulb className="w-4 h-4 text-primary shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground">
          You can update any of these details later in Settings. We just need a starting point.
        </p>
      </div>
    </div>
  );
}

function Step2EsgProfile({
  profile,
  onChange,
}: {
  profile: EsgProfile;
  onChange: (p: EsgProfile) => void;
}) {
  function toggle(key: keyof EsgProfile) {
    onChange({ ...profile, [key]: !profile[key] });
  }

  const atLeastOneSelected = Object.values(profile).some(Boolean);

  return (
    <div className="space-y-4" data-testid="step-esg-profile">
      <p className="text-sm text-muted-foreground">
        Tick everything that applies — even partially. You can update this later.
      </p>
      <div className="space-y-3">
        {ESG_PROFILE_ITEMS.map(item => {
          const Icon = item.icon;
          const checked = profile[item.key as keyof EsgProfile];
          return (
            <label
              key={item.key}
              htmlFor={`esg-${item.key}`}
              className={cn(
                "flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-colors",
                checked
                  ? "border-primary/50 bg-primary/5"
                  : "border-border hover:border-primary/30 hover:bg-muted/30"
              )}
              data-testid={`checkbox-${item.key}`}
            >
              <Checkbox
                id={`esg-${item.key}`}
                checked={checked}
                onCheckedChange={() => toggle(item.key as keyof EsgProfile)}
                className="mt-0.5"
              />
              <div className="flex items-start gap-2 flex-1">
                <Icon className={cn("w-4 h-4 shrink-0 mt-0.5", checked ? "text-primary" : "text-muted-foreground")} />
                <div>
                  <p className={cn("text-sm font-medium", checked ? "text-foreground" : "text-foreground")}>{item.label}</p>
                  <p className="text-xs text-muted-foreground">{item.desc}</p>
                </div>
              </div>
            </label>
          );
        })}
      </div>
      {!atLeastOneSelected && (
        <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3 flex gap-2">
          <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800 dark:text-amber-300">
            Select at least one to help us tailor your metric set. If nothing applies, we'll use a standard office-based profile.
          </p>
        </div>
      )}
    </div>
  );
}

function Step3StarterMetrics({
  metrics,
  isLoading,
  esgProfile,
}: {
  metrics: LabelledOnboardingMetric[];
  isLoading: boolean;
  esgProfile: EsgProfile;
}) {
  if (isLoading) {
    return (
      <div className="space-y-3" data-testid="step-starter-metrics">
        {[1, 2, 3, 4, 5].map(i => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (metrics.length === 0) {
    return (
      <div className="text-center py-12 space-y-3" data-testid="step-starter-metrics">
        <BarChart3 className="w-10 h-10 text-muted-foreground mx-auto" />
        <p className="text-sm text-muted-foreground">
          We're setting up your metrics — this usually takes a moment. Click Next to continue.
        </p>
      </div>
    );
  }

  const essentials = metrics.filter((metric) => metric.wizardLabel === "Essential");
  const recommended = metrics.filter((metric) => metric.wizardLabel === "Recommended next");
  const optional = metrics.filter((metric) => metric.wizardLabel === "Optional later");
  const calculated = metrics.filter((metric) => metric.wizardLabel === "Calculated for you");

  return (
    <div className="space-y-6" data-testid="step-starter-metrics">
      <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 flex gap-2">
        <Lightbulb className="w-4 h-4 text-primary shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground">
          This is a short starting selection based on your sector and operations. You'll enter a few priority figures next. Your workspace also includes supporting calculations and optional metrics; use “Choose what we track” to review the full set.
        </p>
      </div>

      {essentials.length > 0 && (
        <MetricGroup
          label="Essential"
          description="Start here for a useful baseline. You can save partial progress and add more later."
          metrics={essentials}
        />
      )}
      {recommended.length > 0 && (
        <MetricGroup
          label="Recommended next"
          description="Add these over the coming weeks to build a fuller picture."
          metrics={recommended}
        />
      )}
      {optional.length > 0 && (
        <MetricGroup
          label="Optional later"
          description="These become relevant as your ESG programme matures."
          metrics={optional}
        />
      )}
      {calculated.length > 0 && (
        <MetricGroup
          label="Calculated for you"
          description="These update automatically from the operational figures you enter."
          metrics={calculated}
        />
      )}
    </div>
  );
}

function MetricGroup({
  label,
  description,
  metrics,
}: {
  label: MetricLabel;
  description: string;
  metrics: LabelledOnboardingMetric[];
}) {
  const PillarIcon = (cat: string) => PILLAR_ICONS[cat] || Globe;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className={cn("inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium", LABEL_COLORS[label])}>
          <span className={cn("w-1.5 h-1.5 rounded-full", LABEL_DOT[label])} />
          {label}
        </span>
        <span className="text-xs text-muted-foreground">{description}</span>
      </div>
      <div className="space-y-2">
        {metrics.map((m) => {
          const Icon = PillarIcon(m.category);
          return (
            <div
              key={m.id}
              className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card"
              data-testid={`metric-row-${m.id}`}
            >
              <div className="w-7 h-7 rounded-md bg-muted flex items-center justify-center shrink-0">
                <Icon className="w-3.5 h-3.5 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{m.name}</p>
                <p className="text-xs text-muted-foreground">{m.unit} · {m.frequency}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Step4DataEntry({
  metrics,
  isLoading,
  period,
  entries,
  sourceTypes,
  savedIds,
  failedMetrics,
  onChange,
  onSourceTypeChange,
}: {
  metrics: LabelledOnboardingMetric[];
  isLoading: boolean;
  period: string;
  entries: Record<string, string>;
  sourceTypes: Record<string, "manual" | "estimated">;
  savedIds: Set<string>;
  failedMetrics: Record<string, string>;
  onChange: (metricId: string, value: string) => void;
  onSourceTypeChange: (metricId: string, sourceType: "manual" | "estimated") => void;
}) {
  if (isLoading) {
    return (
      <div className="space-y-4" data-testid="step-data-entry">
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full" />)}
      </div>
    );
  }

  if (metrics.length === 0) {
    return (
      <div className="text-center py-12 space-y-3" data-testid="step-data-entry">
        <Zap className="w-10 h-10 text-muted-foreground mx-auto" />
        <p className="text-sm text-muted-foreground">
          No essential metrics found yet. You can enter data from the main platform. Click "Skip for now" to continue.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="step-data-entry">
      <div className="rounded-lg bg-muted/50 border border-border p-3 flex gap-2">
        <FileText className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground">
          Reporting year: <strong>{period}</strong> · Enter figures from an invoice, bill, payroll record, account or spreadsheet.
          We use the final matching period in that year for each metric. Mark each figure as actual or estimated so its confidence is preserved.
        </p>
      </div>

      <div className="space-y-4">
        {metrics.map((m) => {
          const isSaved = savedIds.has(m.id);
          const failure = failedMetrics[m.id];
          const val = entries[m.id] || "";
          const sourceType = sourceTypes[m.id] ?? "estimated";

          return (
            <div
              key={m.id}
              className={cn(
                "p-4 rounded-lg border transition-colors",
                isSaved
                  ? "border-emerald-300 bg-emerald-50/50 dark:bg-emerald-900/10 dark:border-emerald-700"
                  : failure
                    ? "border-red-300 bg-red-50/50 dark:border-red-800 dark:bg-red-950/20"
                    : "border-border bg-card"
              )}
              data-testid={`data-entry-metric-${m.id}`}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <p className="text-sm font-medium text-foreground">{m.name}</p>
                  <p
                    className="text-xs text-muted-foreground mt-0.5"
                    data-testid={`text-metric-period-${m.id}`}
                  >
                    Period: {formatOnboardingMetricPeriod(period, m.frequency)}
                  </p>
                  {m.helpText && (
                    <p className="text-xs text-muted-foreground mt-0.5">{m.helpText}</p>
                  )}
                </div>
                {isSaved && (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                )}
                {!isSaved && failure && (
                  <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                )}
              </div>
              <div className="flex items-center gap-2">
                {isBooleanMetricDataType(m.dataType) || /yes\s*\/\s*no/i.test(m.unit || "") ? (
                  <Select value={val} onValueChange={value => onChange(m.id, value)} disabled={isSaved}>
                    <SelectTrigger aria-label={m.name} data-testid={`input-metric-value-${m.id}`}><SelectValue placeholder="Choose Yes or No" /></SelectTrigger>
                    <SelectContent><SelectItem value="1">Yes</SelectItem><SelectItem value="0">No</SelectItem></SelectContent>
                  </Select>
                ) : <Input
                  type="text"
                  inputMode="decimal"
                  aria-label={m.name}
                  placeholder={getExample(m.name)}
                  value={val}
                  onChange={e => onChange(m.id, e.target.value)}
                  className="flex-1"
                  disabled={isSaved}
                  data-testid={`input-metric-value-${m.id}`}
                />}
                <span className="text-xs text-muted-foreground whitespace-nowrap">{m.unit}</span>
              </div>
              {failure && !isSaved && (
                <p className="mt-1.5 text-xs text-red-700 dark:text-red-300" role="alert" data-testid={`error-metric-save-${m.id}`}>
                  Not saved: {failure}
                </p>
              )}
              {!m.helpText && (
                <p className="text-xs text-muted-foreground mt-1.5">
                  {getExample(m.name) !== "Enter a number"
                    ? `Typical range: ${getExample(m.name)} for a business your size.`
                    : "Enter the figure for this period."}
                </p>
              )}
              <div className="mt-3 flex items-center justify-between gap-3">
                <span className="text-xs text-muted-foreground">This figure is</span>
                <div className="inline-flex rounded-md border border-border p-0.5" role="group" aria-label={`${m.name} data quality`}>
                  <Button
                    type="button"
                    size="sm"
                    variant={sourceType === "manual" ? "default" : "ghost"}
                    className="h-7 px-3 text-xs"
                    disabled={isSaved}
                    onClick={() => onSourceTypeChange(m.id, "manual")}
                    data-testid={`source-actual-${m.id}`}
                  >
                    Actual
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={sourceType === "estimated" ? "default" : "ghost"}
                    className="h-7 px-3 text-xs"
                    disabled={isSaved}
                    onClick={() => onSourceTypeChange(m.id, "estimated")}
                    data-testid={`source-estimated-${m.id}`}
                  >
                    Estimated
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-3 flex gap-2">
        <Upload className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
        <p className="text-xs text-blue-800 dark:text-blue-300">
          After setup, you can upload supporting documents (invoices, bills, certificates) to prove your data. This isn't required right now.
        </p>
      </div>
    </div>
  );
}

function Step5BaselineReady({
  preflight,
  isLoading,
  savedCount,
  period,
}: {
  preflight: any;
  isLoading: boolean;
  savedCount: number;
  period: string;
}) {
  const metricsWithData = preflight?.metricsWithData ?? savedCount;

  return (
    <div className="space-y-6" data-testid="step-baseline-ready">
      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : metricsWithData > 0 ? (
        <div className="rounded-xl border border-emerald-300 bg-emerald-50 dark:bg-emerald-900/20 dark:border-emerald-700 p-5 text-center space-y-2">
          <CheckCircle2 className="w-10 h-10 text-emerald-600 dark:text-emerald-400 mx-auto" />
          <h2 className="text-base font-semibold text-foreground">Your starter ESG baseline is set</h2>
          <p className="text-sm text-muted-foreground">
            You captured {metricsWithData} priority metric{metricsWithData === 1 ? "" : "s"} for {period} across the business areas that matter first.
          </p>
          <p className="text-xs text-muted-foreground">
            This is a practical starting point, not an audited assessment. Home will guide you through evidence and your first shareable report.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-blue-300 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-700 p-5 space-y-2">
          <h2 className="text-base font-semibold text-foreground">Your workspace is ready</h2>
          <p className="text-sm text-muted-foreground">Start with any figure you can find in a bill, payroll record, or business account. Home will keep the next step clear.</p>
        </div>
      )}

      <div className="rounded-lg border border-primary/25 bg-primary/5 p-4" data-testid="onboarding-next-step-preview">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Upload className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">{metricsWithData > 0 ? "Your next step: support one figure" : "Your next step: enter your first figure"}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              {metricsWithData > 0 ? `After setup, open your saved figures for ${period} and attach one bill, invoice or HR record. You do not need to complete every optional metric first.` : `After setup, enter one figure for ${period} from a bill, payroll record or business account. You can add supporting evidence alongside it.`}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
