import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { authFetch } from "@/lib/queryClient";
import { type ControlCentreData } from "@/lib/sme-improvement-plan";
import { buildSmeOverviewTasks, formatOverviewTaskDate } from "@/lib/sme-overview-tasks";
import { usePermissions } from "@/lib/permissions";
import { overviewPeriodContext } from "@/lib/overview-period";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowRight } from "lucide-react";

export function SmeNextTasks({ month }: { month: string }) {
  const { can } = usePermissions();
  const periodLabel = overviewPeriodContext(month).label;
  const { data, isLoading, isError, refetch } = useQuery<ControlCentreData>({
    queryKey: ["/api/control-centre", month],
    queryFn: async () => {
      const response = await authFetch(`/api/control-centre?period=${encodeURIComponent(month)}`);
      if (!response.ok) throw new Error("Tasks could not be loaded");
      return response.json();
    },
  });
  const tasks = buildSmeOverviewTasks(data, {
    canEnterData: can("metrics_data_entry"),
    canReview: can("report_generation"),
    canEditPolicies: can("policy_editing"),
  }, month);
  return (
    <section className="space-y-4 rounded-xl border bg-card p-4 shadow-sm sm:p-5" aria-labelledby="next-tasks-title" data-testid="sme-next-tasks">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="next-tasks-title" className="text-base font-semibold">What to focus on next</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">For {periodLabel} and company-wide work. Urgent items first; other suggestions span ESG areas. All actions shows the full priority order.</p>
        </div>
        <div className="flex flex-wrap gap-1">
          <Button asChild variant="ghost" size="sm"><Link href="/control-centre">All actions</Link></Button>
        </div>
      </div>
      {isLoading ? <Skeleton className="h-48" data-testid="overview-tasks-loading" /> : isError ? (
        <p role="alert" className="text-sm">Next steps could not be loaded. <button className="rounded-sm underline underline-offset-4" onClick={() => refetch()}>Try again</button></p>
      ) : tasks.length ? (
        <ol className="space-y-2">
          {tasks.map((task, index) => {
            const isPrimary = index === 0;
            const dueDate = formatOverviewTaskDate(task.dueDate);
            return (
              <li key={task.key} data-testid={isPrimary ? "overview-primary-task" : "overview-followup-task"} className={isPrimary ? "rounded-lg border border-primary/15 bg-primary/5 p-4 sm:p-5" : "rounded-lg border border-transparent px-4 py-3 sm:px-5"}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 space-y-1.5">
                    {isPrimary && <p className="text-xs font-semibold text-primary">Start here</p>}
                    <h3 className={`break-words font-semibold leading-snug ${isPrimary ? "text-base" : "text-sm"}`}>{task.title}</h3>
                    <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">{isPrimary ? task.why : task.evidenceOrResult}</p>
                    <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs leading-relaxed text-muted-foreground">
                      <span>{task.ownerLabel}</span>
                      <span className={dueDate ? "text-destructive" : ""}>{task.status}</span>
                      {dueDate && <span>{task.type === "expiredEvidence" ? "Expired" : "Due"} {dueDate}</span>}
                    </p>
                  </div>
                  <Button asChild variant={isPrimary ? "default" : "ghost"} size="sm" className={`min-h-10 shrink-0 whitespace-normal ${isPrimary ? "w-full sm:w-auto" : "self-start px-0 sm:px-3"}`}>
                    <Link href={task.href}>{task.actionLabel}<ArrowRight className="ml-2 h-4 w-4 shrink-0" aria-hidden="true" /></Link>
                  </Button>
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="rounded-lg bg-muted/40 p-4 text-sm leading-relaxed" data-testid="overview-tasks-empty">No outstanding items in this check. <Link className="text-primary underline underline-offset-4" href="/reports">View reports</Link> or <Link className="text-primary underline underline-offset-4" href="/control-centre">review the action plan</Link>.</p>
      )}
    </section>
  );
}
