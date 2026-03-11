import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Activity, Server, AlertTriangle, CheckCircle, XCircle,
  Clock, FileText, RefreshCw, Database, Gauge, TrendingUp,
  Zap, HardDrive,
} from "lucide-react";
import { useState } from "react";

function StatusCard({ title, icon: Icon, status, value, subtitle }: { title: string; icon: any; status: "green" | "amber" | "red"; value: string; subtitle: string }) {
  const colors = {
    green: "border-emerald-500 bg-emerald-50 dark:bg-emerald-950",
    amber: "border-amber-500 bg-amber-50 dark:bg-amber-950",
    red: "border-red-500 bg-red-50 dark:bg-red-950",
  };
  const dotColors = { green: "bg-emerald-500", amber: "bg-amber-500", red: "bg-red-500" };

  return (
    <Card className={`border-l-4 ${colors[status]}`} data-testid={`health-card-${title.toLowerCase().replace(/\s+/g, "-")}`}>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <Icon className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">{title}</span>
          <div className={`w-2 h-2 rounded-full ${dotColors[status]} ml-auto`} />
        </div>
        <p className="text-2xl font-bold">{value}</p>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </CardContent>
    </Card>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const config: Record<string, { className: string }> = {
    info: { className: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
    warning: { className: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200" },
    error: { className: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" },
    critical: { className: "bg-red-200 text-red-900 dark:bg-red-800 dark:text-red-100" },
  };
  return <Badge className={config[severity]?.className || ""} data-testid={`badge-severity-${severity}`}>{severity}</Badge>;
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { className: string; icon: any }> = {
    completed: { className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200", icon: CheckCircle },
    running: { className: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200", icon: RefreshCw },
    failed: { className: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200", icon: XCircle },
    pending: { className: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200", icon: Clock },
  };
  const c = config[status] || config.pending;
  return (
    <Badge className={c.className} data-testid={`badge-job-status-${status}`}>
      <c.icon className="w-3 h-3 mr-1" />
      {status}
    </Badge>
  );
}

function PerfBar({ label, value, max, unit = "ms" }: { label: string; value: number; max: number; unit?: string }) {
  const pct = Math.min((value / max) * 100, 100);
  const color = value > 2000 ? "bg-red-500" : value > 500 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-48 text-xs truncate text-muted-foreground">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-16 text-right text-xs font-mono">{Math.round(value)}{unit}</span>
    </div>
  );
}

export default function AdminHealthPage() {
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: health, isLoading: loadingHealth } = useQuery<any>({
    queryKey: ["/api/admin/health"],
    refetchInterval: 30000,
  });

  const { data: events, isLoading: loadingEvents } = useQuery<any[]>({
    queryKey: ["/api/admin/health/events"],
    refetchInterval: 30000,
  });

  const { data: jobs, isLoading: loadingJobs } = useQuery<any[]>({
    queryKey: ["/api/admin/health/jobs"],
    refetchInterval: 30000,
  });

  const { data: perfData } = useQuery<any>({
    queryKey: ["/api/admin/performance"],
    refetchInterval: 60000,
  });

  if (loadingHealth) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
      </div>
    );
  }

  const schedulerStatus = health?.backgroundJobs?.failed24h === 0 ? "green" : health?.backgroundJobs?.failed24h < 5 ? "amber" : "red";
  const apiStatus = health?.apiErrors?.count24h === 0 ? "green" : health?.apiErrors?.count24h < 10 ? "amber" : "red";
  const reportStatus = health?.reportFailures?.count24h === 0 ? "green" : "red";

  const filteredJobs = statusFilter === "all" ? (jobs || []) : (jobs || []).filter(j => j.status === statusFilter);

  const uptimeHours = health?.uptime ? Math.floor(health.uptime / 3600000) : 0;
  const uptimeMinutes = health?.uptime ? Math.floor((health.uptime % 3600000) / 60000) : 0;

  const dbStats = perfData?.database;
  const tableStats = perfData?.tables || [];
  const indexCount = perfData?.indexCount || 0;

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-health-title">Platform Health</h1>
        <p className="text-sm text-muted-foreground mt-1">System monitoring, performance, and diagnostics (auto-refreshes)</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatusCard title="Scheduler" icon={Server} status={schedulerStatus} value={`${health?.backgroundJobs?.completed24h || 0} completed`} subtitle={`${health?.backgroundJobs?.failed24h || 0} failed (24h)`} />
        <StatusCard title="API Errors" icon={AlertTriangle} status={apiStatus} value={`${health?.apiErrors?.count24h || 0}`} subtitle="errors in last 24h" />
        <StatusCard title="Reports" icon={FileText} status={reportStatus} value={`${health?.reportFailures?.count24h || 0} failures`} subtitle="in last 24h" />
        <StatusCard title="Uptime" icon={Activity} status="green" value={`${uptimeHours}h ${uptimeMinutes}m`} subtitle="since last restart" />
      </div>

      <Tabs defaultValue="events" className="space-y-4">
        <TabsList data-testid="health-tabs">
          <TabsTrigger value="events" data-testid="tab-events">Health Events</TabsTrigger>
          <TabsTrigger value="jobs" data-testid="tab-jobs">Background Jobs</TabsTrigger>
          <TabsTrigger value="performance" data-testid="tab-performance">Performance</TabsTrigger>
        </TabsList>

        <TabsContent value="events">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Recent Health Events</CardTitle>
            </CardHeader>
            <CardContent>
              {loadingEvents ? (
                <Skeleton className="h-32" />
              ) : (events || []).length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No health events recorded</p>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {(events || []).slice(0, 20).map((e: any) => (
                    <div key={e.id} className="flex items-start gap-3 p-2 rounded-lg border text-sm" data-testid={`event-${e.id}`}>
                      <SeverityBadge severity={e.severity} />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-xs">{e.message}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{e.eventType} | {new Date(e.createdAt).toLocaleString()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="jobs">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Background Jobs</CardTitle>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-32 h-8 text-xs" data-testid="select-job-filter">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                    <SelectItem value="running">Running</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {loadingJobs ? (
                <Skeleton className="h-32" />
              ) : filteredJobs.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No jobs found</p>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {filteredJobs.slice(0, 30).map((j: any) => (
                    <div key={j.id} className="flex items-center gap-3 p-2 rounded-lg border text-sm" data-testid={`job-${j.id}`}>
                      <StatusBadge status={j.status} />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-xs">{j.jobType}</p>
                        <p className="text-[10px] text-muted-foreground">
                          Attempts: {j.attempts}/{j.maxAttempts}
                          {j.completedAt && ` | Completed: ${new Date(j.completedAt).toLocaleString()}`}
                          {j.error && ` | Error: ${j.error.slice(0, 60)}`}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="performance">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Database className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Database Size</span>
                </div>
                <p className="text-2xl font-bold" data-testid="text-db-size">{dbStats?.size || "N/A"}</p>
                <p className="text-xs text-muted-foreground">{dbStats?.connections || 0} active connections</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <HardDrive className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Indexes</span>
                </div>
                <p className="text-2xl font-bold" data-testid="text-index-count">{indexCount}</p>
                <p className="text-xs text-muted-foreground">database indexes active</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Gauge className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Scheduler</span>
                </div>
                <p className="text-2xl font-bold" data-testid="text-scheduler-worker">{health?.scheduler?.workerId?.slice(0, 12) || "N/A"}</p>
                <p className="text-xs text-muted-foreground">{health?.scheduler?.recurringJobs?.length || 0} recurring jobs</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                Table Row Counts
              </CardTitle>
            </CardHeader>
            <CardContent>
              {tableStats.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No performance data available</p>
              ) : (
                <div className="space-y-2">
                  {tableStats.map((t: any) => (
                    <PerfBar
                      key={t.table}
                      label={t.table}
                      value={t.rows}
                      max={Math.max(...tableStats.map((s: any) => s.rows), 1)}
                      unit=""
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Zap className="w-4 h-4" />
                Reliability Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div className="space-y-2">
                  <p className="font-medium">Job Processing</p>
                  <ul className="space-y-1 text-muted-foreground text-xs">
                    <li>Atomic locking: FOR UPDATE SKIP LOCKED</li>
                    <li>Max retry: 3 attempts with exponential backoff</li>
                    <li>Stuck job recovery: 10min timeout</li>
                    <li>Auto-cleanup: completed jobs after 30 days</li>
                  </ul>
                </div>
                <div className="space-y-2">
                  <p className="font-medium">Monitoring</p>
                  <ul className="space-y-1 text-muted-foreground text-xs">
                    <li>Slow route detection: 2s threshold</li>
                    <li>Health event retention: 90 days</li>
                    <li>Auto-refresh: 30s (health), 60s (perf)</li>
                    <li>Database indexes: {indexCount} active</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
