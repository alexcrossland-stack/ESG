import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertTriangle, Shield, ShieldAlert, ShieldCheck, LogIn, Key,
  UserCog, Trash2, CheckCircle, Clock, RefreshCw, Bell, BellOff,
  XCircle,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";

function SeverityBadge({ severity }: { severity: string }) {
  const config: Record<string, { className: string }> = {
    low: { className: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
    medium: { className: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200" },
    high: { className: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" },
    critical: { className: "bg-red-200 text-red-900 dark:bg-red-800 dark:text-red-100 font-bold" },
  };
  return (
    <Badge className={config[severity]?.className || ""} data-testid={`badge-severity-${severity}`}>
      {severity.toUpperCase()}
    </Badge>
  );
}

function ts(val: string | null | undefined) {
  if (!val) return "—";
  try {
    return format(new Date(val), "dd MMM yyyy HH:mm");
  } catch {
    return val;
  }
}

function ago(val: string | null | undefined) {
  if (!val) return "—";
  try {
    return formatDistanceToNow(new Date(val), { addSuffix: true });
  } catch {
    return val;
  }
}

function AlertsPanel({ alerts, onAcknowledge }: { alerts: any[]; onAcknowledge: (id: string) => void }) {
  if (!alerts.length) {
    return (
      <div className="text-center text-muted-foreground py-10" data-testid="text-no-alerts">
        <ShieldCheck className="w-8 h-8 mx-auto mb-2 text-emerald-500" />
        No security alerts
      </div>
    );
  }

  return (
    <div className="space-y-2" data-testid="list-security-alerts">
      {alerts.map((a) => (
        <div
          key={a.id}
          className={`border rounded-lg p-3 flex items-start justify-between gap-3 ${a.acknowledged_at ? "opacity-60" : ""}`}
          data-testid={`alert-row-${a.id}`}
        >
          <div className="flex items-start gap-3 min-w-0">
            <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm">{a.rule_name}</span>
                <SeverityBadge severity={a.severity} />
                {a.acknowledged_at && (
                  <Badge variant="outline" className="text-xs">Acknowledged</Badge>
                )}
              </div>
              <div className="text-xs text-muted-foreground mt-1 space-x-3">
                <span>Action: <code className="font-mono">{a.action}</code></span>
                {a.ip_address && <span>IP: {a.ip_address}</span>}
                {a.user_id && <span>User: {a.user_id.slice(0, 8)}…</span>}
                <span>{ago(a.fired_at)}</span>
              </div>
              {a.notification_failure && (
                <div className="text-xs text-destructive mt-1">
                  Delivery failed: {a.notification_failure}
                </div>
              )}
              {a.notification_sent_at && !a.notification_failure && (
                <div className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">
                  Slack alert sent {ago(a.notification_sent_at)}
                </div>
              )}
            </div>
          </div>
          {!a.acknowledged_at && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onAcknowledge(a.id)}
              data-testid={`button-ack-alert-${a.id}`}
            >
              <CheckCircle className="w-3 h-3 mr-1" /> Acknowledge
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}

function AuditList({ items, label, icon: Icon }: { items: any[]; label: string; icon: any }) {
  if (!items.length) {
    return (
      <div className="text-center text-muted-foreground py-6 text-sm" data-testid={`text-no-${label.toLowerCase().replace(/\s/g, "-")}`}>
        No {label.toLowerCase()} in last 24 hours
      </div>
    );
  }
  return (
    <div className="space-y-1" data-testid={`list-${label.toLowerCase().replace(/\s/g, "-")}`}>
      {items.map((item, idx) => (
        <div key={item.id || idx} className="text-sm flex items-start gap-2 border-b border-border/50 pb-1">
          <Icon className="w-3 h-3 mt-1 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <span className="font-mono text-xs text-muted-foreground">{ago(item.created_at)}</span>
            {" · "}
            <span>{item.action}</span>
            {item.ip_address && <span className="text-muted-foreground"> · {item.ip_address}</span>}
            {item.details?.email && <span className="text-muted-foreground"> · {item.details.email}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function AdminSecurityPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("overview");

  const { data: overview, isLoading, refetch } = useQuery<any>({
    queryKey: ["/api/admin/security/overview"],
    refetchInterval: 60000,
  });

  const { data: slackStatus } = useQuery<{ configured: boolean }>({
    queryKey: ["/api/admin/security/slack-status"],
  });

  const ackMut = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/admin/security/alerts/${id}/acknowledge`, {}),
    onSuccess: () => {
      toast({ title: "Alert acknowledged" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/security/overview"] });
    },
    onError: () => toast({ title: "Error", description: "Failed to acknowledge alert", variant: "destructive" }),
  });

  const alerts: any[] = overview?.recentAlerts ?? [];
  const highSeverityCount = alerts.filter((a) => (a.severity === "high" || a.severity === "critical") && !a.acknowledged_at).length;

  if (isLoading) {
    return (
      <div className="p-6 space-y-4" data-testid="page-admin-security">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" data-testid="page-admin-security">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="w-6 h-6" /> Security Overview
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Read-only monitoring of security alerts and suspicious activity (last 24 hours)
          </p>
        </div>
        <div className="flex items-center gap-2">
          {slackStatus?.configured ? (
            <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200 flex items-center gap-1" data-testid="badge-slack-configured">
              <Bell className="w-3 h-3" /> Slack alerts active
            </Badge>
          ) : (
            <Badge variant="outline" className="flex items-center gap-1" data-testid="badge-slack-not-configured">
              <BellOff className="w-3 h-3" /> Slack not configured
            </Badge>
          )}
          <Button size="sm" variant="outline" onClick={() => refetch()} data-testid="button-refresh-security">
            <RefreshCw className="w-3 h-3 mr-1" /> Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-5 flex items-center gap-3">
            <AlertTriangle className={`w-5 h-5 ${highSeverityCount > 0 ? "text-red-500" : "text-muted-foreground"}`} />
            <div>
              <p className="text-2xl font-bold" data-testid="stat-active-alerts">{highSeverityCount}</p>
              <p className="text-xs text-muted-foreground">Active High/Critical Alerts</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 flex items-center gap-3">
            <LogIn className="w-5 h-5 text-muted-foreground" />
            <div>
              <p className="text-2xl font-bold" data-testid="stat-failed-logins">{overview?.failedLogins?.length ?? 0}</p>
              <p className="text-xs text-muted-foreground">Failed Logins (24h)</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 flex items-center gap-3">
            <Key className="w-5 h-5 text-muted-foreground" />
            <div>
              <p className="text-2xl font-bold" data-testid="stat-mfa-failures">{overview?.mfaFailures?.length ?? 0}</p>
              <p className="text-xs text-muted-foreground">MFA Failures (24h)</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 flex items-center gap-3">
            <UserCog className="w-5 h-5 text-muted-foreground" />
            <div>
              <p className="text-2xl font-bold" data-testid="stat-role-changes">{overview?.roleChanges?.length ?? 0}</p>
              <p className="text-xs text-muted-foreground">Role Changes (24h)</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} data-testid="tabs-security">
        <TabsList>
          <TabsTrigger value="overview" data-testid="tab-security-overview">
            Alerts
            {highSeverityCount > 0 && (
              <Badge className="ml-1 bg-red-500 text-white text-xs px-1.5 py-0">{highSeverityCount}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="logins" data-testid="tab-security-logins">Failed Logins</TabsTrigger>
          <TabsTrigger value="mfa" data-testid="tab-security-mfa">MFA Failures</TabsTrigger>
          <TabsTrigger value="exports" data-testid="tab-security-exports">Exports & Deletions</TabsTrigger>
          <TabsTrigger value="admin" data-testid="tab-security-admin">Admin Actions</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent Security Alerts</CardTitle>
            </CardHeader>
            <CardContent>
              <AlertsPanel alerts={alerts} onAcknowledge={(id) => ackMut.mutate(id)} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="logins" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Failed Login Attempts (Last 24h)</CardTitle>
            </CardHeader>
            <CardContent>
              <AuditList items={overview?.failedLogins ?? []} label="Failed Logins" icon={XCircle} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="mfa" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">MFA Failures (Last 24h)</CardTitle>
            </CardHeader>
            <CardContent>
              <AuditList items={overview?.mfaFailures ?? []} label="MFA Failures" icon={Key} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="exports" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Export & Deletion Activity (Last 24h)</CardTitle>
            </CardHeader>
            <CardContent>
              <AuditList items={overview?.exportDeleteActivity ?? []} label="Export Delete Activity" icon={Trash2} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="admin" className="mt-4">
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Role Changes (Last 24h)</CardTitle>
              </CardHeader>
              <CardContent>
                <AuditList items={overview?.roleChanges ?? []} label="Role Changes" icon={UserCog} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Super-Admin Actions (Last 24h)</CardTitle>
              </CardHeader>
              <CardContent>
                <AuditList items={overview?.superAdminActions ?? []} label="Super Admin Actions" icon={Shield} />
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="w-4 h-4" /> Alert Rules Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground space-y-1">
            <p>The following rules are active and evaluated on each relevant security event:</p>
            <ul className="list-disc list-inside mt-2 space-y-0.5">
              <li>5+ failed logins from same IP within 10 min → <SeverityBadge severity="high" /></li>
              <li>5+ failed logins for same account within 10 min → <SeverityBadge severity="high" /></li>
              <li>5+ failed MFA attempts for same account within 10 min → <SeverityBadge severity="high" /></li>
              <li>10+ failed API key auth attempts from same IP within 10 min → <SeverityBadge severity="high" /></li>
              <li>Admin role assignment or removal → <SeverityBadge severity="high" /></li>
              <li>Company deletion request → <SeverityBadge severity="critical" /></li>
              <li>Super-admin critical action → <SeverityBadge severity="critical" /></li>
              <li>5+ data exports within 30 min → <SeverityBadge severity="medium" /></li>
              <li>3+ data deletions within 30 min → <SeverityBadge severity="high" /></li>
              <li>20+ access denied from same IP within 10 min → <SeverityBadge severity="medium" /></li>
            </ul>
            <p className="mt-3">
              Alert delivery is always best-effort. Failures are logged and never interrupt application operations.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
