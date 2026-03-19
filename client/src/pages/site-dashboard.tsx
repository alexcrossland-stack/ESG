import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { Building2, MapPin, BarChart3, FileText, ClipboardList, ArrowLeft, Archive } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const SITE_TYPE_LABELS: Record<string, string> = {
  operational: "Operational",
  office: "Office",
  manufacturing: "Manufacturing",
  warehouse: "Warehouse",
  retail: "Retail",
  data_centre: "Data Centre",
  other: "Other",
};

export default function SiteDashboardPage() {
  const params = useParams<{ siteId: string }>();
  const siteId = params.siteId;

  const { data: reportingPeriods = [] } = useQuery<any[]>({
    queryKey: ["/api/reporting-periods"],
  });
  const openPeriod = (reportingPeriods as any[]).find((rp: any) => rp.status === "open");
  const periodParam = openPeriod ? `?period=${encodeURIComponent(openPeriod.name)}` : "";

  const { data, isLoading, isError } = useQuery<any>({
    queryKey: ["/api/sites", siteId, "dashboard", openPeriod?.name ?? ""],
    queryFn: async () => {
      const r = await fetch(`/api/sites/${siteId}/dashboard${periodParam}`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load site dashboard");
      return r.json();
    },
    enabled: !!siteId,
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-6 max-w-5xl mx-auto">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-28" />)}
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <p className="text-destructive" data-testid="text-site-dashboard-error">Site not found or access denied.</p>
        <Link href="/sites">
          <Button variant="outline" className="mt-4" data-testid="button-back-to-sites">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Sites
          </Button>
        </Link>
      </div>
    );
  }

  const { site, metricValues, evidenceFiles, questionnaires } = data;

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/sites">
          <Button variant="ghost" size="sm" data-testid="button-back-to-sites">
            <ArrowLeft className="w-4 h-4 mr-1" /> Sites
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-foreground truncate" data-testid="text-site-name">{site.name}</h1>
            {site.status === "archived" && (
              <Badge variant="secondary" className="flex items-center gap-1" data-testid="badge-archived">
                <Archive className="w-3 h-3" /> Archived
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
            {site.siteType && (
              <span className="flex items-center gap-1">
                <Building2 className="w-3.5 h-3.5" />
                {SITE_TYPE_LABELS[site.siteType] ?? site.siteType}
              </span>
            )}
            {site.location && (
              <span className="flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5" />
                {site.location}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card data-testid="card-metric-count">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <BarChart3 className="w-4 h-4" /> Metric Values
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold" data-testid="text-metric-count">{metricValues.length}</p>
            <p className="text-xs text-muted-foreground mt-1">recorded for this site</p>
          </CardContent>
        </Card>
        <Card data-testid="card-evidence-count">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <FileText className="w-4 h-4" /> Evidence Files
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold" data-testid="text-evidence-count">{evidenceFiles.length}</p>
            <p className="text-xs text-muted-foreground mt-1">uploaded for this site</p>
          </CardContent>
        </Card>
        <Card data-testid="card-questionnaire-count">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <ClipboardList className="w-4 h-4" /> Questionnaires
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold" data-testid="text-questionnaire-count">{questionnaires.length}</p>
            <p className="text-xs text-muted-foreground mt-1">linked to this site</p>
          </CardContent>
        </Card>
      </div>

      {/* Recent metric values */}
      {metricValues.length > 0 && (
        <Card data-testid="card-recent-metrics">
          <CardHeader>
            <CardTitle className="text-base">Recent Metric Values</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-border">
              {metricValues.slice(0, 10).map((mv: any) => (
                <div key={mv.id} className="py-2 flex items-center justify-between text-sm" data-testid={`row-metric-${mv.id}`}>
                  <span className="text-muted-foreground font-mono text-xs">{mv.period}</span>
                  <span className="font-medium">{mv.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent evidence */}
      {evidenceFiles.length > 0 && (
        <Card data-testid="card-recent-evidence">
          <CardHeader>
            <CardTitle className="text-base">Recent Evidence Files</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-border">
              {evidenceFiles.slice(0, 5).map((ef: any) => (
                <div key={ef.id} className="py-2 flex items-center justify-between text-sm" data-testid={`row-evidence-${ef.id}`}>
                  <span className="truncate max-w-xs">{ef.filename}</span>
                  <Badge variant="outline" className="shrink-0 text-xs">{ef.evidenceStatus}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {metricValues.length === 0 && evidenceFiles.length === 0 && questionnaires.length === 0 && (
        <div className="text-center py-16 text-muted-foreground" data-testid="text-site-empty">
          <Building2 className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium">No data recorded for this site yet</p>
          <p className="text-sm mt-1">Start entering metrics and uploading evidence to see them here.</p>
        </div>
      )}
    </div>
  );
}
