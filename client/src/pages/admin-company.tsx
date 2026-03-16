import { useQuery } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft, Building2, Users, FileText, BarChart2, ShieldCheck, ShieldOff,
  BotMessageSquare, Calendar, AlertCircle, CheckCircle2, XCircle,
  ClipboardList, TrendingUp, Upload, Bot, LogIn, LineChart, Crown,
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

export default function AdminCompanyPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const [, navigate] = useLocation();

  const { data: diag, isLoading, error } = useQuery<any>({
    queryKey: ["/api/admin/company", companyId, "diagnostics"],
    queryFn: async () => {
      const res = await fetch(`/api/admin/company/${companyId}/diagnostics`, { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return res.json();
    },
    enabled: !!companyId,
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
    </div>
  );
}
