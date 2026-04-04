import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Form, FormControl, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Settings as SettingsIcon, Building2, Clock, Save, Library, FileText,
  ChevronRight, BarChart3, Lock, Users, Shield, ToggleLeft,
  Scale, Leaf, Palette, ClipboardCheck, Search, Calendar, Copy, LockIcon, UserPlus,
  Key, KeyRound, Trash2, Plus, AlertCircle, CheckCircle, XCircle,
  Monitor, Smartphone, Globe, RefreshCw, LogOut, Crown,
} from "lucide-react";
import { format } from "date-fns";
import { usePermissions } from "@/lib/permissions";
import { OwnerAssignment } from "@/components/owner-assignment";
import { Link } from "wouter";

const INDUSTRIES = [
  "Construction", "Education", "Energy & Utilities", "Financial Services",
  "Food & Beverage", "Healthcare", "Hospitality & Tourism", "IT & Technology",
  "Legal & Professional Services", "Manufacturing", "Media & Communications",
  "Retail", "Transport & Logistics", "Other",
];

const REVENUE_BANDS = [
  "Under £1m", "£1m – £5m", "£5m – £25m", "£25m – £100m", "Over £100m",
];

const COUNTRIES = [
  "United Kingdom", "Ireland", "United States", "Canada", "Australia",
  "New Zealand", "Germany", "France", "Netherlands", "Other",
];

export default function Settings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [formInitialized, setFormInitialized] = useState(false);
  const { can, isAdmin } = usePermissions();

  const { data: authData, isLoading: authLoading } = useQuery<any>({ queryKey: ["/api/auth/me"] });
  const { data: company, isLoading: companyLoading } = useQuery<any>({ queryKey: ["/api/company"] });

  const companyForm = useForm({
    defaultValues: {
      name: "",
      industry: "",
      country: "",
      employeeCount: "",
      revenueBand: "",
      locations: "1",
    },
  });

  if (company && !formInitialized) {
    companyForm.reset({
      name: company.name || "",
      industry: company.industry || "",
      country: company.country || "",
      employeeCount: String(company.employeeCount || ""),
      revenueBand: company.revenueBand || "",
      locations: String(company.locations || "1"),
    });
    setFormInitialized(true);
  }

  const updateCompanyMutation = useMutation({
    mutationFn: (data: any) => apiRequest("PUT", "/api/company", {
      ...data,
      employeeCount: parseInt(data.employeeCount) || null,
      locations: parseInt(data.locations) || 1,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/company"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({ title: "Company details updated" });
    },
    onError: () => toast({ title: "Update failed", variant: "destructive" }),
  });

  if (authLoading || companyLoading) {
    return <div className="p-6 space-y-4">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-40" />)}</div>;
  }

  const user = authData?.user;

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-4xl mx-auto">
      <div>
        <h1 className="text-lg sm:text-xl font-semibold flex items-center gap-2">
          <SettingsIcon className="w-5 h-5 text-primary" />
          Settings
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Manage your company profile, account, and platform configuration
        </p>
      </div>

      <Tabs defaultValue="general" className="w-full">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="general" data-testid="tab-general">General</TabsTrigger>
          {isAdmin && <TabsTrigger value="admin" data-testid="tab-admin">Administration</TabsTrigger>}
          <TabsTrigger value="privacy" data-testid="tab-privacy">Privacy &amp; Data</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-5 mt-4">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <Building2 className="w-4 h-4 text-primary" />
                Company Details
              </CardTitle>
              <CardDescription className="text-xs">
                This information is used in your ESG reports
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...companyForm}>
                <form onSubmit={companyForm.handleSubmit(d => updateCompanyMutation.mutate(d))} className="space-y-4">
                  <FormField control={companyForm.control} name="name" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Company Name</FormLabel>
                      <FormControl><Input {...field} data-testid="input-company-name" /></FormControl>
                    </FormItem>
                  )} />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField control={companyForm.control} name="industry" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">Industry</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-industry"><SelectValue placeholder="Select industry" /></SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {INDUSTRIES.map(i => <SelectItem key={i} value={i}>{i}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )} />
                    <FormField control={companyForm.control} name="country" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">Country</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-country"><SelectValue placeholder="Select country" /></SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {COUNTRIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )} />
                    <FormField control={companyForm.control} name="employeeCount" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">Number of Employees</FormLabel>
                        <FormControl><Input type="number" placeholder="e.g. 50" {...field} data-testid="input-employee-count" /></FormControl>
                      </FormItem>
                    )} />
                    <FormField control={companyForm.control} name="revenueBand" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">Revenue Band</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-revenue"><SelectValue placeholder="Select range" /></SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {REVENUE_BANDS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )} />
                    <FormField control={companyForm.control} name="locations" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">Number of Locations</FormLabel>
                        <FormControl><Input type="number" min="1" placeholder="1" {...field} data-testid="input-locations" /></FormControl>
                      </FormItem>
                    )} />
                  </div>
                  {can("settings_admin") && (
                    <div className="flex justify-end pt-2">
                      <Button type="submit" size="sm" disabled={updateCompanyMutation.isPending} data-testid="button-save-company">
                        <Save className="w-3.5 h-3.5 mr-1.5" />
                        {updateCompanyMutation.isPending ? "Saving..." : "Save Details"}
                      </Button>
                    </div>
                  )}
                </form>
              </Form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-sm">Account Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between py-2 border-b border-border">
                <div>
                  <p className="text-sm font-medium" data-testid="text-username">{user?.username}</p>
                  <p className="text-xs text-muted-foreground">{user?.email}</p>
                </div>
                <Badge variant="secondary">{user?.role}</Badge>
              </div>
            </CardContent>
          </Card>

          <YourPlanCard />

          <PasswordChangeCard />

          <MfaCard />

          <SessionManagementCard />

          <ActivityLogCard />
        </TabsContent>

        {isAdmin && (
          <TabsContent value="admin" className="space-y-5 mt-4">
            <AdminPanel />
          </TabsContent>
        )}

        <TabsContent value="privacy" className="space-y-5 mt-4">
          <PrivacyDataTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============================================================
// STEP-UP AUTHENTICATION DIALOG
// ============================================================

export function StepUpDialog({ open, onClose, onSuccess, actionLabel }: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  actionLabel?: string;
}) {
  const { toast } = useToast();
  const [password, setPassword] = useState("");
  const [totpToken, setTotpToken] = useState("");
  const [backupCode, setBackupCode] = useState("");
  const [useTotpOrBackup, setUseTotpOrBackup] = useState<"totp" | "backup">("totp");

  const { data: mfaStatus } = useQuery<any>({ queryKey: ["/api/auth/mfa/status"] });
  const requiresMfa = mfaStatus?.mfaEnabled;

  const stepUpMutation = useMutation({
    mutationFn: async () => {
      const body: any = { password };
      if (requiresMfa) {
        if (useTotpOrBackup === "totp") body.totpToken = totpToken;
        else body.backupCode = backupCode;
      }
      const res = await apiRequest("POST", "/api/auth/step-up", body);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Re-authentication failed");
      }
      return res.json();
    },
    onSuccess: () => {
      setPassword(""); setTotpToken(""); setBackupCode("");
      onSuccess();
    },
    onError: (e: any) => toast({ title: "Authentication failed", description: e.message, variant: "destructive" }),
  });

  if (!open) return null;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            Confirm Your Identity
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {actionLabel
              ? `For your security, please verify your identity before ${actionLabel}.`
              : "This action requires re-authentication. Please verify your identity to continue."}
          </p>
          <div className="space-y-2">
            <Label className="text-xs">Password</Label>
            <Input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Your current password"
              data-testid="input-stepup-password"
            />
          </div>
          {requiresMfa && (
            <div className="space-y-2">
              <div className="flex gap-2">
                <Button size="sm" variant={useTotpOrBackup === "totp" ? "default" : "outline"} onClick={() => setUseTotpOrBackup("totp")} className="text-xs">Authenticator</Button>
                <Button size="sm" variant={useTotpOrBackup === "backup" ? "default" : "outline"} onClick={() => setUseTotpOrBackup("backup")} className="text-xs">Backup Code</Button>
              </div>
              {useTotpOrBackup === "totp" ? (
                <Input value={totpToken} onChange={e => setTotpToken(e.target.value)} placeholder="6-digit code" maxLength={6} data-testid="input-stepup-totp" />
              ) : (
                <Input value={backupCode} onChange={e => setBackupCode(e.target.value)} placeholder="Backup code" data-testid="input-stepup-backup" />
              )}
            </div>
          )}
          <div className="flex gap-2 justify-end pt-1">
            <Button size="sm" variant="outline" onClick={onClose}>Cancel</Button>
            <Button
              size="sm"
              onClick={() => stepUpMutation.mutate()}
              disabled={stepUpMutation.isPending || !password || (requiresMfa && !totpToken && !backupCode)}
              data-testid="button-stepup-confirm"
            >
              {stepUpMutation.isPending ? "Verifying..." : "Confirm"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// YOUR PLAN CARD
// ============================================================

function YourPlanCard() {
  const { data: billing, isLoading } = useQuery<any>({ queryKey: ["/api/billing/status"] });

  const isPro = billing?.planTier === "pro";
  const isBeta = billing?.isBeta;
  const isComped = billing?.isComped;

  let planName = "Free";
  let planDescription = "Basic ESG tracking across 1 site";
  let badgeVariant: "default" | "secondary" | "outline" = "secondary";

  if (isPro && isBeta) {
    planName = "Pro (Beta)";
    planDescription = "All Pro features unlocked as a beta participant";
    badgeVariant = "default";
  } else if (isPro && isComped) {
    planName = "Pro (Complimentary)";
    planDescription = "All Pro features at no cost";
    badgeVariant = "default";
  } else if (isPro) {
    planName = "Pro";
    planDescription = "Full ESG management — unlimited sites, AI, and advanced reporting";
    badgeVariant = "default";
  }

  return (
    <Card data-testid="card-your-plan">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Crown className="w-4 h-4 text-primary" />
          Your Plan
        </CardTitle>
        <CardDescription className="text-xs">
          Your current subscription and what it includes
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-4 w-48" />
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm" data-testid="text-plan-name">{planName}</span>
                <Badge variant={badgeVariant} className="text-[10px]" data-testid="badge-plan-tier">
                  {isPro ? "Pro" : "Free"}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5" data-testid="text-plan-description">{planDescription}</p>
            </div>
            <Link href="/billing">
              <Button variant="outline" size="sm" data-testid="button-manage-plan">
                {isPro ? "Manage plan" : "Upgrade to Pro"}
              </Button>
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================

function SessionManagementCard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [revokeConfirmId, setRevokeConfirmId] = useState<string | null>(null);

  const { data: sessions, isLoading } = useQuery<any[]>({ queryKey: ["/api/auth/sessions"] });

  const revokeMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const res = await apiRequest("DELETE", `/api/auth/sessions/${sessionId}`);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/sessions"] });
      if (data.loggedOut) {
        toast({ title: "Session revoked", description: "You have been logged out of this session." });
      } else {
        toast({ title: "Session revoked", description: "The session has been terminated." });
      }
      setRevokeConfirmId(null);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const revokeAllMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/auth/sessions/revoke-others");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/sessions"] });
      toast({ title: "Sessions terminated", description: `${data.revokedCount} other session(s) have been logged out.` });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const otherSessions = sessions?.filter(s => !s.isCurrent) || [];

  return (
    <Card data-testid="card-sessions">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Monitor className="w-4 h-4 text-primary" />
          Active Sessions
        </CardTitle>
        <CardDescription className="text-xs">
          Manage where you are logged in. Revoke sessions from devices you no longer use.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="space-y-2">{[...Array(2)].map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : !sessions || sessions.length === 0 ? (
          <p className="text-xs text-muted-foreground">No active sessions found. Your sessions will appear here after logging in.</p>
        ) : (
          <div className="space-y-2">
            {sessions.map(session => (
              <div key={session.id} className="flex items-start justify-between p-2.5 rounded-lg border border-border bg-muted/30" data-testid={`row-session-${session.id}`}>
                <div className="flex items-start gap-2.5">
                  <Globe className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-medium">{session.deviceSummary}</p>
                      {session.isCurrent && (
                        <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4">Current</Badge>
                      )}
                    </div>
                    {session.ipAddress && (
                      <p className="text-[11px] text-muted-foreground">IP: {session.ipAddress}</p>
                    )}
                    <p className="text-[11px] text-muted-foreground">
                      Last active: {session.lastSeenAt ? format(new Date(session.lastSeenAt), "MMM d, HH:mm") : "Unknown"}
                    </p>
                    {session.createdAt && (
                      <p className="text-[11px] text-muted-foreground">
                        Started: {format(new Date(session.createdAt), "MMM d, yyyy")}
                      </p>
                    )}
                  </div>
                </div>
                <div>
                  {!session.isCurrent && (
                    revokeConfirmId === session.sessionId ? (
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="destructive"
                          className="h-6 text-xs px-2"
                          onClick={() => revokeMutation.mutate(session.sessionId)}
                          disabled={revokeMutation.isPending}
                          data-testid={`button-confirm-revoke-${session.id}`}
                        >
                          Revoke
                        </Button>
                        <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={() => setRevokeConfirmId(null)}>Cancel</Button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 text-xs px-2"
                        onClick={() => setRevokeConfirmId(session.sessionId)}
                        data-testid={`button-revoke-${session.id}`}
                      >
                        <LogOut className="w-3 h-3 mr-1" />
                        Revoke
                      </Button>
                    )
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        {otherSessions.length > 0 && (
          <div className="pt-1">
            <Button
              size="sm"
              variant="outline"
              className="text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
              onClick={() => revokeAllMutation.mutate()}
              disabled={revokeAllMutation.isPending}
              data-testid="button-revoke-all-sessions"
            >
              <LogOut className="w-3 h-3 mr-1.5" />
              {revokeAllMutation.isPending ? "Revoking..." : `Log out ${otherSessions.length} other session(s)`}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MfaCard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<"idle" | "setup" | "backup">("idle");
  const [setupData, setSetupData] = useState<{ secret: string; uri: string; qrDataUrl?: string } | null>(null);
  const [verifyToken, setVerifyToken] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [disablePassword, setDisablePassword] = useState("");
  const [disableToken, setDisableToken] = useState("");
  const [regenToken, setRegenToken] = useState("");
  const [showDisable, setShowDisable] = useState(false);
  const [showRegen, setShowRegen] = useState(false);

  const { data: mfaStatus, isLoading } = useQuery<any>({ queryKey: ["/api/auth/mfa/status"] });

  const setupMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/auth/mfa/setup");
      return res.json();
    },
    onSuccess: (data) => {
      setSetupData(data);
      setStep("setup");
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const verifySetupMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/auth/mfa/verify-setup", { token: verifyToken });
      return res.json();
    },
    onSuccess: (data) => {
      setBackupCodes(data.backupCodes || []);
      setStep("backup");
      queryClient.invalidateQueries({ queryKey: ["/api/auth/mfa/status"] });
      toast({ title: "MFA enabled", description: "Two-factor authentication is now active on your account." });
    },
    onError: (e: any) => toast({ title: "Invalid token", description: e.message, variant: "destructive" }),
  });

  const disableMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/auth/mfa/disable", { password: disablePassword, token: disableToken }, () => disableMutation.mutate());
      return res.json();
    },
    onSuccess: () => {
      setShowDisable(false);
      setDisablePassword(""); setDisableToken("");
      queryClient.invalidateQueries({ queryKey: ["/api/auth/mfa/status"] });
      toast({ title: "MFA disabled", description: "Two-factor authentication has been removed." });
    },
    onError: (e: any) => {
      if (e?.name !== "StepUpRequiredError") {
        toast({ title: "Error", description: e.message, variant: "destructive" });
      }
    },
  });

  const regenMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/auth/mfa/regenerate-codes", { token: regenToken }, () => regenMutation.mutate());
      return res.json();
    },
    onSuccess: (data) => {
      setBackupCodes(data.backupCodes || []);
      setShowRegen(false); setRegenToken("");
      setStep("backup");
      queryClient.invalidateQueries({ queryKey: ["/api/auth/mfa/status"] });
      toast({ title: "Backup codes regenerated", description: "Save these codes somewhere safe." });
    },
    onError: (e: any) => {
      if (e?.name !== "StepUpRequiredError") {
        toast({ title: "Error", description: e.message, variant: "destructive" });
      }
    },
  });

  if (isLoading) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Shield className="w-4 h-4 text-primary" />
          Two-Factor Authentication (MFA)
        </CardTitle>
        <CardDescription className="text-xs">
          {mfaStatus?.mfaEnabled
            ? "MFA is active on your account. Use your authenticator app to sign in."
            : "Add an extra layer of security to your account with an authenticator app."}
          {mfaStatus?.mfaPolicy && mfaStatus.mfaPolicy !== "optional" && (
            <span className="ml-1 text-amber-600 font-medium">
              (Required by company policy)
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {step === "idle" && !mfaStatus?.mfaEnabled && (
          <Button size="sm" onClick={() => setupMutation.mutate()} disabled={setupMutation.isPending} data-testid="button-setup-mfa">
            <Shield className="w-3.5 h-3.5 mr-1.5" />
            {setupMutation.isPending ? "Setting up..." : "Enable MFA"}
          </Button>
        )}

        {step === "setup" && setupData && (
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium mb-2">1. Scan this QR code with your authenticator app</p>
              <div className="bg-white inline-block p-2 rounded border" data-testid="div-mfa-qr-code">
                {setupData.qrDataUrl ? (
                  <img src={setupData.qrDataUrl} alt="Scan this QR code with your authenticator app" className="w-48 h-48" data-testid="img-mfa-qr" />
                ) : (
                  <p className="text-xs font-mono break-all text-muted-foreground max-w-xs">Setup URI: {setupData.uri}</p>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-2">Or enter this code manually: <span className="font-mono font-medium" data-testid="text-mfa-secret">{setupData.secret}</span></p>
            </div>
            <div>
              <p className="text-sm font-medium mb-2">2. Enter the 6-digit code from your app to confirm</p>
              <div className="flex gap-2">
                <Input
                  value={verifyToken}
                  onChange={e => setVerifyToken(e.target.value)}
                  placeholder="000000"
                  maxLength={6}
                  className="w-32 font-mono"
                  data-testid="input-mfa-verify-token"
                />
                <Button size="sm" onClick={() => verifySetupMutation.mutate()} disabled={verifySetupMutation.isPending || verifyToken.length !== 6} data-testid="button-verify-mfa-setup">
                  {verifySetupMutation.isPending ? "Verifying..." : "Verify & Enable"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setStep("idle"); setSetupData(null); setVerifyToken(""); }}>Cancel</Button>
              </div>
            </div>
          </div>
        )}

        {step === "backup" && backupCodes.length > 0 && (
          <div className="space-y-3">
            <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200 mb-2">Save your backup codes</p>
              <p className="text-xs text-amber-700 dark:text-amber-300 mb-3">These codes can be used to access your account if you lose your authenticator device. Each code can only be used once.</p>
              <div className="grid grid-cols-2 gap-1 font-mono text-sm" data-testid="div-backup-codes">
                {backupCodes.map((code, i) => <span key={i} className="text-amber-900 dark:text-amber-100">{code}</span>)}
              </div>
            </div>
            <Button size="sm" onClick={() => { setStep("idle"); setBackupCodes([]); }} data-testid="button-mfa-done">Done — I've saved my codes</Button>
          </div>
        )}

        {mfaStatus?.mfaEnabled && step === "idle" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400" data-testid="status-mfa-enabled">
              <CheckCircle className="w-4 h-4" />
              MFA enabled{mfaStatus.mfaEnabledAt ? ` since ${format(new Date(mfaStatus.mfaEnabledAt), "d MMM yyyy")}` : ""}
            </div>
            <p className="text-xs text-muted-foreground">Backup codes remaining: <span data-testid="text-backup-codes-count">{mfaStatus.backupCodesCount}</span></p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setShowRegen(!showRegen)} data-testid="button-regen-backup">Regenerate backup codes</Button>
              <Button size="sm" variant="destructive" onClick={() => setShowDisable(!showDisable)} data-testid="button-disable-mfa">Disable MFA</Button>
            </div>
            {showRegen && (
              <div className="flex gap-2 items-center">
                <Input value={regenToken} onChange={e => setRegenToken(e.target.value)} placeholder="Enter current MFA token" maxLength={6} className="w-48 font-mono" data-testid="input-regen-token" />
                <Button size="sm" onClick={() => regenMutation.mutate()} disabled={regenMutation.isPending || regenToken.length !== 6} data-testid="button-confirm-regen">
                  {regenMutation.isPending ? "..." : "Confirm"}
                </Button>
              </div>
            )}
            {showDisable && (
              <div className="space-y-2 bg-muted/40 p-3 rounded-lg">
                <Input type="password" value={disablePassword} onChange={e => setDisablePassword(e.target.value)} placeholder="Current password" data-testid="input-disable-password" />
                <Input value={disableToken} onChange={e => setDisableToken(e.target.value)} placeholder="Current MFA token" maxLength={6} className="font-mono" data-testid="input-disable-token" />
                <div className="flex gap-2">
                  <Button size="sm" variant="destructive" onClick={() => disableMutation.mutate()} disabled={disableMutation.isPending} data-testid="button-confirm-disable-mfa">
                    {disableMutation.isPending ? "Disabling..." : "Confirm Disable MFA"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setShowDisable(false); setDisablePassword(""); setDisableToken(""); }}>Cancel</Button>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PrivacyDataTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: authData } = useQuery<any>({ queryKey: ["/api/auth/me"] });
  const user = authData?.user;
  const company = authData?.company;
  const consentOutdated = authData?.consentOutdated === true;

  const [requestType, setRequestType] = useState<string | null>(null);
  const [requestNote, setRequestNote] = useState("");

  const reacceptMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/auth/accept-terms", {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({ title: "Terms accepted", description: "You have accepted the latest terms and privacy policy." });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const submitRightsMutation = useMutation({
    mutationFn: async (data: { subject: string; message: string }) => {
      const res = await apiRequest("POST", "/api/support-requests", {
        category: "privacy",
        subject: data.subject,
        message: data.message,
        userName: user?.username,
        userEmail: user?.email,
        companyName: company?.name,
        pageContext: "/settings?tab=privacy",
      });
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Request submitted",
        description: `Your data rights request has been received. Reference: ${data.refNumber}`,
      });
      setRequestType(null);
      setRequestNote("");
    },
    onError: (e: any) => {
      toast({ title: "Failed to submit", description: e.message, variant: "destructive" });
    },
  });

  const handleSubmitRight = (type: string) => {
    const labels: Record<string, string> = {
      access: "Data Access Request",
      rectification: "Data Rectification Request",
      erasure: "Right to Erasure (Data Deletion) Request",
      portability: "Data Portability Request",
      objection: "Objection to Processing",
    };
    submitRightsMutation.mutate({
      subject: labels[type] || "Data Rights Request",
      message: `Request type: ${labels[type]}\n\nAdditional notes:\n${requestNote || "(none provided)"}`,
    });
  };

  return (
    <div className="space-y-5">
      {consentOutdated && (
        <Card className="border-yellow-500 bg-yellow-50 dark:bg-yellow-950">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">Updated Terms & Privacy Policy</p>
                <p className="text-xs text-muted-foreground">Our terms or privacy policy have been updated since you last accepted. Please review and accept the latest versions to continue.</p>
              </div>
              <Button size="sm" onClick={() => reacceptMutation.mutate()} disabled={reacceptMutation.isPending} data-testid="button-reaccept-terms">
                {reacceptMutation.isPending ? "Accepting..." : "Accept Updated Terms"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            Your Legal Agreements
          </CardTitle>
          <CardDescription className="text-xs">Documents you accepted when creating your account</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {[
            { label: "Terms of Service", href: "/terms", version: user?.termsVersionAccepted, accepted: user?.termsAcceptedAt },
            { label: "Privacy Policy", href: "/privacy", version: user?.privacyVersionAccepted, accepted: user?.privacyAcceptedAt },
          ].map(doc => (
            <div key={doc.label} className="flex items-center justify-between py-2 border-b last:border-0">
              <div>
                <p className="text-sm font-medium">{doc.label}</p>
                {doc.version && <p className="text-xs text-muted-foreground">Version {doc.version}{doc.accepted ? ` — accepted ${format(new Date(doc.accepted), "d MMM yyyy")}` : ""}</p>}
              </div>
              <Link href={doc.href}>
                <Button size="sm" variant="outline" data-testid={`button-view-${doc.label.toLowerCase().replace(/\s+/g, "-")}`}>
                  View
                </Button>
              </Link>
            </div>
          ))}
          <div className="flex flex-wrap gap-2 pt-2">
            <Link href="/cookies"><Button size="sm" variant="ghost" className="text-xs text-muted-foreground" data-testid="link-cookie-policy">Cookie Policy</Button></Link>
            <Link href="/dpa"><Button size="sm" variant="ghost" className="text-xs text-muted-foreground" data-testid="link-dpa">Data Processing Agreement</Button></Link>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Lock className="w-4 h-4 text-primary" />
            Your Data Rights
          </CardTitle>
          <CardDescription className="text-xs">
            Under UK GDPR, you have rights over your personal data. Use the options below to submit a formal request.
            Requests are processed within 30 days.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {[
            { key: "access", label: "Request data access", description: "Receive a copy of all personal data we hold about you" },
            { key: "rectification", label: "Correct my data", description: "Request correction of inaccurate or incomplete data" },
            { key: "erasure", label: "Delete my data", description: "Request erasure of your personal data (right to be forgotten)" },
            { key: "portability", label: "Export my data", description: "Receive your data in a portable, machine-readable format" },
            { key: "objection", label: "Object to processing", description: "Object to how we process your personal data" },
          ].map(right => (
            <div key={right.key} className="flex items-start justify-between gap-3 py-2 border-b last:border-0">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{right.label}</p>
                <p className="text-xs text-muted-foreground">{right.description}</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setRequestType(requestType === right.key ? null : right.key)}
                data-testid={`button-data-right-${right.key}`}
              >
                Request
              </Button>
            </div>
          ))}

          {requestType && (
            <div className="bg-muted/40 rounded-lg p-3 space-y-2 mt-2">
              <p className="text-sm font-medium">
                {requestType === "access" && "Data Access Request"}
                {requestType === "rectification" && "Data Rectification Request"}
                {requestType === "erasure" && "Right to Erasure Request"}
                {requestType === "portability" && "Data Portability Request"}
                {requestType === "objection" && "Objection to Processing"}
              </p>
              <textarea
                className="w-full text-sm border rounded-md p-2 bg-background resize-y min-h-[60px]"
                placeholder="Add any additional details or context (optional)..."
                value={requestNote}
                onChange={e => setRequestNote(e.target.value)}
                data-testid="textarea-rights-note"
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => handleSubmitRight(requestType)}
                  disabled={submitRightsMutation.isPending}
                  data-testid="button-submit-rights-request"
                >
                  {submitRightsMutation.isPending ? "Submitting..." : "Submit Request"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setRequestType(null); setRequestNote(""); }}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <DataExportCard />

      <AccountDeletionCard companyName={company?.name} />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Leaf className="w-4 h-4 text-primary" />
            Data Use
          </CardTitle>
          <CardDescription className="text-xs">How ESG Manager uses your company data</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>ESG data you enter is stored securely and used only to provide the ESG Manager service to your company.</p>
          <p>We do not sell your data, share it with third parties for advertising, or use it to train AI models without your explicit consent.</p>
          <p>AI features (policy generation, questionnaire autofill) send limited context to OpenAI for processing under a data processing agreement. Personal details are not included in these requests.</p>
          <div className="pt-1">
            <Link href="/privacy">
              <Button size="sm" variant="link" className="p-0 h-auto text-xs" data-testid="link-full-privacy-policy">Read the full Privacy Policy</Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function DataExportCard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showHistory, setShowHistory] = useState(false);
  const { data: authData } = useQuery<any>({ queryKey: ["/api/auth/me"] });
  const isAdmin = authData?.user?.role === "admin" || authData?.user?.role === "super_admin";

  const { data: exports } = useQuery<any[]>({ queryKey: ["/api/gdpr/exports"] });

  const requestExportMutation = useMutation({
    mutationFn: async (scope: string) => {
      const res = await apiRequest("POST", "/api/gdpr/export", { scope }, () => requestExportMutation.mutate(scope));
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/gdpr/exports"] });
      toast({ title: "Export requested", description: "Your data export is being prepared. Check below for the download link once ready." });
    },
    onError: (e: any) => {
      if (e?.name !== "StepUpRequiredError") {
        toast({ title: "Error", description: e.message, variant: "destructive" });
      }
    },
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Key className="w-4 h-4 text-primary" />
          Data Export
        </CardTitle>
        <CardDescription className="text-xs">Download a copy of your data stored in the platform</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => requestExportMutation.mutate("personal")} disabled={requestExportMutation.isPending} data-testid="button-request-personal-export">
            {requestExportMutation.isPending ? "Requesting..." : "Export my personal data"}
          </Button>
          {isAdmin && (
            <Button size="sm" variant="outline" onClick={() => requestExportMutation.mutate("company")} disabled={requestExportMutation.isPending} data-testid="button-request-company-export">
              {requestExportMutation.isPending ? "Requesting..." : "Export all company data"}
            </Button>
          )}
        </div>
        {exports && exports.length > 0 && (
          <div className="space-y-2">
            <button className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setShowHistory(!showHistory)} data-testid="button-toggle-export-history">
              {showHistory ? "Hide" : "Show"} export history ({exports.length})
            </button>
            {showHistory && (
              <div className="space-y-2">
                {exports.slice(0, 5).map((j: any) => (
                  <div key={j.id} className="flex items-center justify-between text-sm py-1.5 border-b last:border-0" data-testid={`row-export-${j.id}`}>
                    <div>
                      <span className="font-medium capitalize">{j.exportScope}</span>
                      <span className="text-muted-foreground ml-2 text-xs">{j.createdAt ? format(new Date(j.createdAt), "d MMM yyyy HH:mm") : ""}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={j.status === "completed" ? "default" : j.status === "failed" ? "destructive" : "secondary"} className="text-xs">{j.status}</Badge>
                      {j.downloadToken && (
                        <a href={`/api/gdpr/download/${j.downloadToken}`} download className="text-xs text-primary underline" data-testid={`link-download-export-${j.id}`}>Download</a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AccountDeletionCard({ companyName }: { companyName?: string }) {
  const { toast } = useToast();
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/gdpr/delete-account", { confirmationText: confirmText }, () => deleteMutation.mutate());
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Account deleted", description: "Your account has been anonymised. You will be logged out." });
      setTimeout(() => window.location.href = "/auth", 2000);
    },
    onError: (e: any) => {
      if (e?.name !== "StepUpRequiredError") {
        toast({ title: "Error", description: e.message, variant: "destructive" });
      }
    },
  });

  return (
    <Card className="border-destructive/30">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2 text-destructive">
          <Trash2 className="w-4 h-4" />
          Delete Account
        </CardTitle>
        <CardDescription className="text-xs">Permanently anonymise your account. This action cannot be undone.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!showConfirm ? (
          <Button size="sm" variant="destructive" onClick={() => setShowConfirm(true)} data-testid="button-delete-account">
            Delete my account
          </Button>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-destructive font-medium">Are you sure? Type <strong>delete my account</strong> to confirm:</p>
            <Input
              value={confirmText}
              onChange={e => setConfirmText(e.target.value)}
              placeholder="delete my account"
              data-testid="input-delete-account-confirm"
            />
            <div className="flex gap-2">
              <Button size="sm" variant="destructive" onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending || confirmText !== "delete my account"} data-testid="button-confirm-delete-account">
                {deleteMutation.isPending ? "Deleting..." : "Confirm Delete"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setShowConfirm(false); setConfirmText(""); }}>Cancel</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AdminPanel() {
  const [section, setSection] = useState("users");

  const sections = [
    { key: "users", label: "Users & Roles", icon: Users },
    { key: "mfa", label: "MFA Policy", icon: Shield },
    { key: "modules", label: "Module Configuration", icon: ToggleLeft },
    { key: "scoring", label: "Scoring Weights", icon: Scale },
    { key: "metrics", label: "Metric Settings", icon: BarChart3 },
    { key: "templates", label: "Policy Templates", icon: Library },
    { key: "factors", label: "Emission Factors", icon: Leaf },
    { key: "workflow", label: "Approval Workflow", icon: ClipboardCheck },
    { key: "reminders", label: "Reminders", icon: Clock },
    { key: "branding", label: "Report Branding", icon: Palette },
    { key: "periods", label: "Reporting Periods", icon: Calendar },
    { key: "audit", label: "Audit Log", icon: Search },
    { key: "security", label: "Security & API Keys", icon: Shield },
    { key: "gdpr", label: "Company Data", icon: Trash2 },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {sections.map(s => (
          <Button
            key={s.key}
            variant={section === s.key ? "default" : "outline"}
            size="sm"
            className="text-xs h-8"
            onClick={() => setSection(s.key)}
            data-testid={`admin-section-${s.key}`}
          >
            <s.icon className="w-3.5 h-3.5 mr-1.5" />
            {s.label}
          </Button>
        ))}
      </div>

      {section === "users" && <UserManagement />}
      {section === "mfa" && <MfaPolicyAdmin />}
      {section === "modules" && <ModuleConfiguration />}
      {section === "scoring" && <ScoringWeights />}
      {section === "metrics" && <MetricsAdmin />}
      {section === "templates" && <PolicyTemplateAdmin />}
      {section === "factors" && <EmissionFactorAdmin />}
      {section === "workflow" && <WorkflowSettings />}
      {section === "reminders" && <ReminderSettings />}
      {section === "branding" && <ReportBranding />}
      {section === "periods" && <ReportingPeriodsAdmin />}
      {section === "audit" && <AuditLogAdmin />}
      {section === "security" && <SecurityAdmin />}
      {section === "gdpr" && <CompanyGdprAdmin />}
    </div>
  );
}

function UserManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: users, isLoading } = useQuery<any[]>({
    queryKey: ["/api/users"],
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId: targetUserId, role }: { userId: string; role: string }) => {
      await apiRequest("PUT", `/api/users/${targetUserId}/role`, { role }, () => updateRoleMutation.mutate({ userId: targetUserId, role }));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"] });
      toast({ title: "Role updated", description: "User role has been changed successfully." });
    },
    onError: (e: any) => {
      if (e?.name !== "StepUpRequiredError") {
        toast({ title: "Failed to update role", description: e.message || "Something went wrong", variant: "destructive" });
      }
    },
  });

  const ROLES = [
    { value: "admin", label: "Admin", desc: "Full access to all features and settings" },
    { value: "contributor", label: "Contributor", desc: "Can enter data, edit policies, answer questionnaires" },
    { value: "approver", label: "Approver", desc: "Can review submissions and generate reports" },
    { value: "viewer", label: "Viewer", desc: "Read-only access across the platform" },
  ];

  return (
    <Card data-testid="card-admin-users">
      <CardHeader className="pb-4">
        <CardTitle className="text-sm flex items-center gap-2">
          <Users className="w-4 h-4" />
          User & Role Management
        </CardTitle>
        <CardDescription className="text-xs">Assign roles to control what each team member can access</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {ROLES.map(r => (
            <div key={r.value} className="border border-border rounded-md p-2">
              <p className="text-xs font-medium capitalize">{r.label}</p>
              <p className="text-[10px] text-muted-foreground">{r.desc}</p>
            </div>
          ))}
        </div>
        {isLoading ? (
          <Skeleton className="h-24" />
        ) : !users || users.length === 0 ? (
          <p className="text-xs text-muted-foreground">No users found.</p>
        ) : (
          <div className="space-y-2">
            {users.map((u: any) => (
              <div
                key={u.id}
                className="flex items-center justify-between py-2 px-3 border border-border rounded-md"
                data-testid={`user-row-${u.id}`}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate" data-testid={`text-user-name-${u.id}`}>{u.username}</p>
                  <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                </div>
                <Select
                  value={u.role}
                  onValueChange={(role) => updateRoleMutation.mutate({ userId: u.id, role })}
                  disabled={updateRoleMutation.isPending}
                >
                  <SelectTrigger className="w-[140px] h-8 text-xs" data-testid={`select-role-${u.id}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => (
                      <SelectItem key={r.value} value={r.value} data-testid={`option-role-${r.value}`}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ModuleConfiguration() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery<any>({
    queryKey: ["/api/company/settings"],
  });

  const updateMutation = useMutation({
    mutationFn: (data: any) => apiRequest("PUT", "/api/company/settings", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/company/settings"] });
      toast({ title: "Module settings updated" });
    },
    onError: () => toast({ title: "Update failed", variant: "destructive" }),
  });

  const modules = [
    { key: "trackEnergy", label: "Energy & Emissions", desc: "Track electricity, gas, and fuel consumption" },
    { key: "trackWaste", label: "Waste Management", desc: "Track waste generation, recycling, and landfill diversion" },
    { key: "trackWater", label: "Water Usage", desc: "Track water consumption and efficiency" },
    { key: "trackDiversity", label: "Diversity & Inclusion", desc: "Track workforce diversity and gender pay gap" },
    { key: "trackTraining", label: "Training & Development", desc: "Track employee training hours and investment" },
    { key: "trackHealthSafety", label: "Health & Safety", desc: "Track incidents, near-misses, and safety metrics" },
    { key: "trackGovernance", label: "Governance", desc: "Track governance policies, whistleblowing, and compliance" },
  ];

  if (isLoading) return <Skeleton className="h-48" />;

  const handleToggle = (key: string, value: boolean) => {
    updateMutation.mutate({ ...settings, [key]: value });
  };

  return (
    <Card data-testid="card-admin-modules">
      <CardHeader className="pb-4">
        <CardTitle className="text-sm flex items-center gap-2">
          <ToggleLeft className="w-4 h-4" />
          Module Configuration
        </CardTitle>
        <CardDescription className="text-xs">Enable or disable ESG tracking modules for your company</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {modules.map(m => (
            <div key={m.key} className="flex items-center justify-between py-2 px-3 border border-border rounded-md" data-testid={`module-row-${m.key}`}>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{m.label}</p>
                <p className="text-xs text-muted-foreground">{m.desc}</p>
              </div>
              <Switch
                checked={settings?.[m.key] ?? true}
                onCheckedChange={(v) => handleToggle(m.key, v)}
                disabled={updateMutation.isPending}
                data-testid={`switch-module-${m.key}`}
              />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ScoringWeights() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: metrics = [] } = useQuery<any[]>({ queryKey: ["/api/metrics/all"] });

  const categories = ["Environmental", "Social", "Governance"];

  const updateMutation = useMutation({
    mutationFn: async ({ id, weight, importance }: { id: string; weight: string; importance: string }) => {
      return apiRequest("PUT", `/api/metrics/${id}/admin`, { weight, importance });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/metrics/all"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/enhanced"] });
      toast({ title: "Scoring weight updated" });
    },
    onError: () => toast({ title: "Update failed", variant: "destructive" }),
  });

  const enabledMetrics = metrics.filter((m: any) => m.enabled !== false);
  const grouped = categories.map(cat => ({
    category: cat,
    items: enabledMetrics.filter((m: any) => m.category?.toLowerCase() === cat.toLowerCase()),
  }));

  const totalWeight = enabledMetrics.reduce((sum: number, m: any) => sum + (parseFloat(m.weight) || 1), 0);

  return (
    <Card data-testid="card-admin-scoring">
      <CardHeader className="pb-4">
        <CardTitle className="text-sm flex items-center gap-2">
          <Scale className="w-4 h-4" />
          Scoring Weight Configuration
        </CardTitle>
        <CardDescription className="text-xs">
          Set weights and importance for each metric. Higher weights increase a metric's influence on the overall ESG score. Total weight across all metrics: {totalWeight.toFixed(1)}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {grouped.map(g => (
            <div key={g.category}>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{g.category}</p>
              <div className="space-y-1.5">
                {g.items.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No metrics in this category.</p>
                ) : g.items.map((m: any) => (
                  <div key={m.id} className="flex items-center gap-3 py-1.5 px-2 border border-border rounded-md text-xs" data-testid={`scoring-metric-${m.id}`}>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{m.name}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Label className="text-[10px] text-muted-foreground">Weight</Label>
                      <Input
                        type="number"
                        step="0.1"
                        min="0"
                        max="10"
                        className="w-16 h-7 text-xs"
                        defaultValue={m.weight || "1"}
                        onBlur={(e) => {
                          const newWeight = e.target.value;
                          if (newWeight !== String(m.weight || "1")) {
                            updateMutation.mutate({ id: m.id, weight: newWeight, importance: m.importance || "standard" });
                          }
                        }}
                        data-testid={`input-weight-${m.id}`}
                      />
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Label className="text-[10px] text-muted-foreground">Priority</Label>
                      <Select
                        defaultValue={m.importance || "standard"}
                        onValueChange={(v) => updateMutation.mutate({ id: m.id, weight: String(m.weight || "1"), importance: v })}
                      >
                        <SelectTrigger className="w-24 h-7 text-xs" data-testid={`select-importance-${m.id}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="critical">Critical</SelectItem>
                          <SelectItem value="high">High</SelectItem>
                          <SelectItem value="standard">Standard</SelectItem>
                          <SelectItem value="low">Low</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function MetricsAdmin() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editingMetric, setEditingMetric] = useState<any | null>(null);
  const [selectedMetrics, setSelectedMetrics] = useState<Set<string>>(new Set());
  const [bulkAssignUserId, setBulkAssignUserId] = useState("");

  const { data: metrics = [] } = useQuery<any[]>({ queryKey: ["/api/metrics/all"] });
  const { data: companyUsers = [] } = useQuery<any[]>({ queryKey: ["/api/users"] });

  const [direction, setDirection] = useState("");
  const [targetValue, setTargetValue] = useState("");
  const [targetMin, setTargetMin] = useState("");
  const [targetMax, setTargetMax] = useState("");
  const [amberThreshold, setAmberThreshold] = useState("");
  const [redThreshold, setRedThreshold] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [helpText, setHelpText] = useState("");
  const [dataOwner, setDataOwner] = useState("");

  const openEditor = (m: any) => {
    setEditingMetric(m);
    setDirection(m.direction || "higher_is_better");
    setTargetValue(m.targetValue ? String(m.targetValue) : "");
    setTargetMin(m.targetMin ? String(m.targetMin) : "");
    setTargetMax(m.targetMax ? String(m.targetMax) : "");
    setAmberThreshold(m.amberThreshold ? String(m.amberThreshold) : "5");
    setRedThreshold(m.redThreshold ? String(m.redThreshold) : "15");
    setEnabled(m.enabled !== false);
    setHelpText(m.helpText || "");
    setDataOwner(m.dataOwner || "");
  };

  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("PUT", `/api/metrics/${editingMetric.id}/admin`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/metrics/all"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/enhanced"] });
      queryClient.invalidateQueries({ queryKey: ["/api/metrics"] });
      setEditingMetric(null);
      toast({ title: "Metric settings updated" });
    },
    onError: () => toast({ title: "Update failed", variant: "destructive" }),
  });

  const bulkAssignMutation = useMutation({
    mutationFn: async ({ entityIds, assignedUserId }: { entityIds: string[]; assignedUserId: string }) => {
      const resp = await apiRequest("PUT", "/api/assign/bulk", {
        entityType: "metrics",
        entityIds,
        assignedUserId,
      });
      return resp.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/metrics/all"] });
      queryClient.invalidateQueries({ queryKey: ["/api/metrics"] });
      queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"] });
      const assignedUser = companyUsers.find((u: any) => u.id === bulkAssignUserId);
      const userName = assignedUser?.username || "selected user";
      toast({
        title: `${data.succeeded} metrics assigned to ${userName}`,
        description: data.failed > 0 ? `${data.failed} failed` : undefined,
      });
      setSelectedMetrics(new Set());
      setBulkAssignUserId("");
    },
    onError: () => toast({ title: "Bulk assign failed", variant: "destructive" }),
  });

  const handleSave = () => {
    updateMutation.mutate({
      direction,
      targetValue: targetValue || null,
      targetMin: targetMin || null,
      targetMax: targetMax || null,
      amberThreshold: amberThreshold || "5",
      redThreshold: redThreshold || "15",
      enabled,
      helpText,
      dataOwner,
    });
  };

  const toggleMetricSelection = (id: string) => {
    setSelectedMetrics(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedMetrics.size === metrics.length) {
      setSelectedMetrics(new Set());
    } else {
      setSelectedMetrics(new Set(metrics.map((m: any) => m.id)));
    }
  };

  const handleBulkAssign = () => {
    if (!bulkAssignUserId || selectedMetrics.size === 0) return;
    bulkAssignMutation.mutate({
      entityIds: Array.from(selectedMetrics),
      assignedUserId: bulkAssignUserId,
    });
  };

  const enabledCount = metrics.filter((m: any) => m.enabled !== false).length;

  return (
    <>
      <Card data-testid="card-admin-metrics">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-primary" />
            Metric Activation & Thresholds
          </CardTitle>
          <CardDescription className="text-xs">
            Enable/disable metrics, set targets, and configure traffic-light thresholds. {enabledCount} of {metrics.length} metrics active.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Checkbox
                checked={metrics.length > 0 && selectedMetrics.size === metrics.length}
                onCheckedChange={toggleSelectAll}
                data-testid="checkbox-select-all-metrics"
              />
              <span className="text-xs text-muted-foreground" data-testid="text-selected-count">
                {selectedMetrics.size > 0 ? `${selectedMetrics.size} selected` : "Select all"}
              </span>
            </div>
            {selectedMetrics.size > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <Select value={bulkAssignUserId} onValueChange={setBulkAssignUserId}>
                  <SelectTrigger className="w-[180px] text-xs" data-testid="select-bulk-assign-user">
                    <SelectValue placeholder="Choose user..." />
                  </SelectTrigger>
                  <SelectContent>
                    {companyUsers.map((u: any) => (
                      <SelectItem key={u.id} value={u.id}>{u.username}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  disabled={!bulkAssignUserId || bulkAssignMutation.isPending}
                  onClick={handleBulkAssign}
                  data-testid="button-bulk-assign"
                >
                  <UserPlus className="w-3.5 h-3.5 mr-1.5" />
                  {bulkAssignMutation.isPending ? "Assigning..." : "Assign Selected"}
                </Button>
              </div>
            )}
          </div>
          <div className="space-y-1 max-h-96 overflow-y-auto">
            {metrics.map((m: any) => (
              <div
                key={m.id}
                className="flex items-center gap-3 py-2 px-2 rounded-md hover:bg-muted/50 cursor-pointer text-xs"
                onClick={() => openEditor(m)}
                data-testid={`admin-metric-${m.id}`}
              >
                <div onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={selectedMetrics.has(m.id)}
                    onCheckedChange={() => toggleMetricSelection(m.id)}
                    data-testid={`checkbox-metric-${m.id}`}
                  />
                </div>
                <div className={`w-2 h-2 rounded-full shrink-0 ${m.enabled === false ? "bg-gray-300" : "bg-emerald-500"}`} />
                <div className="flex-1 min-w-0">
                  <p className={`font-medium truncate ${m.enabled === false ? "text-muted-foreground line-through" : ""}`}>{m.name}</p>
                  <p className="text-muted-foreground">{m.category} · {m.metricType || "manual"} · {(m.direction || "higher_is_better").replace(/_/g, " ")}</p>
                </div>
                {m.enabled === false && <Badge variant="outline" className="text-[10px]">Disabled</Badge>}
                <div onClick={(e) => e.stopPropagation()}>
                  <OwnerAssignment entityType="metrics" entityId={m.id} currentUserId={m.assignedUserId} invalidateKeys={[["/api/metrics/all"], ["/api/metrics"]]} />
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!editingMetric} onOpenChange={(open) => !open && setEditingMetric(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">Configure: {editingMetric?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Scoring Direction</Label>
              <Select value={direction} onValueChange={setDirection}>
                <SelectTrigger data-testid="select-direction"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="higher_is_better">Higher is better</SelectItem>
                  <SelectItem value="lower_is_better">Lower is better</SelectItem>
                  <SelectItem value="target_range">Target range</SelectItem>
                  <SelectItem value="compliance_yes_no">Compliance (Yes/No)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {direction === "target_range" ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Target Min</Label>
                  <Input type="number" step="any" value={targetMin} onChange={e => setTargetMin(e.target.value)} data-testid="input-target-min" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Target Max</Label>
                  <Input type="number" step="any" value={targetMax} onChange={e => setTargetMax(e.target.value)} data-testid="input-target-max" />
                </div>
              </div>
            ) : direction !== "compliance_yes_no" ? (
              <div className="space-y-1.5">
                <Label className="text-xs">Target Value ({editingMetric?.unit})</Label>
                <Input type="number" step="any" value={targetValue} onChange={e => setTargetValue(e.target.value)} data-testid="input-target-value" />
              </div>
            ) : null}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1">
                  Amber Threshold
                  <span className="text-muted-foreground">(% deviation)</span>
                </Label>
                <Input type="number" step="any" value={amberThreshold} onChange={e => setAmberThreshold(e.target.value)} data-testid="input-amber-threshold" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1">
                  Red Threshold
                  <span className="text-muted-foreground">(% deviation)</span>
                </Label>
                <Input type="number" step="any" value={redThreshold} onChange={e => setRedThreshold(e.target.value)} data-testid="input-red-threshold" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Data Owner</Label>
              <Input value={dataOwner} onChange={e => setDataOwner(e.target.value)} data-testid="input-data-owner" />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Help Text</Label>
              <Textarea value={helpText} onChange={e => setHelpText(e.target.value)} className="text-xs min-h-12 resize-none" data-testid="input-help-text" />
            </div>

            <div className="flex items-center justify-between">
              <Label className="text-xs">Metric Enabled</Label>
              <Switch checked={enabled} onCheckedChange={setEnabled} data-testid="switch-metric-enabled" />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setEditingMetric(null)}>Cancel</Button>
              <Button size="sm" onClick={handleSave} disabled={updateMutation.isPending} data-testid="button-save-metric-admin">
                <Save className="w-3.5 h-3.5 mr-1.5" />
                {updateMutation.isPending ? "Saving..." : "Save Settings"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function PolicyTemplateAdmin() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [editSections, setEditSections] = useState<any[]>([]);
  const [editReviewCycle, setEditReviewCycle] = useState("");
  const [editCompliance, setEditCompliance] = useState<any>({});
  const [editDescription, setEditDescription] = useState("");
  const [editEnabled, setEditEnabled] = useState(true);

  const { data: templates = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/policy-templates"],
  });

  const updateMutation = useMutation({
    mutationFn: async ({ slug, data }: { slug: string; data: any }) => {
      const res = await apiRequest("PUT", `/api/policy-templates/${slug}/admin`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/policy-templates"] });
      setEditingSlug(null);
      toast({ title: "Template updated" });
    },
    onError: () => toast({ title: "Update failed", variant: "destructive" }),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ slug, enabled }: { slug: string; enabled: boolean }) => {
      return apiRequest("PUT", `/api/policy-templates/${slug}/admin`, { enabled });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/policy-templates"] });
      toast({ title: "Template status updated" });
    },
    onError: () => toast({ title: "Update failed", variant: "destructive" }),
  });

  const openEditor = (t: any) => {
    setEditSections(JSON.parse(JSON.stringify(t.sections)));
    setEditReviewCycle(t.defaultReviewCycle || "annual");
    setEditCompliance(JSON.parse(JSON.stringify(t.complianceMapping || {})));
    setEditDescription(t.description || "");
    setEditEnabled(t.enabled !== false);
    setEditingSlug(t.slug);
  };

  const handleSectionChange = (index: number, field: string, value: string) => {
    setEditSections(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const handleSave = () => {
    if (!editingSlug) return;
    updateMutation.mutate({
      slug: editingSlug,
      data: {
        sections: editSections,
        defaultReviewCycle: editReviewCycle,
        description: editDescription,
        complianceMapping: editCompliance,
        enabled: editEnabled,
      },
    });
  };

  const editingTemplate = templates.find((t: any) => t.slug === editingSlug);
  const activeCount = templates.filter((t: any) => t.enabled !== false).length;

  return (
    <>
      <Card data-testid="card-admin-templates">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Library className="w-4 h-4 text-primary" />
            Policy Template Administration
          </CardTitle>
          <CardDescription className="text-xs">
            Activate/deactivate templates and edit clause text. {activeCount} of {templates.length} templates active.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-32" />
          ) : (
            <div className="space-y-1 max-h-96 overflow-y-auto">
              {templates.map((t: any) => (
                <div
                  key={t.slug}
                  className="flex items-center gap-3 py-2 px-2 rounded-md hover:bg-muted/50 text-xs"
                  data-testid={`admin-template-${t.slug}`}
                >
                  <Switch
                    checked={t.enabled !== false}
                    onCheckedChange={(v) => toggleMutation.mutate({ slug: t.slug, enabled: v })}
                    className="shrink-0"
                    data-testid={`switch-template-${t.slug}`}
                  />
                  <div
                    className="flex-1 min-w-0 cursor-pointer"
                    onClick={() => openEditor(t)}
                  >
                    <p className={`font-medium truncate ${t.enabled === false ? "text-muted-foreground line-through" : ""}`}>{t.name}</p>
                    <p className="text-muted-foreground">{t.category} · Review: {t.defaultReviewCycle}</p>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-muted-foreground cursor-pointer" onClick={() => openEditor(t)} />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editingSlug} onOpenChange={(open) => !open && setEditingSlug(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-sm">Edit: {editingTemplate?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Template Active</Label>
              <Switch checked={editEnabled} onCheckedChange={setEditEnabled} data-testid="switch-template-edit-enabled" />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Template Description</Label>
              <Textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                className="text-xs min-h-12 resize-none"
                data-testid="admin-template-description"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Default Review Cycle</Label>
                <Select value={editReviewCycle} onValueChange={setEditReviewCycle}>
                  <SelectTrigger data-testid="select-review-cycle">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                    <SelectItem value="bi-annual">Bi-annual</SelectItem>
                    <SelectItem value="annual">Annual</SelectItem>
                    <SelectItem value="every-2-years">Every 2 years</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">ISO Standards (comma-separated)</Label>
                <Input
                  value={(editCompliance.isoStandards || []).join(", ")}
                  onChange={(e) => setEditCompliance((prev: any) => ({ ...prev, isoStandards: e.target.value.split(",").map((s: string) => s.trim()).filter(Boolean) }))}
                  className="text-xs"
                  data-testid="admin-iso-standards"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Legal Drivers (comma-separated)</Label>
              <Input
                value={(editCompliance.legalDrivers || []).join(", ")}
                onChange={(e) => setEditCompliance((prev: any) => ({ ...prev, legalDrivers: e.target.value.split(",").map((s: string) => s.trim()).filter(Boolean) }))}
                className="text-xs"
                data-testid="admin-legal-drivers"
              />
            </div>

            <div className="space-y-3">
              <Label className="text-xs font-semibold">Section Clause Text & Prompt Hints</Label>
              {editSections.map((section: any, i: number) => (
                <Card key={section.key} className="p-3 space-y-2">
                  <p className="text-xs font-medium">{section.label}</p>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Default Clause Text</Label>
                    <Textarea
                      value={section.defaultClauseText || ""}
                      onChange={(e) => handleSectionChange(i, "defaultClauseText", e.target.value)}
                      placeholder="Default clause text (used as fallback if generation is not available)"
                      className="text-xs min-h-16 resize-none"
                      data-testid={`admin-clause-${section.key}`}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Prompt Hint</Label>
                    <Textarea
                      value={section.aiPromptHint || ""}
                      onChange={(e) => handleSectionChange(i, "aiPromptHint", e.target.value)}
                      className="text-xs min-h-12 resize-none"
                      data-testid={`admin-hint-${section.key}`}
                    />
                  </div>
                </Card>
              ))}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setEditingSlug(null)}>Cancel</Button>
              <Button size="sm" onClick={handleSave} disabled={updateMutation.isPending} data-testid="button-save-template-admin">
                <Save className="w-3.5 h-3.5 mr-1.5" />
                {updateMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function EmissionFactorAdmin() {
  const { data: factorSets = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/emission-factor-sets"],
  });

  const { data: settings, isLoading: settingsLoading } = useQuery<any>({
    queryKey: ["/api/company/settings"],
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const updateMutation = useMutation({
    mutationFn: (data: any) => apiRequest("PUT", "/api/company/settings", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/company/settings"] });
      toast({ title: "Emission factor set updated" });
    },
    onError: () => toast({ title: "Update failed", variant: "destructive" }),
  });

  if (isLoading || settingsLoading) return <Skeleton className="h-32" />;

  const currentSet = settings?.emissionFactorSet || "UK_DEFRA_2024";

  return (
    <Card data-testid="card-admin-factors">
      <CardHeader className="pb-4">
        <CardTitle className="text-sm flex items-center gap-2">
          <Leaf className="w-4 h-4" />
          Emission Factor Version
        </CardTitle>
        <CardDescription className="text-xs">
          Select which emission factor dataset to use for carbon calculations
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          {factorSets.length === 0 ? (
            <p className="text-xs text-muted-foreground">No emission factor sets available.</p>
          ) : factorSets.map((fs: any) => (
            <div
              key={fs.key}
              className={`flex items-center justify-between py-3 px-3 border rounded-md cursor-pointer transition-colors ${
                currentSet === fs.key ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
              }`}
              onClick={() => updateMutation.mutate({ ...settings, emissionFactorSet: fs.key })}
              data-testid={`factor-set-${fs.key}`}
            >
              <div>
                <p className="text-sm font-medium">{fs.label}</p>
                <p className="text-xs text-muted-foreground">{fs.count} factors · Year {fs.year}</p>
              </div>
              {currentSet === fs.key && (
                <Badge variant="default" className="text-[10px]">Active</Badge>
              )}
            </div>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground">
          Changing the emission factor set affects all future carbon calculations. Existing calculations retain the factor set used at the time of calculation.
        </p>
      </CardContent>
    </Card>
  );
}

function WorkflowSettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery<any>({
    queryKey: ["/api/company/settings"],
  });

  const updateMutation = useMutation({
    mutationFn: (data: any) => apiRequest("PUT", "/api/company/settings", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/company/settings"] });
      toast({ title: "Workflow settings updated" });
    },
    onError: () => toast({ title: "Update failed", variant: "destructive" }),
  });

  if (isLoading) return <Skeleton className="h-48" />;

  const handleToggle = (key: string, value: boolean) => {
    updateMutation.mutate({ ...settings, [key]: value });
  };

  const workflowItems = [
    {
      key: "requireApprovalMetrics",
      label: "Require approval for metric data submissions",
      desc: "When enabled, metric values submitted by contributors must be approved before they are included in reports and scoring.",
    },
    {
      key: "requireApprovalReports",
      label: "Require approval for generated reports",
      desc: "When enabled, generated reports are marked as draft until reviewed and approved by an approver.",
    },
    {
      key: "requireApprovalPolicies",
      label: "Require approval for policy documents",
      desc: "When enabled, generated policies must go through the review workflow before being finalised.",
    },
    {
      key: "autoLockApproved",
      label: "Auto-lock approved items",
      desc: "When enabled, approved items are automatically locked to prevent further edits without re-submitting.",
    },
  ];

  return (
    <Card data-testid="card-admin-workflow">
      <CardHeader className="pb-4">
        <CardTitle className="text-sm flex items-center gap-2">
          <ClipboardCheck className="w-4 h-4" />
          Approval Workflow Settings
        </CardTitle>
        <CardDescription className="text-xs">
          Configure which items require formal approval before being finalised
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {workflowItems.map(w => (
            <div key={w.key} className="flex items-start justify-between gap-4 py-2 px-3 border border-border rounded-md" data-testid={`workflow-row-${w.key}`}>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{w.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{w.desc}</p>
              </div>
              <Switch
                checked={settings?.[w.key] ?? (w.key === "requireApprovalMetrics" ? false : true)}
                onCheckedChange={(v) => handleToggle(w.key, v)}
                disabled={updateMutation.isPending}
                className="shrink-0 mt-0.5"
                data-testid={`switch-workflow-${w.key}`}
              />
            </div>
          ))}
        </div>
        <div className="mt-4 p-3 bg-muted/50 rounded-md">
          <p className="text-xs font-medium flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5" />
            Workflow States
          </p>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {["Draft", "Submitted", "Approved", "Rejected", "Archived"].map(s => (
              <Badge key={s} variant="outline" className="text-[10px]">{s}</Badge>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground mt-1.5">
            Items move through these states: Draft → Submitted → Approved/Rejected. Rejected items can be resubmitted. Approved items can be archived.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function ReminderSettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: settings } = useQuery<any>({ queryKey: ["/api/company/settings"] });
  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("PUT", "/api/company/settings", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/company/settings"] });
      toast({ title: "Reminder settings updated" });
    },
  });

  return (
    <Card data-testid="card-reminder-settings">
      <CardHeader className="pb-4">
        <CardTitle className="text-sm flex items-center gap-2">
          <Clock className="w-4 h-4" />
          Automated Reminders
        </CardTitle>
        <CardDescription className="text-xs">
          Configure automated reminder generation for missing data, expiring evidence, and overdue items
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start justify-between gap-4 py-2 px-3 border border-border rounded-md">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">Enable automated reminders</p>
            <p className="text-xs text-muted-foreground mt-0.5">When enabled, the system generates reminders for missing data, expiring evidence, overdue actions, and pending approvals</p>
          </div>
          <Switch
            checked={settings?.reminderEnabled ?? true}
            onCheckedChange={(v) => updateMutation.mutate({ ...settings, reminderEnabled: v })}
            disabled={updateMutation.isPending}
            data-testid="switch-reminder-enabled"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Reminder frequency</Label>
          <Select
            value={settings?.reminderFrequency || "daily"}
            onValueChange={(v) => updateMutation.mutate({ ...settings, reminderFrequency: v })}
          >
            <SelectTrigger className="w-40" data-testid="select-reminder-frequency">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">Daily</SelectItem>
              <SelectItem value="weekly">Weekly</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="p-3 bg-muted/50 rounded-md">
          <p className="text-xs font-medium">Reminder schedule</p>
          <ul className="text-[10px] text-muted-foreground mt-1.5 space-y-0.5 list-disc pl-3">
            <li>Missing metric data: start of each reporting period</li>
            <li>Evidence expiry: 60, 30, 14, 7 days before expiry</li>
            <li>Overdue actions: daily after due date</li>
            <li>Pending approvals: every 3 days after submission</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

function ReportBranding() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery<any>({
    queryKey: ["/api/company/settings"],
  });

  const [brandName, setBrandName] = useState("");
  const [brandTagline, setBrandTagline] = useState("");
  const [brandColor, setBrandColor] = useState("#228B53");
  const [brandFooter, setBrandFooter] = useState("");
  const [initialized, setInitialized] = useState(false);

  if (settings && !initialized) {
    setBrandName(settings.reportBrandingName || "");
    setBrandTagline(settings.reportBrandingTagline || "");
    setBrandColor(settings.reportBrandingColor || "#228B53");
    setBrandFooter(settings.reportBrandingFooter || "");
    setInitialized(true);
  }

  const updateMutation = useMutation({
    mutationFn: (data: any) => apiRequest("PUT", "/api/company/settings", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/company/settings"] });
      toast({ title: "Report branding saved" });
    },
    onError: () => toast({ title: "Update failed", variant: "destructive" }),
  });

  if (isLoading) return <Skeleton className="h-48" />;

  const handleSave = () => {
    updateMutation.mutate({
      ...settings,
      reportBrandingName: brandName || null,
      reportBrandingTagline: brandTagline || null,
      reportBrandingColor: brandColor || null,
      reportBrandingFooter: brandFooter || null,
    });
  };

  return (
    <Card data-testid="card-admin-branding">
      <CardHeader className="pb-4">
        <CardTitle className="text-sm flex items-center gap-2">
          <Palette className="w-4 h-4" />
          Report Branding
        </CardTitle>
        <CardDescription className="text-xs">
          Customise the appearance of generated ESG reports with your company branding
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Report Header Name</Label>
            <Input
              value={brandName}
              onChange={e => setBrandName(e.target.value)}
              placeholder="e.g. Acme Corp ESG Report"
              data-testid="input-brand-name"
            />
            <p className="text-[10px] text-muted-foreground">Appears at the top of all generated reports</p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Tagline / Subtitle</Label>
            <Input
              value={brandTagline}
              onChange={e => setBrandTagline(e.target.value)}
              placeholder="e.g. Committed to sustainable growth"
              data-testid="input-brand-tagline"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Brand Colour</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={brandColor}
                onChange={e => setBrandColor(e.target.value)}
                className="w-8 h-8 rounded border border-border cursor-pointer"
                data-testid="input-brand-color"
              />
              <Input
                value={brandColor}
                onChange={e => setBrandColor(e.target.value)}
                className="flex-1"
                placeholder="#228B53"
                data-testid="input-brand-color-text"
              />
            </div>
            <p className="text-[10px] text-muted-foreground">Used for report headers and accent elements</p>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Report Footer Text</Label>
          <Textarea
            value={brandFooter}
            onChange={e => setBrandFooter(e.target.value)}
            placeholder="e.g. Confidential — For internal use only. © 2025 Acme Corp."
            className="text-xs min-h-16 resize-none"
            data-testid="input-brand-footer"
          />
          <p className="text-[10px] text-muted-foreground">Appears at the bottom of each report page</p>
        </div>

        <div className="border border-border rounded-md p-4">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Preview</p>
          <div className="border-l-4 pl-3" style={{ borderColor: brandColor }}>
            <p className="text-sm font-semibold" style={{ color: brandColor }}>{brandName || "Company ESG Report"}</p>
            {brandTagline && <p className="text-xs text-muted-foreground">{brandTagline}</p>}
          </div>
          {brandFooter && (
            <div className="mt-3 pt-2 border-t border-border">
              <p className="text-[10px] text-muted-foreground">{brandFooter}</p>
            </div>
          )}
        </div>

        <div className="flex justify-end pt-2">
          <Button size="sm" onClick={handleSave} disabled={updateMutation.isPending} data-testid="button-save-branding">
            <Save className="w-3.5 h-3.5 mr-1.5" />
            {updateMutation.isPending ? "Saving..." : "Save Branding"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ReportingPeriodsAdmin() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [copyOpen, setCopyOpen] = useState<string | null>(null);
  const [periodName, setPeriodName] = useState("");
  const [periodType, setPeriodType] = useState("quarterly");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [copyName, setCopyName] = useState("");
  const [copyType, setCopyType] = useState("quarterly");
  const [copyStart, setCopyStart] = useState("");
  const [copyEnd, setCopyEnd] = useState("");

  const { data: periods = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/reporting-periods"],
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/reporting-periods", {
        name: periodName, periodType, startDate, endDate,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Reporting period created" });
      queryClient.invalidateQueries({ queryKey: ["/api/reporting-periods"] });
      setCreateOpen(false);
      setPeriodName("");
      setStartDate("");
      setEndDate("");
    },
    onError: (e: any) => {
      toast({ title: "Failed to create period", description: e.message, variant: "destructive" });
    },
  });

  const closeMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/reporting-periods/${id}/close`, {});
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Period closed" });
      queryClient.invalidateQueries({ queryKey: ["/api/reporting-periods"] });
    },
  });

  const lockMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/reporting-periods/${id}/lock`, {});
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Period locked" });
      queryClient.invalidateQueries({ queryKey: ["/api/reporting-periods"] });
    },
  });

  const copyMutation = useMutation({
    mutationFn: async (sourceId: string) => {
      const res = await apiRequest("POST", `/api/reporting-periods/${sourceId}/copy-forward`, {
        name: copyName, periodType: copyType, startDate: copyStart, endDate: copyEnd,
      });
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: `Period copied: ${data.copiedMetrics} metrics, ${data.copiedActions} actions carried forward` });
      queryClient.invalidateQueries({ queryKey: ["/api/reporting-periods"] });
      setCopyOpen(null);
      setCopyName("");
      setCopyStart("");
      setCopyEnd("");
    },
    onError: (e: any) => {
      toast({ title: "Copy failed", description: e.message, variant: "destructive" });
    },
  });

  const statusColors: Record<string, string> = {
    open: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
    closed: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
    locked: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
  };

  return (
    <Card data-testid="admin-section-reporting-periods">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Reporting Periods</CardTitle>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm" data-testid="button-create-period">Create Period</Button>
            </DialogTrigger>
            <DialogContent data-testid="dialog-create-period">
              <DialogHeader>
                <DialogTitle>Create Reporting Period</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Name</Label>
                  <Input value={periodName} onChange={(e) => setPeriodName(e.target.value)} placeholder="Q1 2026" />
                </div>
                <div>
                  <Label>Period Type</Label>
                  <Select value={periodType} onValueChange={setPeriodType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="quarterly">Quarterly</SelectItem>
                      <SelectItem value="annual">Annual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Start Date</Label>
                    <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                  </div>
                  <div>
                    <Label>End Date</Label>
                    <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                  </div>
                </div>
                <Button onClick={() => createMutation.mutate()} disabled={!periodName || !startDate || !endDate || createMutation.isPending} className="w-full">
                  {createMutation.isPending ? "Creating..." : "Create Period"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading && <Skeleton className="h-20 w-full" />}
        {!isLoading && periods.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">No reporting periods created yet</p>
        )}
        {periods.map((p: any) => (
          <div key={p.id} className="flex items-center justify-between p-3 border rounded-md" data-testid={`period-item-${p.id}`}>
            <div>
              <p className="text-sm font-medium">{p.name}</p>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="outline" className="text-xs">{p.periodType}</Badge>
                <Badge variant="outline" className={`text-xs border-0 ${statusColors[p.status] || ""}`} data-testid={`badge-period-status-${p.id}`}>
                  {p.status}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {p.startDate ? new Date(p.startDate).toLocaleDateString() : ""} - {p.endDate ? new Date(p.endDate).toLocaleDateString() : ""}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {p.status === "open" && (
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { if (confirm("Close this period? Data entry will still be possible but the period will be marked as closed.")) closeMutation.mutate(p.id); }} data-testid={`button-close-period-${p.id}`}>
                  Close
                </Button>
              )}
              {p.status === "closed" && (
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { if (confirm("Lock this period? No further data changes will be possible.")) lockMutation.mutate(p.id); }} data-testid={`button-lock-period-${p.id}`}>
                  <LockIcon className="w-3 h-3 mr-1" />Lock
                </Button>
              )}
              <Dialog open={copyOpen === p.id} onOpenChange={(o) => setCopyOpen(o ? p.id : null)}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="outline" className="h-7 text-xs" data-testid={`button-copy-forward-${p.id}`}>
                    <Copy className="w-3 h-3 mr-1" />Copy Forward
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Copy Forward: {p.name}</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">Metric targets and incomplete actions will be carried forward. Data entry starts fresh.</p>
                    <div>
                      <Label>New Period Name</Label>
                      <Input value={copyName} onChange={(e) => setCopyName(e.target.value)} placeholder="Q2 2026" />
                    </div>
                    <div>
                      <Label>Period Type</Label>
                      <Select value={copyType} onValueChange={setCopyType}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="monthly">Monthly</SelectItem>
                          <SelectItem value="quarterly">Quarterly</SelectItem>
                          <SelectItem value="annual">Annual</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>Start Date</Label>
                        <Input type="date" value={copyStart} onChange={(e) => setCopyStart(e.target.value)} />
                      </div>
                      <div>
                        <Label>End Date</Label>
                        <Input type="date" value={copyEnd} onChange={(e) => setCopyEnd(e.target.value)} />
                      </div>
                    </div>
                    <Button onClick={() => copyMutation.mutate(p.id)} disabled={!copyName || !copyStart || !copyEnd || copyMutation.isPending} className="w-full">
                      {copyMutation.isPending ? "Copying..." : "Copy Forward"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function AuditLogAdmin() {
  const [filter, setFilter] = useState("");
  const { data: auditLogs = [], isLoading } = useQuery<any[]>({ queryKey: ["/api/audit-logs"] });

  const filtered = filter
    ? auditLogs.filter((log: any) => {
        const search = filter.toLowerCase();
        return (
          (log.action || "").toLowerCase().includes(search) ||
          (log.entityType || "").toLowerCase().includes(search) ||
          (log.performedBy || "").toLowerCase().includes(search)
        );
      })
    : auditLogs;

  const entityTypes = [...new Set(auditLogs.map((l: any) => l.entityType).filter(Boolean))];

  return (
    <Card data-testid="card-admin-audit">
      <CardHeader className="pb-4">
        <CardTitle className="text-sm flex items-center gap-2">
          <Search className="w-4 h-4" />
          Audit Log Review
        </CardTitle>
        <CardDescription className="text-xs">
          {auditLogs.length} total events · {entityTypes.length} entity types tracked
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Input
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="Filter by action, entity type, or user..."
          className="text-xs"
          data-testid="input-audit-filter"
        />

        {entityTypes.length > 0 && (
          <div className="flex flex-wrap gap-1">
            <Badge
              variant={filter === "" ? "default" : "outline"}
              className="text-[10px] cursor-pointer"
              onClick={() => setFilter("")}
            >
              All
            </Badge>
            {entityTypes.map(et => (
              <Badge
                key={et}
                variant={filter === et ? "default" : "outline"}
                className="text-[10px] cursor-pointer capitalize"
                onClick={() => setFilter(filter === et ? "" : et)}
                data-testid={`badge-audit-${et}`}
              >
                {et}
              </Badge>
            ))}
          </div>
        )}

        {isLoading ? (
          <Skeleton className="h-48" />
        ) : filtered.length === 0 ? (
          <p className="text-xs text-muted-foreground">No matching audit log entries.</p>
        ) : (
          <div className="space-y-1 max-h-[500px] overflow-y-auto">
            {filtered.map((log: any) => (
              <div key={log.id} className="flex items-start gap-3 py-2 px-2 border-b border-border last:border-0 text-xs" data-testid={`audit-log-${log.id}`}>
                <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium">{log.action}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {log.entityType && <Badge variant="outline" className="text-[10px] capitalize">{log.entityType}</Badge>}
                    {log.performedBy && <span className="text-muted-foreground">{log.performedBy}</span>}
                  </div>
                </div>
                <p className="text-muted-foreground shrink-0">
                  {log.createdAt ? format(new Date(log.createdAt), "dd MMM yyyy HH:mm") : ""}
                </p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ActivityLogCard() {
  const { data: auditLogs = [], isLoading } = useQuery<any[]>({ queryKey: ["/api/audit-logs"] });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Clock className="w-4 h-4" />
          Activity Log
        </CardTitle>
        <CardDescription className="text-xs">Recent changes in your ESG platform</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-32" />
        ) : auditLogs.length === 0 ? (
          <p className="text-xs text-muted-foreground">No activity recorded yet.</p>
        ) : (
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {auditLogs.slice(0, 20).map((log: any) => (
              <div key={log.id} className="flex items-start gap-3 py-2 border-b border-border last:border-0 text-xs" data-testid={`log-${log.id}`}>
                <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium">{log.action}</p>
                  {log.entityType && (
                    <p className="text-muted-foreground capitalize">{log.entityType}</p>
                  )}
                </div>
                <p className="text-muted-foreground shrink-0">
                  {log.createdAt ? format(new Date(log.createdAt), "dd MMM HH:mm") : ""}
                </p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PasswordChangeCard() {
  const { toast } = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const changeMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/auth/change-password", { currentPassword, newPassword });
    },
    onSuccess: () => {
      toast({ title: "Password updated", description: "Your password has been changed successfully." });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    },
    onError: (e: any) => {
      toast({ title: "Password change failed", description: e.message || "Something went wrong", variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      toast({ title: "Password too short", description: "New password must be at least 6 characters.", variant: "destructive" });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: "Passwords do not match", description: "Please make sure your new passwords match.", variant: "destructive" });
      return;
    }
    changeMutation.mutate();
  };

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-sm flex items-center gap-2">
          <Lock className="w-4 h-4" />
          Change Password
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Current Password</Label>
            <Input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Enter current password"
              data-testid="input-current-password"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">New Password</Label>
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Enter new password (min 6 characters)"
              data-testid="input-new-password"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Confirm New Password</Label>
            <Input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
              data-testid="input-confirm-password"
            />
          </div>
          <Button
            type="submit"
            size="sm"
            disabled={changeMutation.isPending || !currentPassword || !newPassword || !confirmPassword}
            data-testid="button-change-password"
          >
            {changeMutation.isPending ? "Updating..." : "Update Password"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function SecurityAdmin() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [newKeyLabel, setNewKeyLabel] = useState("");
  const [newKeyScopes, setNewKeyScopes] = useState<string[]>([]);
  const [newKeyResult, setNewKeyResult] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const { data: apiKeys = [], isLoading: keysLoading } = useQuery<any[]>({ queryKey: ["/api/company/api-keys"] });
  const { data: auditLogs = [], isLoading: logsLoading } = useQuery<any[]>({ queryKey: ["/api/audit-logs"] });

  const activeKeys = (apiKeys as any[]).filter((k: any) => !k.revokedAt);
  const revokedKeys = (apiKeys as any[]).filter((k: any) => k.revokedAt);
  const recentEvents = (auditLogs as any[]).slice(0, 20);

  const AVAILABLE_SCOPES = [
    { value: "read:metrics", label: "Read Metrics" },
    { value: "write:metrics", label: "Write Metrics" },
    { value: "read:reports", label: "Read Reports" },
    { value: "read:evidence", label: "Read Evidence" },
    { value: "write:evidence", label: "Write Evidence" },
  ];

  const createMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/company/api-keys", { label: newKeyLabel, scopes: newKeyScopes }, () => createMutation.mutate()),
    onSuccess: async (res) => {
      const data = await res.json();
      setNewKeyResult(data.key);
      queryClient.invalidateQueries({ queryKey: ["/api/company/api-keys"] });
    },
    onError: (e: any) => {
      if (e?.name !== "StepUpRequiredError") {
        toast({ title: "Failed to create API key", variant: "destructive" });
      }
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/company/api-keys/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/company/api-keys"] });
      toast({ title: "API key revoked" });
    },
    onError: () => toast({ title: "Failed to revoke key", variant: "destructive" }),
  });

  const copyKey = () => {
    if (newKeyResult) {
      navigator.clipboard.writeText(newKeyResult);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const toggleScope = (scope: string) => {
    setNewKeyScopes(prev => prev.includes(scope) ? prev.filter(s => s !== scope) : [...prev, scope]);
  };

  const getActionColor = (action: string) => {
    if (action.includes("fail") || action.includes("delet") || action.includes("revok") || action.includes("block")) return "text-destructive";
    if (action.includes("creat") || action.includes("success") || action.includes("upload")) return "text-green-600 dark:text-green-400";
    return "text-muted-foreground";
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
              <Key className="w-4 h-4 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-xl font-bold" data-testid="stat-active-keys">{activeKeys.length}</p>
              <p className="text-xs text-muted-foreground">Active API Keys</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-muted">
              <XCircle className="w-4 h-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-xl font-bold" data-testid="stat-revoked-keys">{revokedKeys.length}</p>
              <p className="text-xs text-muted-foreground">Revoked Keys</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-muted">
              <Shield className="w-4 h-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-xl font-bold" data-testid="stat-security-events">{(auditLogs as any[]).length}</p>
              <p className="text-xs text-muted-foreground">Audit Events</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <KeyRound className="w-4 h-4" /> API Keys
            </CardTitle>
            <Button
              size="sm"
              className="h-7 text-xs"
              onClick={() => { setShowCreate(true); setNewKeyResult(null); setNewKeyLabel(""); setNewKeyScopes([]); }}
              data-testid="button-create-api-key"
            >
              <Plus className="w-3 h-3 mr-1" /> New Key
            </Button>
          </div>
          <CardDescription className="text-xs">Keys are shown once at creation. Store them securely — they cannot be retrieved later.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {keysLoading ? (
            <Skeleton className="h-12 w-full" />
          ) : (apiKeys as any[]).length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">No API keys created yet.</p>
          ) : (
            <div className="space-y-2">
              {(apiKeys as any[]).map((key: any) => (
                <div
                  key={key.id}
                  className={`flex items-center justify-between p-2 rounded-md border text-xs ${key.revokedAt ? "opacity-50 bg-muted/30" : "bg-background"}`}
                  data-testid={`row-api-key-${key.id}`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Key className="w-3 h-3 flex-shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="font-medium truncate">{key.label}</p>
                      <p className="text-muted-foreground font-mono">{key.keyPrefix}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {key.lastUsedAt && (
                      <span className="text-muted-foreground hidden sm:block">
                        Used {new Date(key.lastUsedAt).toLocaleDateString()}
                      </span>
                    )}
                    {key.revokedAt ? (
                      <Badge variant="outline" className="text-[10px] text-destructive border-destructive/30">Revoked</Badge>
                    ) : (
                      <>
                        <Badge variant="outline" className="text-[10px] text-green-600 dark:text-green-400 border-green-300 dark:border-green-700">Active</Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                          onClick={() => revokeMutation.mutate(key.id)}
                          disabled={revokeMutation.isPending}
                          data-testid={`button-revoke-key-${key.id}`}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Search className="w-4 h-4" /> Recent Security Events
          </CardTitle>
        </CardHeader>
        <CardContent>
          {logsLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : recentEvents.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">No events recorded yet.</p>
          ) : (
            <div className="space-y-0 max-h-64 overflow-y-auto">
              {recentEvents.map((log: any) => (
                <div
                  key={log.id}
                  className="flex items-start justify-between gap-2 py-1.5 border-b last:border-0 text-xs"
                  data-testid={`row-security-event-${log.id}`}
                >
                  <div className="flex items-start gap-2 min-w-0">
                    <span className={`font-mono mt-0.5 flex-shrink-0 ${getActionColor(log.action)}`}>●</span>
                    <div className="min-w-0">
                      <span className="font-medium">{log.action}</span>
                      {log.performedBy && <span className="text-muted-foreground ml-1">by {log.performedBy}</span>}
                      {log.entityType && (
                        <Badge variant="outline" className="ml-1 text-[9px] py-0">{log.entityType}</Badge>
                      )}
                    </div>
                  </div>
                  <span className="text-muted-foreground flex-shrink-0 text-[10px]">
                    {log.createdAt ? new Date(log.createdAt).toLocaleString() : ""}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create API Key</DialogTitle>
          </DialogHeader>
          {newKeyResult ? (
            <div className="space-y-3">
              <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-md">
                <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800 dark:text-amber-200">
                  Copy this key now. It will not be shown again after you close this dialog.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <code
                  className="flex-1 text-xs font-mono bg-muted p-2 rounded break-all"
                  data-testid="text-new-api-key"
                >
                  {newKeyResult}
                </code>
                <Button variant="outline" size="sm" onClick={copyKey} data-testid="button-copy-api-key">
                  {copied ? <CheckCircle className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
              <Button className="w-full" onClick={() => { setShowCreate(false); setNewKeyResult(null); }}>Done</Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-1">
                <Label className="text-xs font-medium">Label</Label>
                <Input
                  value={newKeyLabel}
                  onChange={e => setNewKeyLabel(e.target.value)}
                  placeholder="e.g. My integration"
                  data-testid="input-api-key-label"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-medium">Permissions (Scopes)</Label>
                <div className="space-y-2">
                  {AVAILABLE_SCOPES.map(scope => (
                    <div key={scope.value} className="flex items-center gap-2">
                      <Checkbox
                        id={scope.value}
                        checked={newKeyScopes.includes(scope.value)}
                        onCheckedChange={() => toggleScope(scope.value)}
                        data-testid={`checkbox-scope-${scope.value.replace(":", "-")}`}
                      />
                      <label htmlFor={scope.value} className="text-sm cursor-pointer">{scope.label}</label>
                    </div>
                  ))}
                </div>
              </div>
              <Button
                className="w-full"
                disabled={createMutation.isPending || !newKeyLabel.trim() || newKeyLabel.trim().length < 2}
                onClick={() => createMutation.mutate()}
                data-testid="button-confirm-create-api-key"
              >
                {createMutation.isPending ? "Creating..." : "Create API Key"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MfaPolicyAdmin() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: authData } = useQuery<any>({ queryKey: ["/api/auth/me"] });
  const { data: users } = useQuery<any[]>({ queryKey: ["/api/users"] });
  const currentPolicy = authData?.company?.mfaPolicy || "optional";

  const setPolicyMutation = useMutation({
    mutationFn: async (policy: string) => {
      const res = await apiRequest("PATCH", "/api/admin/mfa-policy", { policy });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({ title: "MFA policy updated", description: "The company-wide MFA policy has been saved." });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const mfaUsers = users?.filter((u: any) => u.mfaEnabled) || [];
  const totalUsers = users?.length || 0;
  const mfaPercent = totalUsers > 0 ? Math.round((mfaUsers.length / totalUsers) * 100) : 0;

  return (
    <Card data-testid="card-mfa-policy">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Shield className="w-4 h-4 text-primary" />
          Company MFA Policy
        </CardTitle>
        <CardDescription className="text-xs">Control whether two-factor authentication is required for users in your organisation</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          {[
            { value: "optional", label: "Optional", desc: "Users can choose whether to enable MFA" },
            { value: "admin_required", label: "Required for Admins", desc: "Admins must have MFA enabled to sign in" },
            { value: "all_required", label: "Required for All", desc: "All users must have MFA enabled to sign in" },
          ].map(opt => (
            <div
              key={opt.value}
              className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${currentPolicy === opt.value ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"}`}
              onClick={() => { if (currentPolicy !== opt.value) setPolicyMutation.mutate(opt.value); }}
              data-testid={`option-mfa-policy-${opt.value}`}
            >
              <div className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center ${currentPolicy === opt.value ? "border-primary" : "border-muted-foreground"}`}>
                {currentPolicy === opt.value && <div className="w-2 h-2 rounded-full bg-primary" />}
              </div>
              <div>
                <p className="text-sm font-medium">{opt.label}</p>
                <p className="text-xs text-muted-foreground">{opt.desc}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="pt-2 border-t">
          <p className="text-xs text-muted-foreground mb-2">MFA adoption across your organisation</p>
          <div className="flex items-center gap-3">
            <div className="flex-1 bg-muted rounded-full h-2">
              <div className="bg-primary h-2 rounded-full transition-all" style={{ width: `${mfaPercent}%` }} />
            </div>
            <span className="text-sm font-medium" data-testid="text-mfa-adoption">{mfaUsers.length}/{totalUsers} users ({mfaPercent}%)</span>
          </div>
        </div>
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">User MFA Status</p>
          {users?.slice(0, 10).map((u: any) => (
            <div key={u.id} className="flex items-center justify-between text-sm py-1" data-testid={`row-user-mfa-${u.id}`}>
              <span className="text-muted-foreground">{u.username} <span className="text-xs">({u.role})</span></span>
              {u.mfaEnabled
                ? <Badge variant="default" className="text-xs"><CheckCircle className="w-3 h-3 mr-1" />MFA On</Badge>
                : <Badge variant="secondary" className="text-xs"><XCircle className="w-3 h-3 mr-1" />MFA Off</Badge>}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function CompanyGdprAdmin() {
  const { toast } = useToast();
  const { data: authData } = useQuery<any>({ queryKey: ["/api/auth/me"] });
  const companyName = authData?.company?.name || "";
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deletePassword, setDeletePassword] = useState("");

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/gdpr/delete-company", { confirmationText: confirmText, password: deletePassword }, () => deleteMutation.mutate());
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Company deletion scheduled", description: data.message || "Your company account will be deleted in 7 days. Contact support to cancel." });
      setShowDeleteConfirm(false); setConfirmText(""); setDeletePassword("");
    },
    onError: (e: any) => {
      if (e?.name !== "StepUpRequiredError") {
        toast({ title: "Error", description: e.message, variant: "destructive" });
      }
    },
  });

  return (
    <Card className="border-destructive/30" data-testid="card-company-gdpr">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2 text-destructive">
          <Trash2 className="w-4 h-4" />
          Company Account Deletion
        </CardTitle>
        <CardDescription className="text-xs">Schedule permanent deletion of your company and all associated data. This action has a 7-day cancellation window.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-xs text-amber-800 dark:text-amber-200">
          <p className="font-medium mb-1">Before deleting your company account:</p>
          <ul className="space-y-0.5 list-disc list-inside text-amber-700 dark:text-amber-300">
            <li>Export all your ESG data from the Privacy tab</li>
            <li>Inform all team members — their accounts will be removed</li>
            <li>All reports, metrics, and evidence will be permanently deleted</li>
          </ul>
        </div>
        {!showDeleteConfirm ? (
          <Button size="sm" variant="destructive" onClick={() => setShowDeleteConfirm(true)} data-testid="button-delete-company">
            Schedule Company Deletion
          </Button>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-destructive font-medium">Type your company name <strong>{companyName}</strong> to confirm:</p>
            <Input value={confirmText} onChange={e => setConfirmText(e.target.value)} placeholder={companyName} data-testid="input-delete-company-confirm" />
            <Input type="password" value={deletePassword} onChange={e => setDeletePassword(e.target.value)} placeholder="Your password" data-testid="input-delete-company-password" />
            <div className="flex gap-2">
              <Button size="sm" variant="destructive" onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending || confirmText !== companyName || !deletePassword} data-testid="button-confirm-delete-company">
                {deleteMutation.isPending ? "Scheduling..." : "Confirm Schedule Deletion"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setShowDeleteConfirm(false); setConfirmText(""); setDeletePassword(""); }}>Cancel</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
