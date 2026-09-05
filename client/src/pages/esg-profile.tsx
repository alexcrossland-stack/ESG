import { useEffect, useMemo, useState } from "react";
import { useReportingMonth } from "@/hooks/use-reporting-month";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { PermissionBanner } from "@/components/permission-gate";
import { UpgradeButton, useBillingStatus } from "@/components/upgrade-prompt";
import { usePermissions } from "@/lib/permissions";
import { DEFAULT_PUBLIC_PASSPORT_SECTIONS } from "@shared/esg-passport";
import {
  Shield, Factory, FileText, Share2, Copy, Lock,
  RefreshCw, CheckCircle, Clock,
} from "lucide-react";

const SECTION_OPTIONS = [
  { key: "passport_summary", label: "Boundary, period and completion" },
  { key: "evidence_confidence", label: "Evidence-confidence ladder" },
  { key: "emissions", label: "Emissions by scope" },
  { key: "policies_actions_targets", label: "Policies, actions and targets" },
  { key: "report_access", label: "Approved report access" },
];

function hasMetricValue(metric: any) {
  return metric?.hasValue !== false && metric?.value !== null && metric?.value !== undefined && metric?.value !== "";
}

function generateProfilePeriods() {
  const periods: string[] = [];
  const now = new Date();
  const startYear = 2020;
  for (let year = now.getFullYear(); year >= startYear; year--) {
    const maxMonth = year === now.getFullYear() ? now.getMonth() : 11;
    for (let month = maxMonth; month >= 0; month--) {
      periods.push(`${year}-${String(month + 1).padStart(2, "0")}`);
    }
  }
  return periods;
}

function getReportingPeriodLabel(profile: any) {
  return profile?.reporting_period?.label || profile?.reporting_period?.period || "No reporting period";
}

export default function EsgProfilePage() {
  const reporting = useReportingMonth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const { isPro, isLoading: billingLoading } = useBillingStatus();
  const [expiryDays, setExpiryDays] = useState("30");
  const [selectedSections, setSelectedSections] = useState<string[]>([...DEFAULT_PUBLIC_PASSPORT_SECTIONS]);
  const [selectedPeriod, setSelectedPeriod] = useState(reporting.month);
  useEffect(() => { setSelectedPeriod(reporting.month); }, [reporting.month]);

  const { data: reportingPeriods = [] } = useQuery<any[]>({ queryKey: ["/api/reporting-periods"] });
  const { data: profile, isLoading } = useQuery<any>({
    queryKey: ["/api/company/esg-profile", selectedPeriod || "__default__"],
    queryFn: async () => {
      const path = selectedPeriod ? `/api/company/esg-profile?period=${encodeURIComponent(selectedPeriod)}` : "/api/company/esg-profile";
      const response = await apiRequest("GET", path);
      return response.json();
    },
  });

  useEffect(() => {
    if (!selectedPeriod && profile?.reporting_period?.period) {
      setSelectedPeriod(profile.reporting_period.period);
    }
  }, [profile?.reporting_period?.period, selectedPeriod]);

  useEffect(() => {
    const savedSections = profile?.shareSettings?.visibleSections;
    if (Array.isArray(savedSections) && savedSections.length > 0) {
      const allowed = new Set(SECTION_OPTIONS.map((section) => section.key));
      const selected = savedSections.filter((section: unknown): section is string =>
        typeof section === "string" && allowed.has(section)
      );
      if (selected.length > 0) setSelectedSections(selected);
    }
  }, [profile?.shareSettings?.visibleSections]);

  const periodOptions = useMemo(() => {
    const options = [
      ...reportingPeriods.map((period: any) => period.name).filter(Boolean),
      ...(profile?.reporting_period?.period ? [profile.reporting_period.period] : []),
      ...generateProfilePeriods(),
    ];
    return Array.from(new Set(options));
  }, [profile?.reporting_period?.period, reportingPeriods]);

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

  const canManageSettings = can("settings_admin");
  const canManagePublicSharing = canManageSettings && isPro;
  const shareEnabled = canManagePublicSharing && (profile?.shareSettings?.enabled || false);
  const shareToken = canManagePublicSharing ? profile?.shareSettings?.token : null;
  const shareUrl = shareToken ? `${window.location.origin}/public/esg/${shareToken}` : null;
  const reportingPeriodLabel = getReportingPeriodLabel(profile);

  function toggleSection(key: string) {
    setSelectedSections(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-profile-title">SME ESG Passport</h1>
          <p className="text-sm text-muted-foreground mt-1">Review and share clear ESG facts, evidence and progress</p>
          <div className="mt-2">
            <Badge variant="outline" className="text-xs" data-testid="text-profile-reporting-period">
              Reporting Period: {reportingPeriodLabel}
            </Badge>
          </div>
        </div>
        <div className="w-full sm:w-56">
          <Label className="text-xs text-muted-foreground">Reporting Period</Label>
          <Select value={selectedPeriod || profile?.reporting_period?.period || ""} onValueChange={setSelectedPeriod}>
            <SelectTrigger className="mt-1 h-9" data-testid="select-profile-reporting-period">
              <SelectValue placeholder="No reporting period" />
            </SelectTrigger>
            <SelectContent>
              {periodOptions.map(period => (
                <SelectItem key={period} value={period}>{period}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{profile?.company?.name || "Company"}</CardTitle>
          <div className="flex gap-3 text-sm text-muted-foreground">
            {profile?.company?.industry && <span>{profile.company.industry}</span>}
            {profile?.company?.employeeSizeBand ? <span>{profile.company.employeeSizeBand} employees (size band)</span> : profile?.company?.employeeCount != null && <span>{profile.company.employeeCount} employees (company profile)</span>}
          </div>
        </CardHeader>
      </Card>

      {profile?.passport && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3" data-testid="passport-fact-summary">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Data completion</p>
              <p className="mt-1 text-2xl font-semibold">{profile.passport.completion?.percentage || 0}%</p>
              <p className="text-xs text-muted-foreground">
                {profile.passport.completion?.reportedMetrics || 0} of {profile.passport.completion?.totalMetrics || 0} tracked metrics
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Evidence confidence</p>
              <p className="mt-1 text-sm font-semibold">{profile.passport.evidenceConfidence?.label || "Not yet evidenced"}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {profile.passport.evidenceConfidence?.description || "Add and review evidence to strengthen confidence."}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Reporting boundary</p>
              <p className="mt-1 text-sm font-semibold">
                {profile.passport.reportingBoundary?.label || "Boundary not stated"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">No composite score is used as the passport outcome.</p>
            </CardContent>
          </Card>
        </div>
      )}

      {profile?.key_metrics?.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Key Metrics</CardTitle>
            <p className="text-xs text-muted-foreground">Values shown for {reportingPeriodLabel}</p>
          </CardHeader>
          <CardContent>
            <div className="max-h-[34rem] overflow-y-auto pr-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {profile.key_metrics.map((m: any, i: number) => (
                  <div key={m.id || i} className="p-3 rounded-lg border min-h-28 flex flex-col justify-between gap-3" data-testid={`metric-card-${i}`}>
                    <p className="text-xs text-muted-foreground line-clamp-2">{m.name}</p>
                    <p className={`text-lg font-bold leading-tight ${hasMetricValue(m) ? "" : "text-muted-foreground"}`}>
                      {hasMetricValue(m) ? m.value : "No data"}
                      {hasMetricValue(m) && m.unit && <span className="text-xs font-normal text-muted-foreground"> {m.unit}</span>}
                    </p>
                    <Badge variant="secondary" className="text-[10px] mt-1">
                      {m.category}
                    </Badge>
                  </div>
                ))}
              </div>
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
                {profile.policy_status.status === "not_created" ? "Not created yet" : String(profile.policy_status.status).replace(/_/g, " ")}
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
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">Scope 1</span><span className="font-medium">{profile.carbon_summary.scope1 || 0} {profile.carbon_summary.unit || "kgCO2e"}</span></div>
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">Scope 2</span><span className="font-medium">{profile.carbon_summary.scope2 || 0} {profile.carbon_summary.unit || "kgCO2e"}</span></div>
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">Scope 3</span><span className="font-medium">{profile.carbon_summary.scope3 || 0} {profile.carbon_summary.unit || "kgCO2e"}</span></div>
                <Separator />
                <div className="flex justify-between text-sm font-bold"><span>Total</span><span>{profile.carbon_summary.total || 0} {profile.carbon_summary.unit || "kgCO2e"}</span></div>
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
          <CardTitle className="text-sm flex items-center gap-2"><Share2 className="w-4 h-4" /> Share SME ESG Passport</CardTitle>
          <p className="text-xs text-muted-foreground">
            Share plain ESG facts with an expiring link. The passport does not lead with a composite ESG score.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {billingLoading ? (
            <Skeleton className="h-20 w-full" data-testid="passport-share-loading" />
          ) : !canManageSettings ? (
            <PermissionBanner
              module="settings_admin"
              customMessage="This passport is read-only for your role."
              testId="passport-share-read-only"
            />
          ) : !isPro ? (
            <div
              className="flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/20 sm:flex-row sm:items-center sm:justify-between"
              data-testid="passport-share-upgrade"
            >
              <div className="flex items-start gap-3">
                <Lock className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" />
                <div>
                  <p className="text-sm font-medium text-amber-900 dark:text-amber-200">Public Passport sharing is available on Pro.</p>
                  <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">You can keep reviewing and improving the passport here without publishing a live link.</p>
                </div>
              </div>
              <UpgradeButton feature="ESG Passport sharing" size="sm" data-testid="button-upgrade-passport-sharing">
                Upgrade to share
              </UpgradeButton>
            </div>
          ) : (
            <div className="space-y-4" data-testid="passport-share-admin-controls">
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
                    <Label className="text-xs">Visible facts</Label>
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
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
