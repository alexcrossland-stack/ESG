import { useMemo, useState } from "react";
import { useBillingStatus, UpgradeLimitBanner } from "@/components/upgrade-prompt";
import { PageGuidance } from "@/components/page-guidance";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { usePermissions } from "@/lib/permissions";
import { useSiteContext } from "@/hooks/use-site-context";
import { EmptyState } from "@/components/empty-state";
import { EsgTooltip } from "@/components/esg-tooltip";
import {
  FileCheck, Upload, AlertTriangle, CheckCircle, Clock,
  Trash2, Eye, FileText, PieChart,
  XCircle, ArrowRight, Filter, Link2Off,
} from "lucide-react";
import { OwnerAssignment } from "@/components/owner-assignment";
import { authFetch } from "@/lib/queryClient";
import { buildCanonicalEnabledMetrics, buildCanonicalEvidenceMetrics } from "@/lib/metric-activation";
import { Link } from "wouter";

type MetricDefinitionActivation = {
  id: string;
  name: string;
  pillar: "environmental" | "social" | "governance";
  description?: string | null;
  unit?: string | null;
  isActive: boolean;
  isDerived?: boolean;
  formulaJson?: Record<string, unknown> | null;
};

type CompanyMetric = {
  id: string;
  name: string;
  category: "environmental" | "social" | "governance";
  description?: string | null;
  unit?: string | null;
  enabled?: boolean | null;
  metricType?: string | null;
  direction?: string | null;
  helpText?: string | null;
  formulaText?: string | null;
};

const STATUS_CONFIG: Record<string, { label: string; icon: any; className: string }> = {
  uploaded: { label: "Uploaded", icon: Upload, className: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" },
  reviewed: { label: "Reviewed", icon: Eye, className: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300" },
  approved: { label: "Approved", icon: CheckCircle, className: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" },
  expired: { label: "Expired", icon: AlertTriangle, className: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300" },
};

const MODULE_LABELS: Record<string, string> = {
  metric: "Metric",
  metric_value: "Metric Value",
  raw_data: "Raw Data",
  policy: "Policy",
  questionnaire_answer: "Questionnaire Answer",
  report: "Report",
};

const SOURCE_CONFIG: Record<string, { label: string; className: string }> = {
  evidenced: { label: "Evidenced", className: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" },
  estimated: { label: "Estimated", className: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300" },
  manual: { label: "Manual", className: "bg-muted text-muted-foreground" },
};

const METRIC_EVIDENCE_ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.png,.jpg,.jpeg,.gif,.webp,.svg,.ppt,.pptx,.odt,.ods,.odp,.zip,.eml,.msg";

function formatAttachmentSize(size?: number | null) {
  if (!size) return null;
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function EvidenceStatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.uploaded;
  const Icon = config.icon;
  return (
    <Badge variant="outline" className={`${config.className} text-xs py-0 h-5 px-1.5 gap-1 font-medium border-0`} data-testid={`badge-evidence-${status}`}>
      <Icon className="w-3 h-3" />
      {config.label}
    </Badge>
  );
}

export function DataSourceBadge({ type }: { type?: string | null }) {
  const config = SOURCE_CONFIG[type || "manual"] || SOURCE_CONFIG.manual;
  return (
    <Badge variant="outline" className={`${config.className} text-xs py-0 h-5 px-1.5 font-medium border-0`} data-testid={`badge-source-${type || "manual"}`}>
      {config.label}
    </Badge>
  );
}

function UploadEvidenceDialog({ disabled }: { disabled?: boolean }) {
  const { toast } = useToast();
  const { activeSiteId, activeSites } = useSiteContext();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [metricId, setMetricId] = useState("");
  const [period, setPeriod] = useState("");
  const [notes, setNotes] = useState("");
  const [tags, setTags] = useState("");
  const [selectedSiteId, setSelectedSiteId] = useState(activeSiteId || "");

  const { data: metrics = [] } = useQuery<CompanyMetric[]>({
    queryKey: ["/api/metrics"],
    queryFn: () => authFetch("/api/metrics").then((r) => r.json()),
  });

  const metricOptions = metrics
    .filter((metric) => metric.enabled !== false)
    .sort((a, b) => a.name.localeCompare(b.name));

  const reset = () => {
    setFile(null);
    setMetricId("");
    setPeriod("");
    setNotes("");
    setTags("");
    setSelectedSiteId(activeSiteId || "");
  };

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Choose an evidence file to upload.");
      const formData = new FormData();
      formData.append("file", file, file.name);
      formData.append("metricId", metricId);
      formData.append("period", period.trim());
      if (notes.trim()) formData.append("notes", notes.trim());
      if (tags.trim()) formData.append("tags", tags.trim());
      if (selectedSiteId) formData.append("siteId", selectedSiteId);
      const res = await apiRequest("POST", "/api/evidence", formData);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Evidence uploaded", description: "The file is stored and linked to the selected metric." });
      queryClient.invalidateQueries({ queryKey: ["/api/evidence"] });
      queryClient.invalidateQueries({ queryKey: ["/api/evidence/coverage"] });
      queryClient.invalidateQueries({ queryKey: ["/api/metrics", metricId, "evidence"] });
      reset();
      setOpen(false);
    },
    onError: (e: Error) => {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    },
  });

  const selectedFileSize = formatAttachmentSize(file?.size);
  const isMultiSite = activeSites.length >= 1;
  const canUpload = Boolean(file && metricId && period.trim()) && !uploadMutation.isPending && !disabled;

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) reset(); }}>
      <DialogTrigger asChild>
        <Button disabled={disabled} data-testid="button-upload-evidence">
          <Upload className="w-4 h-4 mr-2" />
          Upload evidence
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg" data-testid="dialog-upload-evidence">
        <DialogHeader>
          <DialogTitle>Upload Evidence</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="evidence-file">File *</Label>
            <Input
              id="evidence-file"
              type="file"
              accept={METRIC_EVIDENCE_ACCEPT}
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              data-testid="input-evidence-file"
            />
            {file && (
              <p className="text-xs text-muted-foreground" data-testid="text-selected-evidence-file">
                {file.name}{selectedFileSize ? ` · ${selectedFileSize}` : ""}
              </p>
            )}
          </div>

          <div className="space-y-1">
            <Label>Metric *</Label>
            <Select value={metricId} onValueChange={setMetricId}>
              <SelectTrigger data-testid="select-evidence-metric">
                <SelectValue placeholder="Select the metric this supports" />
              </SelectTrigger>
              <SelectContent>
                {metricOptions.map((metric) => (
                  <SelectItem key={metric.id} value={metric.id}>{metric.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="evidence-period">Reporting period or evidence date *</Label>
            <Input
              id="evidence-period"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              placeholder="e.g. 2026-04 or 2026-04-30"
              data-testid="input-evidence-period"
            />
          </div>

          {isMultiSite && (
            <div className="space-y-1">
              <Label>Site</Label>
              <Select value={selectedSiteId} onValueChange={setSelectedSiteId}>
                <SelectTrigger data-testid="select-evidence-site">
                  <SelectValue placeholder="Company-wide evidence" />
                </SelectTrigger>
                <SelectContent>
                  {activeSites.map((site: any) => (
                    <SelectItem key={site.id} value={site.id}>{site.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1">
            <Label htmlFor="evidence-notes">Notes</Label>
            <Textarea
              id="evidence-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional context for reviewers"
              data-testid="input-evidence-notes"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="evidence-tags">Tags</Label>
            <Input
              id="evidence-tags"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="invoice, supplier, assurance"
              data-testid="input-evidence-tags"
            />
          </div>

          <Button
            className="w-full"
            disabled={!canUpload}
            onClick={() => uploadMutation.mutate()}
            data-testid="button-submit-evidence"
          >
            {uploadMutation.isPending ? "Uploading..." : "Upload and link evidence"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CoverageOverview() {
  const { data: coverage, isLoading } = useQuery<any>({
    queryKey: ["/api/evidence/coverage"],
  });
  const { data: definitions = [] } = useQuery<MetricDefinitionActivation[]>({
    queryKey: ["/api/metric-definitions"],
    queryFn: () => authFetch("/api/metric-definitions").then((r) => r.json()),
  });
  const { data: companyMetrics = [] } = useQuery<CompanyMetric[]>({
    queryKey: ["/api/metrics"],
    queryFn: () => authFetch("/api/metrics").then((r) => r.json()),
  });

  if (isLoading) return <div className="text-sm text-muted-foreground">Loading coverage...</div>;
  if (!coverage) return null;

  const canonicalMetrics = buildCanonicalEnabledMetrics(definitions, companyMetrics);
  const canonicalCoverage = buildCanonicalEvidenceMetrics(canonicalMetrics, coverage.metricCoverage || []);
  const evidencedCount = canonicalCoverage.filter((metric) => metric.hasEvidence).length;
  const coveragePercent = canonicalMetrics.length > 0 ? Math.round((evidencedCount / canonicalMetrics.length) * 100) : 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
              <FileCheck className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold" data-testid="text-total-evidence">{coverage.totalEvidence}</p>
              <p className="text-xs text-muted-foreground">Total Evidence Files</p>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/30">
              <PieChart className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold" data-testid="text-coverage-percent">{coveragePercent}%</p>
              <p className="text-xs text-muted-foreground">Enabled Metrics Evidenced</p>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-900/30">
              <Clock className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold" data-testid="text-pending-review">{coverage.byStatus?.uploaded || 0}</p>
              <p className="text-xs text-muted-foreground">Pending Review</p>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-red-100 dark:bg-red-900/30">
              <AlertTriangle className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold" data-testid="text-expired-evidence">{coverage.expiredCount}</p>
              <p className="text-xs text-muted-foreground">Expired</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCoverageTable() {
  const { data: coverage } = useQuery<any>({
    queryKey: ["/api/evidence/coverage"],
  });
  const { data: definitions = [] } = useQuery<MetricDefinitionActivation[]>({
    queryKey: ["/api/metric-definitions"],
    queryFn: () => authFetch("/api/metric-definitions").then((r) => r.json()),
  });
  const { data: companyMetrics = [] } = useQuery<CompanyMetric[]>({
    queryKey: ["/api/metrics"],
    queryFn: () => authFetch("/api/metrics").then((r) => r.json()),
  });

  const canonicalMetrics = buildCanonicalEnabledMetrics(definitions, companyMetrics);
  const canonicalCoverage = buildCanonicalEvidenceMetrics(canonicalMetrics, coverage?.metricCoverage || []);

  if (!canonicalCoverage.length) return null;

  const categories = ["environmental", "social", "governance"];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Metric Evidence Coverage</CardTitle>
        <CardDescription>Which metrics have supporting evidence attached</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {categories.map(cat => {
            const metricsInCat = canonicalCoverage.filter((m) => m.category === cat);
            if (!metricsInCat.length) return null;
            const evidenced = metricsInCat.filter((m) => m.hasEvidence).length;
            return (
              <div key={cat}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium capitalize">{cat}</span>
                  <span className="text-xs text-muted-foreground">{evidenced}/{metricsInCat.length} enabled metrics evidenced</span>
                </div>
                <div className="space-y-1">
                  {metricsInCat.map((m) => (
                    <div key={m.canonicalId} className="flex items-center justify-between py-1 px-2 rounded text-sm hover:bg-muted/50" data-testid={`row-metric-coverage-${m.canonicalId}`}>
                      <span className={m.hasEvidence ? "text-foreground" : "text-muted-foreground"}>{m.name}</span>
                      <div className="flex items-center gap-2">
                        <DataSourceBadge type={m.dataSourceType} />
                        {m.hasEvidence ? (
                          <CheckCircle className="w-4 h-4 text-green-600" />
                        ) : (
                          <XCircle className="w-4 h-4 text-muted-foreground/40" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

type EvidenceListItem = {
  id: string;
  filename: string;
  description?: string | null;
  linkedModule?: string | null;
  linkedEntityId?: string | null;
  linkedPeriod?: string | null;
  resolvedLinkedPeriod?: string | null;
  evidenceStatus?: string | null;
  uploadedAt?: string | null;
  expiryDate?: string | null;
  fileUrl?: string | null;
  downloadUrl?: string | null;
  fileType?: string | null;
  fileSize?: number | null;
  assignedUserId?: string | null;
  siteId?: string | null;
  metricId?: string | null;
  metricName?: string | null;
  companyName?: string | null;
  uploaderName?: string | null;
  uploaderEmail?: string | null;
  tags?: string[] | null;
  isOrphaned?: boolean;
};

function EvidenceManagementView({
  viewSiteId,
  setViewSiteId,
}: {
  viewSiteId: string;
  setViewSiteId: (v: string) => void;
}) {
  const { sites } = useSiteContext();
  const { can } = usePermissions();
  const { toast } = useToast();
  const hasMultipleSites = sites.length >= 1;
  const resolvedSiteId = viewSiteId === "__all__" ? undefined : viewSiteId;
  const viewedSite = resolvedSiteId ? sites.find((s: any) => s.id === resolvedSiteId) : null;
  const [metricFilter, setMetricFilter] = useState("__all__");
  const [periodFilter, setPeriodFilter] = useState("__all__");
  const [companyFilter, setCompanyFilter] = useState("__all__");
  const [showOrphansOnly, setShowOrphansOnly] = useState("false");

  const { data: files = [], isLoading } = useQuery<EvidenceListItem[]>({
    queryKey: ["/api/evidence", resolvedSiteId ?? "all"],
    queryFn: async () => {
      const url = resolvedSiteId ? `/api/evidence?siteId=${resolvedSiteId}` : "/api/evidence";
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load evidence");
      return res.json();
    },
  });

  const metricOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const file of files) {
      if (file.metricId && file.metricName && !seen.has(file.metricId)) {
        seen.set(file.metricId, file.metricName);
      }
    }
    return Array.from(seen.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [files]);

  const periodOptions = useMemo(() => {
    return Array.from(new Set(files.map((file) => file.resolvedLinkedPeriod).filter(Boolean) as string[])).sort().reverse();
  }, [files]);

  const companyOptions = useMemo(() => {
    return Array.from(new Set(files.map((file) => file.companyName).filter(Boolean) as string[])).sort();
  }, [files]);

  const filteredFiles = useMemo(() => {
    return files.filter((file) => {
      if (metricFilter !== "__all__" && file.metricId !== metricFilter) return false;
      if (periodFilter !== "__all__" && file.resolvedLinkedPeriod !== periodFilter) return false;
      if (companyFilter !== "__all__" && file.companyName !== companyFilter) return false;
      if (showOrphansOnly === "true" && !file.isOrphaned) return false;
      return true;
    });
  }, [companyFilter, files, metricFilter, periodFilter, showOrphansOnly]);

  const orphanCount = files.filter((file) => file.isOrphaned).length;

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await apiRequest("PUT", `/api/evidence/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/evidence"] });
      queryClient.invalidateQueries({ queryKey: ["/api/evidence/coverage"] });
      toast({ title: "Evidence updated" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/evidence/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/evidence"] });
      queryClient.invalidateQueries({ queryKey: ["/api/evidence/coverage"] });
      toast({ title: "Evidence deleted" });
    },
  });

  if (isLoading) return <div className="text-sm text-muted-foreground">Loading evidence...</div>;

  if (!files.length) {
    return (
      <EmptyState
        icon={FileCheck}
        title={viewedSite ? "No evidence for this site yet" : "No evidence files yet"}
        description={viewedSite
          ? `Upload a document and link it to a metric for ${viewedSite.name}.`
          : "Upload a document and link it to the metric it supports. Evidence added from Data Entry also appears here."}
        helpText="Use Upload evidence above, or attach evidence directly from a metric row in Data Entry."
      />
    );
  }

  const isExpired = (f: EvidenceListItem) => f.expiryDate && new Date(f.expiryDate) < new Date();

  return (
    <div className="space-y-4">
      <Card className="border-dashed">
        <CardContent className="pt-6 space-y-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-muted-foreground" />
                <p className="text-sm font-medium">Audit filters</p>
                {orphanCount > 0 && (
                  <Badge variant="destructive" className="text-xs" data-testid="badge-orphaned-evidence-count">
                    {orphanCount} orphaned
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Uploads are metric-linked here, and files attached in Data Entry appear in the same audit trail.
              </p>
            </div>
            <Link href="/data-entry">
              <Button size="sm" variant="outline" data-testid="button-evidence-open-data-entry">
                Go to Data Entry
                <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
              </Button>
            </Link>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
            {hasMultipleSites && (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Site</Label>
                <Select value={viewSiteId} onValueChange={setViewSiteId} data-testid="select-evidence-site-filter">
                  <SelectTrigger data-testid="trigger-evidence-site-filter">
                    <SelectValue placeholder="All sites" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All sites</SelectItem>
                    {sites.map((s) => (
                      <SelectItem key={s.id} value={s.id} data-testid={`option-evidence-site-${s.id}`}>
                        {s.name}{s.status === "archived" ? " (Archived)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Metric</Label>
              <Select value={metricFilter} onValueChange={setMetricFilter} data-testid="select-evidence-metric-filter">
                <SelectTrigger>
                  <SelectValue placeholder="All metrics" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All metrics</SelectItem>
                  {metricOptions.map((metric) => (
                    <SelectItem key={metric.id} value={metric.id}>{metric.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Period</Label>
              <Select value={periodFilter} onValueChange={setPeriodFilter} data-testid="select-evidence-period-filter">
                <SelectTrigger>
                  <SelectValue placeholder="All periods" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All periods</SelectItem>
                  {periodOptions.map((period) => (
                    <SelectItem key={period} value={period}>{period}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Company</Label>
              <Select value={companyFilter} onValueChange={setCompanyFilter} data-testid="select-evidence-company-filter">
                <SelectTrigger>
                  <SelectValue placeholder="Current company" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All companies</SelectItem>
                  {companyOptions.map((company) => (
                    <SelectItem key={company} value={company}>{company}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Status</Label>
              <Select value={showOrphansOnly} onValueChange={setShowOrphansOnly} data-testid="select-evidence-link-status-filter">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="false">All evidence</SelectItem>
                  <SelectItem value="true">Orphaned only</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {filteredFiles.length === 0 ? (
        <EmptyState
          icon={FileCheck}
          title="No evidence matches these filters"
          description="Try clearing one of the audit filters or return to Data Entry to attach evidence to a metric."
        />
      ) : (
        filteredFiles.map((f) => (
          <Card key={f.id} className={isExpired(f) ? "border-red-300 dark:border-red-800" : ""} data-testid={`card-evidence-${f.id}`}>
            <CardContent className="py-3 px-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span className="font-medium text-sm truncate" data-testid={`text-evidence-filename-${f.id}`}>{f.filename}</span>
                    <EvidenceStatusBadge status={isExpired(f) ? "expired" : (f.evidenceStatus || "uploaded")} />
                    {f.companyName && (
                      <Badge variant="secondary" className="text-xs">{f.companyName}</Badge>
                    )}
                    {f.siteId && (() => {
                      const evSite = sites.find((site) => site.id === f.siteId);
                      return (
                        <Badge variant="secondary" className="text-xs" data-testid={`badge-site-evidence-${f.id}`}>
                          {evSite ? evSite.name : f.siteId}
                          {evSite?.status === "archived" && " (Archived)"}
                        </Badge>
                      );
                    })()}
                    {f.isOrphaned ? (
                      <Badge variant="destructive" className="text-xs gap-1" data-testid={`badge-orphaned-evidence-${f.id}`}>
                        <Link2Off className="w-3 h-3" />
                        Orphaned
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs">
                        {MODULE_LABELS[f.linkedModule || "metric_value"] || f.linkedModule}
                      </Badge>
                    )}
                  </div>

                  <div className="grid grid-cols-1 gap-2 text-xs md:grid-cols-3">
                    <div className="rounded-md border bg-muted/30 px-2.5 py-2">
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Metric</p>
                      <p className="mt-1 font-medium text-foreground">
                        {f.metricName || "Not linked to a metric"}
                      </p>
                    </div>
                    <div className="rounded-md border bg-muted/30 px-2.5 py-2">
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Reporting period</p>
                      <p className="mt-1 font-medium text-foreground">
                        {f.resolvedLinkedPeriod || "Not set"}
                      </p>
                    </div>
                    <div className="rounded-md border bg-muted/30 px-2.5 py-2">
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Link status</p>
                      <p className={`mt-1 font-medium ${f.isOrphaned ? "text-destructive" : "text-foreground"}`}>
                        {f.isOrphaned ? "Needs metric linkage" : "Linked to metric entry"}
                      </p>
                    </div>
                  </div>

                  {f.description && <p className="text-xs text-muted-foreground">{f.description}</p>}
                  {f.tags && f.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {f.tags.map((tag) => (
                        <Badge key={tag} variant="secondary" className="text-[10px]">{tag}</Badge>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                    <span>Uploaded {f.uploadedAt ? new Date(f.uploadedAt).toLocaleDateString() : "Unknown"}</span>
                    <span>By {f.uploaderName || f.uploaderEmail || "Unknown user"}</span>
                    {formatAttachmentSize(f.fileSize) && <span>{formatAttachmentSize(f.fileSize)}</span>}
                    {f.expiryDate && (
                      <span className={isExpired(f) ? "text-red-600 font-medium" : ""}>
                        {isExpired(f) ? "Expired" : "Expires"} {new Date(f.expiryDate).toLocaleDateString()}
                      </span>
                    )}
                    <OwnerAssignment
                      entityType="evidence_files"
                      entityId={f.id}
                      currentUserId={f.assignedUserId}
                      invalidateKeys={[["/api/evidence"]]}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <a href={f.downloadUrl || f.fileUrl || `/api/evidence/${f.id}/download`} target="_blank" rel="noopener noreferrer">
                    <Button size="sm" variant="outline" data-testid={`button-download-evidence-${f.id}`}>
                      <Eye className="w-3 h-3 mr-1" />
                      Open
                    </Button>
                  </a>
                  {can("metrics_data_entry") && (
                    <>
                    {f.evidenceStatus === "uploaded" && (
                      <Button size="sm" variant="outline" onClick={() => updateMutation.mutate({ id: f.id, data: { evidenceStatus: "reviewed" } })} data-testid={`button-review-evidence-${f.id}`}>
                        <Eye className="w-3 h-3 mr-1" />
                        Review
                      </Button>
                    )}
                    {(f.evidenceStatus === "uploaded" || f.evidenceStatus === "reviewed") && (
                      <Button size="sm" variant="outline" className="text-green-600" onClick={() => updateMutation.mutate({ id: f.id, data: { evidenceStatus: "approved" } })} data-testid={`button-approve-evidence-${f.id}`}>
                        <CheckCircle className="w-3 h-3 mr-1" />
                        Approve
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => { if (confirm("Delete this evidence file?")) deleteMutation.mutate(f.id); }} data-testid={`button-delete-evidence-${f.id}`}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                    </>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}

export default function Evidence() {
  const { can } = usePermissions();
  const { isPro } = useBillingStatus();
  const { activeSiteId, sites } = useSiteContext();
  const { data: coverage } = useQuery<any>({ queryKey: ["/api/evidence/coverage"] });
  const fileCount = coverage?.totalEvidence ?? 0;

  const [viewSiteId, setViewSiteId] = useState<string>(activeSiteId || "__all__");

  const resolvedViewSite = viewSiteId === "__all__" ? undefined : sites.find((s: any) => s.id === viewSiteId);
  const isArchivedView = resolvedViewSite?.status === "archived";

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <PageGuidance
        pageKey="evidence"
        title="Supporting Documents — what this page does"
        summary="Upload evidence documents, link them to the metric they support, and review the audit trail by metric, period, site, and company context."
        goodLooksLike="Each evidence item has a stored file, a linked metric, a reporting period, and a clear download path for review."
        steps={[
          "Upload a document and select the metric it supports",
          "Set the reporting period or evidence date and add optional notes or tags",
          "Open or download evidence from this audit view or from the metric detail view",
          "Use the Coverage tab to see which metrics still need supporting documentation",
        ]}
      />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-evidence-title">Supporting Documents <EsgTooltip term="evidence" /></h1>
          <p className="text-sm text-muted-foreground mt-1">Review linked evidence by metric and reporting period</p>
        </div>
        {isArchivedView && (
          <Badge variant="outline" className="text-xs text-amber-600 border-amber-300 dark:border-amber-700">
            Archived site — uploads disabled
          </Badge>
        )}
        {can("metrics_data_entry") && !isArchivedView && (
          <UploadEvidenceDialog />
        )}
      </div>

      {!isPro && can("metrics_data_entry") && (
        <UpgradeLimitBanner
          current={fileCount}
          limit={10}
          noun="Evidence files"
          feature="evidence-upload"
          valueMessage="Pro gives you unlimited uploads — add every invoice, certificate, and document that backs up your ESG data."
          data-testid="banner-evidence-limit"
        />
      )}

      <CoverageOverview />

      <Tabs defaultValue="files">
        <TabsList>
          <TabsTrigger value="files" data-testid="tab-evidence-files">Audit View</TabsTrigger>
          <TabsTrigger value="coverage" data-testid="tab-evidence-coverage">Coverage</TabsTrigger>
          <TabsTrigger value="requests" data-testid="tab-evidence-requests">
            Evidence Requests
            <EvidenceRequestCountBadge />
          </TabsTrigger>
        </TabsList>
        <TabsContent value="files" className="mt-4">
          <EvidenceManagementView
            viewSiteId={viewSiteId}
            setViewSiteId={setViewSiteId}
          />
        </TabsContent>
        <TabsContent value="coverage" className="mt-4">
          <MetricCoverageTable />
        </TabsContent>
        <TabsContent value="requests" className="mt-4">
          <EvidenceRequestsPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function EvidenceRequestCountBadge() {
  const { isAdmin } = usePermissions();
  const { data } = useQuery<any[]>({
    queryKey: [isAdmin ? "/api/evidence-requests" : "/api/evidence-requests/mine"],
  });
  const pending = (data || []).filter((r: any) => ["requested", "uploaded"].includes(r.status));
  if (pending.length === 0) return null;
  return <Badge variant="secondary" className="ml-1.5 text-xs h-4 px-1" data-testid="badge-requests-count">{pending.length}</Badge>;
}

const REQUEST_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  requested: { label: "Requested", className: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" },
  uploaded: { label: "Uploaded", className: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300" },
  under_review: { label: "Under Review", className: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300" },
  approved: { label: "Approved", className: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" },
  rejected: { label: "Rejected", className: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300" },
  expired: { label: "Expired", className: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400" },
};

function EvidenceRequestsPanel() {
  const { isAdmin, can } = usePermissions();
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [assignUser, setAssignUser] = useState("");
  const [reqLinkedModule, setReqLinkedModule] = useState("");
  const [reqDescription, setReqDescription] = useState("");
  const [reqDueDate, setReqDueDate] = useState("");

  const { data: requests, isLoading } = useQuery<any[]>({
    queryKey: [isAdmin ? "/api/evidence-requests" : "/api/evidence-requests/mine"],
  });

  const { data: companyUsers } = useQuery<any[]>({
    queryKey: ["/api/users"],
    enabled: isAdmin,
  });

  const { data: evidenceFiles } = useQuery<any[]>({
    queryKey: ["/api/evidence"],
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/evidence-requests", {
        assignedUserId: assignUser,
        linkedModule: reqLinkedModule || null,
        description: reqDescription,
        dueDate: reqDueDate || null,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Evidence request created" });
      queryClient.invalidateQueries({ queryKey: ["/api/evidence-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/evidence-requests/mine"] });
      setCreateOpen(false);
      setAssignUser("");
      setReqLinkedModule("");
      setReqDescription("");
      setReqDueDate("");
    },
    onError: (e: any) => {
      toast({ title: "Failed to create request", description: e.message, variant: "destructive" });
    },
  });

  const linkMutation = useMutation({
    mutationFn: async ({ requestId, evidenceFileId }: { requestId: string; evidenceFileId: string }) => {
      const res = await apiRequest("PUT", `/api/evidence-requests/${requestId}/link`, { evidenceFileId });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Evidence linked to request" });
      queryClient.invalidateQueries({ queryKey: ["/api/evidence-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/evidence-requests/mine"] });
    },
    onError: (e: any) => {
      toast({ title: "Failed to link evidence", description: e.message, variant: "destructive" });
    },
  });

  return (
    <div className="space-y-4">
      {isAdmin && (
        <div className="flex justify-end">
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm" data-testid="button-create-request">Create Request</Button>
            </DialogTrigger>
            <DialogContent data-testid="dialog-create-request">
              <DialogHeader>
                <DialogTitle>Create Evidence Request</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Assign To</Label>
                  <Select value={assignUser} onValueChange={setAssignUser} data-testid="select-assign-user">
                    <SelectTrigger>
                      <SelectValue placeholder="Select user" />
                    </SelectTrigger>
                    <SelectContent>
                      {(companyUsers || []).map((u: any) => (
                        <SelectItem key={u.id} value={u.id}>{u.username}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Linked Module</Label>
                  <Select value={reqLinkedModule} onValueChange={setReqLinkedModule} data-testid="select-linked-module">
                    <SelectTrigger>
                      <SelectValue placeholder="Optional" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="metric">Metric</SelectItem>
                      <SelectItem value="policy">Policy</SelectItem>
                      <SelectItem value="questionnaire">Questionnaire</SelectItem>
                      <SelectItem value="action">Action</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Description</Label>
                  <Textarea value={reqDescription} onChange={(e) => setReqDescription(e.target.value)} placeholder="Describe the evidence needed..." data-testid="input-request-description" />
                </div>
                <div>
                  <Label>Due Date</Label>
                  <Input type="date" value={reqDueDate} onChange={(e) => setReqDueDate(e.target.value)} data-testid="input-request-due-date" />
                </div>
                <Button onClick={() => createMutation.mutate()} disabled={!assignUser || !reqDescription || createMutation.isPending} className="w-full">
                  {createMutation.isPending ? "Creating..." : "Create Request"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      )}

      {isLoading && <div className="text-center text-muted-foreground py-8">Loading requests...</div>}

      {!isLoading && (!requests || requests.length === 0) && (
        <div className="text-center py-10 space-y-3" data-testid="empty-state-evidence-requests">
          <p className="text-sm font-medium">No evidence requests yet</p>
          <p className="text-xs text-muted-foreground max-w-xs mx-auto">
            Evidence requests let you ask a team member to upload a specific file — for example, ask your finance team for the latest electricity bill.
          </p>
          <p className="text-xs text-muted-foreground">Use the "Request File" button above to send your first request.</p>
        </div>
      )}

      {(requests || []).map((req: any) => {
        const statusConfig = REQUEST_STATUS_CONFIG[req.status] || REQUEST_STATUS_CONFIG.requested;
        return (
          <Card key={req.id} data-testid={`request-item-${req.id}`}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{req.description}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {req.linkedModule && <Badge variant="outline" className="text-xs">{req.linkedModule}</Badge>}
                    {req.dueDate && <span className="text-xs text-muted-foreground">{new Date(req.dueDate).toLocaleDateString()}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant="outline" className={`${statusConfig.className} text-xs border-0`} data-testid={`badge-request-status-${req.id}`}>
                    {statusConfig.label}
                  </Badge>
                  {req.status === "requested" && !isAdmin && (
                    <Select onValueChange={(fileId) => linkMutation.mutate({ requestId: req.id, evidenceFileId: fileId })}>
                      <SelectTrigger className="w-auto h-7 text-xs" data-testid={`button-upload-for-request-${req.id}`}>
                        <SelectValue placeholder="Link Evidence" />
                      </SelectTrigger>
                      <SelectContent>
                        {(evidenceFiles || []).map((f: any) => (
                          <SelectItem key={f.id} value={f.id}>{f.filename}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
