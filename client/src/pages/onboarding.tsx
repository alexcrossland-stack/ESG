import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { trackEvent, AnalyticsEvents } from "@/lib/analytics";
import { EsgTooltip } from "@/components/esg-tooltip";
import { format, subMonths } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import {
  Leaf, Users, Shield, ArrowRight, ArrowLeft, CheckCircle2,
  Building2, Sparkles, LayoutGrid, BarChart3, Zap, FileText,
  Truck, Factory, Store, Briefcase, ClipboardList, Globe,
  Target, Upload, FileCheck, HelpCircle, Star,
} from "lucide-react";

const V2_STEPS = [
  { key: "profile", label: "Company Profile", icon: Building2, desc: "Tell us about your business" },
  { key: "maturity", label: "ESG Maturity", icon: Star, desc: "Assess your current ESG level" },
  { key: "focus", label: "ESG Priorities", icon: Target, desc: "Choose your focus areas" },
  { key: "reporting", label: "Reporting Setup", icon: BarChart3, desc: "Configure metrics and frequency" },
  { key: "data_entry", label: "First Data Entry", icon: Zap, desc: "Enter your first data point" },
  { key: "evidence", label: "Evidence Linking", icon: Upload, desc: "Link supporting evidence" },
  { key: "action_plan", label: "Your ESG Action Plan", icon: FileCheck, desc: "See your personalised plan" },
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

const MATURITY_QUESTIONS = [
  { key: "q1", text: "Does your business have a written ESG, sustainability or environmental policy?" },
  { key: "q2", text: "Do you track carbon emissions, energy consumption, or waste data?" },
  { key: "q3", text: "Do you formally measure social metrics (e.g. employee diversity, training hours, health & safety incidents)?" },
  { key: "q4", text: "Do you have governance documents covering ethics, anti-corruption, or data privacy?" },
  { key: "q5", text: "Have you reported on ESG topics to customers, investors, banks, or regulators in the past 2 years?" },
];

function computeMaturity(answers: Record<string, boolean | null>): string {
  const yesCount = Object.values(answers).filter(v => v === true).length;
  if (yesCount <= 1) return "just_starting";
  if (yesCount <= 3) return "some_policies";
  return "formal_programme";
}

const MATURITY_META: Record<string, { label: string; desc: string; color: string }> = {
  just_starting: { label: "Starter", desc: "Just beginning your ESG journey — the platform will guide you step by step.", color: "text-amber-600 dark:text-amber-400" },
  some_policies: { label: "Developing", desc: "You have some ESG practices in place — now let's formalise and track them.", color: "text-blue-600 dark:text-blue-400" },
  formal_programme: { label: "Established", desc: "You have a strong ESG foundation — the platform will help you optimise and report.", color: "text-emerald-600 dark:text-emerald-400" },
};

const ESG_TOPICS = [
  { key: "climate_change", label: "Climate Change & Carbon", category: "environmental" as const, icon: Leaf, benefit: "Reduce energy costs and meet customer carbon requirements" },
  { key: "energy_efficiency", label: "Energy Efficiency", category: "environmental" as const, icon: Zap, benefit: "Lower utility bills and demonstrate resource responsibility" },
  { key: "waste_management", label: "Waste & Recycling", category: "environmental" as const, icon: Globe, benefit: "Cut disposal costs and show circular economy commitment" },
  { key: "water_conservation", label: "Water Conservation", category: "environmental" as const, icon: Globe, benefit: "Manage water risk and reduce operational costs" },
  { key: "employee_wellbeing", label: "Employee Wellbeing", category: "social" as const, icon: Users, benefit: "Attract and retain talent, reduce absence and turnover" },
  { key: "diversity_inclusion", label: "Diversity & Inclusion", category: "social" as const, icon: Users, benefit: "Access wider talent pools and meet procurement requirements" },
  { key: "health_safety", label: "Health & Safety", category: "social" as const, icon: Shield, benefit: "Meet legal obligations and protect your workforce" },
  { key: "training_development", label: "Training & Development", category: "social" as const, icon: BarChart3, benefit: "Build capability, reduce skill gaps, and improve retention" },
  { key: "board_governance", label: "Business Oversight & Ethics", category: "governance" as const, icon: Shield, benefit: "Build stakeholder confidence and demonstrate responsible leadership" },
  { key: "anti_corruption", label: "Anti-Corruption & Bribery", category: "governance" as const, icon: Shield, benefit: "Meet legal requirements and protect business reputation" },
  { key: "data_privacy", label: "Data Privacy (GDPR)", category: "governance" as const, icon: FileText, benefit: "Comply with GDPR and build customer trust" },
  { key: "supply_chain", label: "Supplier Standards", category: "governance" as const, icon: ClipboardList, benefit: "Meet growing customer supplier-assessment requirements" },
];

type MetricRec = { key: string; name: string; desc: string; default: boolean };

const ENV_METRICS: MetricRec[] = [
  { key: "electricity", name: "Electricity Consumption", desc: "Track electricity usage in kWh", default: true },
  { key: "gas_fuel", name: "Gas / Fuel Consumption", desc: "Natural gas and fuel oil use", default: true },
  { key: "scope1", name: "Direct Carbon Emissions (Scope 1)", desc: "CO₂ from gas, fuel & vehicles you own — auto-calculated from your usage data", default: true },
  { key: "scope2", name: "Electricity Carbon Emissions (Scope 2)", desc: "CO₂ from grid electricity you buy — auto-calculated from your kWh usage", default: true },
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

const INDUSTRY_TOPICS: Record<string, string[]> = {
  "Manufacturing": ["climate_change", "energy_efficiency", "waste_management", "health_safety"],
  "Logistics & Transport": ["climate_change", "energy_efficiency", "health_safety", "supply_chain"],
  "Technology": ["energy_efficiency", "data_privacy", "board_governance", "employee_wellbeing"],
  "Retail": ["climate_change", "waste_management", "supply_chain", "diversity_inclusion"],
  "Professional Services": ["employee_wellbeing", "diversity_inclusion", "board_governance", "data_privacy"],
  "Healthcare": ["health_safety", "employee_wellbeing", "waste_management", "data_privacy"],
  "Financial Services": ["board_governance", "anti_corruption", "data_privacy", "employee_wellbeing"],
  "Construction": ["climate_change", "health_safety", "waste_management", "supply_chain"],
  "Education": ["employee_wellbeing", "training_development", "health_safety", "energy_efficiency"],
  "Hospitality": ["energy_efficiency", "waste_management", "employee_wellbeing", "water_conservation"],
  "Agriculture": ["climate_change", "water_conservation", "waste_management", "supply_chain"],
  "Other": ["energy_efficiency", "employee_wellbeing", "board_governance"],
};

const METRIC_UNITS: Record<string, string> = {
  electricity: "kWh", gas_fuel: "kWh", scope1: "tCO₂e", scope2: "tCO₂e",
  waste: "tonnes", recycling: "%", water: "m³", vehicle_fuel: "litres",
  headcount: "people", gender_diversity: "%", turnover: "%", training_hours: "hours",
  health_safety: "incidents", living_wage: "%", board_meetings: "number",
  esg_policy: "yes/no", supplier_screening: "%", anti_bribery: "yes/no",
};

function generateOnboardingPeriods() {
  const periods = [];
  const now = new Date();
  let d = new Date(now.getFullYear(), now.getMonth(), 1);
  const start = new Date(2023, 0, 1);
  while (d >= start) {
    periods.push({ value: format(d, "yyyy-MM"), label: format(d, "MMM yyyy") });
    d = subMonths(d, 1);
  }
  return periods;
}

const ONBOARDING_PERIODS = generateOnboardingPeriods();

const POLICY_MAP: Record<string, { name: string; url: string }> = {
  climate_change: { name: "Climate Change & Carbon Policy", url: "/policy-generator" },
  energy_efficiency: { name: "Energy Management Policy", url: "/policy-generator" },
  waste_management: { name: "Waste & Recycling Policy", url: "/policy-generator" },
  water_conservation: { name: "Water Management Policy", url: "/policy-generator" },
  employee_wellbeing: { name: "Employee Wellbeing Policy", url: "/policy-generator" },
  diversity_inclusion: { name: "Diversity & Inclusion Policy", url: "/policy-generator" },
  health_safety: { name: "Health & Safety Policy", url: "/policy-generator" },
  training_development: { name: "Learning & Development Policy", url: "/policy-generator" },
  board_governance: { name: "Corporate Governance Policy", url: "/policy-generator" },
  anti_corruption: { name: "Anti-Bribery & Corruption Policy", url: "/policy-generator" },
  data_privacy: { name: "Data Privacy Policy", url: "/policy-generator" },
  supply_chain: { name: "Supplier Code of Conduct", url: "/policy-generator" },
};

const EVIDENCE_BY_MATURITY: Record<string, { name: string; desc: string }[]> = {
  just_starting: [
    { name: "Energy Invoices", desc: "Electricity and gas bills for the past 12 months" },
    { name: "Payroll / HR Records", desc: "Employee headcount and diversity data" },
    { name: "Company Registration Document", desc: "Formal business registration certificate" },
  ],
  some_policies: [
    { name: "Emissions Calculation Report", desc: "Carbon footprint calculation methodology and results" },
    { name: "Training Records", desc: "Employee learning and development completion logs" },
    { name: "Board Meeting Minutes", desc: "Evidence of board-level ESG oversight and discussion" },
  ],
  formal_programme: [
    { name: "Third-Party ESG Assessment", desc: "Independent audit or sustainability assessment report" },
    { name: "ISO or Industry Certification", desc: "Quality, environmental, or safety management certificates" },
    { name: "Supply Chain Due Diligence Report", desc: "Supplier ESG questionnaire results and risk ratings" },
  ],
};

function generateActionPlan(maturity: string, topics: string[], metrics: string[], frequency: string) {
  const PRIORITY_BY_MATURITY: Record<string, string[]> = {
    just_starting: ["health_safety", "employee_wellbeing", "climate_change", "board_governance", "data_privacy"],
    some_policies: ["climate_change", "diversity_inclusion", "anti_corruption", "health_safety", "board_governance"],
    formal_programme: ["supply_chain", "water_conservation", "training_development", "data_privacy", "energy_efficiency"],
  };

  const prioritised = (PRIORITY_BY_MATURITY[maturity] || []).filter(t => topics.includes(t));
  const remaining = topics.filter(t => !prioritised.includes(t));
  const orderedTopics = [...prioritised, ...remaining];

  const recommendedPolicies = orderedTopics
    .filter(t => POLICY_MAP[t])
    .slice(0, 3)
    .map(t => ({ topic: t, name: POLICY_MAP[t].name, url: POLICY_MAP[t].url }));

  const ALL_METRICS = [...ENV_METRICS, ...SOCIAL_METRICS, ...GOV_METRICS];
  const topicToMetrics: Record<string, string[]> = {
    climate_change: ["scope1", "scope2", "gas_fuel", "electricity"],
    energy_efficiency: ["electricity", "gas_fuel"],
    waste_management: ["waste", "recycling"],
    water_conservation: ["water"],
    employee_wellbeing: ["headcount", "turnover", "training"],
    diversity_inclusion: ["gender_diversity", "headcount"],
    health_safety: ["health_safety"],
    training_development: ["training"],
    board_governance: ["board_meetings", "esg_policy"],
    anti_corruption: ["anti_bribery"],
    data_privacy: ["esg_policy"],
    supply_chain: ["supplier_screening"],
  };
  const metricKeys = new Set<string>();
  for (const topic of orderedTopics) {
    for (const m of (topicToMetrics[topic] || [])) metricKeys.add(m);
  }
  for (const m of metrics) metricKeys.add(m);
  const recommendedMetrics = Array.from(metricKeys)
    .slice(0, 5)
    .map(k => ALL_METRICS.find(m => m.key === k))
    .filter(Boolean)
    .map(m => ({ key: m!.key, name: m!.name, desc: m!.desc }));

  const recommendedEvidence = (EVIDENCE_BY_MATURITY[maturity] || EVIDENCE_BY_MATURITY.just_starting);

  return {
    maturityLevel: maturity,
    recommendedPolicies,
    recommendedMetrics,
    recommendedEvidence,
    reportingFrequency: frequency,
    generatedAt: new Date().toISOString(),
  };
}

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
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                isCompleted ? "bg-primary text-primary-foreground"
                  : isCurrent ? "bg-primary/20 text-primary border-2 border-primary"
                  : "bg-muted text-muted-foreground"
              }`}
              data-testid={`step-indicator-${s.key}`}
            >
              {isCompleted ? <CheckCircle2 className="w-3.5 h-3.5" /> : i + 1}
            </div>
            {i < steps.length - 1 && (
              <div className={`w-5 h-0.5 ${isCompleted ? "bg-primary" : "bg-muted"}`} />
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
            <input type="checkbox" checked={selected.has(m.key)} onChange={() => onToggle(m.key)} className="mt-0.5 accent-primary" />
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
  const [showCompletion, setShowCompletion] = useState(false);
  const [step, setStep] = useState(1);
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());

  const [companyName, setCompanyName] = useState("");
  const [industry, setIndustry] = useState("");
  const [employeeCount, setEmployeeCount] = useState("");
  const [country, setCountry] = useState("United Kingdom");
  const [operationalProfile, setOperationalProfile] = useState("");

  const [maturityAnswers, setMaturityAnswers] = useState<Record<string, boolean | null>>({
    q1: null, q2: null, q3: null, q4: null, q5: null,
  });
  const [maturityUnsure, setMaturityUnsure] = useState<Set<string>>(new Set());

  const [selectedTopics, setSelectedTopics] = useState<Set<string>>(new Set());
  const [selectedMetrics, setSelectedMetrics] = useState<Set<string>>(new Set());
  const [reportingFrequency, setReportingFrequency] = useState("monthly");

  const [quickDataMetric, setQuickDataMetric] = useState("");
  const [quickDataValue, setQuickDataValue] = useState("");
  const [quickDataPeriod, setQuickDataPeriod] = useState(ONBOARDING_PERIODS[0]?.value || "");

  const [quickEvidenceDesc, setQuickEvidenceDesc] = useState("");
  const [quickEvidenceModule, setQuickEvidenceModule] = useState("metrics");

  const [actionPlan, setActionPlan] = useState<any>(null);
  const [planLoading, setPlanLoading] = useState(false);

  const computedMaturity = computeMaturity(maturityAnswers);

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
      if (company.selectedMetrics) setSelectedMetrics(new Set(company.selectedMetrics as string[]));

      const answers = company.onboardingAnswers as any;
      if (answers?.selectedTopics && Array.isArray(answers.selectedTopics)) {
        setSelectedTopics(new Set(answers.selectedTopics));
      }
      if (answers?.reportingFrequency) setReportingFrequency(answers.reportingFrequency);
      if (answers?.maturityAnswers) setMaturityAnswers({ q1: null, q2: null, q3: null, q4: null, q5: null, ...answers.maturityAnswers });

      const now = new Date();
      setQuickDataPeriod(`${now.toLocaleString("en", { month: "short" })} ${now.getFullYear()}`);

      if (company.esgActionPlan) setActionPlan(company.esgActionPlan);
    }
  }, [company]);

  useEffect(() => {
    if (selectedTopics.size > 0 && selectedMetrics.size === 0) {
      const recommended = getRecommendedMetrics(Array.from(selectedTopics));
      setSelectedMetrics(new Set(recommended));
    }
  }, [selectedTopics]);

  useEffect(() => {
    if (industry && selectedTopics.size === 0) {
      const defaults = INDUSTRY_TOPICS[industry];
      if (defaults) setSelectedTopics(new Set(defaults));
    }
  }, [industry]);

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
      queryClient.invalidateQueries({ queryKey: ["/api/onboarding/status"] });
      trackEvent(AnalyticsEvents.ONBOARDING_COMPLETED, { path: "guided" });
      setShowCompletion(true);
    },
    onError: (e: any) => {
      toast({
        title: "Setup could not be saved",
        description: "There was a problem saving your setup. Please check your connection and try again.",
        variant: "destructive",
      });
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
      esgMaturity: computedMaturity,
      selectedTopics: Array.from(selectedTopics),
      selectedMetrics: Array.from(selectedMetrics),
      reportingFrequency,
      onboardingAnswers: {
        quickDataMetric, quickDataValue, quickDataPeriod,
        quickEvidenceDesc, quickEvidenceModule,
        maturityAnswers,
      },
    };
  }

  function isStepValid(): boolean {
    switch (step) {
      case 1: return !!(companyName && industry && country && employeeCount);
      case 2: return Object.values(maturityAnswers).every(v => v !== null);
      case 3: return selectedTopics.size >= 1;
      case 4: return selectedMetrics.size >= 1;
      case 5: return true;
      case 6: return true;
      case 7: return true;
      default: return true;
    }
  }

  async function handleActionPlanStep() {
    setPlanLoading(true);
    try {
      const res = await apiRequest("POST", "/api/onboarding/action-plan", {
        esgMaturity: computedMaturity,
        selectedTopics: Array.from(selectedTopics),
        selectedMetrics: Array.from(selectedMetrics),
        reportingFrequency,
      });
      const plan = await res.json();
      setActionPlan(plan);
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    } catch {
      const plan = generateActionPlan(computedMaturity, Array.from(selectedTopics), Array.from(selectedMetrics), reportingFrequency);
      setActionPlan(plan);
    } finally {
      setPlanLoading(false);
    }
  }

  function saveAndNext() {
    const stepKey = V2_STEPS[step - 1]?.key;
    if (stepKey) {
      setCompletedSteps(prev => new Set([...prev, stepKey]));
      trackEvent(AnalyticsEvents.ONBOARDING_STEP_COMPLETED, { step, stepKey });
    }
    const data = getStepData();
    saveMutation.mutate({ ...data, step: step + 1 });
    const nextStep = step + 1;
    setStep(Math.min(nextStep, V2_STEPS.length));
    if (nextStep === 7) {
      handleActionPlanStep();
    }
  }

  function saveAndPrev() {
    const data = getStepData();
    saveMutation.mutate({ ...data, step: step - 1 });
    setStep(s => Math.max(s - 1, 1));
  }

  function handleComplete() {
    completeMutation.mutate(getStepData());
  }

  function startGuided() {
    setShowWizard(true);
    setStep(1);
    saveMutation.mutate({ step: 1, path: "guided", onboardingVersion: 2 });
  }

  function startQuickStart() {
    apiRequest("POST", "/api/onboarding/complete", { path: "quick_start", onboardingVersion: 2 }).then(() => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/onboarding/status"] });
      trackEvent(AnalyticsEvents.ONBOARDING_COMPLETED, { path: "quick_start" });
      setShowCompletion(true);
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

  function setMaturityAnswer(key: string, val: boolean) {
    setMaturityAnswers(prev => ({ ...prev, [key]: val }));
    setMaturityUnsure(prev => { const next = new Set(prev); next.delete(key); return next; });
  }

  if (!company) return null;

  if (showCompletion) {
    const topicsSelected = Array.from(selectedTopics);
    const metricsCount = selectedMetrics.size || 5;
    return (
      <div className="flex items-center justify-center min-h-screen bg-background p-4">
        <div className="max-w-lg w-full space-y-6 text-center">
          <div className="space-y-3">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold" data-testid="text-completion-title">
              Your ESG workspace is ready!
            </h1>
            <p className="text-muted-foreground text-sm sm:text-base max-w-md mx-auto">
              Here's what we've set up for you.
            </p>
          </div>

          <div className="text-left space-y-3">
            {companyName && (
              <div className="flex items-center gap-3 p-3 rounded-lg border bg-card">
                <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                <div>
                  <p className="text-sm font-medium">Company profile created</p>
                  <p className="text-xs text-muted-foreground">{companyName} — {industry || "your industry"}</p>
                </div>
              </div>
            )}
            {topicsSelected.length > 0 && (
              <div className="flex items-center gap-3 p-3 rounded-lg border bg-card">
                <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                <div>
                  <p className="text-sm font-medium">{topicsSelected.length} ESG topics selected</p>
                  <p className="text-xs text-muted-foreground">Including {topicsSelected.slice(0, 2).join(", ").replace(/_/g, " ")}{topicsSelected.length > 2 ? " and more" : ""}</p>
                </div>
              </div>
            )}
            <div className="flex items-center gap-3 p-3 rounded-lg border bg-card">
              <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
              <div>
                <p className="text-sm font-medium">{metricsCount} metrics activated</p>
                <p className="text-xs text-muted-foreground">Reporting {reportingFrequency} — you can change this any time</p>
              </div>
            </div>
            {actionPlan && (
              <div className="flex items-center gap-3 p-3 rounded-lg border bg-card">
                <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                <div>
                  <p className="text-sm font-medium">Personalised action plan saved</p>
                  <p className="text-xs text-muted-foreground">View it any time from your dashboard</p>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-2 pt-2">
            <p className="text-sm font-medium">What to do next</p>
            <p className="text-xs text-muted-foreground">Add your first real data point — it only takes a minute. Your electricity bill is the easiest place to start.</p>
            <div className="flex flex-col sm:flex-row gap-2 justify-center pt-1">
              <Button onClick={() => setLocation("/data-entry")} data-testid="button-go-data-entry">
                Add your first data point <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
              <Button variant="outline" onClick={() => setLocation("/")} data-testid="button-go-dashboard">
                Go to dashboard
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

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
              We'll create a personalised ESG action plan for your business.
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
                    7 guided steps. Get a personalised ESG action plan. Takes about 5 minutes.
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

          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {currentStepDef && <currentStepDef.icon className="w-5 h-5 text-primary" />}
                <h2 className="text-xl font-semibold">{currentStepDef?.label}</h2>
              </div>
              <span className="text-xs text-muted-foreground">Step {step} of {V2_STEPS.length}</span>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">{currentStepDef?.desc}</p>
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
                  <Label>Number of Employees <span className="text-xs text-muted-foreground font-normal">(full-time equivalent)</span></Label>
                  <Input type="number" value={employeeCount} onChange={e => setEmployeeCount(e.target.value)} placeholder="e.g. 50" data-testid="input-employees" />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>How do you mainly operate? <span className="text-xs text-muted-foreground font-normal">(optional)</span></Label>
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

              {step === 1 && !isStepValid() && (companyName || industry || country || employeeCount) && (
                <p className="text-xs text-amber-600 dark:text-amber-400" data-testid="text-step1-validation-hint">
                  Still needed:{" "}
                  {[
                    !companyName && "company name",
                    !industry && "industry",
                    !country && "country",
                    !employeeCount && "number of employees",
                  ].filter(Boolean).join(", ")}
                </p>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5" data-testid="step-maturity-quiz">
              <Card className="bg-muted/30 border-dashed">
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground">
                    Answer these 5 quick questions to help us understand where you are on your <span className="inline-flex items-center gap-1">ESG journey <EsgTooltip term="maturity" /></span>. There are no right or wrong answers — we use this to suggest a starting plan.
                  </p>
                </CardContent>
              </Card>

              <div className="space-y-3">
                {MATURITY_QUESTIONS.map((q, idx) => (
                  <Card key={q.key} className={`transition-all ${maturityAnswers[q.key] !== null ? "border-primary/30" : ""}`} data-testid={`maturity-question-${q.key}`}>
                    <CardContent className="p-4">
                      <p className="text-sm font-medium mb-3">{idx + 1}. {q.text}</p>
                      <div className="flex gap-2">
                        <button
                          className={`flex-1 py-2 px-3 rounded-md border text-sm font-medium transition-colors ${
                            maturityAnswers[q.key] === true ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/50"
                          }`}
                          onClick={() => setMaturityAnswer(q.key, true)}
                          data-testid={`maturity-${q.key}-yes`}
                        >
                          Yes
                        </button>
                        <button
                          className={`flex-1 py-2 px-3 rounded-md border text-sm font-medium transition-colors ${
                            maturityAnswers[q.key] === false ? "bg-muted text-foreground border-border" : "border-border hover:border-primary/50"
                          }`}
                          onClick={() => setMaturityAnswer(q.key, false)}
                          data-testid={`maturity-${q.key}-no`}
                        >
                          No
                        </button>
                        <button
                          className={`flex-1 py-2 px-3 rounded-md border text-sm font-medium transition-colors text-muted-foreground ${
                            maturityUnsure.has(q.key) ? "border-amber-400 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400" : "border-border hover:border-primary/30"
                          }`}
                          onClick={() => {
                            setMaturityAnswer(q.key, false);
                            setMaturityUnsure(prev => { const next = new Set(prev); next.add(q.key); return next; });
                          }}
                          data-testid={`maturity-${q.key}-unsure`}
                        >
                          Not sure
                        </button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {Object.values(maturityAnswers).every(v => v !== null) && (
                <Card className="border-primary/20 bg-primary/5">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <Star className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold">
                          Your ESG Maturity Level:{" "}
                          <span className={MATURITY_META[computedMaturity]?.color}>
                            {MATURITY_META[computedMaturity]?.label}
                          </span>
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {MATURITY_META[computedMaturity]?.desc}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4" data-testid="step-esg-focus">
              <p className="text-sm text-muted-foreground">
                Select the ESG topics most relevant to your business. We'll use these to recommend policies, metrics, and evidence.
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
                        className={`flex items-start gap-3 p-3 rounded-md border text-left transition-colors ${
                          selectedTopics.has(topic.key) ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"
                        }`}
                        onClick={() => toggleTopic(topic.key)}
                        data-testid={`topic-option-${topic.key}`}
                      >
                        <input type="checkbox" checked={selectedTopics.has(topic.key)} readOnly className="accent-primary mt-0.5 shrink-0" />
                        <div className="min-w-0">
                          <span className="text-sm font-medium">{topic.label}</span>
                          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{topic.benefit}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4" data-testid="step-reporting-setup">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  We've recommended metrics based on your focus areas. Adjust as needed.
                </p>
                <Badge variant="secondary" className="text-xs">{selectedMetrics.size} metrics</Badge>
              </div>

              <div className="space-y-1.5">
                <Label>How often will you enter data?</Label>
                <Select value={reportingFrequency} onValueChange={setReportingFrequency}>
                  <SelectTrigger data-testid="select-frequency" className="w-60"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly — best for energy & carbon</SelectItem>
                    <SelectItem value="quarterly">Quarterly — good for most businesses</SelectItem>
                    <SelectItem value="annual">Annual — minimum for compliance</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Monthly is recommended — you can enter figures straight from your utility bills. You can change this any time.</p>
              </div>

              <MetricCheckboxGroup title="Environmental" icon={Leaf} color="text-primary" metrics={ENV_METRICS} selected={selectedMetrics} onToggle={toggleMetric} />
              <MetricCheckboxGroup title="Social" icon={Users} color="text-blue-500" metrics={SOCIAL_METRICS} selected={selectedMetrics} onToggle={toggleMetric} />
              <MetricCheckboxGroup title="Governance" icon={Shield} color="text-purple-500" metrics={GOV_METRICS} selected={selectedMetrics} onToggle={toggleMetric} />
            </div>
          )}

          {step === 5 && (
            <div className="space-y-4" data-testid="step-data-entry">
              <Card className="border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20">
                <CardContent className="p-4">
                  <p className="text-sm font-medium text-blue-700 dark:text-blue-300">Try entering your first data point</p>
                  <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                    Use your most recent utility bill or HR record. You can use an estimate — you can update it later.
                  </p>
                </CardContent>
              </Card>

              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>What are you recording?</Label>
                  <Select value={quickDataMetric} onValueChange={setQuickDataMetric}>
                    <SelectTrigger data-testid="select-quick-metric"><SelectValue placeholder="Choose a type of data" /></SelectTrigger>
                    <SelectContent>
                      {[...ENV_METRICS, ...SOCIAL_METRICS, ...GOV_METRICS]
                        .filter(m => selectedMetrics.has(m.key))
                        .map(m => <SelectItem key={m.key} value={m.key}>{m.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>
                      Value
                      {quickDataMetric && METRIC_UNITS[quickDataMetric] && (
                        <span className="ml-1 text-xs text-muted-foreground font-normal">({METRIC_UNITS[quickDataMetric]})</span>
                      )}
                    </Label>
                    <Input type="number" value={quickDataValue} onChange={e => setQuickDataValue(e.target.value)} placeholder="e.g. 1500" data-testid="input-quick-value" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-1">Which month is this for? <EsgTooltip term="reporting_period" /></Label>
                    <Select value={quickDataPeriod} onValueChange={setQuickDataPeriod}>
                      <SelectTrigger data-testid="select-quick-period"><SelectValue placeholder="Select month" /></SelectTrigger>
                      <SelectContent>
                        {ONBOARDING_PERIODS.slice(0, 24).map(p => (
                          <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                You can skip this step and enter data later from the Data Entry page.
              </p>
            </div>
          )}

          {step === 6 && (
            <div className="space-y-4" data-testid="step-evidence">
              <Card className="border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20">
                <CardContent className="p-4">
                  <p className="text-sm font-medium text-blue-700 dark:text-blue-300">Link supporting evidence</p>
                  <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                    Evidence files (invoices, certificates, reports) strengthen your ESG data and credibility with stakeholders.
                  </p>
                </CardContent>
              </Card>

              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Evidence Description</Label>
                  <Input value={quickEvidenceDesc} onChange={e => setQuickEvidenceDesc(e.target.value)} placeholder="e.g. January electricity invoice" data-testid="input-evidence-desc" />
                </div>
                <div className="space-y-1.5">
                  <Label>What does this evidence support?</Label>
                  <Select value={quickEvidenceModule} onValueChange={setQuickEvidenceModule}>
                    <SelectTrigger data-testid="select-evidence-module" className="w-48"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="metrics">A metric (e.g. electricity bill)</SelectItem>
                      <SelectItem value="policies">A policy document</SelectItem>
                      <SelectItem value="questionnaires">A questionnaire response</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                Full file uploads are available on the Evidence page after setup.
              </p>
            </div>
          )}

          {step === 7 && (
            <div className="space-y-5" data-testid="step-action-plan">
              {planLoading ? (
                <div className="space-y-3">
                  <div className="h-16 bg-muted animate-pulse rounded-lg" />
                  <div className="h-32 bg-muted animate-pulse rounded-lg" />
                  <div className="h-32 bg-muted animate-pulse rounded-lg" />
                </div>
              ) : actionPlan ? (
                <>
                  <Card className="border-primary/20 bg-primary/5">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                          <Sparkles className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold">Your personalised ESG Action Plan is ready</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Based on your {MATURITY_META[computedMaturity]?.label} maturity level and {selectedTopics.size} selected focus areas.
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <div className="space-y-4">
                    <div>
                      <h3 className="text-sm font-semibold flex items-center gap-2 mb-2">
                        <FileText className="w-4 h-4 text-primary" /> Top Recommended Policies
                      </h3>
                      <div className="space-y-2">
                        {(actionPlan.recommendedPolicies || []).map((p: any, i: number) => (
                          <div key={i} className="flex items-center justify-between p-3 rounded-md border bg-card" data-testid={`plan-policy-${i}`}>
                            <div className="flex items-center gap-2">
                              <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                <span className="text-xs text-primary font-bold">{i + 1}</span>
                              </div>
                              <span className="text-sm">{p.name}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <h3 className="text-sm font-semibold flex items-center gap-2 mb-2">
                        <BarChart3 className="w-4 h-4 text-blue-500" /> Top Recommended Metrics
                      </h3>
                      <div className="space-y-2">
                        {(actionPlan.recommendedMetrics || []).map((m: any, i: number) => (
                          <div key={i} className="flex items-start gap-2 p-3 rounded-md border bg-card" data-testid={`plan-metric-${i}`}>
                            <div className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center shrink-0 mt-0.5">
                              <span className="text-xs text-blue-600 dark:text-blue-400 font-bold">{i + 1}</span>
                            </div>
                            <div>
                              <p className="text-sm font-medium">{m.name}</p>
                              <p className="text-xs text-muted-foreground">{m.desc}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <h3 className="text-sm font-semibold flex items-center gap-2 mb-2">
                        <Upload className="w-4 h-4 text-amber-500" /> Evidence to Collect
                      </h3>
                      <div className="space-y-2">
                        {(actionPlan.recommendedEvidence || []).map((e: any, i: number) => (
                          <div key={i} className="flex items-start gap-2 p-3 rounded-md border bg-card" data-testid={`plan-evidence-${i}`}>
                            <div className="w-5 h-5 rounded-full bg-amber-100 dark:bg-amber-900 flex items-center justify-center shrink-0 mt-0.5">
                              <span className="text-xs text-amber-600 dark:text-amber-400 font-bold">{i + 1}</span>
                            </div>
                            <div>
                              <p className="text-sm font-medium">{e.name}</p>
                              <p className="text-xs text-muted-foreground">{e.desc}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center justify-between p-3 rounded-md bg-muted/50">
                      <span className="text-sm text-muted-foreground">Recommended reporting frequency</span>
                      <Badge variant="secondary" className="capitalize">{actionPlan.reportingFrequency}</Badge>
                    </div>
                  </div>

                  <p className="text-xs text-muted-foreground text-center">
                    This plan is saved to your profile and visible from the dashboard at any time.
                  </p>
                </>
              ) : (
                <div className="text-center py-8">
                  <HelpCircle className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Generating your action plan...</p>
                </div>
              )}
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
              {step >= 5 && step < V2_STEPS.length && (
                <Button variant="ghost" size="sm" onClick={saveAndNext} data-testid="button-skip">
                  Skip
                </Button>
              )}
              {step < V2_STEPS.length ? (
                <Button onClick={saveAndNext} disabled={!isStepValid() || saveMutation.isPending} data-testid="button-next">
                  Continue <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              ) : (
                <Button
                  onClick={handleComplete}
                  disabled={completeMutation.isPending || planLoading}
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
