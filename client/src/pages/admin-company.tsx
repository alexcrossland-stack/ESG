import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  ArrowLeft, Building2, Users, FileText, BarChart2, ShieldCheck, ShieldOff,
  BotMessageSquare, Calendar, AlertCircle, CheckCircle2, XCircle,
  ClipboardList, TrendingUp, Upload, Bot, LogIn, LineChart, Crown,
  ArrowRightLeft, PlayCircle, Eye, Link2, Activity, Database, Archive, Trash2,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";

function SeverityBadge({ severity }: { severity: string }) {
  const map: Record<string, string> = {
    info: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    warning: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
    error: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
    critical: "bg-red-200 text-red-900 dark:bg-red-800 dark:text-red-100",
  };
  return (
    <Badge className={map[severity] ?? map.info} data-testid={`badge-severity-${severity}`}>
      {severity}
    </Badge>
  );
}

function ActionIcon({ action }: { action: string }) {
  if (action.includes("policy")) return <ClipboardList className="w-3.5 h-3.5 text-violet-500 shrink-0" />;
  if (action.includes("metric")) return <TrendingUp className="w-3.5 h-3.5 text-blue-500 shrink-0" />;
  if (action.includes("evidence")) return <Upload className="w-3.5 h-3.5 text-emerald-500 shrink-0" />;
  if (action.includes("report")) return <FileText className="w-3.5 h-3.5 text-orange-500 shrink-0" />;
  if (action.includes("onboarding")) return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />;
  if (action.includes("assist") || action.includes("chat")) return <Bot className="w-3.5 h-3.5 text-primary shrink-0" />;
  return <Calendar className="w-3.5 h-3.5 text-muted-foreground shrink-0" />;
}

function actionLabel(action: string): string {
  const map: Record<string, string> = {
    onboarding_complete: "Onboarding completed",
    policy_created: "Policy created",
    policy_adopted: "Policy adopted",
    metric_entered: "Metric entered",
    evidence_uploaded: "Evidence uploaded",
    report_generated: "Report generated",
    assistant_used: "Assistant used",
    login: "User login",
  };
  return map[action] ?? action.replace(/_/g, " ");
}

function DiagStatCard({
  label, value, icon: Icon, sub, color = "text-primary",
}: { label: string; value: string | number; icon: any; sub?: string; color?: string }) {
  return (
    <Card data-testid={`diag-stat-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <CardContent className="pt-5 flex items-start gap-3">
        <div className={`p-2 rounded-lg bg-muted ${color}`}>
          <Icon className="w-4 h-4" />
        </div>
        <div>
          <p className="text-xl font-bold leading-tight">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
          {sub && <p className="text-[11px] text-muted-foreground/70 mt-0.5">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function HealthFlag({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-md border text-sm ${ok ? "border-emerald-300 bg-emerald-50 dark:bg-emerald-950 dark:border-emerald-800" : "border-amber-300 bg-amber-50 dark:bg-amber-950 dark:border-amber-800"}`}
      data-testid={`health-flag-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      {ok
        ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
        : <XCircle className="w-4 h-4 text-amber-500 shrink-0" />}
      <span className={ok ? "text-emerald-800 dark:text-emerald-200" : "text-amber-800 dark:text-amber-200"}>{label}</span>
    </div>
  );
}

function AdminMigrationPanel({ companyId }: { companyId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dryRunResult, setDryRunResult] = useState<any>(null);
  const [executeResult, setExecuteResult] = useState<any>(null);

  const dryRunMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/migrate-sites", { companyId, dryRun: true });
      return res.json();
    },
    onSuccess: (data: any) => {
      setDryRunResult(data);
      setExecuteResult(null);
      toast({ title: "Preview complete", description: "Review the row counts below, then execute to apply." });
    },
    onError: (e: any) => toast({ title: "Preview failed", description: e.message, variant: "destructive" }),
  });

  const executeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/migrate-sites", { companyId, dryRun: false });
      return res.json();
    },
    onSuccess: (data: any) => {
      setExecuteResult(data);
      setDryRunResult(null);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/company", companyId, "diagnostics"] });
      toast({ title: "Migration complete", description: `Legacy data assigned to "${data.siteName}".` });
    },
    onError: (e: any) => toast({ title: "Migration failed", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-3" data-testid="admin-migration-panel">
      <p className="text-xs text-muted-foreground">
        Assigns all untagged (legacy) records across 10 tables to an idempotent "Primary Site" for this company.
        Run Preview first, then Execute Migration. <strong className="text-destructive">This cannot be reversed through the UI.</strong>
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => dryRunMutation.mutate()}
          disabled={dryRunMutation.isPending || executeMutation.isPending}
          data-testid="button-dry-run-migration"
        >
          <Eye className="w-3.5 h-3.5 mr-1.5" />
          {dryRunMutation.isPending ? "Checking..." : "Preview"}
        </Button>
        <Button
          size="sm"
          variant="destructive"
          onClick={() => executeMutation.mutate()}
          disabled={executeMutation.isPending || dryRunMutation.isPending || !dryRunResult}
          data-testid="button-execute-migration"
        >
          <PlayCircle className="w-3.5 h-3.5 mr-1.5" />
          {executeMutation.isPending ? "Migrating..." : "Execute Migration"}
        </Button>
      </div>
      {dryRunResult && (
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md p-3 text-xs space-y-1.5" data-testid="dry-run-result">
          <p className="font-semibold text-amber-800 dark:text-amber-300">
            This migration would assign {dryRunResult.totalRows} total records across {dryRunResult.tablesWithData} tables to a new Primary Site.
          </p>
          {Object.entries(dryRunResult.estimatedRows || {}).filter(([, count]: [string, any]) => count > 0).map(([key, count]: [string, any]) => (
            <div key={key} className="flex justify-between text-muted-foreground">
              <span className="capitalize">{key.replace(/_/g, " ")}</span>
              <span className="font-medium text-foreground">{count}</span>
            </div>
          ))}
          <p className="text-amber-700 dark:text-amber-400 pt-1 font-medium">Click Execute Migration to apply — this cannot be undone.</p>
        </div>
      )}
      {executeResult && (
        <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-md p-3 text-xs space-y-1.5" data-testid="execute-result">
          <p className="font-semibold text-emerald-800 dark:text-emerald-300 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" /> Migration complete — records assigned to "{executeResult.siteName}"
          </p>
          {Object.entries(executeResult.tablesUpdated || {}).map(([key, count]: [string, any]) => (
            <div key={key} className="flex justify-between text-muted-foreground">
              <span className="capitalize">{key.replace(/_/g, " ")}</span>
              <span className="font-medium text-foreground">{count} migrated</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminCompanyPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteCompanyInput, setDeleteCompanyInput] = useState("");

  const { data: diag, isLoading, error } = useQuery<any>({
    queryKey: ["/api/admin/company", companyId, "diagnostics"],
    queryFn: async () => {
      const res = await fetch(`/api/admin/company/${companyId}/diagnostics`, { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return res.json();
    },
    enabled: !!companyId,
  });

  const archiveMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/companies/${companyId}/archive`, {});
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Company archived", description: "The workspace is now inactive for normal users." });
      setArchiveOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/companies"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/company", companyId, "diagnostics"] });
      navigate("/admin");
    },
    onError: (e: any) => toast({ title: "Archive failed", description: e.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", `/api/admin/companies/${companyId}`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Company deleted", description: "The company has been anonymised and marked deleted." });
      setDeleteOpen(false);
      setDeleteCompanyInput("");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/companies"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/company", companyId, "diagnostics"] });
      navigate("/admin");
    },
    onError: (e: any) => toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-4 max-w-5xl mx-auto">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-48" />
      </div>
    );
  }

  if (error || !diag || diag.error) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <Button variant="ghost" size="sm" onClick={() => navigate("/admin")} className="mb-4" data-testid="button-back-admin">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back to Admin
        </Button>
        <div className="text-center py-16 text-muted-foreground">
          <AlertCircle className="w-8 h-8 mx-auto mb-2 text-destructive" />
          <p className="font-medium">Company not found or diagnostics unavailable</p>
        </div>
      </div>
    );
  }

  const statusActive = diag.status === "active";

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/admin")} data-testid="button-back-admin">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </Button>
        <div>
          <h1 className="text-xl font-bold leading-tight" data-testid="heading-company-name">{diag.name}</h1>
          <p className="text-sm text-muted-foreground">{diag.industry ?? "—"} · {diag.country ?? "—"}</p>
        </div>
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => setArchiveOpen(true)} data-testid="button-archive-company-detail">
            <Archive className="w-4 h-4 mr-1.5" />
            Archive
          </Button>
          <Button variant="destructive" size="sm" onClick={() => { setDeleteOpen(true); setDeleteCompanyInput(""); }} data-testid="button-delete-company-detail">
            <Trash2 className="w-4 h-4 mr-1.5" />
            Delete
          </Button>
          <Badge variant={statusActive ? "outline" : "destructive"} data-testid="badge-company-status">
            {statusActive ? <ShieldCheck className="w-3 h-3 mr-1" /> : <ShieldOff className="w-3 h-3 mr-1" />}
            {diag.status ?? "active"}
          </Badge>
          <Badge variant={diag.planTier === "pro" ? "default" : diag.isBetaCompany ? "outline" : "secondary"} data-testid="badge-plan-tier">
            {diag.planTier === "pro" ? "Pro (Stripe)" : diag.isBetaCompany ? "Free + Beta" : "free"}
          </Badge>
          {diag.isBetaCompany && (
            <Badge variant="outline" className="gap-1 border-blue-300 text-blue-700 dark:border-blue-700 dark:text-blue-300" data-testid="badge-beta-status">
              <Crown className="w-3 h-3" />
              Beta
              {diag.betaExpiresAt && (
                <span className="font-normal opacity-70">
                  · exp {format(new Date(diag.betaExpiresAt), "d MMM yy")}
                </span>
              )}
            </Badge>
          )}
          {diag.maturityLevel && (
            <Badge variant="outline" className="capitalize" data-testid="badge-maturity">
              {diag.maturityLevel} maturity
            </Badge>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground px-0.5">
        <span>Employees: <strong>{diag.employeeCount ?? "—"}</strong></span>
        <span>·</span>
        <span>Created: <strong>{diag.createdAt ? format(new Date(diag.createdAt), "d MMM yyyy") : "—"}</strong></span>
        <span>·</span>
        <span>Onboarding: <strong className={diag.onboardingComplete ? "text-emerald-600" : "text-amber-600"}>{diag.onboardingComplete ? "Complete" : "Incomplete"}</strong></span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <DiagStatCard label="Users" value={diag.counts.users} icon={Users} />
        <DiagStatCard label="Policies" value={diag.counts.policies} icon={ClipboardList} />
        <DiagStatCard label="Metrics" value={diag.counts.metrics} icon={BarChart2} />
        <DiagStatCard label="Evidence Files" value={diag.counts.evidenceFiles} icon={Upload} />
        <DiagStatCard label="Reports" value={diag.counts.reports} icon={FileText} />
        <DiagStatCard
          label="AI Usage (30d)"
          value={diag.counts.aiUsageLast30Days}
          icon={BotMessageSquare}
          sub="assistant interactions"
          color="text-violet-500"
        />
        <DiagStatCard
          label="Last Login"
          value={diag.lastLogin ? formatDistanceToNow(new Date(diag.lastLogin), { addSuffix: true }) : "Never"}
          icon={LogIn}
          sub="most recent user login"
        />
        <DiagStatCard
          label="Last Metric Entry"
          value={diag.lastMetricEntry ? formatDistanceToNow(new Date(diag.lastMetricEntry), { addSuffix: true }) : "None"}
          icon={LineChart}
          sub="most recent metric value"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Building2 className="w-4 h-4" />
              System Health Checks
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2" data-testid="system-health-flags">
            <HealthFlag ok={diag.onboardingComplete} label="Onboarding complete" />
            <HealthFlag ok={diag.counts.policies > 0} label="At least one policy adopted" />
            <HealthFlag ok={diag.counts.metrics > 0} label="Metrics configured" />
            <HealthFlag ok={diag.counts.evidenceFiles > 0} label="Evidence uploaded" />
            <HealthFlag ok={diag.counts.reports > 0} label="Report generated" />
            <HealthFlag ok={diag.counts.users > 0} label="Users registered" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              Recent Errors (up to 5)
            </CardTitle>
          </CardHeader>
          <CardContent data-testid="recent-errors">
            {(diag.recentErrors ?? []).length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400 py-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                No errors recorded for this tenant
              </div>
            ) : (
              <div className="space-y-2">
                {diag.recentErrors.map((e: any, i: number) => (
                  <div key={e.id ?? i} className="flex items-start gap-2 p-2 rounded border text-xs" data-testid={`error-${i}`}>
                    <SeverityBadge severity={e.severity} />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{e.message}</p>
                      <p className="text-muted-foreground mt-0.5">{e.event_type} · {e.created_at ? formatDistanceToNow(new Date(e.created_at), { addSuffix: true }) : ""}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              Recent Activity Timeline
            </CardTitle>
          </CardHeader>
          <CardContent data-testid="activity-timeline">
            {(diag.activityTimeline ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">No activity recorded</p>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {diag.activityTimeline.map((a: any, i: number) => (
                  <div key={i} className="flex items-center gap-2.5 text-xs" data-testid={`activity-${i}`}>
                    <ActionIcon action={a.action} />
                    <div className="flex-1 min-w-0">
                      <span className="font-medium">{actionLabel(a.action)}</span>
                      {a.entity_type && <span className="text-muted-foreground"> · {a.entity_type}</span>}
                    </div>
                    <span className="text-muted-foreground shrink-0">
                      {a.created_at ? formatDistanceToNow(new Date(a.created_at), { addSuffix: true }) : ""}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="w-4 h-4" />
              Users ({diag.users?.length ?? 0})
            </CardTitle>
          </CardHeader>
          <CardContent data-testid="company-users-list">
            {(diag.users ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">No users registered</p>
            ) : (
              <div className="space-y-1.5 max-h-80 overflow-y-auto">
                {diag.users.map((u: any) => (
                  <div key={u.id} className="flex items-center justify-between px-2 py-1.5 bg-muted/40 rounded text-xs" data-testid={`user-row-${u.id}`}>
                    <div>
                      <span className="font-medium">{u.username}</span>
                      <span className="text-muted-foreground ml-1.5">{u.email}</span>
                    </div>
                    <Badge variant="secondary" className="text-[10px]">{u.role}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Activity className="w-4 h-4" />
              Provisioning Events
            </CardTitle>
          </CardHeader>
          <CardContent data-testid="provisioning-events">
            {(diag.provisioningEvents ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">No provisioning events recorded</p>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {(diag.provisioningEvents ?? []).map((ev: any, i: number) => (
                  <div key={i} className="flex items-center gap-2.5 text-xs" data-testid={`prov-event-${i}`}>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="font-mono font-medium">{ev.action}</span>
                    </div>
                    <span className="text-muted-foreground shrink-0">
                      {ev.created_at ? formatDistanceToNow(new Date(ev.created_at), { addSuffix: true }) : ""}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Link2 className="w-4 h-4" />
              Group Memberships
            </CardTitle>
          </CardHeader>
          <CardContent data-testid="group-memberships">
            {(diag.groupMemberships ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">Not linked to any portfolio group</p>
            ) : (
              <div className="space-y-2">
                {(diag.groupMemberships ?? []).map((g: any, i: number) => (
                  <div key={g.id ?? i} className="flex items-center justify-between px-2 py-1.5 bg-muted/40 rounded text-xs" data-testid={`group-row-${i}`}>
                    <div>
                      <span className="font-medium">{g.name}</span>
                      <span className="text-muted-foreground ml-1.5">/{g.slug}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-[10px]">{g.type}</Badge>
                      <span className="text-muted-foreground">{g.linked_at ? format(new Date(g.linked_at), "d MMM yyyy") : ""}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {diag.dataReadiness && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Database className="w-4 h-4" />
              Data Readiness
              <Badge
                variant={diag.dataReadiness.isDataReady ? "default" : "secondary"}
                className={`ml-auto text-[10px] ${diag.dataReadiness.isDataReady ? "bg-emerald-600 hover:bg-emerald-700" : ""}`}
                data-testid="data-readiness-badge"
              >
                {diag.dataReadiness.isDataReady ? "Ready" : "Incomplete"}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent data-testid="data-readiness-panel">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {[
                { label: "Metrics configured", ok: diag.dataReadiness.hasMetrics },
                { label: "Metric data entered", ok: diag.dataReadiness.hasMetricData },
                { label: "Evidence uploaded", ok: diag.dataReadiness.hasEvidence },
                { label: "Policy adopted", ok: diag.dataReadiness.hasPolicy },
                { label: "Report generated", ok: diag.dataReadiness.hasReport },
              ].map(({ label, ok }) => (
                <div key={label} className={`flex flex-col items-center justify-center gap-1 p-3 rounded border text-xs text-center ${ok ? "border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-800" : "border-muted bg-muted/20"}`} data-testid={`readiness-${label.replace(/\s+/g, "-").toLowerCase()}`}>
                  {ok ? <CheckCircle2 className="w-5 h-5 text-emerald-500" /> : <XCircle className="w-5 h-5 text-muted-foreground" />}
                  <span className={ok ? "text-emerald-700 dark:text-emerald-300 font-medium" : "text-muted-foreground"}>{label}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <ArrowRightLeft className="w-4 h-4" />
            Legacy Data Migration
          </CardTitle>
        </CardHeader>
        <CardContent data-testid="admin-migration-section" className="space-y-4">
          <AdminMigrationPanel companyId={companyId!} />
          {diag.migrationHistory && diag.migrationHistory.length > 0 && (
            <div data-testid="migration-history">
              <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">Migration History</p>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {diag.migrationHistory.map((entry: any, i: number) => (
                  <div key={entry.id ?? i} className="flex items-start gap-2 p-2 rounded border text-xs" data-testid={`migration-entry-${i}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <Badge variant={entry.details?.dryRun ? "secondary" : "outline"} className="text-[10px]">
                          {entry.details?.dryRun ? "Dry run" : "Executed"}
                        </Badge>
                        <span className="text-muted-foreground">
                          {entry.created_at ? formatDistanceToNow(new Date(entry.created_at), { addSuffix: true }) : ""}
                        </span>
                      </div>
                      {!entry.details?.dryRun && entry.details?.tablesUpdated && (
                        <p className="text-muted-foreground mt-1">
                          {Object.values(entry.details.tablesUpdated as Record<string, number>).reduce((a, b) => a + b, 0)} records migrated to "{entry.details.siteName}"
                        </p>
                      )}
                      {entry.details?.dryRun && entry.details?.estimatedRows && (
                        <p className="text-muted-foreground mt-1">
                          Preview: {Object.values(entry.details.estimatedRows as Record<string, number>).reduce((a, b) => a + b, 0)} records estimated
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-destructive/30">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2 text-destructive">
            <AlertCircle className="w-4 h-4" />
            Danger Zone
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>Archive keeps the company record for super-admin oversight but makes it inactive for normal users.</p>
          <p>Delete is stronger: it revokes access, anonymises the company and its users, and cannot be undone.</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setArchiveOpen(true)} data-testid="button-archive-company-danger">
              <Archive className="w-4 h-4 mr-1.5" />
              Archive company
            </Button>
            <Button variant="destructive" onClick={() => { setDeleteOpen(true); setDeleteCompanyInput(""); }} data-testid="button-delete-company-danger">
              <Trash2 className="w-4 h-4 mr-1.5" />
              Delete company
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archive company</DialogTitle>
            <DialogDescription>
              Archiving will make this workspace inactive for normal users. Super admins will still be able to find it in admin views.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setArchiveOpen(false)}>Cancel</Button>
            <Button
              variant="default"
              onClick={() => archiveMut.mutate()}
              disabled={archiveMut.isPending}
              data-testid="button-confirm-archive-company-detail"
            >
              Archive company
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={(open) => { setDeleteOpen(open); if (!open) setDeleteCompanyInput(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete company</DialogTitle>
            <DialogDescription>
              This is irreversible. The company will be anonymised, user access will be revoked, and historical references will be retained to keep the database consistent.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-muted-foreground">
              Type <strong>{diag.name}</strong> to confirm permanent deletion.
            </div>
            <Input
              value={deleteCompanyInput}
              onChange={(e) => setDeleteCompanyInput(e.target.value)}
              placeholder={diag.name}
              data-testid="input-delete-company-detail-confirm"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeleteOpen(false); setDeleteCompanyInput(""); }}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => deleteMut.mutate()}
              disabled={deleteMut.isPending || deleteCompanyInput !== diag.name}
              data-testid="button-confirm-delete-company-detail"
            >
              Delete company
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
