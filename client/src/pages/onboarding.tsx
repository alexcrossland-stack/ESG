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
  Target, Upload, FileCheck,
} from "lucide-react";

const V2_STEPS = [
  { key: "profile", label: "Company Profile", icon: Building2, desc: "Tell us about your business" },
  { key: "focus", label: "ESG Focus Areas", icon: Target, desc: "Choose your priority topics" },
  { key: "reporting", label: "Reporting Setup", icon: BarChart3, desc: "Configure metrics and frequency" },
  { key: "data_entry", label: "First Data Entry", icon: Zap, desc: "Enter your first data point" },
  { key: "evidence", label: "Evidence Linking", icon: Upload, desc: "Link supporting evidence" },
  { key: "output", label: "First Output", icon: FileCheck, desc: "Generate your first report or policy" },
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

const ESG_TOPICS = [
  { key: "climate_change", label: "Climate Change & Carbon", category: "environmental" as const, icon: Leaf },
  { key: "energy_efficiency", label: "Energy Efficiency", category: "environmental" as const, icon: Zap },
  { key: "waste_management", label: "Waste & Recycling", category: "environmental" as const, icon: Globe },
  { key: "water_conservation", label: "Water Conservation", category: "environmental" as const, icon: Globe },
  { key: "employee_wellbeing", label: "Employee Wellbeing", category: "social" as const, icon: Users },
  { key: "diversity_inclusion", label: "Diversity & Inclusion", category: "social" as const, icon: Users },
  { key: "health_safety", label: "Health & Safety", category: "social" as const, icon: Shield },
  { key: "training_development", label: "Training & Development", category: "social" as const, icon: BarChart3 },
  { key: "board_governance", label: "Board Governance", category: "governance" as const, icon: Shield },
  { key: "anti_corruption", label: "Anti-Corruption", category: "governance" as const, icon: Shield },
  { key: "data_privacy", label: "Data Privacy", category: "governance" as const, icon: FileText },
  { key: "supply_chain", label: "Supply Chain ESG", category: "governance" as const, icon: ClipboardList },
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
];

const SOCIAL_METRICS: MetricRec[] = [
  { key: "headcount", name: "Employee Headcount", desc: "Total number of employees", default: true },
  { key: "gender_diversity", name: "Gender Diversity", desc: "Percentage of female employees", default: true },
  { key: "turnover", name: "Employee Turnover", desc: "Staff leaving rate (auto-calculated)", default: true },
  { key: "training", name: "Training Hours per Employee", desc: "Learning and development hours", default: true },
  { key: "health_safety", name: "Lost Time Incidents", desc: "Workplace health and safety incidents", default: true },
  { key: "absence", name: "Absence Rate", desc: "Staff absence percentage", default: false },
];

const GOV_METRICS: MetricRec[] = [
  { key: "board_meetings", name: "Board Meetings Held", desc: "Number of board meetings per year", default: true },
  { key: "esg_policy", name: "ESG Policy Adoption", desc: "Whether a formal ESG policy is in place", default: true },
  { key: "supplier_screening", name: "Supplier ESG Screening", desc: "Percentage of suppliers assessed", default: true },
  { key: "anti_bribery", name: "Anti-Bribery Policy", desc: "Whether an anti-bribery policy is in place", default: false },
];

function getRecommendedMetrics(topics: string[]): string[] {
  const base = new Set<string>();
  const hasEnv = topics.some(t => ESG_TOPICS.find(e => e.key === t)?.category === "environmental");
  const hasSocial = topics.some(t => ESG_TOPICS.find(e => e.key === t)?.category === "social");
  const hasGov = topics.some(t => ESG_TOPICS.find(e => e.key === t)?.category === "governance");

  if (hasEnv) ENV_METRICS.filter(m => m.default).forEach(m => base.add(m.key));
  if (hasSocial) SOCIAL_METRICS.filter(m => m.default).forEach(m => base.add(m.key));
  if (hasGov) GOV_METRICS.filter(m => m.default).forEach(m => base.add(m.key));

  if (topics.includes("climate_change")) { base.add("scope1"); base.add("scope2"); base.add("gas_fuel"); }
  if (topics.includes("waste_management")) { base.add("waste"); base.add("recycling"); }
  if (topics.includes("water_conservation")) base.add("water");
  if (topics.includes("health_safety")) base.add("health_safety");
  if (topics.includes("anti_corruption")) base.add("anti_bribery");

  return Array.from(base);
}

function StepIndicator({ steps, currentStep, completedSteps }: {
  steps: typeof V2_STEPS; currentStep: number; completedSteps: Set<string>;
}) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-2">
      {steps.map((s, i) => {
        const isCompleted = completedSteps.has(s.key);
        const isCurrent = i + 1 === currentStep;
        return (
          <div key={s.key} className="flex items-center gap-1 shrink-0">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                isCompleted
                  ? "bg-primary text-primary-foreground"
                  : isCurrent
                  ? "bg-primary/20 text-primary border-2 border-primary"
                  : "bg-muted text-muted-foreground"
              }`}
              data-testid={`step-indicator-${s.key}`}
            >
              {isCompleted ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
            </div>
            {i < steps.length - 1 && (
              <div className={`w-6 h-0.5 ${isCompleted ? "bg-primary" : "bg-muted"}`} />
            )}
          </div>
        );
      })}
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
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());

  const [companyName, setCompanyName] = useState("");
  const [industry, setIndustry] = useState("");
  const [employeeCount, setEmployeeCount] = useState("");
  const [country, setCountry] = useState("United Kingdom");
  const [operationalProfile, setOperationalProfile] = useState("");
  const [esgMaturity, setEsgMaturity] = useState("");

  const [selectedTopics, setSelectedTopics] = useState<Set<string>>(new Set());
  const [selectedMetrics, setSelectedMetrics] = useState<Set<string>>(new Set());
  const [reportingFrequency, setReportingFrequency] = useState("monthly");

  const [quickDataMetric, setQuickDataMetric] = useState("");
  const [quickDataValue, setQuickDataValue] = useState("");
  const [quickDataPeriod, setQuickDataPeriod] = useState("");

  const [quickEvidenceDesc, setQuickEvidenceDesc] = useState("");
  const [quickEvidenceModule, setQuickEvidenceModule] = useState("metrics");

  const [selectedOutput, setSelectedOutput] = useState<"report" | "policy">("report");

  useEffect(() => {
    if (company) {
      if (company.onboardingComplete) {
        setLocation("/");
        return;
      }
      if (company.onboardingPath === "guided" && company.onboardingStep > 0) {
        setShowWizard(true);
        if (company.onboardingVersion === 2) {
          setStep(company.onboardingStep);
        } else {
          setStep(1);
        }
      }
      if (company.name && company.name !== "My Company") setCompanyName(company.name);
      if (company.industry) setIndustry(company.industry);
      if (company.employeeCount) setEmployeeCount(String(company.employeeCount));
      if (company.country) setCountry(company.country);
      if (company.operationalProfile) setOperationalProfile(company.operationalProfile);
      if (company.esgMaturity) setEsgMaturity(company.esgMaturity);
      if (company.selectedMetrics) setSelectedMetrics(new Set(company.selectedMetrics as string[]));

      const answers = company.onboardingAnswers as any;
      if (answers?.selectedTopics && Array.isArray(answers.selectedTopics)) {
        setSelectedTopics(new Set(answers.selectedTopics));
      }
      if (answers?.reportingFrequency) {
        setReportingFrequency(answers.reportingFrequency);
      }

      const now = new Date();
      setQuickDataPeriod(`${now.toLocaleString("en", { month: "short" })} ${now.getFullYear()}`);
    }
  }, [company]);

  useEffect(() => {
    if (selectedTopics.size > 0 && selectedMetrics.size === 0) {
      const recommended = getRecommendedMetrics(Array.from(selectedTopics));
      setSelectedMetrics(new Set(recommended));
    }
  }, [selectedTopics]);

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
      onboardingVersion: 2,
      companyProfile: {
        name: companyName, industry,
        employeeCount: Number(employeeCount) || 0,
        locations: 1, country, operationalProfile,
        reportingYearStart: "January",
      },
      esgMaturity,
      selectedTopics: Array.from(selectedTopics),
      selectedMetrics: Array.from(selectedMetrics),
      reportingFrequency,
      onboardingAnswers: {
        quickDataMetric, quickDataValue, quickDataPeriod,
        quickEvidenceDesc, quickEvidenceModule,
        selectedOutput,
      },
    };
  }

  function isStepValid(): boolean {
    switch (step) {
      case 1: return !!(companyName && industry && country && employeeCount);
      case 2: return selectedTopics.size >= 1;
      case 3: return selectedMetrics.size >= 1;
      case 4: return true;
      case 5: return true;
      case 6: return true;
      default: return true;
    }
  }

  function saveAndNext() {
    const stepKey = V2_STEPS[step - 1]?.key;
    if (stepKey) {
      setCompletedSteps(prev => new Set([...prev, stepKey]));
    }
    const data = getStepData();
    saveMutation.mutate({ ...data, step: step + 1 });
    setStep(s => Math.min(s + 1, V2_STEPS.length));
  }

  function saveAndPrev() {
    const data = getStepData();
    saveMutation.mutate({ ...data, step: step - 1 });
    setStep(s => Math.max(s - 1, 1));
  }

  function handleComplete() {
    completeMutation.mutate(getStepData());
  }

  function handleSkipToFinish() {
    completeMutation.mutate({
      ...getStepData(),
      step: V2_STEPS.length,
    });
  }

  function startGuided() {
    setShowWizard(true);
    setStep(1);
    saveMutation.mutate({ step: 1, path: "guided", onboardingVersion: 2 });
  }

  function startQuickStart() {
    apiRequest("POST", "/api/onboarding/complete", { path: "quick_start", onboardingVersion: 2 }).then(() => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({ title: "Welcome!", description: "Your workspace is ready. Check the dashboard to get started." });
      setLocation("/");
    });
  }

  function toggleTopic(key: string) {
    setSelectedTopics(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
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
              Set up ESG metrics, carbon tracking, policies, and reporting in minutes.
              We'll guide you through 6 action-based steps.
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
                    6 action-based steps. Complete each to unlock your workspace. Takes about 5 minutes.
                  </p>
                </div>
                <Badge variant="secondary" className="text-xs">Recommended</Badge>
              </CardContent>
            </Card>

            <Card
              className="cursor-pointer border-2 hover:border-muted-foreground/30 transition-colors text-left"
              onClick={startQuickStart}
              data-testid="button-quick-start"
            >
              <CardContent className="p-5 space-y-3">
                <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                  <LayoutGrid className="w-5 h-5 text-muted-foreground" />
                </div>
                <div>
                  <h3 className="font-semibold">Quick Start</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    Jump straight in with defaults. The dashboard will guide you from there.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  const currentStepDef = V2_STEPS[step - 1];

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
          <StepIndicator steps={V2_STEPS} currentStep={step} completedSteps={completedSteps} />

          <div className="space-y-1">
            <div className="flex items-center gap-2">
              {currentStepDef && <currentStepDef.icon className="w-5 h-5 text-primary" />}
              <h2 className="text-xl font-semibold">{currentStepDef?.label}</h2>
            </div>
            <p className="text-sm text-muted-foreground">{currentStepDef?.desc}</p>
          </div>

          {step === 1 && (
            <div className="space-y-4" data-testid="step-company-profile">
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
                  <Label>ESG Maturity</Label>
                  <Select value={esgMaturity} onValueChange={setEsgMaturity}>
                    <SelectTrigger data-testid="select-maturity"><SelectValue placeholder="Select level" /></SelectTrigger>
                    <SelectContent>
                      {MATURITY_LEVELS.map(l => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Operational Profile</Label>
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
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4" data-testid="step-esg-focus">
              <p className="text-sm text-muted-foreground">
                Select at least one ESG topic to focus on. This determines which metrics and reports we set up for you.
              </p>
              <Badge variant="secondary" className="text-xs">{selectedTopics.size} topics selected</Badge>

              {(["environmental", "social", "governance"] as const).map(cat => (
                <div key={cat} className="space-y-2">
                  <h3 className="text-sm font-medium capitalize flex items-center gap-2">
                    {cat === "environmental" ? <Leaf className="w-4 h-4 text-primary" /> :
                     cat === "social" ? <Users className="w-4 h-4 text-blue-500" /> :
                     <Shield className="w-4 h-4 text-purple-500" />}
                    {cat}
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {ESG_TOPICS.filter(t => t.category === cat).map(topic => (
                      <button
                        key={topic.key}
                        className={`flex items-center gap-3 p-3 rounded-md border text-left transition-colors ${
                          selectedTopics.has(topic.key) ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"
                        }`}
                        onClick={() => toggleTopic(topic.key)}
                        data-testid={`topic-option-${topic.key}`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedTopics.has(topic.key)}
                          readOnly
                          className="accent-primary"
                        />
                        <span className="text-sm">{topic.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4" data-testid="step-reporting-setup">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  We've recommended metrics based on your focus areas. Adjust as needed.
                </p>
                <Badge variant="secondary" className="text-xs">{selectedMetrics.size} metrics</Badge>
              </div>

              <div className="space-y-1.5">
                <Label>Reporting Frequency</Label>
                <Select value={reportingFrequency} onValueChange={setReportingFrequency}>
                  <SelectTrigger data-testid="select-frequency" className="w-48"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                    <SelectItem value="annual">Annual</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <MetricCheckboxGroup title="Environmental" icon={Leaf} color="text-primary" metrics={ENV_METRICS} selected={selectedMetrics} onToggle={toggleMetric} />
              <MetricCheckboxGroup title="Social" icon={Users} color="text-blue-500" metrics={SOCIAL_METRICS} selected={selectedMetrics} onToggle={toggleMetric} />
              <MetricCheckboxGroup title="Governance" icon={Shield} color="text-purple-500" metrics={GOV_METRICS} selected={selectedMetrics} onToggle={toggleMetric} />
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4" data-testid="step-data-entry">
              <Card className="border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20">
                <CardContent className="p-4">
                  <p className="text-sm font-medium text-blue-700 dark:text-blue-300">Try entering your first data point</p>
                  <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                    You can enter real data or an estimate. This helps you see how the platform works.
                  </p>
                </CardContent>
              </Card>

              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Metric</Label>
                  <Select value={quickDataMetric} onValueChange={setQuickDataMetric}>
                    <SelectTrigger data-testid="select-quick-metric"><SelectValue placeholder="Choose a metric" /></SelectTrigger>
                    <SelectContent>
                      {[...ENV_METRICS, ...SOCIAL_METRICS, ...GOV_METRICS]
                        .filter(m => selectedMetrics.has(m.key))
                        .map(m => <SelectItem key={m.key} value={m.key}>{m.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Value</Label>
                    <Input type="number" value={quickDataValue} onChange={e => setQuickDataValue(e.target.value)} placeholder="e.g. 1500" data-testid="input-quick-value" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Period</Label>
                    <Input value={quickDataPeriod} onChange={e => setQuickDataPeriod(e.target.value)} placeholder="e.g. Jan 2025" data-testid="input-quick-period" />
                  </div>
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                You can skip this step and enter data later from the Data Entry page.
              </p>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-4" data-testid="step-evidence">
              <Card className="border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20">
                <CardContent className="p-4">
                  <p className="text-sm font-medium text-blue-700 dark:text-blue-300">Link supporting evidence</p>
                  <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                    Evidence files (invoices, certificates, reports) strengthen your ESG data. You can describe one now or skip.
                  </p>
                </CardContent>
              </Card>

              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Evidence Description</Label>
                  <Input value={quickEvidenceDesc} onChange={e => setQuickEvidenceDesc(e.target.value)} placeholder="e.g. January electricity invoice" data-testid="input-evidence-desc" />
                </div>
                <div className="space-y-1.5">
                  <Label>Linked Module</Label>
                  <Select value={quickEvidenceModule} onValueChange={setQuickEvidenceModule}>
                    <SelectTrigger data-testid="select-evidence-module" className="w-48"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="metrics">Metrics</SelectItem>
                      <SelectItem value="policies">Policies</SelectItem>
                      <SelectItem value="questionnaires">Questionnaires</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                Full file uploads are available on the Evidence page after setup.
              </p>
            </div>
          )}

          {step === 6 && (
            <div className="space-y-5" data-testid="step-output">
              <p className="text-sm text-muted-foreground">
                Choose your first output to see the platform in action. You can always generate more later.
              </p>

              <div className="space-y-3">
                <button
                  className={`w-full p-4 rounded-lg border text-left transition-colors ${
                    selectedOutput === "report" ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"
                  }`}
                  onClick={() => setSelectedOutput("report")}
                  data-testid="option-output-report"
                >
                  <div className="flex items-center gap-3">
                    <FileText className={`w-5 h-5 ${selectedOutput === "report" ? "text-primary" : "text-muted-foreground"}`} />
                    <div>
                      <p className="font-medium">Generate a Board Pack Report</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        A summary report with your metrics, status, and action items
                      </p>
                    </div>
                    {selectedOutput === "report" && <CheckCircle2 className="w-5 h-5 text-primary ml-auto" />}
                  </div>
                </button>

                <button
                  className={`w-full p-4 rounded-lg border text-left transition-colors ${
                    selectedOutput === "policy" ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"
                  }`}
                  onClick={() => setSelectedOutput("policy")}
                  data-testid="option-output-policy"
                >
                  <div className="flex items-center gap-3">
                    <ClipboardList className={`w-5 h-5 ${selectedOutput === "policy" ? "text-primary" : "text-muted-foreground"}`} />
                    <div>
                      <p className="font-medium">Generate ESG Policy Drafts</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Create editable policy documents for your key ESG areas
                      </p>
                    </div>
                    {selectedOutput === "policy" && <CheckCircle2 className="w-5 h-5 text-primary ml-auto" />}
                  </div>
                </button>
              </div>

              <Card className="bg-muted/30 border-dashed">
                <CardContent className="p-4 text-center">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
                    <CheckCircle2 className="w-6 h-6 text-primary" />
                  </div>
                  <p className="text-sm font-medium">Setup Summary</p>
                  <div className="grid grid-cols-2 gap-3 mt-3 text-xs text-muted-foreground">
                    <div>
                      <p className="font-medium text-foreground text-lg" data-testid="text-topics-count">{selectedTopics.size}</p>
                      <p>Focus Topics</p>
                    </div>
                    <div>
                      <p className="font-medium text-foreground text-lg" data-testid="text-metrics-count">{selectedMetrics.size}</p>
                      <p>Active Metrics</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          <div className="flex items-center justify-between pt-4 border-t border-border">
            <div>
              {step > 1 && (
                <Button variant="ghost" size="sm" onClick={saveAndPrev} data-testid="button-prev">
                  <ArrowLeft className="w-4 h-4 mr-1" /> Back
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              {step >= 4 && step < V2_STEPS.length && (
                <Button variant="ghost" size="sm" onClick={saveAndNext} data-testid="button-skip">
                  Skip
                </Button>
              )}
              {step < V2_STEPS.length ? (
                <Button onClick={saveAndNext} disabled={!isStepValid()} data-testid="button-next">
                  Continue <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              ) : (
                <Button
                  onClick={handleComplete}
                  disabled={completeMutation.isPending}
                  data-testid="button-complete"
                >
                  {completeMutation.isPending ? "Setting up..." : "Complete Setup"}
                  <CheckCircle2 className="w-4 h-4 ml-1" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
