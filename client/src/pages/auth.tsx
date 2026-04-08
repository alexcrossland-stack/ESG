import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, setAuthToken } from "@/lib/queryClient";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Leaf, CheckCircle2, Shield } from "lucide-react";
import { LEGAL_VERSION } from "@/lib/legal-content";
import { getInitialAuthView, getInvitationTokenFromSearch, getResetTokenFromSearch, type AuthView } from "@/lib/auth-route";

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

const registerSchema = z.object({
  username: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Please enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  companyName: z.string().min(2, "Company name must be at least 2 characters"),
  termsAccepted: z.boolean().refine(v => v === true, { message: "You must accept the Terms of Service to continue" }),
  privacyAccepted: z.boolean().refine(v => v === true, { message: "You must accept the Privacy Policy to continue" }),
});

const forgotSchema = z.object({
  email: z.string().email("Please enter a valid email"),
});

const resetSchema = z.object({
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string(),
}).refine(d => d.newPassword === d.confirmPassword, { message: "Passwords do not match", path: ["confirmPassword"] });

const inviteSchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string(),
}).refine(d => d.password === d.confirmPassword, { message: "Passwords do not match", path: ["confirmPassword"] });

export default function Auth() {
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const search = typeof window !== "undefined" ? window.location.search : "";
  const resetToken = getResetTokenFromSearch(search);
  const invitationToken = getInvitationTokenFromSearch(search);
  const [view, setView] = useState<AuthView>(getInitialAuthView(search));
  const [mfaToken, setMfaToken] = useState("");
  const [mfaBackupCode, setMfaBackupCode] = useState("");
  const [mfaUseBackup, setMfaUseBackup] = useState(false);
  const [mfaSetupData, setMfaSetupData] = useState<{ secret: string; uri: string; qrDataUrl?: string } | null>(null);
  const [mfaSetupToken, setMfaSetupToken] = useState("");
  const [mfaBackupCodes, setMfaBackupCodes] = useState<string[]>([]);
  const [mfaSetupStep, setMfaSetupStep] = useState<"scan" | "verify" | "backup">("scan");

  const loginForm = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const registerForm = useForm<z.infer<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
    defaultValues: { username: "", email: "", password: "", companyName: "", termsAccepted: false, privacyAccepted: false },
  });

  const forgotForm = useForm<z.infer<typeof forgotSchema>>({
    resolver: zodResolver(forgotSchema),
    defaultValues: { email: "" },
  });

  const resetForm = useForm<z.infer<typeof resetSchema>>({
    resolver: zodResolver(resetSchema),
    defaultValues: { newPassword: "", confirmPassword: "" },
  });

  const inviteForm = useForm<z.infer<typeof inviteSchema>>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  useEffect(() => {
    setView(getInitialAuthView(search));
  }, [location, search]);

  const loginMutation = useMutation({
    mutationFn: async (data: z.infer<typeof loginSchema>) => {
      const res = await apiRequest("POST", "/api/auth/login", data);
      return res.json();
    },
    onSuccess: async (data) => {
      if (data.mfaRequired && data.mfaSetupRequired) {
        setView("mfa-setup");
        setMfaSetupStep("scan");
        const setupRes = await apiRequest("POST", "/api/auth/mfa/setup");
        const setupData = await setupRes.json();
        setMfaSetupData(setupData);
        return;
      }
      if (data.mfaRequired) {
        setView("mfa-verify");
        return;
      }
      if (data.token) setAuthToken(data.token);
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"], refetchType: "none" });
      setLocation("/");
    },
    onError: (e: any) => {
      toast({ title: "Login failed", description: e.message || "Invalid credentials", variant: "destructive" });
    },
  });

  const mfaVerifyMutation = useMutation({
    mutationFn: async () => {
      const body = mfaUseBackup ? { backupCode: mfaBackupCode } : { token: mfaToken };
      const res = await apiRequest("POST", "/api/auth/mfa/verify", body);
      return res.json();
    },
    onSuccess: async (data) => {
      if (data.token) setAuthToken(data.token);
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"], refetchType: "none" });
      setLocation("/");
    },
    onError: (e: any) => {
      toast({ title: "Verification failed", description: e.message || "Invalid code", variant: "destructive" });
    },
  });

  const mfaSetupVerifyMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/auth/mfa/verify-setup", { token: mfaSetupToken });
      return res.json();
    },
    onSuccess: async (data) => {
      if (data.backupCodes) {
        setMfaBackupCodes(data.backupCodes);
        setMfaSetupStep("backup");
      }
      if (data.loggedIn && data.token) {
        setAuthToken(data.token);
        queryClient.setQueryData(["/api/auth/me"], { user: data.user, company: data.company });
        await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"], refetchType: "none" });
      }
    },
    onError: (e: any) => {
      toast({ title: "Invalid token", description: e.message, variant: "destructive" });
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (data: z.infer<typeof registerSchema>) => {
      const res = await apiRequest("POST", "/api/auth/register", {
        username: data.username,
        email: data.email,
        password: data.password,
        companyName: data.companyName,
        termsAccepted: data.termsAccepted,
        privacyAccepted: data.privacyAccepted,
        termsVersion: LEGAL_VERSION,
        privacyVersion: LEGAL_VERSION,
      });
      return res.json();
    },
    onSuccess: async (data) => {
      if (data.token) setAuthToken(data.token);
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"], refetchType: "none" });
      setLocation("/");
      toast({ title: "Welcome!", description: "Your ESG platform is ready." });
    },
    onError: (e: any) => {
      toast({ title: "Registration failed", description: e.message || "Something went wrong", variant: "destructive" });
    },
  });

  const forgotMutation = useMutation({
    mutationFn: async (data: z.infer<typeof forgotSchema>) => {
      const res = await apiRequest("POST", "/api/auth/forgot-password", data);
      return res.json();
    },
    onSuccess: () => setView("forgot-sent"),
    onError: (e: any) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  const resetMutation = useMutation({
    mutationFn: async (data: z.infer<typeof resetSchema>) => {
      const res = await apiRequest("POST", "/api/auth/reset-password", { token: resetToken, newPassword: data.newPassword });
      return res.json();
    },
    onSuccess: () => setView("reset-done"),
    onError: (e: any) => {
      toast({ title: "Reset failed", description: e.message, variant: "destructive" });
    },
  });

  const invitationQuery = useQuery({
    queryKey: ["/api/auth/invitation", invitationToken ?? ""],
    enabled: Boolean(invitationToken),
    queryFn: async () => {
      const res = await fetch(`/api/auth/invitation?token=${encodeURIComponent(invitationToken!)}`, {
        credentials: "include",
      });
      const text = await res.text();
      if (!res.ok) {
        let message = text || res.statusText;
        try {
          const json = JSON.parse(text);
          message = json.error || json.message || message;
        } catch {}
        throw new Error(message);
      }
      return JSON.parse(text) as {
        email: string;
        company?: { id?: string; name?: string };
        role?: string;
        inviteeName?: string | null;
      };
    },
  });

  const acceptInvitationMutation = useMutation({
    mutationFn: async (data: z.infer<typeof inviteSchema>) => {
      const res = await apiRequest("POST", "/api/auth/accept-invitation", {
        token: invitationToken,
        password: data.password,
        confirmPassword: data.confirmPassword,
      });
      return res.json();
    },
    onSuccess: async (data) => {
      if (data.token) setAuthToken(data.token);
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"], refetchType: "none" });
      toast({ title: "Account ready", description: "Your invitation has been accepted and you're now signed in." });
      setLocation("/");
    },
    onError: (e: any) => {
      toast({ title: "Invite activation failed", description: e.message || "We couldn't activate this invitation.", variant: "destructive" });
    },
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <Leaf className="w-6 h-6 text-primary" />
            </div>
          </div>
          <h1 className="text-2xl font-bold">ESG Manager</h1>
          <p className="text-muted-foreground text-sm">Sustainability management for growing businesses</p>
        </div>

        {view === "invite" && (
          <Card>
            <CardHeader>
              <p className="font-semibold text-base">Create your account</p>
              <p className="text-sm text-muted-foreground">
                {invitationQuery.isLoading
                  ? "Checking your invitation link…"
                  : invitationQuery.data
                    ? "Create your password to join your invited company."
                    : "We couldn't load this invitation."}
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {invitationQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">Validating your invitation…</p>
              ) : invitationQuery.isError || !invitationQuery.data ? (
                <div className="space-y-3">
                  <p className="text-sm text-destructive">
                    {(invitationQuery.error as Error | undefined)?.message || "This invitation link is invalid or has expired."}
                  </p>
                  <Button className="w-full" variant="outline" onClick={() => { setView("tabs"); setLocation("/auth"); }} data-testid="button-invite-invalid-sign-in">
                    Go to sign in
                  </Button>
                </div>
              ) : (
                <>
                  <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-4" data-testid="card-invite-details">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Invited email</p>
                      <p className="text-sm font-medium" data-testid="text-invite-email">{invitationQuery.data.email}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Company</p>
                      <p className="text-sm" data-testid="text-invite-company">{invitationQuery.data.company?.name || "Your company"}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Role</p>
                      <p className="text-sm capitalize" data-testid="text-invite-role">{invitationQuery.data.role || "Contributor"}</p>
                    </div>
                  </div>
                  <Form {...inviteForm}>
                    <form onSubmit={inviteForm.handleSubmit((data) => acceptInvitationMutation.mutate(data))} className="space-y-4">
                      <FormField control={inviteForm.control} name="password" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Create your password</FormLabel>
                          <FormControl>
                            <Input type="password" placeholder="••••••••" {...field} data-testid="input-invite-password" autoFocus />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={inviteForm.control} name="confirmPassword" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Confirm password</FormLabel>
                          <FormControl>
                            <Input type="password" placeholder="••••••••" {...field} data-testid="input-invite-confirm-password" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <Button type="submit" className="w-full" disabled={acceptInvitationMutation.isPending} data-testid="button-invite-submit">
                        {acceptInvitationMutation.isPending ? "Activating..." : "Create account"}
                      </Button>
                    </form>
                  </Form>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {view === "forgot" && (
          <Card>
            <CardHeader>
              <p className="font-semibold text-base">Reset your password</p>
              <p className="text-sm text-muted-foreground">Enter your email and we'll send a reset link if there's an account.</p>
            </CardHeader>
            <CardContent>
              <Form {...forgotForm}>
                <form onSubmit={forgotForm.handleSubmit(d => forgotMutation.mutate(d))} className="space-y-4">
                  <FormField control={forgotForm.control} name="email" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email address</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="you@company.com" {...field} data-testid="input-forgot-email" autoFocus />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <Button type="submit" className="w-full" disabled={forgotMutation.isPending} data-testid="button-forgot-submit">
                    {forgotMutation.isPending ? "Sending..." : "Send reset link"}
                  </Button>
                  <Button type="button" variant="ghost" className="w-full" onClick={() => setView("tabs")}>Back to sign in</Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        )}

        {view === "forgot-sent" && (
          <Card>
            <CardContent className="pt-6 text-center space-y-3">
              <CheckCircle2 className="w-10 h-10 text-primary mx-auto" />
              <p className="font-semibold">Check your inbox</p>
              <p className="text-sm text-muted-foreground">If an account exists for that email address, you'll receive a password reset link shortly. If you don't see it, check your spam or junk folder.</p>
              <Button variant="ghost" className="w-full" onClick={() => setView("tabs")}>Back to sign in</Button>
            </CardContent>
          </Card>
        )}

        {view === "reset" && (
          <Card>
            <CardHeader>
              <p className="font-semibold text-base">Choose a new password</p>
              <p className="text-sm text-muted-foreground">Enter and confirm your new password below.</p>
            </CardHeader>
            <CardContent>
              <Form {...resetForm}>
                <form onSubmit={resetForm.handleSubmit(d => resetMutation.mutate(d))} className="space-y-4">
                  <FormField control={resetForm.control} name="newPassword" render={({ field }) => (
                    <FormItem>
                      <FormLabel>New password</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="••••••••" {...field} data-testid="input-new-password" autoFocus />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={resetForm.control} name="confirmPassword" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Confirm password</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="••••••••" {...field} data-testid="input-confirm-password" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <Button type="submit" className="w-full" disabled={resetMutation.isPending} data-testid="button-reset-submit">
                    {resetMutation.isPending ? "Updating..." : "Set new password"}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        )}

        {view === "reset-done" && (
          <Card>
            <CardContent className="pt-6 text-center space-y-3">
              <CheckCircle2 className="w-10 h-10 text-primary mx-auto" />
              <p className="font-semibold">Password updated</p>
              <p className="text-sm text-muted-foreground">Your password has been changed. You can now sign in with your new credentials.</p>
              <Button className="w-full" onClick={() => { setView("tabs"); setLocation("/auth"); }}>Sign in</Button>
            </CardContent>
          </Card>
        )}

        {view === "mfa-verify" && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-primary" />
                <p className="font-semibold text-base">Two-Factor Authentication</p>
              </div>
              <p className="text-sm text-muted-foreground">Enter the 6-digit code from your authenticator app to continue.</p>
            </CardHeader>
            <CardContent className="space-y-4">
              {!mfaUseBackup ? (
                <>
                  <Input
                    value={mfaToken}
                    onChange={e => setMfaToken(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="000000"
                    maxLength={6}
                    className="text-center text-2xl tracking-widest font-mono"
                    autoFocus
                    data-testid="input-mfa-token"
                  />
                  <Button
                    className="w-full"
                    onClick={() => mfaVerifyMutation.mutate()}
                    disabled={mfaVerifyMutation.isPending || mfaToken.length !== 6}
                    data-testid="button-mfa-verify"
                  >
                    {mfaVerifyMutation.isPending ? "Verifying..." : "Verify"}
                  </Button>
                  <button
                    type="button"
                    className="text-xs text-muted-foreground hover:text-foreground w-full text-center"
                    onClick={() => setMfaUseBackup(true)}
                    data-testid="link-use-backup-code"
                  >
                    Use a backup code instead
                  </button>
                </>
              ) : (
                <>
                  <Input
                    value={mfaBackupCode}
                    onChange={e => setMfaBackupCode(e.target.value)}
                    placeholder="XXXXX-XXXXX"
                    className="text-center font-mono"
                    autoFocus
                    data-testid="input-mfa-backup-code"
                  />
                  <Button
                    className="w-full"
                    onClick={() => mfaVerifyMutation.mutate()}
                    disabled={mfaVerifyMutation.isPending || !mfaBackupCode.trim()}
                    data-testid="button-mfa-verify-backup"
                  >
                    {mfaVerifyMutation.isPending ? "Verifying..." : "Verify Backup Code"}
                  </Button>
                  <button
                    type="button"
                    className="text-xs text-muted-foreground hover:text-foreground w-full text-center"
                    onClick={() => setMfaUseBackup(false)}
                    data-testid="link-use-authenticator"
                  >
                    Use authenticator app instead
                  </button>
                </>
              )}
              <Button variant="ghost" className="w-full" onClick={() => { setView("tabs"); setMfaToken(""); setMfaBackupCode(""); setMfaUseBackup(false); }}>
                Back to sign in
              </Button>
            </CardContent>
          </Card>
        )}

        {view === "mfa-setup" && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-primary" />
                <p className="font-semibold text-base">Set Up Two-Factor Authentication</p>
              </div>
              <p className="text-sm text-muted-foreground">Your organisation requires MFA. Set it up now to continue signing in.</p>
            </CardHeader>
            <CardContent className="space-y-4">
              {mfaSetupStep === "scan" && mfaSetupData && (
                <>
                  <div>
                    <p className="text-sm font-medium mb-2">1. Scan this QR code with your authenticator app</p>
                    <div className="flex justify-center my-3">
                      {mfaSetupData.qrDataUrl ? (
                        <div className="bg-white inline-block p-2 rounded border">
                          <img src={mfaSetupData.qrDataUrl} alt="Scan this QR code with your authenticator app" className="w-48 h-48" data-testid="img-mfa-setup-qr" />
                        </div>
                      ) : null}
                    </div>
                    <p className="text-xs text-muted-foreground mb-1">Or enter this code manually:</p>
                    <code className="block bg-muted p-2 rounded text-sm font-mono break-all" data-testid="text-mfa-setup-secret">{mfaSetupData.secret}</code>
                  </div>
                  <Button className="w-full" onClick={() => setMfaSetupStep("verify")} data-testid="button-mfa-setup-next">
                    Next — Enter verification code
                  </Button>
                </>
              )}
              {mfaSetupStep === "verify" && (
                <>
                  <p className="text-sm font-medium">2. Enter the 6-digit code from your app</p>
                  <Input
                    value={mfaSetupToken}
                    onChange={e => setMfaSetupToken(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="000000"
                    maxLength={6}
                    className="text-center text-2xl tracking-widest font-mono"
                    autoFocus
                    data-testid="input-mfa-setup-verify-token"
                  />
                  <Button
                    className="w-full"
                    onClick={() => mfaSetupVerifyMutation.mutate()}
                    disabled={mfaSetupVerifyMutation.isPending || mfaSetupToken.length !== 6}
                    data-testid="button-mfa-setup-verify"
                  >
                    {mfaSetupVerifyMutation.isPending ? "Verifying..." : "Verify & Enable MFA"}
                  </Button>
                  <Button variant="ghost" className="w-full" onClick={() => setMfaSetupStep("scan")}>Back</Button>
                </>
              )}
              {mfaSetupStep === "backup" && mfaBackupCodes.length > 0 && (
                <>
                  <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                    <p className="text-sm font-medium text-amber-800 dark:text-amber-200 mb-2">Save your backup codes</p>
                    <p className="text-xs text-amber-700 dark:text-amber-300 mb-3">These codes let you access your account if you lose your authenticator device. Each code works once.</p>
                    <div className="grid grid-cols-2 gap-1 font-mono text-sm" data-testid="div-mfa-setup-backup-codes">
                      {mfaBackupCodes.map((code, i) => <span key={i} className="text-amber-900 dark:text-amber-100">{code}</span>)}
                    </div>
                  </div>
                  <Button className="w-full" onClick={() => setLocation("/")} data-testid="button-mfa-setup-done">
                    Done — Continue to dashboard
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {view === "tabs" && (
          <Card>
            <Tabs defaultValue="login">
              <CardHeader>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="login" data-testid="tab-login">Sign In</TabsTrigger>
                  <TabsTrigger value="register" data-testid="tab-register">Create Account</TabsTrigger>
                </TabsList>
              </CardHeader>

              <TabsContent value="login">
                <CardContent className="pt-2">
                  <Form {...loginForm}>
                    <form onSubmit={loginForm.handleSubmit(d => loginMutation.mutate(d))} className="space-y-4">
                      <FormField control={loginForm.control} name="email" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email</FormLabel>
                          <FormControl>
                            <Input type="email" placeholder="you@company.com" {...field} data-testid="input-email" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={loginForm.control} name="password" render={({ field }) => (
                        <FormItem>
                          <div className="flex items-center justify-between">
                            <FormLabel>Password</FormLabel>
                            <button
                              type="button"
                              className="text-xs text-primary hover:underline"
                              onClick={() => setView("forgot")}
                              data-testid="link-forgot-password"
                            >
                              Forgot password?
                            </button>
                          </div>
                          <FormControl>
                            <Input type="password" placeholder="••••••••" {...field} data-testid="input-password" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <Button type="submit" className="w-full" disabled={loginMutation.isPending} data-testid="button-login">
                        {loginMutation.isPending ? "Signing in..." : "Sign In"}
                      </Button>
                    </form>
                  </Form>

                </CardContent>
              </TabsContent>

              <TabsContent value="register">
                <CardContent className="pt-2">
                  <Form {...registerForm}>
                    <form onSubmit={registerForm.handleSubmit(d => registerMutation.mutate(d))} className="space-y-4">
                      <FormField control={registerForm.control} name="companyName" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Company Name</FormLabel>
                          <FormControl>
                            <Input placeholder="Acme Ltd" {...field} data-testid="input-company" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={registerForm.control} name="username" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Your Name</FormLabel>
                          <FormControl>
                            <Input placeholder="Jane Smith" {...field} data-testid="input-username" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={registerForm.control} name="email" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email</FormLabel>
                          <FormControl>
                            <Input type="email" placeholder="jane@company.com" {...field} data-testid="input-register-email" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={registerForm.control} name="password" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Password</FormLabel>
                          <FormControl>
                            <Input type="password" placeholder="••••••••" {...field} data-testid="input-register-password" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />

                      <div className="space-y-3 pt-2 border-t">
                        <FormField control={registerForm.control} name="termsAccepted" render={({ field }) => (
                          <FormItem className="flex items-start gap-2 space-y-0">
                            <FormControl>
                              <Checkbox checked={field.value} onCheckedChange={field.onChange} data-testid="checkbox-terms" id="checkbox-terms" />
                            </FormControl>
                            <div className="space-y-0.5">
                              <label htmlFor="checkbox-terms" className="text-sm leading-snug cursor-pointer">
                                I have read and agree to the{" "}
                                <Link href="/terms" className="text-primary underline hover:no-underline" target="_blank">Terms of Service</Link>
                              </label>
                              <FormMessage />
                            </div>
                          </FormItem>
                        )} />

                        <FormField control={registerForm.control} name="privacyAccepted" render={({ field }) => (
                          <FormItem className="flex items-start gap-2 space-y-0">
                            <FormControl>
                              <Checkbox checked={field.value} onCheckedChange={field.onChange} data-testid="checkbox-privacy" id="checkbox-privacy" />
                            </FormControl>
                            <div className="space-y-0.5">
                              <label htmlFor="checkbox-privacy" className="text-sm leading-snug cursor-pointer">
                                I have read and agree to the{" "}
                                <Link href="/privacy" className="text-primary underline hover:no-underline" target="_blank">Privacy Policy</Link>
                              </label>
                              <FormMessage />
                            </div>
                          </FormItem>
                        )} />
                      </div>

                      <Button type="submit" className="w-full" disabled={registerMutation.isPending} data-testid="button-register">
                        {registerMutation.isPending ? "Setting up..." : "Create Account"}
                      </Button>
                    </form>
                  </Form>
                </CardContent>
              </TabsContent>
            </Tabs>
          </Card>
        )}

        <nav className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <Link href="/terms" className="hover:underline">Terms</Link>
          <Link href="/privacy" className="hover:underline">Privacy</Link>
          <Link href="/cookies" className="hover:underline">Cookies</Link>
          <Link href="/dpa" className="hover:underline">DPA</Link>
        </nav>
      </div>
    </div>
  );
}
