import { useQuery } from "@tanstack/react-query";
import { useParams } from "wouter";
import {
  Building2,
  CheckCircle2,
  Circle,
  Download,
  Factory,
  FileCheck2,
  FileText,
  Leaf,
  ListChecks,
  ShieldCheck,
  Target,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

function formatNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return "Not reported";
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "Not reported";
  return new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 }).format(numeric);
}

function formatDate(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime())
    ? null
    : new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function formatStatus(value: unknown) {
  return String(value || "not started")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatFileSize(value: unknown) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) return null;
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${(bytes / 1024).toFixed(1)} KB`;
}

function legacyPassport(profile: any) {
  const metrics = Array.isArray(profile?.key_metrics) ? profile.key_metrics : [];
  const reportedMetrics = metrics.filter((metric: any) =>
    metric?.hasValue !== false && metric?.value !== null && metric?.value !== undefined && metric?.value !== ""
  ).length;
  const evidencePercentage = Number(profile?.evidence_coverage?.percentage || 0);
  const carbon = profile?.carbon_summary;
  const period = profile?.reporting_period || null;

  return {
    version: 1,
    title: "SME ESG Passport",
    organisation: profile?.company || {},
    reportingBoundary: {
      label: `Legal entity: ${profile?.company?.name || "Organisation"}`,
      activeSiteCount: null,
    },
    reportingPeriod: period,
    completion: metrics.length > 0 ? {
      reportedMetrics,
      totalMetrics: metrics.length,
      missingMetrics: metrics.length - reportedMetrics,
      percentage: Math.round((reportedMetrics / metrics.length) * 100),
    } : null,
    evidenceConfidence: profile?.evidence_coverage ? {
      label: evidencePercentage > 0 ? "Evidence recorded" : "Not yet evidence-backed",
      description: `${profile.evidence_coverage.reviewed || 0} of ${profile.evidence_coverage.total || 0} evidence files have been reviewed or approved.`,
      ladder: [],
      documents: {
        total: profile.evidence_coverage.total || 0,
        reviewed: profile.evidence_coverage.reviewed || 0,
        approved: profile.evidence_coverage.reviewed || 0,
      },
    } : null,
    emissions: carbon ? {
      available: true,
      reportingPeriod: carbon.period,
      matchesPassportPeriod: carbon.period === period?.period,
      unit: carbon.unit || "kgCO2e",
      scope1: carbon.scope1,
      scope2: carbon.scope2,
      scope3: carbon.scope3,
      total: carbon.total,
    } : null,
    policies: profile?.policy_status ? {
      total: 1,
      published: profile.policy_status.status === "published" ? 1 : 0,
      items: [{ title: "Company ESG policy", status: profile.policy_status.status }],
    } : null,
    actions: null,
    targets: null,
    reportAccess: profile?.report_access || null,
    disclaimer: "This passport presents reported facts and evidence status. It is not an ESG rating or independent assurance unless explicitly stated.",
  };
}

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
      <div className="min-h-screen bg-background p-6 sm:p-8">
        <div className="max-w-5xl mx-auto space-y-4">
          <Skeleton className="h-16 w-72" />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Skeleton className="h-40" />
            <Skeleton className="h-40" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center">
            <p className="text-lg font-medium">Passport unavailable</p>
            <p className="text-sm text-muted-foreground mt-2">
              This sharing link may have expired, been disabled, or been replaced.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const passport = profile?.passport || legacyPassport(profile);
  const organisation = passport.organisation || profile?.company || {};
  const reportingPeriod = passport.reportingPeriod || profile?.reporting_period;
  const completion = passport.completion;
  const evidence = passport.evidenceConfidence;
  const emissions = passport.emissions;
  const policies = passport.policies;
  const actions = passport.actions;
  const targets = passport.targets;
  const reportAccess = passport.reportAccess;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-primary/5">
        <div className="max-w-5xl mx-auto p-6 sm:p-8">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-lg bg-primary flex items-center justify-center shrink-0">
              <Leaf className="w-5 h-5 text-primary-foreground" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-primary">SME ESG Passport</p>
              <h1 className="text-2xl font-bold break-words" data-testid="text-company-name">
                {organisation.name || "Organisation"}
              </h1>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
                {organisation.industry && <span>{organisation.industry}</span>}
                {organisation.employeeCount !== null && organisation.employeeCount !== undefined && (
                  <span>{organisation.employeeCount} employees</span>
                )}
              </div>
            </div>
          </div>
          <p className="mt-4 max-w-3xl text-sm text-muted-foreground">
            A plain-facts view of what this organisation has reported, the evidence behind it, and what remains incomplete.
          </p>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-6 sm:p-8 space-y-6">
        <Card data-testid="public-passport-boundary">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="w-4 h-4" />
              Boundary and reporting period
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Organisation boundary</p>
              <p className="mt-1 text-sm font-medium" data-testid="public-passport-boundary-label">
                {passport.reportingBoundary?.label || "Boundary not stated"}
              </p>
              {passport.reportingBoundary?.activeSiteCount !== null
                && passport.reportingBoundary?.activeSiteCount !== undefined && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {passport.reportingBoundary.activeSiteCount} active site{passport.reportingBoundary.activeSiteCount === 1 ? "" : "s"} included
                </p>
              )}
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Reporting period</p>
              <Badge variant="outline" className="mt-1" data-testid="public-profile-reporting-period">
                {reportingPeriod?.label || reportingPeriod?.period || "Not stated"}
              </Badge>
              {(formatDate(reportingPeriod?.startDate) || formatDate(reportingPeriod?.endDate)) && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatDate(reportingPeriod?.startDate) || "Start not stated"} – {formatDate(reportingPeriod?.endDate) || "End not stated"}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {(completion || evidence) && (
          <div className="grid gap-4 md:grid-cols-2">
            {completion && (
              <Card data-testid="public-passport-completion">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <ListChecks className="w-4 h-4" />
                    Data completion
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-end justify-between gap-4">
                    <div>
                      <p className="text-3xl font-semibold">{completion.percentage}%</p>
                      <p className="text-sm text-muted-foreground">
                        {completion.reportedMetrics} of {completion.totalMetrics} tracked metrics reported
                      </p>
                    </div>
                    <Badge variant={completion.missingMetrics === 0 ? "default" : "secondary"}>
                      {completion.missingMetrics} missing
                    </Badge>
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">
                    Completion measures whether a value is present. It does not judge performance.
                  </p>
                </CardContent>
              </Card>
            )}

            {evidence && (
              <Card data-testid="public-passport-evidence">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4" />
                    Evidence confidence
                  </CardTitle>
                  <p className="text-sm font-medium" data-testid="public-passport-evidence-label">{evidence.label}</p>
                  <p className="text-xs text-muted-foreground">{evidence.description}</p>
                </CardHeader>
                <CardContent className="space-y-2">
                  {(evidence.ladder || []).map((step: any) => (
                    <div key={step.key} className="grid grid-cols-[1fr_auto] items-center gap-3" data-testid={`public-evidence-step-${step.key}`}>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          {step.count > 0
                            ? <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0" />
                            : <Circle className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                          <span className="text-sm">{step.label}</span>
                        </div>
                        <div className="ml-5 mt-1 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div className="h-full bg-primary" style={{ width: `${step.percentage}%` }} />
                        </div>
                      </div>
                      <span className="text-xs tabular-nums text-muted-foreground">{step.count}/{step.total}</span>
                    </div>
                  ))}
                  {evidence.documents && (
                    <p className="pt-2 text-xs text-muted-foreground">
                      Documents: {evidence.documents.total} recorded, {evidence.documents.reviewed} reviewed, {evidence.documents.approved} approved.
                    </p>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {emissions && (
          <Card data-testid="public-passport-emissions">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Factory className="w-4 h-4" />
                Greenhouse-gas emissions
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                {emissions.available
                  ? `Calculation period: ${emissions.reportingPeriod || "not stated"} · Unit: ${emissions.unit}`
                  : "No carbon calculation has been recorded."}
              </p>
            </CardHeader>
            <CardContent>
              {emissions.available ? (
                <>
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    {[
                      { label: "Scope 1", value: emissions.scope1, testId: "scope-1" },
                      { label: "Scope 2", value: emissions.scope2, testId: "scope-2" },
                      { label: "Scope 3", value: emissions.scope3, testId: "scope-3" },
                      { label: "Total", value: emissions.total, testId: "total" },
                    ].map((item) => (
                      <div key={item.label} className="rounded-lg border p-3">
                        <p className="text-xs text-muted-foreground">{item.label}</p>
                        <p className="mt-1 font-semibold" data-testid={`public-emissions-${item.testId}`}>
                          {formatNumber(item.value)} <span className="text-xs font-normal text-muted-foreground">{emissions.unit}</span>
                        </p>
                      </div>
                    ))}
                  </div>
                  {emissions.matchesPassportPeriod === false && (
                    <p className="mt-3 text-xs text-amber-700">
                      These emissions are from {emissions.reportingPeriod}, not the passport reporting period shown above.
                    </p>
                  )}
                  {emissions.factorYear && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Emission-factor year: {emissions.factorYear}. Basis: {emissions.basis || "Not stated"}.
                    </p>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">No Scope 1, 2 or 3 values are available.</p>
              )}
            </CardContent>
          </Card>
        )}

        {(policies || actions || targets) && (
          <div className="grid gap-4 lg:grid-cols-3" data-testid="public-passport-commitments">
            {policies && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    Policies
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">{policies.published} published or active · {policies.total} total</p>
                </CardHeader>
                <CardContent className="space-y-2">
                  {(policies.items || []).length > 0 ? policies.items.map((item: any, index: number) => (
                    <div key={`${item.title}-${index}`} className="rounded-md border p-2">
                      <p className="text-sm font-medium">{item.title}</p>
                      <Badge variant="outline" className="mt-1 text-[10px]">{formatStatus(item.status)}</Badge>
                    </div>
                  )) : <p className="text-sm text-muted-foreground">No policies recorded.</p>}
                </CardContent>
              </Card>
            )}

            {actions && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <ListChecks className="w-4 h-4" />
                    Actions
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    {actions.completed} complete · {actions.inProgress} in progress · {actions.overdue} overdue
                  </p>
                </CardHeader>
                <CardContent className="space-y-2">
                  {(actions.items || []).length > 0 ? actions.items.map((item: any, index: number) => (
                    <div key={`${item.title}-${index}`} className="rounded-md border p-2">
                      <p className="text-sm font-medium">{item.title}</p>
                      <div className="mt-1 flex flex-wrap gap-2 text-[10px] text-muted-foreground">
                        <Badge variant={item.status === "overdue" ? "destructive" : "outline"}>{formatStatus(item.status)}</Badge>
                        {formatDate(item.dueDate) && <span>Due {formatDate(item.dueDate)}</span>}
                      </div>
                    </div>
                  )) : <p className="text-sm text-muted-foreground">No actions recorded.</p>}
                </CardContent>
              </Card>
            )}

            {targets && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Target className="w-4 h-4" />
                    Targets
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">{targets.achieved} achieved · {targets.inProgress} in progress · {targets.total} total</p>
                </CardHeader>
                <CardContent className="space-y-2">
                  {(targets.items || []).length > 0 ? targets.items.map((item: any, index: number) => (
                    <div key={`${item.title}-${index}`} className="rounded-md border p-2">
                      <p className="text-sm font-medium">{item.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {item.targetValue !== null
                          ? `Target: ${formatNumber(item.targetValue)}${item.unit ? ` ${item.unit}` : ""}${item.targetYear ? ` by ${item.targetYear}` : ""}`
                          : "Target value not stated"}
                      </p>
                      <Badge variant="outline" className="mt-1 text-[10px]">{formatStatus(item.status)}</Badge>
                    </div>
                  )) : <p className="text-sm text-muted-foreground">No targets recorded.</p>}
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {reportAccess && (
          <Card data-testid="public-passport-report-access">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <FileCheck2 className="w-4 h-4" />
                Approved report
              </CardTitle>
            </CardHeader>
            <CardContent>
              {reportAccess.available && reportAccess.latest?.downloadUrl ? (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-medium">{reportAccess.latest.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {reportAccess.latest.reportingPeriod || "Period not stated"}
                      {formatDate(reportAccess.latest.generatedAt) ? ` · Generated ${formatDate(reportAccess.latest.generatedAt)}` : ""}
                      {reportAccess.latest.fileType ? ` · ${String(reportAccess.latest.fileType).toUpperCase()}` : ""}
                      {formatFileSize(reportAccess.latest.fileSize) ? ` · ${formatFileSize(reportAccess.latest.fileSize)}` : ""}
                    </p>
                  </div>
                  <Button asChild>
                    <a
                      href={reportAccess.latest.downloadUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      data-testid="public-passport-report-download"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Open approved report
                    </a>
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{reportAccess.note || "No approved report is available."}</p>
              )}
            </CardContent>
          </Card>
        )}

        <Separator />
        <footer className="pb-4 text-center text-xs text-muted-foreground">
          <p data-testid="public-passport-disclaimer">{passport.disclaimer}</p>
          <p className="mt-1">Generated by SimplyESG</p>
        </footer>
      </main>
    </div>
  );
}
