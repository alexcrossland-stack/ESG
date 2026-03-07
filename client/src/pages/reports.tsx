import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Download, FileText, BarChart3, Clock, CheckCircle, Leaf, Users, Shield, FileDown } from "lucide-react";
import { format, subMonths } from "date-fns";

function generatePeriods() {
  const periods = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = subMonths(now, i);
    periods.push(format(d, "yyyy-MM"));
  }
  return periods;
}

function ReportPreview({ data }: { data: any }) {
  const { company, policy, selectedTopics, metrics, values, actions } = data;

  return (
    <div className="bg-white dark:bg-card border border-border rounded-md p-8 space-y-6 text-sm max-h-[600px] overflow-y-auto" data-testid="report-preview">
      {/* Header */}
      <div className="text-center space-y-1 pb-4 border-b border-border">
        <div className="flex items-center justify-center gap-2 mb-3">
          <div className="p-2 rounded-lg bg-primary">
            <Leaf className="w-5 h-5 text-primary-foreground" />
          </div>
        </div>
        <h1 className="text-xl font-bold">{company?.name}</h1>
        <p className="text-muted-foreground">ESG Report — {new Date().getFullYear()}</p>
        <p className="text-xs text-muted-foreground">Generated {format(new Date(), "dd MMMM yyyy")}</p>
      </div>

      {/* Company overview */}
      <div>
        <h2 className="font-semibold text-base mb-2 flex items-center gap-2">
          <FileText className="w-4 h-4 text-primary" />
          Company Overview
        </h2>
        <div className="grid grid-cols-2 gap-2 text-xs">
          {company?.industry && <div><span className="text-muted-foreground">Industry:</span> {company.industry}</div>}
          {company?.country && <div><span className="text-muted-foreground">Country:</span> {company.country}</div>}
          {company?.employeeCount && <div><span className="text-muted-foreground">Employees:</span> {company.employeeCount}</div>}
          {company?.revenueBand && <div><span className="text-muted-foreground">Revenue:</span> {company.revenueBand}</div>}
        </div>
      </div>

      {/* Priority topics */}
      {selectedTopics?.length > 0 && (
        <div>
          <h2 className="font-semibold text-base mb-2 flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            Priority ESG Topics
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {selectedTopics.map((t: any) => (
              <Badge key={t.id} variant="secondary" className="text-xs">{t.topic}</Badge>
            ))}
          </div>
        </div>
      )}

      {/* Policy summary */}
      {policy && (
        <div>
          <h2 className="font-semibold text-base mb-2 flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" />
            ESG Policy Summary
          </h2>
          {policy.purpose && (
            <p className="text-xs text-muted-foreground line-clamp-4">{policy.purpose}</p>
          )}
        </div>
      )}

      {/* Metrics */}
      {values?.length > 0 && (
        <div>
          <h2 className="font-semibold text-base mb-2 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-primary" />
            ESG Metrics
          </h2>
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-1.5 font-medium text-muted-foreground">Metric</th>
                <th className="text-left py-1.5 font-medium text-muted-foreground">Category</th>
                <th className="text-right py-1.5 font-medium text-muted-foreground">Value</th>
              </tr>
            </thead>
            <tbody>
              {values.slice(0, 10).map((v: any) => (
                <tr key={v.id} className="border-b border-border/50">
                  <td className="py-1.5">{v.metricName}</td>
                  <td className="py-1.5 capitalize text-muted-foreground">{v.category}</td>
                  <td className="py-1.5 text-right font-medium">{v.value} {v.unit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Actions */}
      {actions?.length > 0 && (
        <div>
          <h2 className="font-semibold text-base mb-2 flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-primary" />
            Improvement Actions
          </h2>
          <div className="space-y-2">
            {actions.slice(0, 5).map((a: any) => (
              <div key={a.id} className="flex items-start gap-2">
                <Badge variant={a.status === "complete" ? "default" : "secondary"} className="text-xs shrink-0 mt-0.5">
                  {a.status?.replace(/_/g, " ")}
                </Badge>
                <div>
                  <p className="font-medium">{a.title}</p>
                  {a.owner && <p className="text-xs text-muted-foreground">Owner: {a.owner}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="pt-4 border-t border-border text-center text-xs text-muted-foreground">
        This report was generated using ESG Manager. Data is provided by {company?.name}.
      </div>
    </div>
  );
}

export default function Reports() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const periods = generatePeriods();
  const [selectedPeriod, setSelectedPeriod] = useState(periods[0]);
  const [reportType, setReportType] = useState("pdf");
  const [includePolicy, setIncludePolicy] = useState(true);
  const [includeTopics, setIncludeTopics] = useState(true);
  const [includeMetrics, setIncludeMetrics] = useState(true);
  const [includeActions, setIncludeActions] = useState(true);
  const [reportData, setReportData] = useState<any>(null);

  const { data: reports = [], isLoading } = useQuery<any[]>({ queryKey: ["/api/reports"] });

  const generateMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/reports/generate", {
      period: selectedPeriod,
      reportType,
      includePolicy,
      includeTopics,
      includeMetrics,
      includeActions,
    }),
    onSuccess: (data: any) => {
      setReportData(data.data);
      queryClient.invalidateQueries({ queryKey: ["/api/reports"] });
      toast({ title: "Report generated", description: "Your ESG report is ready to preview and export." });
    },
    onError: () => toast({ title: "Generation failed", variant: "destructive" }),
  });

  const exportReport = () => {
    if (!reportData) return;
    const { company, selectedTopics, metrics, values, actions, policy } = reportData;

    let content = `# ESG Report — ${company?.name}\nGenerated: ${format(new Date(), "dd MMMM yyyy")}\nPeriod: ${selectedPeriod}\n\n`;

    if (includePolicy && policy) {
      content += `## ESG Policy Summary\n\n${policy.purpose || ""}\n\n`;
    }

    if (includeTopics && selectedTopics?.length) {
      content += `## Priority ESG Topics\n\n${selectedTopics.map((t: any) => `- ${t.topic}`).join("\n")}\n\n`;
    }

    if (includeMetrics && values?.length) {
      content += `## ESG Metrics (${selectedPeriod})\n\n`;
      content += values.map((v: any) => `- ${v.metricName}: ${v.value} ${v.unit || ""}`).join("\n");
      content += "\n\n";
    }

    if (includeActions && actions?.length) {
      content += `## Improvement Actions\n\n`;
      content += actions.map((a: any) => `- [${a.status?.replace(/_/g, " ")}] ${a.title} — Owner: ${a.owner || "TBC"}`).join("\n");
    }

    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `esg-report-${selectedPeriod}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Report exported" });
  };

  const exportCsv = () => {
    if (!reportData?.values?.length) return;
    const rows = [["Metric", "Category", "Period", "Value", "Unit"]];
    reportData.values.forEach((v: any) => {
      rows.push([v.metricName, v.category, v.period, v.value, v.unit || ""]);
    });
    const csv = rows.map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `esg-metrics-${selectedPeriod}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "CSV exported" });
  };

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Download className="w-5 h-5 text-primary" />
          ESG Reports
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Generate and export your ESG report for stakeholders
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Configuration panel */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Report Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Reporting Period</Label>
              <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                <SelectTrigger data-testid="select-report-period"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {periods.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Report Format</Label>
              <Select value={reportType} onValueChange={setReportType}>
                <SelectTrigger data-testid="select-report-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pdf">PDF Document</SelectItem>
                  <SelectItem value="word">Word Document</SelectItem>
                  <SelectItem value="csv">CSV Data</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Separator />

            <div className="space-y-3">
              <Label className="text-xs font-medium">Include Sections</Label>
              {[
                { key: "policy", label: "ESG Policy Summary", state: includePolicy, setter: setIncludePolicy },
                { key: "topics", label: "Priority Topics", state: includeTopics, setter: setIncludeTopics },
                { key: "metrics", label: "ESG Metrics & Data", state: includeMetrics, setter: setIncludeMetrics },
                { key: "actions", label: "Improvement Actions", state: includeActions, setter: setIncludeActions },
              ].map(({ key, label, state, setter }) => (
                <div key={key} className="flex items-center gap-2">
                  <Checkbox
                    id={key}
                    checked={state}
                    onCheckedChange={v => setter(!!v)}
                    data-testid={`checkbox-${key}`}
                  />
                  <Label htmlFor={key} className="text-xs cursor-pointer">{label}</Label>
                </div>
              ))}
            </div>

            <Button
              className="w-full"
              onClick={() => generateMutation.mutate()}
              disabled={generateMutation.isPending}
              data-testid="button-generate-report"
            >
              <FileText className="w-3.5 h-3.5 mr-1.5" />
              {generateMutation.isPending ? "Generating..." : "Generate Report"}
            </Button>
          </CardContent>
        </Card>

        {/* Preview and export */}
        <div className="lg:col-span-2 space-y-4">
          {reportData ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-medium">Report Preview</h2>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={exportCsv} disabled={!reportData?.values?.length} data-testid="button-export-csv">
                    <FileDown className="w-3.5 h-3.5 mr-1.5" />
                    Export CSV
                  </Button>
                  <Button size="sm" onClick={exportReport} data-testid="button-export-report">
                    <Download className="w-3.5 h-3.5 mr-1.5" />
                    Export Report
                  </Button>
                </div>
              </div>
              <ReportPreview data={reportData} />
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 border border-dashed border-border rounded-md space-y-3">
              <FileText className="w-10 h-10 text-muted-foreground" />
              <div className="text-center">
                <p className="text-sm font-medium">No report generated yet</p>
                <p className="text-xs text-muted-foreground mt-1">Configure your settings and click Generate Report</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Report history */}
      <div>
        <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Clock className="w-4 h-4" />
          Report History
        </h2>
        {isLoading ? (
          <Skeleton className="h-24" />
        ) : reports.length === 0 ? (
          <p className="text-sm text-muted-foreground">No reports generated yet.</p>
        ) : (
          <div className="space-y-2">
            {reports.map(report => (
              <div key={report.id} className="flex items-center gap-3 p-3 rounded-md border border-border" data-testid={`report-history-${report.id}`}>
                <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">ESG Report — {report.period || "All Periods"}</p>
                  <p className="text-xs text-muted-foreground">
                    Generated {format(new Date(report.generatedAt), "dd MMM yyyy 'at' HH:mm")}
                  </p>
                </div>
                <Badge variant="outline" className="text-xs">{report.reportType?.toUpperCase()}</Badge>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
