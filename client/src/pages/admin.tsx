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
  DollarSign, Percent, ExternalLink,
} from "lucide-react";
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
    queryFn: () => fetch("/api/admin/revenue", { credentials: "include" }).then(r => r.json()),
  });

  if (isLoading) {
    return <div className="text-center py-12 text-muted-foreground text-sm">Loading revenue data…</div>;
  }

  const mrr = data?.estimatedMrr ?? 0;
  const totalCompanies = data?.totalCompanies ?? 0;
  const proCount = data?.proCount ?? 0;
  const freeCount = data?.freeCount ?? 0;
  const newPro30d = data?.newPro30d ?? 0;
  const conversionRate = data?.conversionRate ?? 0;
  const monthlyGrowth: any[] = data?.monthlyGrowth ?? [];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {[
          { label: "Total Companies", value: totalCompanies, icon: Building2 },
          { label: "Free Tier", value: freeCount, icon: Users },
          { label: "Pro Tier", value: proCount, icon: CreditCard },
          { label: "Estimated MRR", value: `£${mrr.toLocaleString()}`, icon: DollarSign },
          { label: "New Pro (30d)", value: newPro30d, icon: TrendingUp },
          { label: "Conversion Rate", value: `${conversionRate}%`, icon: Percent },
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
    queryFn: () => fetch("/api/admin/platform-health/summary", { credentials: "include" }).then(r => r.json()),
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
  const incidentsStatus = openIncidents > 0 ? "text-amber-500" : "text-emerald-600";

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Jobs Running", value: jobs.running ?? 0, color: "text-blue-500", icon: RefreshCw },
          { label: "Failed Jobs (24h)", value: jobs.failed24h ?? 0, color: jobsStatus, icon: XCircle },
          { label: "API Errors (24h)", value: apiErrors, color: errorsStatus, icon: AlertTriangle },
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
              <div className="space-y-1.5">
                {recentEvents.map((e: any, i: number) => (
                  <div key={e.id ?? i} className="flex items-center gap-2 text-xs" data-testid={`health-event-${i}`}>
                    <SeverityBadge severity={e.severity} />
                    <span className="flex-1 truncate">{e.message}</span>
                    <span className="text-muted-foreground shrink-0">
                      {e.created_at ? formatDistanceToNow(new Date(e.created_at), { addSuffix: true }) : ""}
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
              <FileText className="w-4 h-4" /> Recent Background Jobs
            </CardTitle>
          </CardHeader>
          <CardContent data-testid="health-jobs-mini">
            {recentJobs.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2 text-center">No jobs recorded</p>
            ) : (
              <div className="space-y-1.5">
                {recentJobs.map((j: any, i: number) => (
                  <div key={j.id ?? i} className="flex items-center gap-2 text-xs" data-testid={`health-job-${i}`}>
                    <JobStatusBadge status={j.status} />
                    <span className="flex-1 truncate">{j.job_type}</span>
                    <span className="text-muted-foreground shrink-0">
                      {j.created_at ? formatDistanceToNow(new Date(j.created_at), { addSuffix: true }) : ""}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="text-right">
        <Link href="/admin/health" data-testid="link-full-health-dashboard">
          <Button variant="outline" size="sm" className="gap-1.5">
            <ExternalLink className="w-3.5 h-3.5" />
            Full health dashboard
          </Button>
        </Link>
      </div>
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
    queryFn: () => fetch("/api/admin/stats", { credentials: "include" }).then(r => r.json()),
    enabled: role === "super_admin",
  });

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold" data-testid="heading-admin-console">Platform Admin Console</h1>
        <p className="text-muted-foreground text-sm mt-1">Manage all tenants, users, and platform health from one place.</p>
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
      </Tabs>
    </div>
  );
}
