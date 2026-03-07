import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Building2, Leaf, Users, Shield, ChevronRight, ChevronLeft,
  Loader2, RotateCcw, Save, FileText, CheckCircle,
} from "lucide-react";

const STEPS = [
  { label: "Company Profile", icon: Building2 },
  { label: "Environmental", icon: Leaf },
  { label: "Social", icon: Users },
  { label: "Governance", icon: Shield },
];

const SECTORS = [
  "Manufacturing", "Technology", "Professional Services", "Retail",
  "Construction", "Healthcare", "Hospitality", "Education", "Other",
];

const BUSINESS_TYPES = ["Service Business", "Distributor", "Manufacturer"];

const REVIEW_FREQUENCIES = ["Quarterly", "Bi-annual", "Annual", "Every 2 years"];

const POLICY_SECTIONS: { key: string; label: string }[] = [
  { key: "titlePage", label: "Title Page" },
  { key: "purposeAndScope", label: "Purpose & Scope" },
  { key: "commitmentStatement", label: "Commitment Statement" },
  { key: "environmentalCommitments", label: "Environmental Commitments" },
  { key: "socialCommitments", label: "Social Commitments" },
  { key: "governanceCommitments", label: "Governance Commitments" },
  { key: "responsibilities", label: "Responsibilities" },
  { key: "implementationAndMonitoring", label: "Implementation & Monitoring" },
  { key: "reviewCycle", label: "Review Cycle" },
  { key: "approvalSection", label: "Approval" },
];

interface FormData {
  companyName: string;
  sector: string;
  country: string;
  employeeCount: number | "";
  numberOfSites: number | "";
  businessType: string;
  hasVehicles: boolean;
  hasInternationalSuppliers: boolean;
  trackElectricity: boolean;
  trackFuel: boolean;
  trackWater: boolean;
  trackWaste: boolean;
  carbonCommitment: boolean;
  envCertifications: string;
  hasHandbook: boolean;
  trackDiversity: boolean;
  providesTraining: boolean;
  trackHealthSafety: boolean;
  hasWellbeing: boolean;
  paysLivingWage: boolean;
  hasAntiBribery: boolean;
  hasWhistleblowing: boolean;
  hasDataPrivacy: boolean;
  esgResponsible: string;
  reviewFrequency: string;
}

const initialFormData: FormData = {
  companyName: "",
  sector: "",
  country: "",
  employeeCount: "",
  numberOfSites: "",
  businessType: "",
  hasVehicles: false,
  hasInternationalSuppliers: false,
  trackElectricity: false,
  trackFuel: false,
  trackWater: false,
  trackWaste: false,
  carbonCommitment: false,
  envCertifications: "",
  hasHandbook: false,
  trackDiversity: false,
  providesTraining: false,
  trackHealthSafety: false,
  hasWellbeing: false,
  paysLivingWage: false,
  hasAntiBribery: false,
  hasWhistleblowing: false,
  hasDataPrivacy: false,
  esgResponsible: "",
  reviewFrequency: "",
};

export default function PolicyGenerator() {
  const { toast } = useToast();
  const [step, setStep] = useState(0);
  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [generatedContent, setGeneratedContent] = useState<Record<string, string> | null>(null);

  const { data: authData } = useQuery<{ user: any; company: any }>({
    queryKey: ["/api/auth/me"],
  });

  if (authData?.company?.name && !formData.companyName && !generatedContent) {
    setFormData(prev => ({ ...prev, companyName: authData.company.name }));
  }

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/policy-generator/generate", { inputs: formData });
      return res.json();
    },
    onSuccess: (data: { id: string; generatedContent: Record<string, string> }) => {
      setGeneratedContent(data.generatedContent);
      toast({ title: "Policy generated", description: "Your ESG policy has been created successfully." });
    },
    onError: () => {
      toast({ title: "Generation failed", description: "Failed to generate policy. Please try again.", variant: "destructive" });
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/policy-generator/save-to-policy", { content: generatedContent });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/policy"] });
      toast({ title: "Policy saved", description: "Your content has been saved to your ESG Policy." });
    },
    onError: () => {
      toast({ title: "Save failed", description: "Failed to save policy. Please try again.", variant: "destructive" });
    },
  });

  const updateField = (field: keyof FormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleNext = () => {
    if (step < 3) setStep(step + 1);
  };

  const handleBack = () => {
    if (step > 0) setStep(step - 1);
  };

  const handleGenerate = () => {
    generateMutation.mutate();
  };

  const handleStartOver = () => {
    setStep(0);
    setFormData({
      ...initialFormData,
      companyName: authData?.company?.name || "",
    });
    setGeneratedContent(null);
  };

  const renderCheckboxField = (field: keyof FormData, label: string) => (
    <div className="flex items-center gap-3">
      <Checkbox
        id={field}
        checked={formData[field] as boolean}
        onCheckedChange={(checked) => updateField(field, !!checked)}
        data-testid={`checkbox-${field}`}
      />
      <Label htmlFor={field} className="text-sm cursor-pointer">{label}</Label>
    </div>
  );

  const renderStep = () => {
    switch (step) {
      case 0:
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="companyName">Company Name</Label>
              <Input
                id="companyName"
                value={formData.companyName}
                onChange={(e) => updateField("companyName", e.target.value)}
                placeholder="Enter company name"
                data-testid="input-companyName"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sector">Sector</Label>
              <Select value={formData.sector} onValueChange={(v) => updateField("sector", v)}>
                <SelectTrigger data-testid="select-sector">
                  <SelectValue placeholder="Select sector" />
                </SelectTrigger>
                <SelectContent>
                  {SECTORS.map(s => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="country">Country</Label>
              <Input
                id="country"
                value={formData.country}
                onChange={(e) => updateField("country", e.target.value)}
                placeholder="e.g. United Kingdom"
                data-testid="input-country"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="employeeCount">Number of Employees</Label>
                <Input
                  id="employeeCount"
                  type="number"
                  value={formData.employeeCount}
                  onChange={(e) => updateField("employeeCount", e.target.value ? Number(e.target.value) : "")}
                  placeholder="e.g. 50"
                  data-testid="input-employeeCount"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="numberOfSites">Number of Sites</Label>
                <Input
                  id="numberOfSites"
                  type="number"
                  value={formData.numberOfSites}
                  onChange={(e) => updateField("numberOfSites", e.target.value ? Number(e.target.value) : "")}
                  placeholder="e.g. 3"
                  data-testid="input-numberOfSites"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="businessType">Business Type</Label>
              <Select value={formData.businessType} onValueChange={(v) => updateField("businessType", v)}>
                <SelectTrigger data-testid="select-businessType">
                  <SelectValue placeholder="Select business type" />
                </SelectTrigger>
                <SelectContent>
                  {BUSINESS_TYPES.map(t => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-3 pt-2">
              {renderCheckboxField("hasVehicles", "Company operates vehicles")}
              {renderCheckboxField("hasInternationalSuppliers", "Has international suppliers")}
            </div>
          </div>
        );
      case 1:
        return (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Select the environmental areas your company tracks or is committed to.</p>
            <div className="space-y-3">
              {renderCheckboxField("trackElectricity", "Track electricity consumption")}
              {renderCheckboxField("trackFuel", "Track fuel consumption")}
              {renderCheckboxField("trackWater", "Track water usage")}
              {renderCheckboxField("trackWaste", "Track waste and recycling")}
              {renderCheckboxField("carbonCommitment", "Committed to carbon reduction targets")}
            </div>
            <div className="space-y-2 pt-2">
              <Label htmlFor="envCertifications">Environmental Certifications</Label>
              <Input
                id="envCertifications"
                value={formData.envCertifications}
                onChange={(e) => updateField("envCertifications", e.target.value)}
                placeholder="e.g. ISO 14001, Carbon Trust Standard"
                data-testid="input-envCertifications"
              />
            </div>
          </div>
        );
      case 2:
        return (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Tell us about your social practices and commitments.</p>
            <div className="space-y-3">
              {renderCheckboxField("hasHandbook", "Have an employee handbook")}
              {renderCheckboxField("trackDiversity", "Track diversity & inclusion metrics")}
              {renderCheckboxField("providesTraining", "Provide employee training & development")}
              {renderCheckboxField("trackHealthSafety", "Track health & safety incidents")}
              {renderCheckboxField("hasWellbeing", "Have employee wellbeing programmes")}
              {renderCheckboxField("paysLivingWage", "Pay the living wage")}
            </div>
          </div>
        );
      case 3:
        return (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Detail your governance structures and policies.</p>
            <div className="space-y-3">
              {renderCheckboxField("hasAntiBribery", "Have anti-bribery & corruption policy")}
              {renderCheckboxField("hasWhistleblowing", "Have whistleblowing policy")}
              {renderCheckboxField("hasDataPrivacy", "Have data privacy / GDPR policy")}
            </div>
            <div className="space-y-2 pt-2">
              <Label htmlFor="esgResponsible">ESG Responsible Person</Label>
              <Input
                id="esgResponsible"
                value={formData.esgResponsible}
                onChange={(e) => updateField("esgResponsible", e.target.value)}
                placeholder="Name or role title"
                data-testid="input-esgResponsible"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reviewFrequency">Policy Review Frequency</Label>
              <Select value={formData.reviewFrequency} onValueChange={(v) => updateField("reviewFrequency", v)}>
                <SelectTrigger data-testid="select-reviewFrequency">
                  <SelectValue placeholder="Select frequency" />
                </SelectTrigger>
                <SelectContent>
                  {REVIEW_FREQUENCIES.map(f => (
                    <SelectItem key={f} value={f}>{f}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <FileText className="w-5 h-5 text-primary" />
          Policy Generator
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Generate a tailored ESG policy using our guided questionnaire
        </p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        <div className="lg:w-1/2 space-y-4">
          <div className="flex items-center gap-2">
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              const isActive = i === step;
              const isCompleted = i < step || !!generatedContent;
              return (
                <div key={i} className="flex items-center gap-2">
                  {i > 0 && <div className={`w-6 h-px ${isCompleted ? "bg-primary" : "bg-border"}`} />}
                  <button
                    onClick={() => !generatedContent && setStep(i)}
                    disabled={!!generatedContent}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : isCompleted
                          ? "bg-primary/10 text-primary"
                          : "bg-muted text-muted-foreground"
                    }`}
                    data-testid={`step-button-${i}`}
                  >
                    {isCompleted && !isActive ? (
                      <CheckCircle className="w-3.5 h-3.5" />
                    ) : (
                      <Icon className="w-3.5 h-3.5" />
                    )}
                    <span className="hidden sm:inline">{s.label}</span>
                  </button>
                </div>
              );
            })}
          </div>

          {generateMutation.isPending ? (
            <Card>
              <CardContent className="p-12 flex flex-col items-center justify-center gap-4">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground font-medium" data-testid="text-generating">
                  Generating your ESG policy...
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  {(() => { const Icon = STEPS[step].icon; return <Icon className="w-4 h-4 text-primary" />; })()}
                  {STEPS[step].label}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {renderStep()}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-6">
                  <Button
                    variant="outline"
                    onClick={handleBack}
                    disabled={step === 0}
                    data-testid="button-back"
                  >
                    <ChevronLeft className="w-4 h-4 mr-1" />
                    Back
                  </Button>
                  {step < 3 ? (
                    <Button onClick={handleNext} data-testid="button-next">
                      Next
                      <ChevronRight className="w-4 h-4 ml-1" />
                    </Button>
                  ) : (
                    <Button onClick={handleGenerate} data-testid="button-generate">
                      <FileText className="w-4 h-4 mr-1" />
                      Generate Policy
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="lg:w-1/2">
          {generatedContent ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-base font-semibold" data-testid="text-preview-heading">Policy Preview</h2>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    onClick={handleStartOver}
                    data-testid="button-start-over"
                  >
                    <RotateCcw className="w-4 h-4 mr-1" />
                    Start Over
                  </Button>
                  <Button
                    onClick={() => saveMutation.mutate()}
                    disabled={saveMutation.isPending}
                    data-testid="button-save-to-policy"
                  >
                    <Save className="w-4 h-4 mr-1" />
                    {saveMutation.isPending ? "Saving..." : "Save to ESG Policy"}
                  </Button>
                </div>
              </div>
              <div className="space-y-3">
                {POLICY_SECTIONS.map(({ key, label }) => {
                  const content = generatedContent[key];
                  if (!content) return null;
                  return (
                    <Card key={key} data-testid={`policy-section-${key}`}>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">{label}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">{content}</p>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          ) : (
            <Card className="h-full min-h-[300px]">
              <CardContent className="flex flex-col items-center justify-center h-full p-12 text-center">
                <FileText className="w-10 h-10 text-muted-foreground/40 mb-3" />
                <p className="text-sm font-medium text-muted-foreground">Policy Preview</p>
                <p className="text-xs text-muted-foreground/70 mt-1">
                  Complete the questionnaire and generate your policy to see a preview here
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
