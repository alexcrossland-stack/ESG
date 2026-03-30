import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, authFetch } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Building2, Users, CheckCircle2, ArrowRight, ArrowLeft, Plus, Trash2,
  FileText, BarChart3, Sparkles, X, Check, ChevronRight, AlertCircle,
} from "lucide-react";

const INDUSTRIES = [
  { value: "manufacturing", label: "Manufacturing" },
  { value: "professional_services", label: "Professional Services" },
  { value: "technology", label: "Technology" },
  { value: "retail", label: "Retail" },
  { value: "construction", label: "Construction" },
  { value: "healthcare", label: "Healthcare" },
  { value: "education", label: "Education" },
  { value: "hospitality", label: "Hospitality" },
  { value: "finance", label: "Financial Services" },
  { value: "transport_logistics", label: "Logistics & Transport" },
  { value: "agriculture", label: "Agriculture" },
  { value: "other", label: "Other" },
];

const COUNTRIES = [
  { value: "GB", label: "United Kingdom" },
  { value: "IE", label: "Ireland" },
  { value: "US", label: "United States" },
  { value: "DE", label: "Germany" },
  { value: "FR", label: "France" },
  { value: "NL", label: "Netherlands" },
  { value: "AU", label: "Australia" },
  { value: "CA", label: "Canada" },
  { value: "IN", label: "India" },
  { value: "SG", label: "Singapore" },
  { value: "AE", label: "United Arab Emirates" },
  { value: "ZA", label: "South Africa" },
  { value: "NZ", label: "New Zealand" },
  { value: "ES", label: "Spain" },
  { value: "IT", label: "Italy" },
  { value: "PT", label: "Portugal" },
  { value: "BE", label: "Belgium" },
  { value: "SE", label: "Sweden" },
  { value: "NO", label: "Norway" },
  { value: "DK", label: "Denmark" },
  { value: "FI", label: "Finland" },
  { value: "PL", label: "Poland" },
  { value: "CH", label: "Switzerland" },
];

const COMPANY_SIZES = [
  { value: "1-10", label: "1–10 employees" },
  { value: "11-50", label: "11–50 employees" },
  { value: "51-250", label: "51–250 employees" },
  { value: "251-1000", label: "251–1,000 employees" },
  { value: "1001-5000", label: "1,001–5,000 employees" },
  { value: "5001+", label: "5,001+ employees" },
];

const INVITE_ROLES = [
  { value: "admin", label: "Admin", desc: "Full access to all features and settings" },
  { value: "contributor", label: "Contributor", desc: "Can enter data, edit policies, and answer questionnaires" },
  { value: "viewer", label: "Viewer", desc: "Read-only access across the platform" },
];

const STEPS = [
  { key: "details", label: "Company Details", icon: Building2 },
  { key: "group", label: "Portfolio Group", icon: Users },
  { key: "invite", label: "Invite Team", icon: Users },
];

interface Invitee {
  email: string;
  role: string;
}

interface PortfolioGroup {
  id: string;
  name: string;
  companyCount: number;
  role: string;
}

function StepHeader({ step, total }: { step: number; total: number }) {
  const current = STEPS[step - 1];
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        {STEPS.map((s, i) => {
          const num = i + 1;
          const done = num < step;
          const active = num === step;
          return (
            <div key={s.key} className="flex items-center gap-2">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-colors ${
                  done ? "bg-primary text-primary-foreground"
                    : active ? "bg-primary/15 text-primary border-2 border-primary"
                    : "bg-muted text-muted-foreground"
                }`}
                data-testid={`step-circle-${num}`}
              >
                {done ? <CheckCircle2 className="w-3.5 h-3.5" /> : num}
              </div>
              <span className={`text-xs hidden sm:inline ${active ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                {s.label}
              </span>
              {i < STEPS.length - 1 && <ChevronRight className="w-3.5 h-3.5 text-muted-foreground mx-1" />}
            </div>
          );
        })}
      </div>
      <Progress value={(step / total) * 100} className="h-1" data-testid="progress-bar" />
    </div>
  );
}

function Step1Details({
  companyName, setCompanyName,
  sector, setSector,
  country, setCountry,
  companySizeBand, setCompanySizeBand,
  reportingYear, setReportingYear,
  onNext,
}: {
  companyName: string; setCompanyName: (v: string) => void;
  sector: string; setSector: (v: string) => void;
  country: string; setCountry: (v: string) => void;
  companySizeBand: string; setCompanySizeBand: (v: string) => void;
  reportingYear: string; setReportingYear: (v: string) => void;
  onNext: () => void;
}) {
  const [nameError, setNameError] = useState("");
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 6 }, (_, i) => currentYear - i);

  function handleNext() {
    if (!companyName.trim()) {
      setNameError("Company name is required");
      return;
    }
    setNameError("");
    onNext();
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold" data-testid="step-title-details">Company Details</h2>
        <p className="text-sm text-muted-foreground mt-1">Tell us about the company so we can configure the right metrics and reporting for you.</p>
      </div>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="company-name">Company Name <span className="text-destructive">*</span></Label>
          <Input
            id="company-name"
            placeholder="e.g. Acme Ltd"
            value={companyName}
            onChange={e => { setCompanyName(e.target.value); setNameError(""); }}
            data-testid="input-company-name"
            className={nameError ? "border-destructive" : ""}
          />
          {nameError && (
            <p className="text-xs text-destructive flex items-center gap-1" data-testid="error-company-name">
              <AlertCircle className="w-3 h-3" /> {nameError}
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="sector">Sector / Industry</Label>
            <Select value={sector} onValueChange={setSector}>
              <SelectTrigger id="sector" data-testid="select-sector">
                <SelectValue placeholder="Select sector" />
              </SelectTrigger>
              <SelectContent>
                {INDUSTRIES.map(ind => (
                  <SelectItem key={ind.value} value={ind.value} data-testid={`option-sector-${ind.value}`}>{ind.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="country">Country</Label>
            <Select value={country} onValueChange={setCountry}>
              <SelectTrigger id="country" data-testid="select-country">
                <SelectValue placeholder="Select country" />
              </SelectTrigger>
              <SelectContent>
                {COUNTRIES.map(c => (
                  <SelectItem key={c.value} value={c.value} data-testid={`option-country-${c.value}`}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="company-size">Company Size</Label>
            <Select value={companySizeBand} onValueChange={setCompanySizeBand}>
              <SelectTrigger id="company-size" data-testid="select-company-size">
                <SelectValue placeholder="Select size" />
              </SelectTrigger>
              <SelectContent>
                {COMPANY_SIZES.map(s => (
                  <SelectItem key={s.value} value={s.value} data-testid={`option-size-${s.value}`}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reporting-year">Reporting Year</Label>
            <Select value={reportingYear} onValueChange={setReportingYear}>
              <SelectTrigger id="reporting-year" data-testid="select-reporting-year">
                <SelectValue placeholder="Select year" />
              </SelectTrigger>
              <SelectContent>
                {years.map(y => (
                  <SelectItem key={y} value={String(y)} data-testid={`option-year-${y}`}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <Button onClick={handleNext} data-testid="button-next-step1">
          Continue <ArrowRight className="w-4 h-4 ml-1.5" />
        </Button>
      </div>
    </div>
  );
}

function Step2Group({
  groups,
  groupId, setGroupId,
  onBack, onNext,
}: {
  groups: PortfolioGroup[];
  groupId: string; setGroupId: (v: string) => void;
  onBack: () => void; onNext: () => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold" data-testid="step-title-group">Portfolio Group</h2>
        <p className="text-sm text-muted-foreground mt-1">Optionally assign this company to a portfolio group so it appears in your portfolio dashboard.</p>
      </div>

      {groups.length === 0 ? (
        <div className="rounded-md border border-border p-4 text-sm text-muted-foreground flex items-center gap-2" data-testid="no-groups-available">
          <AlertCircle className="w-4 h-4 shrink-0" />
          No portfolio groups are available to you. The company will be created without a group assignment.
        </div>
      ) : (
        <div className="space-y-2" data-testid="group-options">
          <div
            key="none"
            onClick={() => setGroupId("")}
            className={`flex items-center gap-3 p-3 rounded-md border cursor-pointer transition-colors ${
              groupId === "" ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"
            }`}
            data-testid="option-group-none"
          >
            <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${groupId === "" ? "border-primary" : "border-muted-foreground"}`}>
              {groupId === "" && <div className="w-2 h-2 rounded-full bg-primary" />}
            </div>
            <div>
              <p className="text-sm font-medium">No group (standalone company)</p>
              <p className="text-xs text-muted-foreground">Create as an independent company, not in any portfolio group</p>
            </div>
          </div>
          {groups.map(g => (
            <div
              key={g.id}
              onClick={() => setGroupId(g.id)}
              className={`flex items-center gap-3 p-3 rounded-md border cursor-pointer transition-colors ${
                groupId === g.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"
              }`}
              data-testid={`option-group-${g.id}`}
            >
              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${groupId === g.id ? "border-primary" : "border-muted-foreground"}`}>
                {groupId === g.id && <div className="w-2 h-2 rounded-full bg-primary" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{g.name}</p>
                <p className="text-xs text-muted-foreground">{g.companyCount} {g.companyCount === 1 ? "company" : "companies"} · Your role: {g.role}</p>
              </div>
              <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-between pt-2">
        <Button variant="outline" onClick={onBack} data-testid="button-back-step2">
          <ArrowLeft className="w-4 h-4 mr-1.5" /> Back
        </Button>
        <Button onClick={onNext} data-testid="button-next-step2">
          Continue <ArrowRight className="w-4 h-4 ml-1.5" />
        </Button>
      </div>
    </div>
  );
}

function Step3Invite({
  invitees, setInvitees,
  onBack, onSubmit, isSubmitting,
}: {
  invitees: Invitee[];
  setInvitees: (v: Invitee[]) => void;
  onBack: () => void;
  onSubmit: () => void;
  isSubmitting: boolean;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("contributor");
  const [emailError, setEmailError] = useState("");

  function addInvitee() {
    if (!email.trim()) {
      setEmailError("Email is required");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setEmailError("Please enter a valid email address");
      return;
    }
    if (invitees.some(i => i.email.toLowerCase() === email.trim().toLowerCase())) {
      setEmailError("This email has already been added");
      return;
    }
    setInvitees([...invitees, { email: email.trim(), role }]);
    setEmail("");
    setEmailError("");
  }

  function removeInvitee(index: number) {
    setInvitees(invitees.filter((_, i) => i !== index));
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      addInvitee();
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold" data-testid="step-title-invite">Invite Team Members</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Invite people to join this company. They'll receive an email with a link to set up their account. You can also do this later.
        </p>
      </div>

      <div className="space-y-3">
        <div className="flex gap-2">
          <div className="flex-1 space-y-1">
            <Label htmlFor="invite-email">Email address</Label>
            <Input
              id="invite-email"
              type="email"
              placeholder="colleague@company.com"
              value={email}
              onChange={e => { setEmail(e.target.value); setEmailError(""); }}
              onKeyDown={handleKeyDown}
              data-testid="input-invite-email"
              className={emailError ? "border-destructive" : ""}
            />
            {emailError && (
              <p className="text-xs text-destructive flex items-center gap-1" data-testid="error-invite-email">
                <AlertCircle className="w-3 h-3" /> {emailError}
              </p>
            )}
          </div>
          <div className="space-y-1">
            <Label htmlFor="invite-role">Role</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger id="invite-role" className="w-36" data-testid="select-invite-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INVITE_ROLES.map(r => (
                  <SelectItem key={r.value} value={r.value} data-testid={`option-role-${r.value}`}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button variant="outline" onClick={addInvitee} data-testid="button-add-invitee">
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {INVITE_ROLES.map(r => (
            <div key={r.value} className="text-xs border border-border rounded-md p-2">
              <p className="font-medium capitalize">{r.label}</p>
              <p className="text-muted-foreground">{r.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {invitees.length > 0 && (
        <div className="space-y-2" data-testid="invitee-list">
          <p className="text-sm font-medium">People to invite ({invitees.length})</p>
          {invitees.map((inv, i) => (
            <div
              key={i}
              className="flex items-center justify-between gap-3 p-2.5 rounded-md border border-border bg-muted/30"
              data-testid={`invitee-item-${i}`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <span className="text-xs font-bold text-primary">{inv.email[0].toUpperCase()}</span>
                </div>
                <span className="text-sm truncate" data-testid={`invitee-email-${i}`}>{inv.email}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge variant="secondary" className="text-xs capitalize">{inv.role}</Badge>
                <Button
                  variant="ghost"
                  size="icon"
                  className="w-6 h-6"
                  onClick={() => removeInvitee(i)}
                  data-testid={`button-remove-invitee-${i}`}
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {invitees.length === 0 && (
        <div className="rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground" data-testid="no-invitees-message">
          No invites added yet — you can invite your team now or skip this step and do it later from the Team page.
        </div>
      )}

      <div className="flex justify-between pt-2">
        <Button variant="outline" onClick={onBack} disabled={isSubmitting} data-testid="button-back-step3">
          <ArrowLeft className="w-4 h-4 mr-1.5" /> Back
        </Button>
        <Button onClick={onSubmit} disabled={isSubmitting} data-testid="button-create-company">
          {isSubmitting ? (
            <>
              <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin mr-2" />
              Creating…
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 mr-1.5" /> Create Company
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

function SuccessScreen({
  companyId,
  companyName,
  invitesSent,
  onNavigate,
}: {
  companyId: string;
  companyName: string;
  invitesSent: number;
  onNavigate: (path: string) => void;
}) {
  const { data: setupStatus, isLoading } = useQuery<any>({
    queryKey: ["/api/companies", companyId, "setup-status"],
    queryFn: () => authFetch(`/api/companies/${companyId}/setup-status`).then(r => r.json()),
    enabled: !!companyId,
  });

  const checklist = setupStatus?.checklistProgress?.items || [];
  const reportingReady = setupStatus?.reportingReady || false;

  return (
    <div className="space-y-6 text-center" data-testid="success-screen">
      <div className="flex flex-col items-center gap-3">
        <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
          <CheckCircle2 className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
        </div>
        <div>
          <h2 className="text-xl font-bold" data-testid="success-title">Company Created!</h2>
          <p className="text-muted-foreground text-sm mt-1">
            <span className="font-medium text-foreground" data-testid="success-company-name">{companyName}</span> is ready to go.
            {invitesSent > 0 && ` ${invitesSent} invitation${invitesSent === 1 ? "" : "s"} sent.`}
          </p>
        </div>
      </div>

      {!isLoading && checklist.length > 0 && (
        <Card className="text-left" data-testid="checklist-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Onboarding Checklist</CardTitle>
            <CardDescription className="text-xs">Complete these steps to get the most from your ESG programme.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {checklist.map((item: any) => (
              <div
                key={item.key}
                className={`flex items-center gap-3 p-2 rounded-md ${item.done ? "text-muted-foreground" : ""}`}
                data-testid={`checklist-item-${item.key}`}
              >
                <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${item.done ? "bg-emerald-100 dark:bg-emerald-900/30" : "bg-amber-100 dark:bg-amber-900/30"}`}>
                  {item.done
                    ? <Check className="w-3 h-3 text-emerald-600" />
                    : <span className="text-[10px] font-bold text-amber-600">!</span>}
                </div>
                <span className="text-sm">{item.label}</span>
                {item.done && <Badge variant="outline" className="ml-auto text-xs text-emerald-600 border-emerald-300">Done</Badge>}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-left">
        <Card
          className="cursor-pointer hover:border-primary/50 transition-colors"
          onClick={() => onNavigate("/data-entry")}
          data-testid="action-enter-data"
        >
          <CardContent className="pt-4 pb-4 space-y-1">
            <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center mb-2">
              <BarChart3 className="w-4 h-4 text-primary" />
            </div>
            <p className="text-sm font-medium">Enter First Data</p>
            <p className="text-xs text-muted-foreground">Add your first ESG metric value to start tracking progress.</p>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer hover:border-primary/50 transition-colors"
          onClick={() => onNavigate("/team")}
          data-testid="action-invite-team"
        >
          <CardContent className="pt-4 pb-4 space-y-1">
            <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center mb-2">
              <Users className="w-4 h-4 text-primary" />
            </div>
            <p className="text-sm font-medium">Invite Team</p>
            <p className="text-xs text-muted-foreground">Add more colleagues to collaborate on your ESG programme.</p>
          </CardContent>
        </Card>

        <Card
          className={`${reportingReady ? "cursor-pointer hover:border-primary/50" : "opacity-60 cursor-not-allowed"} transition-colors`}
          onClick={() => reportingReady && onNavigate("/reports")}
          data-testid="action-generate-report"
        >
          <CardContent className="pt-4 pb-4 space-y-1">
            <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center mb-2">
              <FileText className="w-4 h-4 text-primary" />
            </div>
            <p className="text-sm font-medium">Generate Report</p>
            <p className="text-xs text-muted-foreground">
              {reportingReady
                ? "Your first ESG report is ready to generate."
                : "Available once you've added data and configured metrics."}
            </p>
            {!reportingReady && (
              <Badge variant="secondary" className="text-xs mt-1">Not ready yet</Badge>
            )}
          </CardContent>
        </Card>
      </div>

      <Button onClick={() => onNavigate("/")} className="w-full sm:w-auto" data-testid="button-go-to-dashboard">
        Go to Dashboard <ArrowRight className="w-4 h-4 ml-1.5" />
      </Button>
    </div>
  );
}

export default function CreateCompanyPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: authData } = useQuery<any>({ queryKey: ["/api/auth/me"] });
  const groups: PortfolioGroup[] = authData?.portfolioGroups || [];
  const userRole = authData?.user?.role;

  const canAccess = userRole === "super_admin" || userRole === "admin" || userRole === "portfolio_owner";

  const [step, setStep] = useState(1);
  const [companyName, setCompanyName] = useState("");
  const [sector, setSector] = useState("");
  const [country, setCountry] = useState("GB");
  const [companySizeBand, setCompanySizeBand] = useState("");
  const [reportingYear, setReportingYear] = useState(String(new Date().getFullYear()));
  const [groupId, setGroupId] = useState("");
  const [invitees, setInvitees] = useState<Invitee[]>([]);
  const [createdCompanyId, setCreatedCompanyId] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [invitesSentCount, setInvitesSentCount] = useState(0);

  const createMutation = useMutation({
    mutationFn: async () => {
      const body: any = {
        companyName: companyName.trim(),
        ...(sector ? { sector } : {}),
        ...(country ? { country } : {}),
        ...(companySizeBand ? { companySizeBand } : {}),
        ...(reportingYear ? { reportingYear: parseInt(reportingYear) } : {}),
        ...(groupId ? { groupId } : {}),
      };
      const res = await apiRequest("POST", "/api/companies", body);
      return res.json();
    },
    onSuccess: async (data: any) => {
      const newCompanyId = data?.companyId || data?.company?.id;
      setCreatedCompanyId(newCompanyId);

      let successfulInvites = 0;
      if (invitees.length > 0 && newCompanyId) {
        const results = await Promise.allSettled(
          invitees.map(inv =>
            authFetch(`/api/companies/${newCompanyId}/invites`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ email: inv.email, role: inv.role }),
            }).then(r => {
              if (!r.ok) throw new Error(`Invite failed for ${inv.email}`);
              return r;
            })
          )
        );
        successfulInvites = results.filter(r => r.status === "fulfilled").length;
        const failed = results.length - successfulInvites;
        if (failed > 0) {
          toast({
            title: "Some invites failed",
            description: `${successfulInvites} of ${invitees.length} invites sent. You can retry from the Team page.`,
            variant: "destructive",
          });
        }
      }

      setInvitesSentCount(successfulInvites);
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      setIsSuccess(true);
    },
    onError: (e: any) => {
      toast({
        title: "Failed to create company",
        description: e.message || "Something went wrong. Please try again.",
        variant: "destructive",
      });
    },
  });

  function handleNavigate(path: string) {
    queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    navigate(path);
  }

  if (!canAccess && authData) {
    return (
      <div className="p-6 max-w-md mx-auto text-center space-y-4 mt-16">
        <AlertCircle className="w-10 h-10 text-muted-foreground mx-auto" />
        <h2 className="text-lg font-semibold">Access Restricted</h2>
        <p className="text-sm text-muted-foreground">You don't have permission to create companies. Contact your administrator.</p>
        <Button variant="outline" onClick={() => navigate("/")} data-testid="button-go-home">Back to Dashboard</Button>
      </div>
    );
  }

  if (isSuccess && createdCompanyId) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <SuccessScreen
          companyId={createdCompanyId}
          companyName={companyName}
          invitesSent={invitesSentCount}
          onNavigate={handleNavigate}
        />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Building2 className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-bold" data-testid="heading-create-company">Create New Company</h1>
        </div>
        <p className="text-sm text-muted-foreground">Set up a new company on the platform in a few quick steps.</p>
      </div>

      <StepHeader step={step} total={STEPS.length} />

      <Card>
        <CardContent className="pt-6">
          {step === 1 && (
            <Step1Details
              companyName={companyName} setCompanyName={setCompanyName}
              sector={sector} setSector={setSector}
              country={country} setCountry={setCountry}
              companySizeBand={companySizeBand} setCompanySizeBand={setCompanySizeBand}
              reportingYear={reportingYear} setReportingYear={setReportingYear}
              onNext={() => setStep(2)}
            />
          )}
          {step === 2 && (
            <Step2Group
              groups={groups}
              groupId={groupId} setGroupId={setGroupId}
              onBack={() => setStep(1)}
              onNext={() => setStep(3)}
            />
          )}
          {step === 3 && (
            <Step3Invite
              invitees={invitees} setInvitees={setInvitees}
              onBack={() => setStep(2)}
              onSubmit={() => createMutation.mutate()}
              isSubmitting={createMutation.isPending}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
