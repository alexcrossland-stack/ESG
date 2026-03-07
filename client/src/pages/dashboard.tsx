import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from "recharts";
import {
  TrendingDown, TrendingUp, AlertTriangle, CheckCircle,
  Clock, Zap, Users, Shield, Target, Activity,
} from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

const COLORS = {
  environmental: "hsl(158, 64%, 32%)",
  social: "hsl(210, 85%, 38%)",
  governance: "hsl(280, 65%, 42%)",
};

function StatCard({ title, value, subtitle, icon: Icon, trend, color = "default" }: any) {
  return (
    <Card data-testid={`stat-${title.toLowerCase().replace(/\s+/g, "-")}`}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground mb-1">{title}</p>
            <p className="text-2xl font-bold tracking-tight">{value}</p>
            {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
          </div>
          <div className={`p-2 rounded-md ${color === "green" ? "bg-primary/10" : color === "blue" ? "bg-blue-500/10" : color === "purple" ? "bg-purple-500/10" : "bg-muted"}`}>
            <Icon className={`w-4 h-4 ${color === "green" ? "text-primary" : color === "blue" ? "text-blue-500" : color === "purple" ? "text-purple-500" : "text-muted-foreground"}`} />
          </div>
        </div>
        {trend !== undefined && (
          <div className="mt-2 flex items-center gap-1">
            {trend >= 0 ? (
              <TrendingUp className="w-3 h-3 text-primary" />
            ) : (
              <TrendingDown className="w-3 h-3 text-destructive" />
            )}
            <span className={`text-xs ${trend >= 0 ? "text-primary" : "text-destructive"}`}>
              {Math.abs(trend)}% vs last period
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/dashboard"] });
  const { data: authData } = useQuery<any>({ queryKey: ["/api/auth/me"] });

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
  const actions = data?.actions || [];
  const actionSummary = data?.actionSummary || {};
  const recentValues = data?.recentValues || [];

  // Build trend chart data
  const periods = [...new Set(recentValues.map((v: any) => v.period))].sort().slice(-6) as string[];

  const electricityData = periods.map(period => {
    const val = recentValues.find((v: any) => v.period === period && v.name === "Electricity Consumption");
    return { period: period.replace("2025-", ""), value: val ? parseFloat(val.value) : null };
  }).filter(d => d.value !== null);

  const employeeData = periods.map(period => {
    const val = recentValues.find((v: any) => v.period === period && v.name === "Total Employees");
    return { period: period.replace("2025-", ""), value: val ? parseFloat(val.value) : null };
  }).filter(d => d.value !== null);

  // Category breakdown
  const categoryData = [
    { name: "Environmental", value: recentValues.filter((v: any) => v.category === "environmental").length, color: COLORS.environmental },
    { name: "Social", value: recentValues.filter((v: any) => v.category === "social").length, color: COLORS.social },
    { name: "Governance", value: recentValues.filter((v: any) => v.category === "governance").length, color: COLORS.governance },
  ].filter(d => d.value > 0);

  // Overdue actions
  const overdueActions = actions.filter((a: any) => {
    const due = new Date(a.dueDate);
    return due < new Date() && a.status !== "complete";
  });

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
        {data?.latestPeriod && (
          <Badge variant="secondary" className="text-xs" data-testid="badge-latest-period">
            Latest data: {data.latestPeriod}
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

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Data Completion"
          value={`${data?.completionScore || 0}%`}
          subtitle={`${data?.totalMetrics || 0} metrics tracked`}
          icon={Activity}
          color="green"
        />
        <StatCard
          title="Actions Open"
          value={actionSummary.total - actionSummary.complete || 0}
          subtitle={`${actionSummary.complete || 0} completed`}
          icon={CheckCircle}
          color="blue"
        />
        <StatCard
          title="In Progress"
          value={actionSummary.inProgress || 0}
          subtitle="improvement actions"
          icon={Clock}
          color="purple"
        />
        <StatCard
          title="Overdue"
          value={actionSummary.overdue || overdueActions.length || 0}
          subtitle="actions past due"
          icon={AlertTriangle}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {electricityData.length > 0 && (
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
                <LineChart data={electricityData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 6 }}
                    formatter={(v: any) => [`${v.toLocaleString()} kWh`, "Electricity"]}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke={COLORS.environmental}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {employeeData.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-500" />
                Workforce Size
              </CardTitle>
              <CardDescription className="text-xs">Total headcount over time</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={employeeData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} domain={['auto', 'auto']} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 6 }}
                    formatter={(v: any) => [`${v} employees`, "Headcount"]}
                  />
                  <Bar dataKey="value" fill={COLORS.social} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* ESG breakdown */}
        {categoryData.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Data by Category</CardTitle>
              <CardDescription className="text-xs">Data points submitted</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie
                    data={categoryData}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={60}
                    dataKey="value"
                    paddingAngle={3}
                  >
                    {categoryData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Legend
                    iconSize={8}
                    iconType="circle"
                    formatter={(value) => <span style={{ fontSize: 11 }}>{value}</span>}
                  />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 6 }} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Completion score */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Target className="w-4 h-4 text-primary" />
              Reporting Score
            </CardTitle>
            <CardDescription className="text-xs">Data completeness for latest period</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-center">
              <span className="text-4xl font-bold text-primary" data-testid="text-completion-score">
                {data?.completionScore || 0}%
              </span>
            </div>
            <Progress value={data?.completionScore || 0} className="h-2" />
            <div className="space-y-2">
              {[
                { label: "Environmental", cat: "environmental", color: "bg-primary" },
                { label: "Social", cat: "social", color: "bg-blue-500" },
                { label: "Governance", cat: "governance", color: "bg-purple-500" },
              ].map(({ label, cat, color }) => {
                const catValues = recentValues.filter((v: any) =>
                  v.category === cat && v.period === data?.latestPeriod
                );
                const pct = data?.totalMetrics ? Math.round((catValues.length / Math.max(1, data.totalMetrics / 3)) * 100) : 0;
                return (
                  <div key={cat} className="flex items-center gap-2 text-xs">
                    <div className={`w-2 h-2 rounded-full ${color}`} />
                    <span className="flex-1 text-muted-foreground">{label}</span>
                    <span className="font-medium">{Math.min(100, pct)}%</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Recent actions */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-1">
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
      </div>
    </div>
  );
}
