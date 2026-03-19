import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { usePermissions } from "@/lib/permissions";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import {
  Building2, Users, CreditCard, AlertTriangle, Search, Eye, LogIn,
  ShieldOff, ShieldCheck, ChevronLeft, ChevronRight, RefreshCw,
  TrendingUp, Activity, CheckCircle, XCircle, Clock, FileText,
  DollarSign, ExternalLink, Crown, Shield, Key,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { formatDistanceToNow } from "date-fns";
import { Link } from "wouter";

function StatCard({ label, value, icon: Icon, variant = "default" }: {
  label: string; value: number | string; icon: any; variant?: "default" | "warning" | "danger";
}) {
  const colorMap = { default: "text-primary", warning: "text-amber-500", danger: "text-destructive" };
  return (
    <Card>
      <CardContent className="pt-6 flex items-center gap-4">
        <div className={`p-2 rounded-lg bg-muted ${colorMap[variant]}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <p className="text-2xl font-bold" data-testid={`stat-${label.toLowerCase().replace(/\s/g, "-")}`}>{value}</p>
          <p className="text-sm text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const map: Record<string, string> = {
    info: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    warning: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
    error: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
    critical: "bg-red-200 text-red-900 dark:bg-red-800 dark:text-red-100",
  };
  return <Badge className={map[severity] ?? map.info}>{severity}</Badge>;
}

function JobStatusBadge({ status }: { status: string }) {
  const config: Record<string, { className: string; icon: any }> = {
    completed: { className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200", icon: CheckCircle },
    running: { className: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200", icon: RefreshCw },
    failed: { className: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200", icon: XCircle },
    pending: { className: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200", icon: Clock },
  };
  const c = config[status] ?? config.pending;
  return (
    <Badge className={c.className} data-testid={`badge-job-${status}`}>
      <c.icon className="w-3 h-3 mr-1" /> {status}
    </Badge>
  );
}

function CompaniesTable() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [confirmAction, setConfirmAction] = useState<{ type: "suspend" | "reactivate" | "impersonate"; company: any } | null>(null);
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const PAGE_SIZE = 50;

  const { data, isLoading, refetch } = useQuery<{ companies: any[]; total: number }>({
    queryKey: ["/api/admin/companies", search, page],
    queryFn: () =>
      fetch(`/api/admin/companies?search=${encodeURIComponent(search)}&page=${page}&pageSize=${PAGE_SIZE}`, { credentials: "include" })
        .then(r => r.json()),
  });

  const suspendMut = useMutation({
    mutationFn: (companyId: string) => apiRequest("POST", "/api/admin/company/suspend", { companyId }),
    onSuccess: () => { toast({ title: "Company suspended" }); setConfirmAction(null); refetch(); queryClient.invalidateQueries({ queryKey: ["/api/admin/companies"] }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const reactivateMut = useMutation({
    mutationFn: (companyId: string) => apiRequest("POST", "/api/admin/company/reactivate", { companyId }),
    onSuccess: () => { toast({ title: "Company reactivated" }); setConfirmAction(null); refetch(); queryClient.invalidateQueries({ queryKey: ["/api/admin/companies"] }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const impersonateMut = useMutation({
    mutationFn: (companyId: string) => apiRequest("POST", `/api/admin/impersonate/${companyId}`, {}),
    onSuccess: (data: any) => {
      setConfirmAction(null);
      toast({ title: "Impersonation active", description: `Viewing as ${data.impersonatingAs?.companyName}` });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/impersonation/status"] });
      window.location.href = "/";
    },
    onError: (e: any) => toast({ title: "Impersonation failed", description: e.message, variant: "destructive" }),
  });

  const companies = data?.companies ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search companies…" value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }} data-testid="input-company-search" />
        </div>
        <Button variant="ghost" size="icon" onClick={() => refetch()} data-testid="button-refresh-companies">
          <RefreshCw className="w-4 h-4" />
        </Button>
        <span className="text-sm text-muted-foreground">{total} companies</span>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground text-sm">Loading…</div>
      ) : (
        <div className="rounded-md border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Company</th>
                <th className="text-left px-4 py-3 font-medium">Industry</th>
                <th className="text-left px-4 py-3 font-medium">Plan</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-left px-4 py-3 font-medium">Users</th>
                <th className="text-left px-4 py-3 font-medium">Created</th>
                <th className="text-right px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {companies.map((c: any) => (
                <tr key={c.id} className="hover:bg-muted/30 transition-colors" data-testid={`row-company-${c.id}`}>
                  <td className="px-4 py-3 font-medium">{c.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{c.industry ?? "—"}</td>
                  <td className="px-4 py-3">
                    <Badge variant={c.plan_tier === "pro" ? "default" : "secondary"}>{c.plan_tier ?? "free"}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={c.status === "suspended" ? "destructive" : "outline"}>{c.status ?? "active"}</Badge>
                  </td>
                  <td className="px-4 py-3">{c.user_count ?? 0}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {c.created_at ? formatDistanceToNow(new Date(c.created_at), { addSuffix: true }) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => navigate(`/admin/companies/${c.id}`)} data-testid={`button-view-${c.id}`}>
                        <Eye className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setConfirmAction({ type: "impersonate", company: c })} data-testid={`button-impersonate-${c.id}`}>
                        <LogIn className="w-3.5 h-3.5" />
                      </Button>
                      {c.status === "suspended" ? (
                        <Button size="sm" variant="ghost" onClick={() => setConfirmAction({ type: "reactivate", company: c })} data-testid={`button-reactivate-${c.id}`}>
                          <ShieldCheck className="w-3.5 h-3.5 text-green-600" />
                        </Button>
                      ) : (
                        <Button size="sm" variant="ghost" onClick={() => setConfirmAction({ type: "suspend", company: c })} data-testid={`button-suspend-${c.id}`}>
                          <ShieldOff className="w-3.5 h-3.5 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {companies.length === 0 && (
                <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">No companies found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(p => p - 1)} data-testid="button-prev-page">
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} data-testid="button-next-page">
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      <Dialog open={!!confirmAction} onOpenChange={() => setConfirmAction(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmAction?.type === "impersonate" ? "Impersonate Company"
                : confirmAction?.type === "suspend" ? "Suspend Company" : "Reactivate Company"}
            </DialogTitle>
            <DialogDescription>
              {confirmAction?.type === "impersonate"
                ? `You will be viewing the platform as ${confirmAction?.company?.name}. You can exit impersonation at any time.`
                : confirmAction?.type === "suspend"
                ? `Suspending ${confirmAction?.company?.name} will block all logins and API calls for their users.`
                : `Reactivating ${confirmAction?.company?.name} will restore full access for their users.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmAction(null)}>Cancel</Button>
            <Button
              variant={confirmAction?.type === "suspend" ? "destructive" : "default"}
              onClick={() => {
                if (!confirmAction) return;
                if (confirmAction.type === "impersonate") impersonateMut.mutate(confirmAction.company.id);
                else if (confirmAction.type === "suspend") suspendMut.mutate(confirmAction.company.id);
                else reactivateMut.mutate(confirmAction.company.id);
              }}
              disabled={suspendMut.isPending || reactivateMut.isPending || impersonateMut.isPending}
              data-testid="button-confirm-action"
            >
              {confirmAction?.type === "impersonate" ? "Start Impersonation"
                : confirmAction?.type === "suspend" ? "Suspend" : "Reactivate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function UsersTable() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;

  const { data, isLoading, refetch } = useQuery<{ users: any[]; total: number }>({
    queryKey: ["/api/admin/users", search, page],
    queryFn: () =>
      fetch(`/api/admin/users?search=${encodeURIComponent(search)}&page=${page}&pageSize=${PAGE_SIZE}`, { credentials: "include" })
        .then(r => r.json()),
  });

  const usersList = data?.users ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search by email or username…" value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }} data-testid="input-user-search" />
        </div>
        <Button variant="ghost" size="icon" onClick={() => refetch()} data-testid="button-refresh-users">
          <RefreshCw className="w-4 h-4" />
        </Button>
        <span className="text-sm text-muted-foreground">{total} users</span>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground text-sm">Loading…</div>
      ) : (
        <div className="rounded-md border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Username</th>
                <th className="text-left px-4 py-3 font-medium">Email</th>
                <th className="text-left px-4 py-3 font-medium">Role</th>
                <th className="text-left px-4 py-3 font-medium">Company</th>
                <th className="text-left px-4 py-3 font-medium">Company Status</th>
                <th className="text-left px-4 py-3 font-medium">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {usersList.map((u: any) => (
                <tr key={u.id} className="hover:bg-muted/30 transition-colors" data-testid={`row-user-${u.id}`}>
                  <td className="px-4 py-3 font-medium">{u.username}</td>
                  <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                  <td className="px-4 py-3">
                    <Badge variant={u.role === "super_admin" ? "default" : u.role === "admin" ? "secondary" : "outline"}>{u.role}</Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{u.company_name ?? "—"}</td>
                  <td className="px-4 py-3">
                    {u.company_status ? (
                      <Badge variant={u.company_status === "suspended" ? "destructive" : "outline"}>{u.company_status}</Badge>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {u.created_at ? formatDistanceToNow(new Date(u.created_at), { addSuffix: true }) : "—"}
                  </td>
                </tr>
              ))}
              {usersList.length === 0 && (
                <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">No users found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(p => p - 1)} data-testid="button-users-prev-page">
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} data-testid="button-users-next-page">
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function RevenueTab() {
  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/admin/revenue"],
    queryFn: () => fetch("/api/admin/revenue", { credentials: "include" }).then(r => r.ok ? r.json() : null),
  });

  if (isLoading) {
    return <div className="text-center py-12 text-muted-foreground text-sm">Loading revenue data…</div>;
  }

  const mrr = data?.estimatedMrr ?? 0;
  const totalCompanies = data?.totalCompanies ?? 0;
  const proCount = data?.proCount ?? 0;
  const freeCount = data?.freeCount ?? 0;
  const newSubscriptions30d = data?.newSubscriptions30d ?? 0;
  const churned30d = data?.churned30d ?? 0;
  const monthlyGrowth: any[] = data?.monthlyGrowth ?? [];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {[
          { label: "Total Companies", value: totalCompanies, icon: Building2 },
          { label: "Free Tier", value: freeCount, icon: Users },
          { label: "Pro Tier", value: proCount, icon: CreditCard },
          { label: "Estimated MRR", value: `£${mrr.toLocaleString()}`, icon: DollarSign },
          { label: "New Subscriptions (30d)", value: newSubscriptions30d, icon: TrendingUp },
          { label: "Churned (30d)", value: churned30d, icon: AlertTriangle },
        ].map(({ label, value, icon: Icon }) => (
          <Card key={label} data-testid={`revenue-stat-${label.toLowerCase().replace(/\s+/g, "-")}`}>
            <CardContent className="pt-5 flex items-start gap-3">
              <div className="p-1.5 rounded-md bg-muted text-primary"><Icon className="w-4 h-4" /></div>
              <div>
                <p className="text-xl font-bold leading-tight">{value}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <p className="text-xs text-muted-foreground px-0.5">
        Estimated MRR is calculated at £199/month per Pro company. All figures are based on company data and do not reflect actual payments received.
      </p>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Company Growth — Last 6 Months</CardTitle>
        </CardHeader>
        <CardContent>
          {monthlyGrowth.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No historical data available yet</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={monthlyGrowth} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorPro" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="total" name="Total" stroke="hsl(var(--primary))" fill="url(#colorTotal)" strokeWidth={2} />
                <Area type="monotone" dataKey="pro" name="Pro" stroke="#10b981" fill="url(#colorPro)" strokeWidth={2} />
                <Area type="monotone" dataKey="free" name="Free" stroke="#f59e0b" fill="none" strokeWidth={1.5} strokeDasharray="4 2" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function PlatformHealthTab() {
  const { data, isLoading, refetch } = useQuery<any>({
    queryKey: ["/api/admin/platform-health/summary"],
    queryFn: async () => {
      const res = await fetch("/api/admin/platform-health/summary", { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return res.json();
    },
    refetchInterval: 30000,
  });

  if (isLoading) {
    return <div className="text-center py-12 text-muted-foreground text-sm">Loading platform health…</div>;
  }

  const jobs = data?.jobs ?? {};
  const apiErrors = data?.apiErrors24h ?? 0;
  const reportFailures = data?.reportFailures24h ?? 0;
  const openIncidents = data?.openIncidents ?? 0;
  const recentEvents: any[] = data?.recentEvents ?? [];
  const recentJobs: any[] = data?.recentJobs ?? [];

  const jobsStatus = jobs.failed24h > 5 ? "text-destructive" : jobs.failed24h > 0 ? "text-amber-500" : "text-emerald-600";
  const errorsStatus = apiErrors > 10 ? "text-destructive" : apiErrors > 0 ? "text-amber-500" : "text-emerald-600";
  const reportStatus = reportFailures > 0 ? "text-destructive" : "text-emerald-600";
  const incidentsStatus = openIncidents > 0 ? "text-amber-500" : "text-emerald-600";

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: "Jobs Running", value: jobs.running ?? 0, color: "text-blue-500", icon: RefreshCw },
          { label: "Failed Jobs (24h)", value: jobs.failed24h ?? 0, color: jobsStatus, icon: XCircle },
          { label: "API Errors (24h)", value: apiErrors, color: errorsStatus, icon: AlertTriangle },
          { label: "Report Failures (24h)", value: reportFailures, color: reportStatus, icon: FileText },
          { label: "Open Incidents", value: openIncidents, color: incidentsStatus, icon: Activity },
        ].map(({ label, value, color, icon: Icon }) => (
          <Card key={label} data-testid={`health-summary-${label.toLowerCase().replace(/\s+/g, "-")}`}>
            <CardContent className="pt-5 flex items-start gap-3">
              <div className={`p-1.5 rounded-md bg-muted ${color}`}><Icon className="w-4 h-4" /></div>
              <div>
                <p className={`text-xl font-bold leading-tight ${color}`}>{value}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {reportFailures > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950 text-sm text-amber-800 dark:text-amber-200">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {reportFailures} report failure{reportFailures !== 1 ? "s" : ""} in the last 24 hours
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center justify-between">
              <span className="flex items-center gap-2"><Activity className="w-4 h-4" /> Recent Health Events</span>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => refetch()} data-testid="button-refresh-health">
                <RefreshCw className="w-3.5 h-3.5" />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent data-testid="health-events-mini">
            {recentEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2 text-center">No health events recorded</p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="pb-1 font-medium">Severity</th>
                    <th className="pb-1 font-medium">Message</th>
                    <th className="pb-1 font-medium text-right">When</th>
                  </tr>
                </thead>
                <tbody>
                  {recentEvents.map((e: any, i: number) => (
                    <tr key={e.id ?? i} data-testid={`health-event-${i}`}>
                      <td className="py-1 pr-2"><SeverityBadge severity={e.severity} /></td>
                      <td className="py-1 truncate max-w-[200px]">{e.message}</td>
                      <td className="py-1 text-right text-muted-foreground whitespace-nowrap">
                        {e.created_at ? formatDistanceToNow(new Date(e.created_at), { addSuffix: true }) : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileText className="w-4 h-4" /> Recent Background Jobs
            </CardTitle>
          </CardHeader>
          <CardContent data-testid="health-jobs-mini">
            {recentJobs.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2 text-center">No jobs recorded</p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="pb-1 font-medium">Status</th>
                    <th className="pb-1 font-medium">Job Type</th>
                    <th className="pb-1 font-medium text-right">When</th>
                  </tr>
                </thead>
                <tbody>
                  {recentJobs.map((j: any, i: number) => (
                    <tr key={j.id ?? i} data-testid={`health-job-${i}`}>
                      <td className="py-1 pr-2"><JobStatusBadge status={j.status} /></td>
                      <td className="py-1 truncate max-w-[200px]">{j.job_type}</td>
                      <td className="py-1 text-right text-muted-foreground whitespace-nowrap">
                        {j.created_at ? formatDistanceToNow(new Date(j.created_at), { addSuffix: true }) : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="text-right">
        <Link href="/admin/health" data-testid="link-full-health-dashboard">
          <Button variant="outline" size="sm" className="gap-1.5">
            <ExternalLink className="w-3.5 h-3.5" />
            View full health dashboard →
          </Button>
        </Link>
      </div>
    </div>
  );
}

function BetaAccessTab() {
  const { toast } = useToast();
  const [grantEmail, setGrantEmail] = useState("");
  const [grantDays, setGrantDays] = useState<number | "">(30);
  const [grantReason, setGrantReason] = useState("");
  const [revokeEmail, setRevokeEmail] = useState("");

  const { data: betaCompaniesRaw, isLoading: betaLoading, refetch: refetchBeta } = useQuery<any[]>({
    queryKey: ["/api/admin/beta/companies"],
    queryFn: () => fetch("/api/admin/beta/companies", { credentials: "include" }).then(r => r.ok ? r.json() : []),
  });
  const betaCompanies: any[] = Array.isArray(betaCompaniesRaw) ? betaCompaniesRaw : [];

  const grantMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/beta/grant", {
        email: grantEmail.trim(),
        expiresInDays: Number(grantDays),
        accessLevel: "pro",
        reason: grantReason.trim() || undefined,
      });
      return res.json();
    },
    onSuccess: (data) => {
      const expiry = data.betaExpiresAt
        ? new Date(data.betaExpiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
        : "unknown";
      toast({ title: "Beta access granted", description: `Pro beta access granted. Expires ${expiry}.` });
      setGrantEmail("");
      setGrantDays(30);
      setGrantReason("");
      refetchBeta();
    },
    onError: (e: any) => {
      toast({ title: "Failed to grant beta access", description: e.message, variant: "destructive" });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/beta/revoke", { email: revokeEmail.trim() });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Beta access revoked", description: `Beta access has been removed from ${revokeEmail}.` });
      setRevokeEmail("");
      refetchBeta();
    },
    onError: (e: any) => {
      toast({ title: "Failed to revoke beta access", description: e.message, variant: "destructive" });
    },
  });

  const activeCompanies = betaCompanies.filter((c: any) => !c.isExpired);
  const expiredCompanies = betaCompanies.filter((c: any) => c.isExpired);

  function fmtDate(iso: string | null) {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  }

  function fmtRelative(iso: string | null) {
    if (!iso) return "";
    try { return formatDistanceToNow(new Date(iso), { addSuffix: true }); } catch { return ""; }
  }

  return (
    <div className="space-y-6 mt-2">
      <div className="grid sm:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Crown className="w-4 h-4 text-primary" />
              Grant Beta Access
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="grant-email">User email</Label>
              <Input
                id="grant-email"
                placeholder="user@example.com"
                value={grantEmail}
                onChange={e => setGrantEmail(e.target.value)}
                data-testid="input-grant-email"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="grant-days">Days of access</Label>
              <Input
                id="grant-days"
                type="number"
                min={1}
                placeholder="30"
                value={grantDays}
                onChange={e => setGrantDays(e.target.value === "" ? "" : Number(e.target.value))}
                data-testid="input-grant-days"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="grant-reason">Reason <span className="text-muted-foreground">(optional)</span></Label>
              <Textarea
                id="grant-reason"
                placeholder="Pre-launch beta tester"
                value={grantReason}
                onChange={e => setGrantReason(e.target.value)}
                rows={2}
                data-testid="input-grant-reason"
              />
            </div>
            <Button
              className="w-full"
              disabled={grantMutation.isPending || !grantEmail || !grantDays}
              onClick={() => grantMutation.mutate()}
              data-testid="button-grant-beta"
            >
              {grantMutation.isPending ? "Granting..." : "Grant Beta Access"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldOff className="w-4 h-4 text-destructive" />
              Revoke Beta Access
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="revoke-email">User email</Label>
              <Input
                id="revoke-email"
                placeholder="user@example.com"
                value={revokeEmail}
                onChange={e => setRevokeEmail(e.target.value)}
                data-testid="input-revoke-email"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              This will immediately remove Pro beta access from the user's company. If they have no active Stripe subscription, they will revert to the Free plan.
            </p>
            <Button
              variant="destructive"
              className="w-full"
              disabled={revokeMutation.isPending || !revokeEmail}
              onClick={() => {
                if (window.confirm(`Revoke beta access from ${revokeEmail}?`)) revokeMutation.mutate();
              }}
              data-testid="button-revoke-beta"
            >
              {revokeMutation.isPending ? "Revoking..." : "Revoke Beta Access"}
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card data-testid="card-beta-companies">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Crown className="w-4 h-4 text-primary" />
            Beta Companies
            {betaCompanies.length > 0 && (
              <Badge variant="secondary" className="ml-1">{betaCompanies.length}</Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {activeCompanies.length > 0 && (
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
                {activeCompanies.length} active
              </span>
            )}
            {expiredCompanies.length > 0 && (
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
                {expiredCompanies.length} expired
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {betaLoading && (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          )}
          {!betaLoading && betaCompanies.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">No companies have beta access set.</p>
          )}
          {!betaLoading && betaCompanies.length > 0 && (
            <div className="space-y-2">
              {betaCompanies.map((c: any) => (
                <div
                  key={c.id}
                  className={`flex items-start gap-3 p-3 rounded-lg border text-sm ${
                    c.isExpired
                      ? "border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20"
                      : "border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20"
                  }`}
                  data-testid={`beta-company-row-${c.id}`}
                >
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium truncate">{c.name}</span>
                      {c.isExpired ? (
                        <Badge variant="outline" className="text-amber-700 dark:text-amber-400 border-amber-400 dark:border-amber-600 bg-transparent shrink-0" data-testid={`badge-beta-expired-${c.id}`}>
                          <Clock className="w-3 h-3 mr-1" /> Expired
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-blue-700 dark:text-blue-400 border-blue-400 dark:border-blue-600 bg-transparent shrink-0" data-testid={`badge-beta-active-${c.id}`}>
                          <CheckCircle className="w-3 h-3 mr-1" /> Active
                        </Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                      {c.adminEmail && <span>{c.adminEmail}</span>}
                      <span className={c.isExpired ? "text-amber-600 dark:text-amber-400 font-medium" : "text-blue-600 dark:text-blue-400"}>
                        {c.isExpired ? "Expired" : "Expires"} {fmtDate(c.betaExpiresAt)}
                        {c.betaExpiresAt && (
                          <span className="ml-1 opacity-70">({fmtRelative(c.betaExpiresAt)})</span>
                        )}
                      </span>
                      {c.betaGrantedBy && <span>Granted by {c.betaGrantedBy}</span>}
                      {c.betaReason && <span className="italic truncate max-w-[20ch]" title={c.betaReason}>{c.betaReason}</span>}
                    </div>
                  </div>
                  <Link href={`/admin/company/${c.id}`}>
                    <button
                      className="shrink-0 p-1.5 rounded hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                      title="View company"
                      data-testid={`button-view-beta-company-${c.id}`}
                    >
                      <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
                    </button>
                  </Link>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function AdminPage() {
  const { role } = usePermissions();
  const [, navigate] = useLocation();

  if (role && role !== "super_admin") {
    navigate("/");
    return null;
  }

  const { data: stats, isLoading: statsLoading } = useQuery<any>({
    queryKey: ["/api/admin/stats"],
    queryFn: () => fetch("/api/admin/stats", { credentials: "include" }).then(r => r.ok ? r.json() : null),
    enabled: role === "super_admin",
  });

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="heading-admin-console">Platform Admin Console</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage all tenants, users, and platform health from one place.</p>
        </div>
        <Link href="/admin/esg">
          <Button variant="outline" size="sm" data-testid="link-admin-esg-management" className="gap-1.5">
            <ExternalLink className="w-3.5 h-3.5" />
            ESG Platform Management
          </Button>
        </Link>
      </div>

      {statsLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[...Array(5)].map((_, i) => (
            <Card key={i}><CardContent className="pt-6"><div className="h-12 bg-muted animate-pulse rounded" /></CardContent></Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <StatCard label="Total Companies" value={stats?.totalCompanies ?? 0} icon={Building2} />
          <StatCard label="Total Users" value={stats?.totalUsers ?? 0} icon={Users} />
          <StatCard label="Pro Subscriptions" value={stats?.proSubscriptions ?? 0} icon={CreditCard} />
          <StatCard label="Suspended" value={stats?.suspendedCompanies ?? 0} icon={ShieldOff} variant="warning" />
          <StatCard label="Errors (24h)" value={stats?.platformErrors24h ?? 0} icon={AlertTriangle} variant="danger" />
        </div>
      )}

      <Tabs defaultValue="companies">
        <TabsList>
          <TabsTrigger value="companies" data-testid="tab-companies">
            <Building2 className="w-4 h-4 mr-2" /> Companies
          </TabsTrigger>
          <TabsTrigger value="users" data-testid="tab-users">
            <Users className="w-4 h-4 mr-2" /> Users
          </TabsTrigger>
          <TabsTrigger value="revenue" data-testid="tab-revenue">
            <TrendingUp className="w-4 h-4 mr-2" /> Revenue
          </TabsTrigger>
          <TabsTrigger value="platform-health" data-testid="tab-platform-health">
            <Activity className="w-4 h-4 mr-2" /> Platform Health
          </TabsTrigger>
          <TabsTrigger value="beta-access" data-testid="tab-beta-access">
            <Crown className="w-4 h-4 mr-2" /> Beta Access
          </TabsTrigger>
          <TabsTrigger value="security" data-testid="tab-security">
            <Shield className="w-4 h-4 mr-2" /> Security
          </TabsTrigger>
        </TabsList>
        <TabsContent value="companies" className="mt-4">
          <CompaniesTable />
        </TabsContent>
        <TabsContent value="users" className="mt-4">
          <UsersTable />
        </TabsContent>
        <TabsContent value="revenue" className="mt-4">
          <RevenueTab />
        </TabsContent>
        <TabsContent value="platform-health" className="mt-4">
          <PlatformHealthTab />
        </TabsContent>
        <TabsContent value="beta-access" className="mt-4">
          <BetaAccessTab />
        </TabsContent>
        <TabsContent value="security" className="mt-4">
          <SecurityAuditTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SecurityAuditTab() {
  const [filter, setFilter] = useState("");

  const { data: auditLogs = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/admin/audit-logs"],
  });

  const logs = auditLogs as any[];

  const failedLogins = logs.filter((l: any) => l.action === "login_failed");
  const privilegedActions = logs.filter((l: any) =>
    ["api_key_created", "api_key_revoked", "User role changed", "password_reset"].includes(l.action)
  );
  const subscriptionEvents = logs.filter((l: any) =>
    l.action?.toLowerCase().includes("subscription") || l.action?.toLowerCase().includes("billing") || l.action?.toLowerCase().includes("payment")
  );

  const filtered = filter
    ? logs.filter((l: any) =>
        (l.action || "").toLowerCase().includes(filter.toLowerCase()) ||
        (l.entityType || "").toLowerCase().includes(filter.toLowerCase()) ||
        (l.ipAddress || "").includes(filter)
      )
    : logs;

  const getActionBadgeVariant = (action: string): "default" | "outline" | "destructive" | "secondary" => {
    if (action?.includes("fail") || action?.includes("block") || action?.includes("revok")) return "destructive";
    if (action?.includes("creat") || action?.includes("success")) return "default";
    return "outline";
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-muted">
              <FileText className="w-4 h-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-xl font-bold" data-testid="stat-total-audit-events">{logs.length}</p>
              <p className="text-xs text-muted-foreground">Total Events</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-destructive/10">
              <ShieldOff className="w-4 h-4 text-destructive" />
            </div>
            <div>
              <p className="text-xl font-bold text-destructive" data-testid="stat-failed-logins">{failedLogins.length}</p>
              <p className="text-xs text-muted-foreground">Failed Logins</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30">
              <Key className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-xl font-bold" data-testid="stat-privileged-actions">{privilegedActions.length}</p>
              <p className="text-xs text-muted-foreground">Privileged Actions</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-muted">
              <CreditCard className="w-4 h-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-xl font-bold" data-testid="stat-subscription-events">{subscriptionEvents.length}</p>
              <p className="text-xs text-muted-foreground">Billing Events</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-4 space-y-3">
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Filter by action, entity type, or IP address..."
              value={filter}
              onChange={e => setFilter(e.target.value)}
              className="text-xs"
              data-testid="input-security-log-filter"
            />
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">No audit events found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="pb-2 text-left font-medium">Action</th>
                    <th className="pb-2 text-left font-medium">Entity</th>
                    <th className="pb-2 text-left font-medium hidden sm:table-cell">IP</th>
                    <th className="pb-2 text-left font-medium hidden md:table-cell">Actor Type</th>
                    <th className="pb-2 text-left font-medium">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, 100).map((log: any) => (
                    <tr key={log.id} className="border-b last:border-0 hover:bg-muted/30" data-testid={`row-security-log-${log.id}`}>
                      <td className="py-1.5 pr-2">
                        <Badge variant={getActionBadgeVariant(log.action)} className="text-[9px] font-mono">
                          {log.action}
                        </Badge>
                      </td>
                      <td className="py-1.5 pr-2 text-muted-foreground">{log.entityType || "—"}</td>
                      <td className="py-1.5 pr-2 font-mono text-muted-foreground hidden sm:table-cell">
                        {log.ipAddress || "—"}
                      </td>
                      <td className="py-1.5 pr-2 text-muted-foreground hidden md:table-cell">
                        {log.actorType || "user"}
                      </td>
                      <td className="py-1.5 text-muted-foreground whitespace-nowrap">
                        {log.createdAt ? formatDistanceToNow(new Date(log.createdAt), { addSuffix: true }) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtered.length > 100 && (
                <p className="text-xs text-muted-foreground text-center mt-2">
                  Showing 100 of {filtered.length} events
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
