import { overviewPeriodContext } from "@/lib/overview-period";

export function ReportingContextStrip({ month, scope = "Organisation-wide", locked = false, readOnly = false }: { month: string; scope?: string; locked?: boolean; readOnly?: boolean }) {
  return <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border bg-muted/25 px-4 py-3 text-sm" data-testid="reporting-context-strip">
    <span><span className="text-muted-foreground">Working period: </span><strong className="font-medium">{overviewPeriodContext(month).label}</strong></span>
    <span><span className="text-muted-foreground">Scope: </span>{scope}</span>
    <span className="text-xs text-muted-foreground sm:ml-auto">{locked ? "Locked · no changes allowed" : readOnly ? "Read-only" : "Open for updates"}</span>
  </div>;
}
