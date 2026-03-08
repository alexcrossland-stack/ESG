import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  Leaf, Users, Shield, ArrowRight, ArrowLeft, CheckCircle2,
  Building2, Sparkles, LayoutGrid, BarChart3, Zap, FileText,
  Truck, Factory, Store, Briefcase, ClipboardList, Globe,
} from "lucide-react";

const TOTAL_STEPS = 8;

const INDUSTRIES = [
  "Manufacturing", "Professional Services", "Technology", "Retail",
  "Construction", "Healthcare", "Education", "Hospitality",
  "Financial Services", "Logistics & Transport", "Agriculture", "Other",
];

const COUNTRIES = [
  "United Kingdom", "Ireland", "United States", "Germany",
  "France", "Netherlands", "Australia", "Canada", "Other",
];

const OP_PROFILES = [
  { value: "office", label: "Office-based", icon: Briefcase, desc: "Primarily desk-based work" },
  { value: "manufacturing", label: "Manufacturing", icon: Factory, desc: "Production and assembly" },
  { value: "logistics", label: "Logistics", icon: Truck, desc: "Transport and distribution" },
  { value: "retail", label: "Retail", icon: Store, desc: "Customer-facing retail operations" },
  { value: "mixed", label: "Mixed", icon: Building2, desc: "Combination of operations" },
];

const MATURITY_LEVELS = [
  { value: "just_starting", label: "Just Starting", desc: "We're new to ESG and need guidance", icon: Leaf },
  { value: "some_policies", label: "Some Policies in Place", desc: "We have some ESG practices but want to formalise them", icon: ClipboardList },
  { value: "formal_programme", label: "Formal ESG Programme", desc: "We have an established programme and want to improve tracking", icon: Shield },
];

const DEFAULT_MODULES = [
  { key: "metrics", label: "ESG Metrics Library", desc: "Track environmental, social, and governance KPIs", icon: BarChart3, default: true },
  { key: "carbon", label: "Carbon Calculator", desc: "Calculate Scope 1, 2 & 3 emissions automatically", icon: Zap, default: true },
  { key: "policies", label: "Policy Generator", desc: "Generate tailored ESG policy documents", icon: FileText, default: true },
  { key: "supplier", label: "Supplier Questionnaire", desc: "Assess supplier ESG compliance", icon: ClipboardList, default: false },
  { key: "reporting", label: "Reporting Dashboard", desc: "Generate ESG reports and exports", icon: Globe, default: true },
  { key: "traffic_light", label: "Traffic Light Scoring", desc: "Red/amber/green status for all metrics", icon: Sparkles, default: true },
];

type MetricRec = { key: string; name: string; desc: string; default: boolean };

const ENV_METRICS: MetricRec[] = [
  { key: "electricity", name: "Electricity Consumption", desc: "Track electricity usage in kWh", default: true },
  { key: "gas_fuel", name: "Gas / Fuel Consumption", desc: "Natural gas and fuel oil use", default: true },
  { key: "scope1", name: "Scope 1 Emissions", desc: "Direct emissions (auto-calculated)", default: true },
  { key: "scope2", name: "Scope 2 Emissions", desc: "Indirect emissions from electricity (auto-calculated)", default: true },
  { key: "waste", name: "Waste Generated", desc: "Total waste produced", default: true },
  { key: "recycling", name: "Recycling Rate", desc: "Percentage of waste recycled (auto-calculated)", default: true },
  { key: "water", name: "Water Consumption", desc: "Water usage in cubic metres", default: false },
  { key: "vehicle_fuel", name: "Company Vehicle Fuel", desc: "Fuel used by company vehicles", default: false },
  { key: "travel_emissions", name: "Business Travel Emissions", desc: "Flights, rail, car travel (auto-calculated)", default: false },
  { key: "carbon_intensity", name: "Carbon Intensity", desc: "Emissions per employee (auto-calculated)", default: false },
];

const SOCIAL_METRICS: MetricRec[] = [
  { key: "headcount", name: "Employee Headcount", desc: "Total number of employees", default: true },
  { key: "gender_diversity", name: "Gender Diversity", desc: "Percentage of female employees", default: true },
  { key: "turnover", name: "Employee Turnover", desc: "Staff leaving rate (auto-calculated)", default: true },
  { key: "training", name: "Training Hours per Employee", desc: "Learning and development hours (auto-calculated)", default: true },
  { key: "health_safety", name: "Lost Time Incidents", desc: "Workplace health and safety incidents", default: true },
  { key: "absence", name: "Absence Rate", desc: "Staff absence percentage (auto-calculated)", default: false },
  { key: "engagement", name: "Employee Engagement Score", desc: "Staff satisfaction and engagement", default: false },
  { key: "living_wage", name: "Living Wage Coverage", desc: "Percentage paid at or above living wage", default: false },
  { key: "mgmt_diversity", name: "Management Gender Diversity", desc: "Female representation in management", default: false },
  { key: "community", name: "Community Investment", desc: "Community engagement and investment", default: false },
];

const GOV_METRICS: MetricRec[] = [
  { key: "board_meetings", name: "Board Meetings Held", desc: "Number of board meetings per year", default: true },
  { key: "esg_policy", name: "ESG Policy Adoption", desc: "Whether a formal ESG policy is in place", default: true },
  { key: "supplier_screening", name: "Supplier ESG Screening", desc: "Percentage of suppliers assessed (auto-calculated)", default: true },
  { key: "privacy_training", name: "Data Privacy Training", desc: "Staff who completed privacy training (auto-calculated)", default: false },
  { key: "anti_bribery", name: "Anti-Bribery Policy", desc: "Whether an anti-bribery policy is in place", default: false },
  { key: "whistleblowing", name: "Whistleblowing Policy", desc: "Whether a whistleblowing policy is in place", default: false },
  { key: "cybersecurity", name: "Cybersecurity Policy", desc: "Whether a cybersecurity policy is in place", default: false },
  { key: "esg_assigned", name: "ESG Responsibility Assigned", desc: "Whether ESG ownership is assigned", default: false },
];

function getRecommendedMetrics(profile: string, maturity: string): string[] {
  const base = new Set<string>();
  ENV_METRICS.filter(m => m.default).forEach(m => base.add(m.key));
  SOCIAL_METRICS.filter(m => m.default).forEach(m => base.add(m.key));
  GOV_METRICS.filter(m => m.default).forEach(m => base.add(m.key));

  if (profile === "manufacturing") {
    base.add("waste"); base.add("water"); base.add("vehicle_fuel"); base.add("health_safety");
  } else if (profile === "office") {
    base.add("training"); base.add("engagement"); base.add("privacy_training");
  } else if (profile === "logistics") {
    base.add("vehicle_fuel"); base.add("travel_emissions"); base.add("health_safety"); base.add("scope1");
  } else if (profile === "retail") {
    base.add("waste"); base.add("living_wage"); base.add("community");
  }

  if (maturity === "formal_programme") {
    base.add("carbon_intensity"); base.add("mgmt_diversity"); base.add("absence");
    base.add("anti_bribery"); base.add("whistleblowing"); base.add("cybersecurity");
    base.add("travel_emissions"); base.add("esg_assigned");
  } else if (maturity === "some_policies") {
    base.add("travel_emissions"); base.add("absence");
  }

  return Array.from(base);
}

function ProgressBar({ step, total }: { step: number; total: number }) {
  const pct = Math.round((step / total) * 100);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Step {step} of {total}</span>
        <span>{pct}%</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function MetricCheckboxGroup({ title, icon: Icon, color, metrics, selected, onToggle }: {
  title: string; icon: any; color: string; metrics: MetricRec[];
  selected: Set<string>; onToggle: (key: string) => void;
}) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium flex items-center gap-2">
        <Icon className={`w-4 h-4 ${color}`} />
        {title}
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {metrics.map(m => (
          <label
            key={m.key}
            className={`flex items-start gap-3 p-3 rounded-md border cursor-pointer transition-colors ${
              selected.has(m.key) ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"
            }`}
            data-testid={`metric-option-${m.key}`}
          >
            <input
              type="checkbox"
              checked={selected.has(m.key)}
              onChange={() => onToggle(m.key)}
              className="mt-0.5 accent-primary"
            />
            <div className="min-w-0">
              <p className="text-sm font-medium">{m.name}</p>
              <p className="text-xs text-muted-foreground">{m.desc}</p>
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}

export default function Onboarding() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: authData } = useQuery<any>({ queryKey: ["/api/auth/me"] });
  const company = authData?.company;

  const [showWizard, setShowWizard] = useState(false);
  const [step, setStep] = useState(1);

  const [companyName, setCompanyName] = useState("");
  const [industry, setIndustry] = useState("");
  const [businessType, setBusinessType] = useState("");
  const [employeeCount, setEmployeeCount] = useState("");
  const [sitesCount, setSitesCount] = useState("1");
  const [country, setCountry] = useState("United Kingdom");
  const [reportingYearStart, setReportingYearStart] = useState("January");
  const [operationalProfile, setOperationalProfile] = useState("");

  const [esgMaturity, setEsgMaturity] = useState("");

  const [enabledModules, setEnabledModules] = useState<Record<string, boolean>>(() => {
    const m: Record<string, boolean> = {};
    DEFAULT_MODULES.forEach(mod => { m[mod.key] = mod.default; });
    return m;
  });

  const [selectedMetrics, setSelectedMetrics] = useState<Set<string>>(new Set());

  const [trackElectricity, setTrackElectricity] = useState(true);
  const [trackGasFuel, setTrackGasFuel] = useState(true);
  const [hasVehicles, setHasVehicles] = useState(false);
  const [autoScope, setAutoScope] = useState(true);

  const [generatePolicies, setGeneratePolicies] = useState(true);
  const [enableSupplier, setEnableSupplier] = useState(false);

  useEffect(() => {
    if (company) {
      if (company.onboardingComplete) {
        setLocation("/");
        return;
      }
      if (company.onboardingPath === "guided" && company.onboardingStep > 0) {
        setShowWizard(true);
        setStep(company.onboardingStep);
      }
      if (company.name) setCompanyName(company.name);
      if (company.industry) setIndustry(company.industry);
      if (company.businessType) setBusinessType(company.businessType);
      if (company.employeeCount) setEmployeeCount(String(company.employeeCount));
      if (company.locations) setSitesCount(String(company.locations));
      if (company.country) setCountry(company.country);
      if (company.operationalProfile) setOperationalProfile(company.operationalProfile);
      if (company.reportingYearStart) setReportingYearStart(company.reportingYearStart);
      if (company.esgMaturity) setEsgMaturity(company.esgMaturity);
      if (company.selectedModules) {
        setEnabledModules(company.selectedModules as Record<string, boolean>);
      }
      if (company.selectedMetrics) {
        setSelectedMetrics(new Set(company.selectedMetrics as string[]));
      }
      if (company.onboardingAnswers) {
        const ans = company.onboardingAnswers as any;
        if (ans.trackElectricity !== undefined) setTrackElectricity(ans.trackElectricity);
        if (ans.trackGasFuel !== undefined) setTrackGasFuel(ans.trackGasFuel);
        if (ans.hasVehicles !== undefined) setHasVehicles(ans.hasVehicles);
        if (ans.autoScope !== undefined) setAutoScope(ans.autoScope);
        if (ans.generatePolicies !== undefined) setGeneratePolicies(ans.generatePolicies);
        if (ans.enableSupplier !== undefined) setEnableSupplier(ans.enableSupplier);
      }
    }
  }, [company]);

  useEffect(() => {
    if (esgMaturity && operationalProfile && selectedMetrics.size === 0) {
      const recommended = getRecommendedMetrics(operationalProfile, esgMaturity);
      setSelectedMetrics(new Set(recommended));
    }
  }, [esgMaturity, operationalProfile]);

  const saveMutation = useMutation({
    mutationFn: (data: any) => apiRequest("PUT", "/api/onboarding/step", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
  });

  const completeMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/onboarding/complete", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/enhanced"] });
      queryClient.invalidateQueries({ queryKey: ["/api/metrics"] });
      toast({ title: "Setup complete!", description: "Your ESG workspace is ready." });
      setLocation("/");
    },
    onError: (e: any) => {
      toast({ title: "Setup failed", description: e.message, variant: "destructive" });
    },
  });

  function getStepData() {
    return {
      step,
      companyProfile: { name: companyName, industry, businessType, employeeCount: Number(employeeCount) || 0, locations: Number(sitesCount) || 1, country, operationalProfile, reportingYearStart },
      esgMaturity,
      selectedModules: enabledModules,
      selectedMetrics: Array.from(selectedMetrics),
      onboardingAnswers: { trackElectricity, trackGasFuel, hasVehicles, autoScope, generatePolicies, enableSupplier },
    };
  }

  function saveAndNext() {
    const data = getStepData();
    saveMutation.mutate({ ...data, step: step + 1 });
    setStep(s => s + 1);
  }

  function saveAndPrev() {
    const data = getStepData();
    saveMutation.mutate({ ...data, step: step - 1 });
    setStep(s => s - 1);
  }

  function handleComplete() {
    completeMutation.mutate(getStepData());
  }

  function startGuided() {
    setShowWizard(true);
    setStep(1);
    saveMutation.mutate({ step: 1, path: "guided" });
  }

  function startManual() {
    apiRequest("POST", "/api/onboarding/complete", { path: "manual" }).then(() => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({ title: "Welcome!", description: "Check the setup checklist on your dashboard." });
      setLocation("/");
    });
  }

  function toggleMetric(key: string) {
    setSelectedMetrics(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  if (!company) return null;

  if (!showWizard) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background p-4">
        <div className="max-w-lg w-full space-y-8 text-center">
          <div className="space-y-3">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
              <Leaf className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold" data-testid="text-onboarding-title">
              Welcome to your ESG workspace
            </h1>
            <p className="text-muted-foreground text-sm sm:text-base max-w-md mx-auto">
              This platform helps SMEs set up ESG metrics, policies, carbon tracking, 
              supplier assessments, and reporting — all in one place.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card
              className="cursor-pointer border-2 hover:border-primary transition-colors text-left"
              onClick={startGuided}
              data-testid="button-guided-setup"
            >
              <CardContent className="p-5 space-y-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold">Guided Setup</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    Answer a few questions and we'll configure everything for you. Takes about 5 minutes.
                  </p>
                </div>
                <Badge variant="secondary" className="text-xs">Recommended</Badge>
              </CardContent>
            </Card>

            <Card
              className="cursor-pointer border-2 hover:border-muted-foreground/30 transition-colors text-left"
              onClick={startManual}
              data-testid="button-manual-setup"
            >
              <CardContent className="p-5 space-y-3">
                <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                  <LayoutGrid className="w-5 h-5 text-muted-foreground" />
                </div>
                <div>
                  <h3 className="font-semibold">Set Up Manually</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    Go straight to your dashboard and configure everything at your own pace.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border px-4 py-3 flex items-center gap-3 shrink-0 bg-background">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
          <Leaf className="w-4 h-4 text-primary" />
        </div>
        <span className="text-sm font-semibold">ESG Manager Setup</span>
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="sm"
          className="text-xs"
          onClick={() => { saveMutation.mutate(getStepData()); setLocation("/"); }}
          data-testid="button-exit-wizard"
        >
          Save & Exit
        </Button>
      </header>

      <div className="flex-1 overflow-auto p-4 sm:p-6">
        <div className="max-w-2xl mx-auto space-y-6">
          <ProgressBar step={step} total={TOTAL_STEPS} />

          {step === 1 && (
            <div className="space-y-5" data-testid="step-company-profile">
              <div>
                <h2 className="text-xl font-semibold">Company Profile</h2>
                <p className="text-sm text-muted-foreground mt-1">Tell us about your business so we can tailor your setup</p>
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Company Name</Label>
                  <Input value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="Your company name" data-testid="input-company-name" />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Industry</Label>
                    <Select value={industry} onValueChange={setIndustry}>
                      <SelectTrigger data-testid="select-industry"><SelectValue placeholder="Select industry" /></SelectTrigger>
                      <SelectContent>
                        {INDUSTRIES.map(i => <SelectItem key={i} value={i}>{i}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Country</Label>
                    <Select value={country} onValueChange={setCountry}>
                      <SelectTrigger data-testid="select-country"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {COUNTRIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Number of Employees</Label>
                    <Input type="number" value={employeeCount} onChange={e => setEmployeeCount(e.target.value)} placeholder="e.g. 50" data-testid="input-employees" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Number of Sites</Label>
                    <Input type="number" value={sitesCount} onChange={e => setSitesCount(e.target.value)} placeholder="e.g. 2" data-testid="input-sites" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Operational Profile</Label>
                  <p className="text-xs text-muted-foreground">What best describes your operations?</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {OP_PROFILES.map(op => (
                      <button
                        key={op.value}
                        className={`p-3 rounded-md border text-left transition-colors ${
                          operationalProfile === op.value ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"
                        }`}
                        onClick={() => setOperationalProfile(op.value)}
                        data-testid={`option-profile-${op.value}`}
                      >
                        <op.icon className={`w-4 h-4 mb-1.5 ${operationalProfile === op.value ? "text-primary" : "text-muted-foreground"}`} />
                        <p className="text-sm font-medium">{op.label}</p>
                        <p className="text-xs text-muted-foreground">{op.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Reporting Year Start</Label>
                  <Select value={reportingYearStart} onValueChange={setReportingYearStart}>
                    <SelectTrigger data-testid="select-reporting-year"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["January","February","March","April","May","June","July","August","September","October","November","December"].map(m => (
                        <SelectItem key={m} value={m}>{m}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5" data-testid="step-esg-maturity">
              <div>
                <h2 className="text-xl font-semibold">ESG Maturity</h2>
                <p className="text-sm text-muted-foreground mt-1">Where is your organisation on its ESG journey? This helps us set appropriate defaults.</p>
              </div>

              <div className="space-y-3">
                {MATURITY_LEVELS.map(level => (
                  <button
                    key={level.value}
                    className={`w-full p-4 rounded-lg border text-left transition-colors flex items-start gap-4 ${
                      esgMaturity === level.value ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"
                    }`}
                    onClick={() => setEsgMaturity(level.value)}
                    data-testid={`option-maturity-${level.value}`}
                  >
                    <level.icon className="w-6 h-6 text-primary shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium">{level.label}</p>
                      <p className="text-sm text-muted-foreground mt-0.5">{level.desc}</p>
                    </div>
                    {esgMaturity === level.value && <CheckCircle2 className="w-5 h-5 text-primary ml-auto shrink-0 mt-1" />}
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5" data-testid="step-module-selection">
              <div>
                <h2 className="text-xl font-semibold">Choose Your Modules</h2>
                <p className="text-sm text-muted-foreground mt-1">Select which tools you'd like to use. You can change this later in Settings.</p>
              </div>

              <div className="space-y-3">
                {DEFAULT_MODULES.map(mod => (
                  <div
                    key={mod.key}
                    className={`flex items-center gap-3 p-4 rounded-lg border transition-colors ${
                      enabledModules[mod.key] ? "border-primary/40 bg-primary/5" : "border-border"
                    }`}
                    data-testid={`module-option-${mod.key}`}
                  >
                    <div className={`p-2 rounded-md ${enabledModules[mod.key] ? "bg-primary/10" : "bg-muted"}`}>
                      <mod.icon className={`w-4 h-4 ${enabledModules[mod.key] ? "text-primary" : "text-muted-foreground"}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{mod.label}</p>
                      <p className="text-xs text-muted-foreground">{mod.desc}</p>
                    </div>
                    <Switch
                      checked={enabledModules[mod.key]}
                      onCheckedChange={v => setEnabledModules(prev => ({ ...prev, [mod.key]: v }))}
                      data-testid={`switch-module-${mod.key}`}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-5" data-testid="step-metric-selection">
              <div>
                <h2 className="text-xl font-semibold">Select Your Metrics</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  We've recommended metrics based on your profile. Tick or untick to customise.
                </p>
                <Badge variant="secondary" className="mt-2 text-xs">
                  {selectedMetrics.size} metrics selected
                </Badge>
              </div>

              <MetricCheckboxGroup title="Environmental" icon={Leaf} color="text-primary" metrics={ENV_METRICS} selected={selectedMetrics} onToggle={toggleMetric} />
              <MetricCheckboxGroup title="Social" icon={Users} color="text-blue-500" metrics={SOCIAL_METRICS} selected={selectedMetrics} onToggle={toggleMetric} />
              <MetricCheckboxGroup title="Governance" icon={Shield} color="text-purple-500" metrics={GOV_METRICS} selected={selectedMetrics} onToggle={toggleMetric} />
            </div>
          )}

          {step === 5 && (
            <div className="space-y-5" data-testid="step-carbon-setup">
              <div>
                <h2 className="text-xl font-semibold">Carbon Calculator Setup</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Help us configure your carbon footprint tracking. We'll link data sources to calculate emissions automatically.
                </p>
              </div>

              <div className="space-y-4">
                {[
                  { label: "Do you track electricity use?", desc: "From your utility bills — used for Scope 2 calculations", checked: trackElectricity, onChange: setTrackElectricity, testId: "switch-electricity" },
                  { label: "Do you track gas or fuel use?", desc: "From your gas bills — used for Scope 1 calculations", checked: trackGasFuel, onChange: setTrackGasFuel, testId: "switch-gas" },
                  { label: "Do you have company vehicles?", desc: "Fuel used by fleet vehicles — contributes to Scope 1", checked: hasVehicles, onChange: setHasVehicles, testId: "switch-vehicles" },
                  { label: "Enable automatic Scope 1 & 2 calculations?", desc: "We'll calculate emissions from your energy data using UK DEFRA factors", checked: autoScope, onChange: setAutoScope, testId: "switch-auto-scope" },
                ].map(item => (
                  <div key={item.testId} className="flex items-center gap-3 p-4 rounded-lg border border-border">
                    <div className="flex-1">
                      <p className="text-sm font-medium">{item.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
                    </div>
                    <Switch checked={item.checked} onCheckedChange={item.onChange} data-testid={item.testId} />
                  </div>
                ))}
              </div>

              {autoScope && (
                <Card className="border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20">
                  <CardContent className="p-4">
                    <p className="text-sm font-medium text-blue-700 dark:text-blue-300">Automatic calculations enabled</p>
                    <ul className="text-xs text-blue-600 dark:text-blue-400 mt-2 space-y-1">
                      {trackGasFuel && <li>• Scope 1 will include gas and fuel emissions</li>}
                      {hasVehicles && <li>• Scope 1 will include company vehicle emissions</li>}
                      {trackElectricity && <li>• Scope 2 will be calculated from electricity consumption</li>}
                    </ul>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {step === 6 && (
            <div className="space-y-5" data-testid="step-policy-setup">
              <div>
                <h2 className="text-xl font-semibold">Policy Generation</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Would you like us to create starter ESG policy drafts? These will be editable templates you can customise.
                </p>
              </div>

              <div className="space-y-3">
                <button
                  className={`w-full p-4 rounded-lg border text-left transition-colors ${
                    generatePolicies ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"
                  }`}
                  onClick={() => setGeneratePolicies(true)}
                  data-testid="option-generate-policies-yes"
                >
                  <div className="flex items-center gap-3">
                    <FileText className={`w-5 h-5 ${generatePolicies ? "text-primary" : "text-muted-foreground"}`} />
                    <div>
                      <p className="font-medium">Yes, generate starter drafts</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        We'll create editable drafts for key ESG policies
                      </p>
                    </div>
                    {generatePolicies && <CheckCircle2 className="w-5 h-5 text-primary ml-auto" />}
                  </div>
                </button>

                <button
                  className={`w-full p-4 rounded-lg border text-left transition-colors ${
                    !generatePolicies ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"
                  }`}
                  onClick={() => setGeneratePolicies(false)}
                  data-testid="option-generate-policies-no"
                >
                  <p className="font-medium">No, I'll set up policies later</p>
                  <p className="text-xs text-muted-foreground mt-0.5">You can generate policies anytime from the Policy Generator</p>
                </button>
              </div>

              {generatePolicies && (
                <div className="p-4 bg-muted/50 rounded-lg border border-border">
                  <p className="text-sm font-medium mb-2">Policies that will be created:</p>
                  <ul className="text-xs text-muted-foreground space-y-1">
                    {["Environmental Policy","Sustainability Policy","Health & Safety Policy","Diversity & Inclusion Policy","Supplier Code of Conduct","Anti-Bribery / Ethics Policy","ESG Commitment Statement"].map(p => (
                      <li key={p} className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-3 h-3 text-primary shrink-0" />
                        {p}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {step === 7 && (
            <div className="space-y-5" data-testid="step-supplier-setup">
              <div>
                <h2 className="text-xl font-semibold">Supplier Assessment</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Do you need to assess your suppliers' ESG practices? We can set up a questionnaire and scoring system.
                </p>
              </div>

              <div className="space-y-3">
                <button
                  className={`w-full p-4 rounded-lg border text-left transition-colors ${
                    enableSupplier ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"
                  }`}
                  onClick={() => setEnableSupplier(true)}
                  data-testid="option-supplier-yes"
                >
                  <div className="flex items-center gap-3">
                    <ClipboardList className={`w-5 h-5 ${enableSupplier ? "text-primary" : "text-muted-foreground"}`} />
                    <div>
                      <p className="font-medium">Yes, set up supplier assessment</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        We'll create a default ESG questionnaire and scoring template
                      </p>
                    </div>
                    {enableSupplier && <CheckCircle2 className="w-5 h-5 text-primary ml-auto" />}
                  </div>
                </button>

                <button
                  className={`w-full p-4 rounded-lg border text-left transition-colors ${
                    !enableSupplier ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"
                  }`}
                  onClick={() => setEnableSupplier(false)}
                  data-testid="option-supplier-no"
                >
                  <p className="font-medium">No, skip for now</p>
                  <p className="text-xs text-muted-foreground mt-0.5">You can enable this later in Settings</p>
                </button>
              </div>
            </div>
          )}

          {step === 8 && (
            <div className="space-y-5" data-testid="step-completion">
              <div className="text-center space-y-3">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-8 h-8 text-primary" />
                </div>
                <h2 className="text-xl font-semibold">You're all set!</h2>
                <p className="text-sm text-muted-foreground">Here's a summary of what we'll configure for you</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Card>
                  <CardContent className="p-4">
                    <p className="text-sm text-muted-foreground">Metrics Enabled</p>
                    <p className="text-2xl font-bold text-primary" data-testid="text-metrics-count">{selectedMetrics.size}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-sm text-muted-foreground">Carbon Calculator</p>
                    <p className="text-2xl font-bold" data-testid="text-carbon-status">
                      {enabledModules.carbon && autoScope ? "Active" : "Inactive"}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-sm text-muted-foreground">Policy Generator</p>
                    <p className="text-2xl font-bold" data-testid="text-policy-status">
                      {enabledModules.policies ? "Ready" : "Disabled"}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-sm text-muted-foreground">Supplier Assessment</p>
                    <p className="text-2xl font-bold" data-testid="text-supplier-status">
                      {enableSupplier ? "Enabled" : "Disabled"}
                    </p>
                  </CardContent>
                </Card>
              </div>

              <Card className="border-primary/30 bg-primary/5">
                <CardContent className="p-4 space-y-2">
                  <p className="text-sm font-medium">Active Modules</p>
                  <div className="flex flex-wrap gap-2">
                    {DEFAULT_MODULES.filter(m => enabledModules[m.key]).map(m => (
                      <Badge key={m.key} variant="secondary" className="text-xs">{m.label}</Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <p className="text-sm font-medium mb-2">Company Details</p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div><span className="text-muted-foreground">Name:</span> {companyName}</div>
                    <div><span className="text-muted-foreground">Industry:</span> {industry}</div>
                    <div><span className="text-muted-foreground">Country:</span> {country}</div>
                    <div><span className="text-muted-foreground">Employees:</span> {employeeCount}</div>
                    <div><span className="text-muted-foreground">Sites:</span> {sitesCount}</div>
                    <div><span className="text-muted-foreground">Profile:</span> {operationalProfile}</div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          <div className="flex items-center justify-between pt-4 border-t border-border">
            {step > 1 ? (
              <Button variant="outline" onClick={saveAndPrev} data-testid="button-prev-step">
                <ArrowLeft className="w-4 h-4 mr-1.5" />
                Previous
              </Button>
            ) : <div />}

            {step < TOTAL_STEPS ? (
              <Button onClick={saveAndNext} data-testid="button-next-step">
                Next
                <ArrowRight className="w-4 h-4 ml-1.5" />
              </Button>
            ) : (
              <Button onClick={handleComplete} disabled={completeMutation.isPending} data-testid="button-complete-setup">
                {completeMutation.isPending ? "Setting up..." : "Go to Dashboard"}
                <ArrowRight className="w-4 h-4 ml-1.5" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
