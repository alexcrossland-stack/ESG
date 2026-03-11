import { useQuery } from "@tanstack/react-query";
import { useParams } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { Leaf, Users, Shield, Factory, FileText, CheckCircle, Clock } from "lucide-react";

export default function PublicProfilePage() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  const { data: profile, isLoading, error } = useQuery<any>({
    queryKey: ["/api/company/esg-profile/public", token],
    queryFn: async () => {
      const res = await fetch(`/api/company/esg-profile/public/${token}`);
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || res.statusText);
      }
      return res.json();
    },
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-8">
        <div className="max-w-4xl mx-auto space-y-4">
          <Skeleton className="h-12 w-64" />
          <div className="grid grid-cols-3 gap-4">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-24" />)}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center">
            <p className="text-lg font-medium">Profile Unavailable</p>
            <p className="text-sm text-muted-foreground mt-2">This profile link may have expired or been disabled.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="bg-primary/5 border-b">
        <div className="max-w-4xl mx-auto p-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
              <Leaf className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-2xl font-bold" data-testid="text-company-name">{profile?.company?.name || "Company"}</h1>
              <div className="flex gap-3 text-sm text-muted-foreground">
                {profile?.company?.industry && <span>{profile.company.industry}</span>}
                {profile?.company?.employeeCount && <span>{profile.company.employeeCount} employees</span>}
              </div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-4">ESG Performance Profile</p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-8 space-y-6">
        {profile?.esg_scores && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Environmental", score: profile.esg_scores.environmental, icon: Leaf, color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200" },
              { label: "Social", score: profile.esg_scores.social, icon: Users, color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
              { label: "Governance", score: profile.esg_scores.governance, icon: Shield, color: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200" },
              { label: "Overall", score: profile.esg_scores.overall, icon: Leaf, color: "bg-primary/10 text-primary" },
            ].map(s => (
              <div key={s.label} className={`rounded-lg p-4 ${s.color}`} data-testid={`public-score-${s.label.toLowerCase()}`}>
                <div className="flex items-center gap-2 mb-1">
                  <s.icon className="w-4 h-4" />
                  <span className="text-xs font-medium">{s.label}</span>
                </div>
                <span className="text-2xl font-bold">{s.score}%</span>
              </div>
            ))}
          </div>
        )}

        {profile?.key_metrics?.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-sm">Key Metrics</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {profile.key_metrics.map((m: any, i: number) => (
                  <div key={i} className="p-3 rounded-lg border">
                    <p className="text-xs text-muted-foreground truncate">{m.name}</p>
                    <p className="text-lg font-bold mt-1">{m.value} <span className="text-xs font-normal text-muted-foreground">{m.unit}</span></p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {profile?.policy_status && (
            <Card>
              <CardHeader><CardTitle className="text-sm flex items-center gap-2"><FileText className="w-4 h-4" /> Policy Status</CardTitle></CardHeader>
              <CardContent>
                <Badge variant={profile.policy_status.status === "published" ? "default" : "secondary"}>
                  {profile.policy_status.status === "published" ? <CheckCircle className="w-3 h-3 mr-1" /> : <Clock className="w-3 h-3 mr-1" />}
                  {profile.policy_status.status}
                </Badge>
              </CardContent>
            </Card>
          )}

          {profile?.carbon_summary && (
            <Card>
              <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Factory className="w-4 h-4" /> Carbon Summary</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">Scope 1</span><span className="font-medium">{profile.carbon_summary.scope1 || 0} tCO2e</span></div>
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">Scope 2</span><span className="font-medium">{profile.carbon_summary.scope2 || 0} tCO2e</span></div>
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">Scope 3</span><span className="font-medium">{profile.carbon_summary.scope3 || 0} tCO2e</span></div>
                  <Separator />
                  <div className="flex justify-between text-sm font-bold"><span>Total</span><span>{profile.carbon_summary.total || 0} tCO2e</span></div>
                </div>
              </CardContent>
            </Card>
          )}

          {profile?.evidence_coverage && (
            <Card>
              <CardHeader><CardTitle className="text-sm">Evidence Coverage</CardTitle></CardHeader>
              <CardContent>
                <div className="flex items-center gap-3">
                  <Progress value={profile.evidence_coverage.percentage} className="flex-1" />
                  <span className="text-sm font-medium">{profile.evidence_coverage.percentage}%</span>
                </div>
              </CardContent>
            </Card>
          )}

          {profile?.compliance_highlights?.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Shield className="w-4 h-4" /> Compliance</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {profile.compliance_highlights.map((c: any, i: number) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{c.framework_name}</span>
                      <span className="font-medium">{c.linked}/{c.total} linked</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="text-center text-xs text-muted-foreground mt-8 pt-4 border-t">
          <p>ESG Profile generated by ESG Manager</p>
        </div>
      </div>
    </div>
  );
}
