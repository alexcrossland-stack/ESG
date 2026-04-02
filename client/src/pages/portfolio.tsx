import { useQuery } from "@tanstack/react-query";
import { useLocation, Link, Redirect } from "wouter";
import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Building2, Users, AlertTriangle, FileText, CheckCircle, BarChart3,
  Search, ChevronRight, ArrowUpDown, RefreshCw, Clock, Activity,
  ExternalLink, Info, Filter, Plus,
} from "lucide-react";
import { usePortfolioAccess, type PortfolioGroup } from "@/hooks/use-portfolio-access";
import { formatDistanceToNow } from "date-fns";
import { authFetch } from "@/lib/queryClient";

function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) return <span className="text-xs text-muted-foreground">—</span>;
  const color = score >= 70 ? "text-emerald-600 dark:text-emerald-400" : score >= 40 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400";
  return <span className={`text-sm font-semibold ${color}`}>{score}%</span>;
}

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, { variant: "default" | "secondary" | "outline" | "destructive"; label: string }> = {
    "Active": { variant: "default", label: "Active" },
    "Report available": { variant: "default", label: "Report ready" },
    "Onboarding incomplete": { variant: "secondary", label: "Onboarding" },
    "Not started": { variant: "outline", label: "Not started" },
  };
  const v = variants[status] || { variant: "outline", label: status };
  return <Badge variant={v.variant} className="text-xs">{v.label}</Badge>;
}

function GroupSwitcher({ groups, activeGroupId, onSwitch }: { groups: PortfolioGroup[]; activeGroupId: string | null; onSwitch: (id: string) => void }) {
  if (groups.length <= 1) return null;
  return (
    <Select value={activeGroupId || ""} onValueChange={onSwitch}>
      <SelectTrigger className="w-56" data-testid="select-active-group">
        <SelectValue placeholder="Select group" />
      </SelectTrigger>
      <SelectContent>
        {groups.map(g => (
          <SelectItem key={g.id} value={g.id} data-testid={`group-option-${g.id}`}>
            <span className="flex items-center gap-1.5">
              <Building2 className="w-3 h-3" />
              {g.name} ({g.companyCount} {g.companyCount === 1 ? "company" : "companies"})
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function SummaryCards({ groupId }: { groupId: string }) {
  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/portfolio/groups", groupId, "summary"],
    queryFn: () => authFetch(`/api/portfolio/groups/${groupId}/summary`).then(r => r.json()),
    enabled: !!groupId,
  });

  const cards = [
    { label: "Total Companies", value: data?.totalCompanies ?? 0, icon: Building2, color: "text-primary", testId: "card-total-companies" },
    { label: "Portfolio ESG Score", value: data?.averageEsgScore != null ? `${data.averageEsgScore}%` : "—", icon: BarChart3, color: "text-primary", testId: "card-esg-score" },
    { label: "Missing Data", value: data?.missingDataCount ?? 0, icon: AlertTriangle, color: "text-amber-500", testId: "card-missing-data" },
    { label: "Overdue Updates", value: data?.overdueUpdatesCount ?? 0, icon: Clock, color: "text-amber-500", testId: "card-overdue-updates" },
    { label: "Reports Ready", value: data?.reportsReadyCount ?? 0, icon: FileText, color: "text-emerald-500", testId: "card-reports-ready" },
    { label: "High-Risk Flags", value: data?.highRiskFlagsCount ?? 0, icon: AlertTriangle, color: "text-red-500", testId: "card-high-risk" },
  ];

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4" data-testid="summary-cards-loading">
        {cards.map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4" data-testid="summary-cards">
      {cards.map(card => (
        <Card key={card.label} data-testid={card.testId}>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 mb-1">
              <card.icon className={`w-4 h-4 ${card.color}`} />
              <span className="text-xs text-muted-foreground">{card.label}</span>
            </div>
            <p className="text-2xl font-bold">{card.value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function CompanyTable({ groupId }: { groupId: string }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState("companyName");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const pageSize = 10;
  const [, navigate] = useLocation();

  const queryParams = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
    ...(search ? { search } : {}),
    ...(statusFilter !== "all" ? { status: statusFilter } : {}),
    sortBy,
    sortDir,
  });

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/portfolio/groups", groupId, "companies", page, search, statusFilter, sortBy, sortDir],
    queryFn: () => authFetch(`/api/portfolio/groups/${groupId}/companies?${queryParams}`).then(r => r.json()),
    enabled: !!groupId,
  });

  const companies = data?.companies || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / pageSize);

  function toggleSort(col: string) {
    if (sortBy === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortBy(col); setSortDir("asc"); }
    setPage(1);
  }

  const SortIcon = ({ col }: { col: string }) => (
    <ArrowUpDown className={`w-3 h-3 ml-1 inline ${sortBy === col ? "text-primary" : "text-muted-foreground"}`} />
  );

  if (!isLoading && companies.length === 0 && !search && statusFilter === "all") {
    return (
      <Card data-testid="table-empty-no-companies">
        <CardContent className="py-12 text-center space-y-2">
          <Building2 className="w-10 h-10 text-muted-foreground mx-auto" />
          <p className="font-medium">No companies in this group</p>
          <p className="text-sm text-muted-foreground">Companies will appear here once they've been added to this group. Contact your administrator to add companies.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3" data-testid="company-comparison-table">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search companies..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="pl-9"
            data-testid="input-search-companies"
          />
        </div>
        <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-44" data-testid="select-status-filter">
            <Filter className="w-3.5 h-3.5 mr-1.5" />
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" data-testid="filter-status-all">All statuses</SelectItem>
            <SelectItem value="active" data-testid="filter-status-active">Active</SelectItem>
            <SelectItem value="onboarding" data-testid="filter-status-onboarding">Onboarding</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded" />)}
        </div>
      ) : (
        <div className="rounded-lg border overflow-x-auto">
          <table className="w-full text-sm" data-testid="table-companies">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left py-2.5 px-3 font-medium cursor-pointer whitespace-nowrap" onClick={() => toggleSort("companyName")} data-testid="sort-company-name">
                  Company Name <SortIcon col="companyName" />
                </th>
                <th className="text-left py-2.5 px-3 font-medium whitespace-nowrap hidden md:table-cell">Sector</th>
                <th className="text-left py-2.5 px-3 font-medium whitespace-nowrap hidden lg:table-cell">Size</th>
                <th className="text-left py-2.5 px-3 font-medium cursor-pointer whitespace-nowrap" onClick={() => toggleSort("esgScore")} data-testid="sort-esg-score">
                  ESG Score <SortIcon col="esgScore" />
                </th>
                <th className="text-left py-2.5 px-3 font-medium whitespace-nowrap hidden xl:table-cell">E</th>
                <th className="text-left py-2.5 px-3 font-medium whitespace-nowrap hidden xl:table-cell">S</th>
                <th className="text-left py-2.5 px-3 font-medium whitespace-nowrap hidden xl:table-cell">G</th>
                <th className="text-left py-2.5 px-3 font-medium whitespace-nowrap hidden md:table-cell">Status</th>
                <th className="text-left py-2.5 px-3 font-medium whitespace-nowrap">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {companies.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-muted-foreground" data-testid="table-no-results">
                    No companies match your search
                  </td>
                </tr>
              ) : (
                companies.map((co: any, i: number) => (
                  <tr
                    key={co.companyId}
                    className="hover:bg-muted/40 cursor-pointer transition-colors"
                    onClick={() => navigate(`/?portfolioCompanyId=${co.companyId}&from=portfolio`)}
                    data-testid={`row-company-${co.companyId}`}
                  >
                    <td className="py-2.5 px-3 font-medium">
                      <div className="flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        {co.companyName}
                        {co.alertCount > 0 && <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-muted-foreground hidden md:table-cell">{co.sector || "—"}</td>
                    <td className="py-2.5 px-3 text-muted-foreground hidden lg:table-cell">{co.sizeBand || "—"}</td>
                    <td className="py-2.5 px-3"><ScoreBadge score={co.esgScore} /></td>
                    <td className="py-2.5 px-3 hidden xl:table-cell"><ScoreBadge score={co.environmentalScore} /></td>
                    <td className="py-2.5 px-3 hidden xl:table-cell"><ScoreBadge score={co.socialScore} /></td>
                    <td className="py-2.5 px-3 hidden xl:table-cell"><ScoreBadge score={co.governanceScore} /></td>
                    <td className="py-2.5 px-3 hidden md:table-cell"><StatusBadge status={co.reportingStatus} /></td>
                    <td className="py-2.5 px-3">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs"
                        onClick={e => { e.stopPropagation(); navigate(`/?portfolioCompanyId=${co.companyId}&from=portfolio`); }}
                        data-testid={`button-view-company-${co.companyId}`}
                      >
                        View <ChevronRight className="w-3 h-3 ml-1" />
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm" data-testid="pagination-controls">
          <span className="text-muted-foreground">
            Showing {((page - 1) * pageSize) + 1}–{Math.min(page * pageSize, total)} of {total} companies
          </span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)} data-testid="button-page-prev">
              Previous
            </Button>
            <span className="px-2 text-muted-foreground">{page} / {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage(p => p + 1)} data-testid="button-page-next">
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function AlertsPanel({ groupId }: { groupId: string }) {
  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/portfolio/groups", groupId, "alerts"],
    queryFn: () => authFetch(`/api/portfolio/groups/${groupId}/alerts`).then(r => r.json()),
    enabled: !!groupId,
  });

  if (isLoading) return <Skeleton className="h-48" />;

  const categories = [
    { key: "neverOnboarded", label: "Never completed onboarding", items: data?.neverOnboarded || [] },
    { key: "missingEvidence", label: "Missing evidence", items: data?.missingEvidence || [] },
    { key: "overdueUpdates", label: "Overdue updates", items: data?.overdueUpdates || [] },
    { key: "noRecentReport", label: "No recent report", items: data?.noRecentReport || [] },
  ].filter(c => c.items.length > 0);

  if (categories.length === 0) {
    return (
      <Card data-testid="alerts-panel-empty">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-500" />
            All Clear
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No companies need attention right now.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="alerts-panel">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-500" />
          Needs Attention
        </CardTitle>
        <CardDescription className="text-xs">Companies that may need action</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {categories.map(cat => (
          <div key={cat.key} data-testid={`alerts-category-${cat.key}`}>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">{cat.label}</p>
            <div className="space-y-1">
              {cat.items.map((item: any) => (
                <div key={item.companyId} className="flex items-center justify-between gap-2 py-1" data-testid={`alert-company-${item.companyId}`}>
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Building2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="text-sm truncate">{item.companyName}</span>
                  </div>
                  <Link
                    href={`/?portfolioCompanyId=${item.companyId}&from=portfolio`}
                    className="text-xs text-primary hover:underline whitespace-nowrap shrink-0"
                    data-testid={`link-alert-company-${item.companyId}`}
                    onClick={e => e.stopPropagation()}
                  >
                    View <ExternalLink className="w-2.5 h-2.5 inline ml-0.5" />
                  </Link>
                </div>
              ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function ActivityFeedPanel({ groupId }: { groupId: string }) {
  const { data, isLoading } = useQuery<any[]>({
    queryKey: ["/api/portfolio/groups", groupId, "activity"],
    queryFn: () => authFetch(`/api/portfolio/groups/${groupId}/activity`).then(r => r.json()),
    enabled: !!groupId,
  });

  if (isLoading) return <Skeleton className="h-48" />;

  const items = Array.isArray(data) ? data : [];

  return (
    <Card data-testid="activity-feed">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Activity className="w-4 h-4 text-primary" />
          Recent Activity
        </CardTitle>
        <CardDescription className="text-xs">Last 20 actions across your portfolio</CardDescription>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center" data-testid="activity-empty">No recent activity to show.</p>
        ) : (
          <div className="space-y-2" data-testid="activity-list">
            {items.map((item: any) => (
              <div key={item.id} className="flex items-start justify-between gap-2 py-1.5 border-b border-border last:border-0" data-testid={`activity-item-${item.id}`}>
                <div className="flex items-start gap-2 min-w-0">
                  <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                    <Building2 className="w-3 h-3 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm leading-snug">
                      <span className="font-medium">{item.companyName}</span>
                      {" "}<span className="text-muted-foreground">{item.action}</span>
                    </p>
                    {item.actor && <p className="text-xs text-muted-foreground">by {item.actor}</p>}
                  </div>
                </div>
                <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                  {item.timestamp ? formatDistanceToNow(new Date(item.timestamp), { addSuffix: true }) : ""}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function NoGroupsState() {
  return (
    <div className="flex-1 flex items-center justify-center p-8" data-testid="portfolio-no-groups">
      <div className="max-w-md text-center space-y-4">
        <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mx-auto">
          <Building2 className="w-7 h-7 text-muted-foreground" />
        </div>
        <h2 className="text-lg font-semibold">No groups available</h2>
        <p className="text-sm text-muted-foreground">
          You don't have access to any portfolio groups yet. Contact your administrator to be added to a group.
        </p>
      </div>
    </div>
  );
}

export default function PortfolioPage() {
  const { isLoading, canAccessPortfolio, groups, activeGroup, activeGroupId, setActiveGroupId, isMultiGroup } = usePortfolioAccess();
  const [, navigate] = useLocation();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <p className="text-sm text-muted-foreground">Loading portfolio...</p>
        </div>
      </div>
    );
  }

  if (!canAccessPortfolio) {
    return <Redirect to="/" replace />;
  }

  if (groups.length === 0) {
    return <NoGroupsState />;
  }

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto" data-testid="portfolio-dashboard">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-portfolio-title">Portfolio Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track ESG progress and reporting status across all your companies.
          </p>
          {activeGroup && (
            <p className="text-sm font-medium mt-0.5" data-testid="text-active-group-name">
              {activeGroup.name} · {activeGroup.companyCount} {activeGroup.companyCount === 1 ? "company" : "companies"}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" onClick={() => navigate("/create-company")} data-testid="button-portfolio-create-company" className="gap-1.5">
            <Plus className="w-3.5 h-3.5" />
            Add Company
          </Button>
          {isMultiGroup && (
            <GroupSwitcher groups={groups} activeGroupId={activeGroupId} onSwitch={setActiveGroupId} />
          )}
        </div>
      </div>

      {activeGroupId && (
        <>
          <SummaryCards groupId={activeGroupId} />

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="xl:col-span-2 space-y-4">
              <h2 className="text-base font-semibold">Company Overview</h2>
              <CompanyTable groupId={activeGroupId} />
            </div>
            <div className="space-y-4">
              <h2 className="text-base font-semibold">Alerts</h2>
              <AlertsPanel groupId={activeGroupId} />
              <h2 className="text-base font-semibold">Recent Activity</h2>
              <ActivityFeedPanel groupId={activeGroupId} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
