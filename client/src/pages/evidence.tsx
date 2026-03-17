import { useState } from "react";
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
import {
  FileCheck, Upload, AlertTriangle, CheckCircle, Clock,
  Trash2, Eye, FileText, BarChart3, Shield, PieChart,
  Calendar, XCircle,
} from "lucide-react";
import { OwnerAssignment } from "@/components/owner-assignment";

const STATUS_CONFIG: Record<string, { label: string; icon: any; className: string }> = {
  uploaded: { label: "Uploaded", icon: Upload, className: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" },
  reviewed: { label: "Reviewed", icon: Eye, className: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300" },
  approved: { label: "Approved", icon: CheckCircle, className: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" },
  expired: { label: "Expired", icon: AlertTriangle, className: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300" },
};

const MODULE_LABELS: Record<string, string> = {
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

function UploadEvidenceDialog({ onUploaded }: { onUploaded?: () => void }) {
  const [open, setOpen] = useState(false);
  const [filename, setFilename] = useState("");
  const [description, setDescription] = useState("");
  const [linkedModule, setLinkedModule] = useState("");
  const [linkedPeriod, setLinkedPeriod] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [fileType, setFileType] = useState("");
  const { toast } = useToast();

  const uploadMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/evidence", {
        filename,
        fileType: fileType || null,
        description: description || null,
        linkedModule: linkedModule || null,
        linkedPeriod: linkedPeriod || null,
        expiryDate: expiryDate || null,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Evidence uploaded successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/evidence"] });
      queryClient.invalidateQueries({ queryKey: ["/api/evidence/coverage"] });
      setOpen(false);
      setFilename("");
      setDescription("");
      setLinkedModule("");
      setLinkedPeriod("");
      setExpiryDate("");
      setFileType("");
      onUploaded?.();
    },
    onError: (e: any) => {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="button-upload-evidence">
          <Upload className="w-4 h-4 mr-2" />
          Upload Evidence
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Upload Evidence</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Filename *</Label>
            <Input value={filename} onChange={e => setFilename(e.target.value)} placeholder="e.g. electricity-bill-jan-2025.pdf" data-testid="input-evidence-filename" />
          </div>
          <div>
            <Label>File Type</Label>
            <Select value={fileType} onValueChange={setFileType}>
              <SelectTrigger data-testid="select-evidence-filetype">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pdf">PDF</SelectItem>
                <SelectItem value="image">Image</SelectItem>
                <SelectItem value="spreadsheet">Spreadsheet</SelectItem>
                <SelectItem value="document">Document</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Description</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="What does this evidence support?" data-testid="input-evidence-description" />
          </div>
          <div>
            <Label>Linked Module</Label>
            <Select value={linkedModule} onValueChange={setLinkedModule}>
              <SelectTrigger data-testid="select-evidence-module">
                <SelectValue placeholder="Select module" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="metric_value">Metric Value</SelectItem>
                <SelectItem value="raw_data">Raw Data</SelectItem>
                <SelectItem value="policy">Policy</SelectItem>
                <SelectItem value="questionnaire_answer">Questionnaire Answer</SelectItem>
                <SelectItem value="report">Report</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Linked Period</Label>
            <Input value={linkedPeriod} onChange={e => setLinkedPeriod(e.target.value)} placeholder="e.g. 2025-01" data-testid="input-evidence-period" />
          </div>
          <div>
            <Label>Expiry / Review Date</Label>
            <Input type="date" value={expiryDate} onChange={e => setExpiryDate(e.target.value)} data-testid="input-evidence-expiry" />
          </div>
          <Button onClick={() => uploadMutation.mutate()} disabled={!filename || uploadMutation.isPending} className="w-full" data-testid="button-submit-evidence">
            {uploadMutation.isPending ? "Uploading..." : "Upload Evidence"}
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

  if (isLoading) return <div className="text-sm text-muted-foreground">Loading coverage...</div>;
  if (!coverage) return null;

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
              <p className="text-2xl font-bold" data-testid="text-coverage-percent">{coverage.coveragePercent}%</p>
              <p className="text-xs text-muted-foreground">Metric Coverage</p>
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

  if (!coverage?.metricCoverage?.length) return null;

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
            const metricsInCat = coverage.metricCoverage.filter((m: any) => m.category === cat);
            if (!metricsInCat.length) return null;
            const evidenced = metricsInCat.filter((m: any) => m.hasEvidence).length;
            return (
              <div key={cat}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium capitalize">{cat}</span>
                  <span className="text-xs text-muted-foreground">{evidenced}/{metricsInCat.length} evidenced</span>
                </div>
                <div className="space-y-1">
                  {metricsInCat.map((m: any) => (
                    <div key={m.metricId} className="flex items-center justify-between py-1 px-2 rounded text-sm hover:bg-muted/50" data-testid={`row-metric-coverage-${m.metricId}`}>
                      <span className={m.hasEvidence ? "text-foreground" : "text-muted-foreground"}>{m.metricName}</span>
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

function EvidenceList() {
  const { data: files = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/evidence"],
  });
  const { can } = usePermissions();
  const { toast } = useToast();

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
      <Card>
        <CardContent className="pt-6">
          <div className="text-center py-8 space-y-3" data-testid="evidence-empty-state">
            <FileCheck className="w-12 h-12 mx-auto text-muted-foreground/30" />
            <div>
              <p className="text-sm font-medium">No evidence files yet</p>
              <p className="text-xs text-muted-foreground mt-1">Start by uploading documents that support your ESG data</p>
            </div>
            <div className="text-xs text-muted-foreground space-y-1 max-w-xs mx-auto text-left">
              <p>Examples to upload:</p>
              <ul className="list-disc list-inside space-y-0.5 text-muted-foreground/80">
                <li>Energy invoices (electricity, gas)</li>
                <li>Payroll or HR records</li>
                <li>Training completion certificates</li>
                <li>Board meeting minutes</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const isExpired = (f: any) => f.expiryDate && new Date(f.expiryDate) < new Date();

  return (
    <div className="space-y-2">
      {files.map((f: any) => (
        <Card key={f.id} className={isExpired(f) ? "border-red-300 dark:border-red-800" : ""} data-testid={`card-evidence-${f.id}`}>
          <CardContent className="py-3 px-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="font-medium text-sm truncate" data-testid={`text-evidence-filename-${f.id}`}>{f.filename}</span>
                  <EvidenceStatusBadge status={isExpired(f) ? "expired" : (f.evidenceStatus || "uploaded")} />
                  {f.linkedModule && (
                    <Badge variant="outline" className="text-xs">{MODULE_LABELS[f.linkedModule] || f.linkedModule}</Badge>
                  )}
                  {f.linkedPeriod && (
                    <Badge variant="outline" className="text-xs">{f.linkedPeriod}</Badge>
                  )}
                </div>
                {f.description && <p className="text-xs text-muted-foreground mt-1">{f.description}</p>}
                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                  <span>Uploaded {f.uploadedAt ? new Date(f.uploadedAt).toLocaleDateString() : "Unknown"}</span>
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
              {can("metrics_data_entry") && (
                <div className="flex items-center gap-1 shrink-0">
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
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function Evidence() {
  const { can } = usePermissions();
  const { isPro } = useBillingStatus();
  const { data: coverage } = useQuery<any>({ queryKey: ["/api/evidence/coverage"] });
  const fileCount = coverage?.totalEvidence ?? 0;
  const atLimit = !isPro && fileCount >= 10;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <PageGuidance
        pageKey="evidence"
        title="Evidence Management — what this page does"
        summary="This page is where you store and manage the documents that support your ESG data — things like energy invoices, training records, board minutes, and third-party certificates. Evidence strengthens the credibility of your ESG reports."
        goodLooksLike="At least one piece of evidence linked to each active metric or policy, with documents reviewed and marked as approved."
        steps={[
          "Upload key documents — energy invoices, payroll data, policy certificates",
          "Link each file to the relevant metric, policy, or questionnaire",
          "Check the Coverage tab to see which metrics still lack supporting evidence",
          "Use evidence requests to ask team members to submit documents",
        ]}
      />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-evidence-title">Evidence Management</h1>
          <p className="text-sm text-muted-foreground mt-1">Upload, track, and review supporting evidence for your ESG data</p>
        </div>
        {can("metrics_data_entry") && !atLimit && <UploadEvidenceDialog />}
      </div>

      {!isPro && can("metrics_data_entry") && (
        <UpgradeLimitBanner
          current={fileCount}
          limit={10}
          noun="Evidence files"
          feature="evidence-upload"
          valueMessage="Pro gives you unlimited uploads — add every invoice, certificate, and audit record that supports your ESG claims."
          data-testid="banner-evidence-limit"
        />
      )}

      <CoverageOverview />

      <Tabs defaultValue="files">
        <TabsList>
          <TabsTrigger value="files" data-testid="tab-evidence-files">All Evidence</TabsTrigger>
          <TabsTrigger value="coverage" data-testid="tab-evidence-coverage">Coverage</TabsTrigger>
          <TabsTrigger value="requests" data-testid="tab-evidence-requests">
            Evidence Requests
            <EvidenceRequestCountBadge />
          </TabsTrigger>
        </TabsList>
        <TabsContent value="files" className="mt-4">
          <EvidenceList />
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
        <div className="text-center text-muted-foreground py-8">No evidence requests</div>
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
