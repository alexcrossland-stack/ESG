import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, Activity, BarChart3, FileText, Clock } from "lucide-react";

function StatCard({ title, value, subtitle, icon: Icon }: { title: string; value: string | number; subtitle: string; icon: any }) {
  return (
    <Card data-testid={`stat-card-${title.toLowerCase().replace(/\s+/g, "-")}`}>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <Icon className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium text-muted-foreground">{title}</span>
        </div>
        <p className="text-2xl font-bold">{value}</p>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </CardContent>
    </Card>
  );
}

const ACTION_LABELS: Record<string, string> = {
  page_view: "Page Views",
  data_entry_save: "Data Entries",
  report_generated: "Reports Generated",
  import_completed: "Imports",
  questionnaire_autofill: "Autofills",
  carbon_calculation: "Carbon Calculations",
  control_centre_action: "Control Centre",
  login: "Logins",
};

export default function AdminAnalyticsPage() {
  const { data: analytics, isLoading: loadingAnalytics } = useQuery<any>({
    queryKey: ["/api/admin/analytics"],
  });

  const { data: timeline, isLoading: loadingTimeline } = useQuery<any[]>({
    queryKey: ["/api/admin/analytics/timeline"],
  });

  if (loadingAnalytics) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
      </div>
    );
  }

  const featureUsage = (analytics?.featureUsageCounts || []) as { action: string; count: string }[];
  const topPages = (analytics?.topPages || []) as { page: string; count: string }[];
  const maxFeatureCount = Math.max(...featureUsage.map(f => parseInt(f.count)), 1);

  const timelineData = (timeline || []) as { date: string; count: string }[];
  const maxTimelineCount = Math.max(...timelineData.map(t => parseInt(t.count)), 1);

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-analytics-title">User Activity Analytics</h1>
        <p className="text-sm text-muted-foreground mt-1">Platform usage and feature adoption (last 30 days)</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard title="Active Users (7d)" value={analytics?.activeUsers7d || 0} subtitle="unique users this week" icon={Users} />
        <StatCard title="Active Users (30d)" value={analytics?.activeUsers30d || 0} subtitle="unique users this month" icon={Users} />
        <StatCard title="Reports Generated" value={analytics?.reportGenerationCount || 0} subtitle="in last 30 days" icon={FileText} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2"><BarChart3 className="w-4 h-4" /> Feature Usage</CardTitle>
          </CardHeader>
          <CardContent>
            {featureUsage.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No activity recorded yet</p>
            ) : (
              <div className="space-y-3">
                {featureUsage.map((f) => {
                  const count = parseInt(f.count);
                  const pct = (count / maxFeatureCount) * 100;
                  return (
                    <div key={f.action} data-testid={`feature-bar-${f.action}`}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="font-medium">{ACTION_LABELS[f.action] || f.action}</span>
                        <span className="text-muted-foreground">{count}</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2"><Activity className="w-4 h-4" /> Top Pages</CardTitle>
          </CardHeader>
          <CardContent>
            {topPages.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No page views recorded</p>
            ) : (
              <div className="space-y-2">
                {topPages.slice(0, 10).map((p, i) => (
                  <div key={i} className="flex items-center justify-between text-sm p-2 rounded-lg border" data-testid={`page-row-${i}`}>
                    <span className="font-medium text-xs truncate flex-1">{p.page}</span>
                    <Badge variant="secondary" className="text-xs ml-2">{p.count}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2"><Clock className="w-4 h-4" /> Daily Activity (last 30 days)</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingTimeline ? (
            <Skeleton className="h-24" />
          ) : timelineData.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No activity data available</p>
          ) : (
            <div className="flex items-end gap-1 h-24">
              {timelineData.map((t, i) => {
                const count = parseInt(t.count);
                const heightPct = (count / maxTimelineCount) * 100;
                return (
                  <div
                    key={i}
                    className="flex-1 bg-primary/20 hover:bg-primary/40 rounded-t-sm transition-colors relative group"
                    style={{ height: `${Math.max(heightPct, 2)}%` }}
                    data-testid={`timeline-bar-${i}`}
                  >
                    <div className="absolute -top-6 left-1/2 -translate-x-1/2 hidden group-hover:block bg-popover border rounded px-1.5 py-0.5 text-[10px] whitespace-nowrap shadow-sm z-10">
                      {new Date(t.date).toLocaleDateString("en-GB", { month: "short", day: "numeric" })}: {count}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
