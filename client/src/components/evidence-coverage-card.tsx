import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { FileCheck, FileText, BarChart3, ClipboardList } from "lucide-react";

function CoverageRing({ percent }: { percent: number }) {
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(percent, 100) / 100) * circumference;
  const color = percent >= 70 ? "stroke-emerald-500" : percent >= 40 ? "stroke-amber-500" : "stroke-red-500";
  const textColor = percent >= 70 ? "text-emerald-500" : percent >= 40 ? "text-amber-500" : "text-red-500";

  return (
    <div className="flex flex-col items-center shrink-0">
      <div className="relative w-20 h-20">
        <svg className="w-20 h-20 -rotate-90" viewBox="0 0 90 90">
          <circle cx="45" cy="45" r={radius} fill="none" className="stroke-muted" strokeWidth="7" />
          <circle
            cx="45" cy="45" r={radius} fill="none"
            className={color}
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={`text-lg font-bold ${textColor}`} data-testid="text-coverage-percent">{percent}%</span>
        </div>
      </div>
      <p className="text-xs text-muted-foreground mt-1">Coverage</p>
    </div>
  );
}

export function EvidenceCoverageCard({ compact = false }: { compact?: boolean }) {
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/esg/coverage"] });

  if (isLoading) return <Skeleton className={compact ? "h-24" : "h-40"} />;
  if (!data) return null;

  const rows = [
    { label: "Policies", icon: FileText, count: data.policiesWithEvidence, total: data.totalPolicies },
    { label: "Metrics", icon: BarChart3, count: data.metricsWithEvidence, total: data.totalMetrics },
    { label: "Reports", icon: ClipboardList, count: data.reportsWithEvidence, total: data.totalReports },
  ];

  if (compact) {
    return (
      <div className="flex items-center gap-3" data-testid="card-evidence-coverage-compact">
        <FileCheck className="w-4 h-4 text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium">Evidence Coverage</p>
          <div className="flex items-center gap-2 mt-1">
            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${data.overallPercent >= 70 ? "bg-emerald-500" : data.overallPercent >= 40 ? "bg-amber-500" : "bg-red-500"}`}
                style={{ width: `${Math.min(data.overallPercent, 100)}%` }}
              />
            </div>
            <span className="text-xs font-bold" data-testid="text-coverage-compact">{data.overallPercent}%</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <Card data-testid="card-evidence-coverage">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <FileCheck className="w-4 h-4 text-primary" />
          Evidence Coverage
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-start gap-4">
          <CoverageRing percent={data.overallPercent} />
          <div className="flex-1 space-y-2">
            {rows.map(r => {
              const pct = r.total > 0 ? Math.round((r.count / r.total) * 100) : 0;
              return (
                <div key={r.label} className="flex items-center gap-2 text-xs" data-testid={`coverage-row-${r.label.toLowerCase()}`}>
                  <r.icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <span className="w-16 text-muted-foreground">{r.label}</span>
                  <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${pct >= 70 ? "bg-emerald-500" : pct >= 40 ? "bg-amber-500" : "bg-red-500"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-10 text-right font-medium">{r.count}/{r.total}</span>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
