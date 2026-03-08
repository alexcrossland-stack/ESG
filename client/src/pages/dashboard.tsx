import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts";
import {
  TrendingDown, TrendingUp, AlertTriangle, CheckCircle,
  Clock, Zap, Users, Shield, Target, Activity, Leaf, ArrowUp, ArrowDown,
} from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

const COLORS = {
  environmental: "hsl(158, 64%, 32%)",
  social: "hsl(210, 85%, 38%)",
  governance: "hsl(280, 65%, 42%)",
};

function StatusDot({ status, size = "sm" }: { status: string; size?: "sm" | "md" }) {
  const colors: Record<string, string> = {
    green: "bg-emerald-500",
    amber: "bg-amber-500",
    red: "bg-red-500",
    missing: "bg-gray-300",
  };
  const sizeClass = size === "md" ? "w-3 h-3" : "w-2 h-2";
  return <div className={`${sizeClass} rounded-full shrink-0 ${colors[status] || colors.missing}`} />;
}

function ScoreRing({ score, label }: { score: number; label: string }) {
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;
  const color = score >= 70 ? "text-emerald-500" : score >= 40 ? "text-amber-500" : "text-red-500";
  const strokeColor = score >= 70 ? "stroke-emerald-500" : score >= 40 ? "stroke-amber-500" : "stroke-red-500";

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-24 h-24">
        <svg className="w-24 h-24 -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r={radius} fill="none" className="stroke-muted" strokeWidth="8" />
          <circle
            cx="50" cy="50" r={radius} fill="none"
            className={strokeColor}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={`text-xl font-bold ${color}`} data-testid="text-esg-score">{score}%</span>
        </div>
      </div>
      <p className="text-xs text-muted-foreground mt-1">{label}</p>
    </div>
  );
}

function CategoryBar({ label, counts, color }: {
  label: string;
  counts: { green: number; amber: number; red: number; missing: number; total: number };
  color: string;
}) {
  const total = counts.total || 1;
  const greenPct = (counts.green / total) * 100;
  const amberPct = (counts.amber / total) * 100;
  const redPct = (counts.red / total) * 100;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">{label}</p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><StatusDot status="green" /> {counts.green}</span>
          <span className="flex items-center gap-1"><StatusDot status="amber" /> {counts.amber}</span>
          <span className="flex items-center gap-1"><StatusDot status="red" /> {counts.red}</span>
        </div>
      </div>
      <div className="flex h-2 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-800">
        {greenPct > 0 && <div className="bg-emerald-500 transition-all" style={{ width: `${greenPct}%` }} />}
        {amberPct > 0 && <div className="bg-amber-500 transition-all" style={{ width: `${amberPct}%` }} />}
        {redPct > 0 && <div className="bg-red-500 transition-all" style={{ width: `${redPct}%` }} />}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { data: enhanced, isLoading: enhancedLoading } = useQuery<any>({ queryKey: ["/api/dashboard/enhanced"] });
  const { data: oldData, isLoading: oldLoading } = useQuery<any>({ queryKey: ["/api/dashboard"] });
  const { data: authData } = useQuery<any>({ queryKey: ["/api/auth/me"] });

  const isLoading = enhancedLoading || oldLoading;

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[...Array(2)].map((_, i) => <Skeleton key={i} className="h-64" />)}
        </div>
      </div>
    );
  }

  const company = authData?.company;
  const actions = oldData?.actions || [];
  const actionSummary = oldData?.actionSummary || {};
  const statusCounts = enhanced?.statusCounts || { green: 0, amber: 0, red: 0, missing: 0 };
  const categorySummary = enhanced?.categorySummary || {};
  const esgScore = enhanced?.esgScore || 0;
  const metricSummaries = enhanced?.metricSummaries || [];

  const overdueActions = actions.filter((a: any) => {
    const due = new Date(a.dueDate);
    return due < new Date() && a.status !== "complete";
  });

  const envMetrics = metricSummaries.filter((m: any) => m.category === "environmental");
  const socialMetrics = metricSummaries.filter((m: any) => m.category === "social");

  const emissionsTrend = envMetrics
    .filter((m: any) => ["Scope 1 Emissions", "Scope 2 Emissions"].includes(m.name))
    .flatMap((m: any) => (m.trend || []).map((t: any) => ({ ...t, metric: m.name })));

  const periodEmissions: Record<string, any> = {};
  emissionsTrend.forEach((t: any) => {
    if (!periodEmissions[t.period]) periodEmissions[t.period] = { period: t.period.replace("2025-", "") };
    if (t.metric === "Scope 1 Emissions") periodEmissions[t.period].scope1 = t.value;
    if (t.metric === "Scope 2 Emissions") periodEmissions[t.period].scope2 = t.value;
  });
  const emissionsChartData = Object.values(periodEmissions);

  const electricityMetric = envMetrics.find((m: any) => m.name === "Electricity Consumption");
  const electricityChart = (electricityMetric?.trend || []).map((t: any) => ({
    period: t.period?.replace("2025-", ""),
    value: t.value,
  }));

  const workforceMetric = socialMetrics.find((m: any) => m.name === "Total Employees");
  const workforceChart = (workforceMetric?.trend || []).map((t: any) => ({
    period: t.period?.replace("2025-", ""),
    value: t.value,
  }));

  const attentionMetrics = metricSummaries
    .filter((m: any) => m.status === "red" || m.status === "amber")
    .slice(0, 5);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold" data-testid="text-dashboard-title">
            {company?.name ? `${company.name} — ESG Dashboard` : "ESG Dashboard"}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Your ESG performance at a glance
          </p>
        </div>
        {enhanced?.latestPeriod && (
          <Badge variant="secondary" className="text-xs" data-testid="badge-latest-period">
            Latest data: {enhanced.latestPeriod}
          </Badge>
        )}
      </div>

      {overdueActions.length > 0 && (
        <Alert data-testid="alert-overdue">
          <AlertTriangle className="w-4 h-4" />
          <AlertDescription>
            {overdueActions.length} action{overdueActions.length > 1 ? "s are" : " is"} overdue.{" "}
            <Link href="/actions" className="font-medium underline underline-offset-2">Review your action tracker</Link>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Card data-testid="stat-esg-score">
          <CardContent className="p-5 flex flex-col items-center">
            <ScoreRing score={esgScore} label="ESG Score" />
          </CardContent>
        </Card>

        <Card data-testid="stat-total-metrics">
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground mb-1">Total Metrics</p>
            <p className="text-2xl font-bold">{enhanced?.totalMetrics || 0}</p>
            <p className="text-xs text-muted-foreground mt-1">tracked</p>
          </CardContent>
        </Card>

        <Card data-testid="stat-on-track" className="border-emerald-200 dark:border-emerald-800">
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground mb-1">On Track</p>
            <p className="text-2xl font-bold text-emerald-600">{statusCounts.green}</p>
            <p className="text-xs text-muted-foreground mt-1">green status</p>
          </CardContent>
        </Card>

        <Card data-testid="stat-at-risk" className="border-amber-200 dark:border-amber-800">
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground mb-1">At Risk</p>
            <p className="text-2xl font-bold text-amber-600">{statusCounts.amber}</p>
            <p className="text-xs text-muted-foreground mt-1">amber status</p>
          </CardContent>
        </Card>

        <Card data-testid="stat-off-track" className="border-red-200 dark:border-red-800">
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground mb-1">Off Track</p>
            <p className="text-2xl font-bold text-red-600">{statusCounts.red}</p>
            <p className="text-xs text-muted-foreground mt-1">red status</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Category Performance</CardTitle>
            <CardDescription className="text-xs">Traffic light status by ESG category</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <CategoryBar label="Environmental" counts={categorySummary.environmental || { green: 0, amber: 0, red: 0, missing: 0, total: 0 }} color={COLORS.environmental} />
            <CategoryBar label="Social" counts={categorySummary.social || { green: 0, amber: 0, red: 0, missing: 0, total: 0 }} color={COLORS.social} />
            <CategoryBar label="Governance" counts={categorySummary.governance || { green: 0, amber: 0, red: 0, missing: 0, total: 0 }} color={COLORS.governance} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                Needs Attention
              </CardTitle>
            </div>
            <CardDescription className="text-xs">Metrics at risk or off track</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {attentionMetrics.map((m: any) => (
                <div key={m.id} className="flex items-center gap-2 py-1.5 border-b border-border last:border-0">
                  <StatusDot status={m.status} size="md" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{m.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {m.latestValue !== null ? `${m.latestValue} ${m.unit || ""}` : "No data"}
                    </p>
                  </div>
                  {m.percentChange !== null && (
                    <span className={`text-xs flex items-center gap-0.5 ${
                      (m.direction === "lower_is_better" ? m.percentChange < 0 : m.percentChange > 0) ? "text-emerald-600" : "text-red-500"
                    }`}>
                      {m.percentChange > 0 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                      {Math.abs(m.percentChange).toFixed(1)}%
                    </span>
                  )}
                </div>
              ))}
              {attentionMetrics.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">All metrics on track</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {emissionsChartData.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Leaf className="w-4 h-4 text-primary" />
                Carbon Emissions Trend
              </CardTitle>
              <CardDescription className="text-xs">Scope 1 & 2 emissions (tCO2e)</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={emissionsChartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 6 }} />
                  <Bar dataKey="scope1" name="Scope 1" fill={COLORS.environmental} radius={[3, 3, 0, 0]} stackId="a" />
                  <Bar dataKey="scope2" name="Scope 2" fill="hsl(158, 44%, 52%)" radius={[3, 3, 0, 0]} stackId="a" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {electricityChart.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Zap className="w-4 h-4 text-primary" />
                Electricity Consumption
              </CardTitle>
              <CardDescription className="text-xs">Monthly kWh — lower is better</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={electricityChart}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 6 }}
                    formatter={(v: any) => [`${v?.toLocaleString()} kWh`, "Electricity"]}
                  />
                  <Line type="monotone" dataKey="value" stroke={COLORS.environmental} strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {workforceChart.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-500" />
                Workforce
              </CardTitle>
              <CardDescription className="text-xs">Total headcount</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={workforceChart}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} domain={["auto", "auto"]} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 6 }} />
                  <Bar dataKey="value" fill={COLORS.social} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Shield className="w-4 h-4 text-purple-500" />
                Recent Actions
              </CardTitle>
              <Link href="/actions">
                <Button variant="ghost" size="sm" className="text-xs h-6 px-2">View all</Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {actions.slice(0, 4).map((action: any) => (
                <div key={action.id} className="flex items-start gap-2 py-1.5 border-b border-border last:border-0">
                  <div className={`mt-0.5 w-1.5 h-1.5 rounded-full shrink-0 ${
                    action.status === "complete" ? "bg-primary" :
                    action.status === "in_progress" ? "bg-blue-500" :
                    action.status === "overdue" ? "bg-destructive" :
                    "bg-muted-foreground"
                  }`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium truncate">{action.title}</p>
                    <p className="text-xs text-muted-foreground">{action.owner}</p>
                  </div>
                  <Badge variant={
                    action.status === "complete" ? "default" :
                    action.status === "in_progress" ? "secondary" : "outline"
                  } className="text-xs shrink-0">
                    {action.status?.replace(/_/g, " ")}
                  </Badge>
                </div>
              ))}
              {actions.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">No actions yet</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" />
              Quick Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              {[
                { label: "Actions Open", value: (actionSummary.total || 0) - (actionSummary.complete || 0), icon: CheckCircle, color: "text-blue-500" },
                { label: "In Progress", value: actionSummary.inProgress || 0, icon: Clock, color: "text-purple-500" },
                { label: "Missing Data", value: statusCounts.missing || 0, icon: AlertTriangle, color: "text-amber-500" },
              ].map(item => (
                <div key={item.label} className="flex items-center gap-2 text-sm">
                  <item.icon className={`w-3.5 h-3.5 ${item.color}`} />
                  <span className="flex-1 text-muted-foreground">{item.label}</span>
                  <span className="font-medium">{item.value}</span>
                </div>
              ))}
            </div>
            <div className="pt-2 border-t border-border">
              <Link href="/data-entry">
                <Button size="sm" variant="outline" className="w-full text-xs">
                  Enter Data
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
