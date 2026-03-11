import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import {
  Leaf, Shield, Users, Factory, FileText, Share2, Copy,
  RefreshCw, ExternalLink, Download, CheckCircle, Clock,
} from "lucide-react";

const SECTION_OPTIONS = [
  { key: "esg_scores", label: "ESG Scores" },
  { key: "key_metrics", label: "Key Metrics" },
  { key: "policy_status", label: "Policy Status" },
  { key: "carbon_summary", label: "Carbon Summary" },
  { key: "compliance_highlights", label: "Compliance Highlights" },
  { key: "evidence_coverage", label: "Evidence Coverage" },
];

function ScoreBadge({ label, score, icon: Icon }: { label: string; score: number; icon: any }) {
  const color = score >= 70 ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200"
    : score >= 40 ? "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200"
    : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";

  return (
    <div className={`rounded-lg p-4 ${color}`} data-testid={`score-${label.toLowerCase()}`}>
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-4 h-4" />
        <span className="text-xs font-medium">{label}</span>
      </div>
      <span className="text-2xl font-bold">{score}%</span>
    </div>
  );
}

export default function EsgProfilePage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [expiryDays, setExpiryDays] = useState("30");
  const [selectedSections, setSelectedSections] = useState<string[]>(["esg_scores", "key_metrics", "policy_status", "carbon_summary"]);

  const { data: profile, isLoading } = useQuery<any>({ queryKey: ["/api/company/esg-profile"] });

  const shareMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/company/esg-profile/share", data).then(r => r.json()),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/company/esg-profile"] }); toast({ title: "Share settings updated" }); },
  });

  const rotateMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/company/esg-profile/rotate-token").then(r => r.json()),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/company/esg-profile"] }); toast({ title: "Share token rotated" }); },
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-48" />
      </div>
    );
  }

  const shareEnabled = profile?.shareSettings?.enabled || false;
  const shareToken = profile?.shareSettings?.token;
  const shareUrl = shareToken ? `${window.location.origin}/public/esg/${shareToken}` : null;

  function toggleSection(key: string) {
    setSelectedSections(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-profile-title">ESG Company Profile</h1>
        <p className="text-sm text-muted-foreground mt-1">Your company's ESG performance at a glance</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{profile?.company?.name || "Company"}</CardTitle>
          <div className="flex gap-3 text-sm text-muted-foreground">
            {profile?.company?.industry && <span>{profile.company.industry}</span>}
            {profile?.company?.employeeCount && <span>{profile.company.employeeCount} employees</span>}
          </div>
        </CardHeader>
      </Card>

      {profile?.esg_scores && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <ScoreBadge label="Environmental" score={profile.esg_scores.environmental} icon={Leaf} />
          <ScoreBadge label="Social" score={profile.esg_scores.social} icon={Users} />
          <ScoreBadge label="Governance" score={profile.esg_scores.governance} icon={Shield} />
          <div className="rounded-lg p-4 bg-primary/10" data-testid="score-overall">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-medium text-primary">Overall</span>
            </div>
            <span className="text-2xl font-bold text-primary">{profile.esg_scores.overall}%</span>
          </div>
        </div>
      )}

      {profile?.key_metrics?.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Key Metrics</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {profile.key_metrics.map((m: any, i: number) => (
                <div key={i} className="p-3 rounded-lg border" data-testid={`metric-card-${i}`}>
                  <p className="text-xs text-muted-foreground truncate">{m.name}</p>
                  <p className="text-lg font-bold mt-1">{m.value} <span className="text-xs font-normal text-muted-foreground">{m.unit}</span></p>
                  <Badge variant="secondary" className="text-[10px] mt-1">
                    {m.category}
                  </Badge>
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
              <Badge variant={profile.policy_status.status === "published" ? "default" : "secondary"} data-testid="badge-policy-status">
                {profile.policy_status.status === "published" ? <CheckCircle className="w-3 h-3 mr-1" /> : <Clock className="w-3 h-3 mr-1" />}
                {profile.policy_status.status}
              </Badge>
              {profile.policy_status.publishedAt && (
                <p className="text-xs text-muted-foreground mt-2">Published: {new Date(profile.policy_status.publishedAt).toLocaleDateString()}</p>
              )}
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
                <span className="text-sm font-medium" data-testid="text-evidence-pct">{profile.evidence_coverage.percentage}%</span>
              </div>
              <p className="text-xs text-muted-foreground mt-2">{profile.evidence_coverage.reviewed} of {profile.evidence_coverage.total} files reviewed/approved</p>
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

      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2"><Share2 className="w-4 h-4" /> Share Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>Enable public sharing</Label>
            <Switch
              checked={shareEnabled}
              onCheckedChange={(checked) => {
                shareMutation.mutate({
                  enabled: checked,
                  expiresInDays: checked ? parseInt(expiryDays) || 30 : undefined,
                  visibleSections: checked ? selectedSections : undefined,
                });
              }}
              data-testid="switch-share-enabled"
            />
          </div>

          {shareEnabled && (
            <>
              <div className="space-y-2">
                <Label className="text-xs">Expiry (days)</Label>
                <Input
                  type="number"
                  value={expiryDays}
                  onChange={(e) => setExpiryDays(e.target.value)}
                  className="w-32"
                  data-testid="input-expiry-days"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Visible Sections</Label>
                <div className="grid grid-cols-2 gap-2">
                  {SECTION_OPTIONS.map(s => (
                    <label key={s.key} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={selectedSections.includes(s.key)}
                        onCheckedChange={() => toggleSection(s.key)}
                        data-testid={`checkbox-section-${s.key}`}
                      />
                      {s.label}
                    </label>
                  ))}
                </div>
              </div>

              <Button
                size="sm"
                onClick={() => shareMutation.mutate({ enabled: true, expiresInDays: parseInt(expiryDays) || 30, visibleSections: selectedSections })}
                disabled={shareMutation.isPending}
                data-testid="button-update-share"
              >
                Update Share Settings
              </Button>

              {shareUrl && (
                <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                  <Input value={shareUrl} readOnly className="text-xs flex-1" data-testid="input-share-url" />
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={() => { navigator.clipboard.writeText(shareUrl); toast({ title: "Link copied" }); }}
                    data-testid="button-copy-link"
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={() => rotateMutation.mutate()}
                    disabled={rotateMutation.isPending}
                    data-testid="button-rotate-token"
                    title="Rotate token"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
