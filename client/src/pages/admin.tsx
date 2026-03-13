import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { usePermissions } from "@/lib/permissions";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Building2, Users, CreditCard, AlertTriangle, Search, Eye, LogIn,
  ShieldOff, ShieldCheck, ChevronLeft, ChevronRight, RefreshCw, Activity,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

function StatCard({ label, value, icon: Icon, variant = "default" }: {
  label: string; value: number | string; icon: any; variant?: "default" | "warning" | "danger";
}) {
  const colorMap = {
    default: "text-primary",
    warning: "text-amber-500",
    danger: "text-destructive",
  };
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

function CompaniesTable({ onSelect }: { onSelect: (company: any) => void }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [confirmAction, setConfirmAction] = useState<{ type: "suspend" | "reactivate" | "impersonate"; company: any } | null>(null);
  const { toast } = useToast();
  const PAGE_SIZE = 50;

  const { data, isLoading, refetch } = useQuery<{ companies: any[]; total: number }>({
    queryKey: ["/api/admin/companies", search, page],
    queryFn: () =>
      fetch(`/api/admin/companies?search=${encodeURIComponent(search)}&page=${page}&pageSize=${PAGE_SIZE}`, { credentials: "include" })
        .then(r => r.json()),
  });

  const suspendMut = useMutation({
    mutationFn: (companyId: string) => apiRequest("POST", "/api/admin/company/suspend", { companyId }),
    onSuccess: () => {
      toast({ title: "Company suspended" });
      setConfirmAction(null);
      refetch();
      queryClient.invalidateQueries({ queryKey: ["/api/admin/companies"] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const reactivateMut = useMutation({
    mutationFn: (companyId: string) => apiRequest("POST", "/api/admin/company/reactivate", { companyId }),
    onSuccess: () => {
      toast({ title: "Company reactivated" });
      setConfirmAction(null);
      refetch();
      queryClient.invalidateQueries({ queryKey: ["/api/admin/companies"] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const impersonateMut = useMutation({
    mutationFn: (companyId: string) =>
      apiRequest("POST", `/api/admin/impersonate/${companyId}`, {}),
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
          <Input
            className="pl-9"
            placeholder="Search companies…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            data-testid="input-company-search"
          />
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
                    <Badge variant={c.plan_tier === "pro" ? "default" : "secondary"}>
                      {c.plan_tier ?? "free"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={c.status === "suspended" ? "destructive" : "outline"}>
                      {c.status ?? "active"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">{c.user_count ?? 0}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {c.created_at ? formatDistanceToNow(new Date(c.created_at), { addSuffix: true }) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        size="sm" variant="ghost"
                        onClick={() => onSelect(c)}
                        data-testid={`button-view-${c.id}`}
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        size="sm" variant="ghost"
                        onClick={() => setConfirmAction({ type: "impersonate", company: c })}
                        data-testid={`button-impersonate-${c.id}`}
                      >
                        <LogIn className="w-3.5 h-3.5" />
                      </Button>
                      {c.status === "suspended" ? (
                        <Button
                          size="sm" variant="ghost"
                          onClick={() => setConfirmAction({ type: "reactivate", company: c })}
                          data-testid={`button-reactivate-${c.id}`}
                        >
                          <ShieldCheck className="w-3.5 h-3.5 text-green-600" />
                        </Button>
                      ) : (
                        <Button
                          size="sm" variant="ghost"
                          onClick={() => setConfirmAction({ type: "suspend", company: c })}
                          data-testid={`button-suspend-${c.id}`}
                        >
                          <ShieldOff className="w-3.5 h-3.5 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {companies.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-muted-foreground">No companies found</td>
                </tr>
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
              {confirmAction?.type === "impersonate" ? "Impersonate Company" :
               confirmAction?.type === "suspend" ? "Suspend Company" : "Reactivate Company"}
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
              {confirmAction?.type === "impersonate" ? "Start Impersonation" :
               confirmAction?.type === "suspend" ? "Suspend" : "Reactivate"}
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
          <Input
            className="pl-9"
            placeholder="Search by email or username…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            data-testid="input-user-search"
          />
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
                    <Badge variant={u.role === "super_admin" ? "default" : u.role === "admin" ? "secondary" : "outline"}>
                      {u.role}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{u.company_name ?? "—"}</td>
                  <td className="px-4 py-3">
                    {u.company_status ? (
                      <Badge variant={u.company_status === "suspended" ? "destructive" : "outline"}>
                        {u.company_status}
                      </Badge>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {u.created_at ? formatDistanceToNow(new Date(u.created_at), { addSuffix: true }) : "—"}
                  </td>
                </tr>
              ))}
              {usersList.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-muted-foreground">No users found</td>
                </tr>
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

export default function AdminPage() {
  const { role } = usePermissions();
  const [, navigate] = useLocation();
  const params = useParams<{ companyId?: string }>();
  const urlCompanyId = params?.companyId ?? null;

  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(urlCompanyId);

  useEffect(() => {
    if (role && role !== "super_admin") {
      navigate("/");
    }
  }, [role, navigate]);

  useEffect(() => {
    setSelectedCompanyId(urlCompanyId);
  }, [urlCompanyId]);

  const handleSelectCompany = (company: any) => {
    setSelectedCompanyId(company.id);
    navigate(`/admin/companies/${company.id}`);
  };

  const handleCloseDetail = () => {
    setSelectedCompanyId(null);
    navigate("/admin");
  };

  const { data: stats, isLoading: statsLoading } = useQuery<any>({
    queryKey: ["/api/admin/stats"],
    queryFn: () => fetch("/api/admin/stats", { credentials: "include" }).then(r => r.json()),
    enabled: role === "super_admin",
  });

  const { data: companyDetail, isLoading: detailLoading } = useQuery<any>({
    queryKey: ["/api/admin/company", selectedCompanyId],
    queryFn: () =>
      fetch(`/api/admin/company/${selectedCompanyId}`, { credentials: "include" }).then(r => r.json()),
    enabled: !!selectedCompanyId,
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
            <Building2 className="w-4 h-4 mr-2" />
            Companies
          </TabsTrigger>
          <TabsTrigger value="users" data-testid="tab-users">
            <Users className="w-4 h-4 mr-2" />
            Users
          </TabsTrigger>
        </TabsList>
        <TabsContent value="companies" className="mt-4">
          <CompaniesTable onSelect={handleSelectCompany} />
        </TabsContent>
        <TabsContent value="users" className="mt-4">
          <UsersTable />
        </TabsContent>
      </Tabs>

      <Dialog open={!!selectedCompanyId} onOpenChange={(open) => { if (!open) handleCloseDetail(); }}>
        <DialogContent className="max-w-2xl" data-testid="dialog-company-detail">
          <DialogHeader>
            <DialogTitle>{companyDetail?.name ?? selectedCompanyId}</DialogTitle>
            <DialogDescription>Company details and recent admin actions</DialogDescription>
          </DialogHeader>
          {detailLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
          ) : companyDetail ? (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-4">
                <div><span className="text-muted-foreground">Industry:</span> {companyDetail.industry ?? "—"}</div>
                <div><span className="text-muted-foreground">Country:</span> {companyDetail.country ?? "—"}</div>
                <div><span className="text-muted-foreground">Plan:</span> <Badge variant="outline">{companyDetail.planTier ?? "free"}</Badge></div>
                <div><span className="text-muted-foreground">Status:</span> <Badge variant={companyDetail.status === "suspended" ? "destructive" : "outline"}>{companyDetail.status ?? "active"}</Badge></div>
                <div><span className="text-muted-foreground">Employees:</span> {companyDetail.employeeCount ?? "—"}</div>
                <div><span className="text-muted-foreground">Onboarded:</span> {companyDetail.onboardingComplete ? "Yes" : "No"}</div>
              </div>
              <div>
                <p className="font-medium mb-2">Counts</p>
                <div className="grid grid-cols-4 gap-2">
                  {Object.entries(companyDetail.counts ?? {}).map(([k, v]) => (
                    <div key={k} className="text-center p-2 bg-muted rounded">
                      <p className="text-lg font-bold">{String(v)}</p>
                      <p className="text-xs text-muted-foreground capitalize">{k}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="font-medium mb-2">Users ({companyDetail.users?.length ?? 0})</p>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {(companyDetail.users ?? []).map((u: any) => (
                    <div key={u.id} className="flex items-center justify-between px-2 py-1 bg-muted/50 rounded text-xs">
                      <span>{u.username} ({u.email})</span>
                      <Badge variant="secondary">{u.role}</Badge>
                    </div>
                  ))}
                </div>
              </div>
              {(companyDetail.recentAdminActions ?? []).length > 0 && (
                <div>
                  <p className="font-medium mb-2">Recent Admin Actions</p>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {companyDetail.recentAdminActions.map((a: any) => (
                      <div key={a.id} className="flex items-center justify-between px-2 py-1 bg-muted/50 rounded text-xs">
                        <span className="font-mono">{a.action}</span>
                        <span className="text-muted-foreground">
                          {a.created_at ? formatDistanceToNow(new Date(a.created_at), { addSuffix: true }) : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
