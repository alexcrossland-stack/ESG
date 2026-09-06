import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { authFetch } from "@/lib/queryClient";
import { buildSmeImprovementPlan, type ControlCentreData } from "@/lib/sme-improvement-plan";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export function SmeNextTasks({ month }: { month: string }) {
  const { data, isLoading, isError, refetch } = useQuery<ControlCentreData>({
    queryKey: ["/api/control-centre", month],
    queryFn: async () => {
      const response = await authFetch(`/api/control-centre?period=${encodeURIComponent(month)}`);
      if (!response.ok) throw new Error("Tasks could not be loaded");
      return response.json();
    },
  });
  const tasks = data ? buildSmeImprovementPlan(data, 3) : [];
  return (
    <section className="space-y-4 rounded-xl border bg-card p-4 shadow-sm sm:p-5" aria-labelledby="next-tasks-title" data-testid="sme-next-tasks">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="next-tasks-title" className="text-base font-semibold">Your next steps</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">Figures for {month}, plus outstanding company-wide work.</p>
        </div>
        <div className="flex flex-wrap gap-1">
          <Button asChild variant="ghost" size="sm"><Link href="/my-tasks">My work</Link></Button>
          <Button asChild variant="ghost" size="sm"><Link href="/control-centre">All actions</Link></Button>
        </div>
      </div>
      {isLoading ? <Skeleton className="h-24" /> : isError ? (
        <p role="alert" className="text-sm">Your tasks could not be loaded. <button className="rounded-sm underline underline-offset-4" onClick={() => refetch()}>Try again</button></p>
      ) : tasks.length ? (
        <ol className="space-y-1">
          {tasks.map((task, index) => (
            <li key={task.key} className={`grid grid-cols-[2rem_minmax(0,1fr)] items-start gap-x-3 gap-y-3 rounded-lg p-3 sm:grid-cols-[2rem_minmax(0,1fr)_auto] sm:items-center ${index === 0 ? "bg-primary/5 ring-1 ring-inset ring-primary/15" : ""}`}>
              <span aria-hidden="true" className={`flex h-8 w-8 items-center justify-center rounded-lg text-sm font-semibold tabular-nums ${index === 0 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                {index + 1}
              </span>
              <div className="min-w-0">
                <p className="break-words text-sm font-semibold">{task.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{task.why}</p>
                {task.dueDate && <p className="mt-1 text-xs text-destructive">Due {new Date(task.dueDate).toLocaleDateString()}</p>}
              </div>
              <Button asChild variant={index === 0 ? "default" : "outline"} size="sm" className="col-start-2 w-full whitespace-normal sm:col-start-auto sm:w-auto">
                <Link href={task.href}>{task.actionLabel}</Link>
              </Button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="rounded-lg bg-muted/40 p-4 text-sm leading-relaxed">No outstanding items in this check. <Link className="text-primary underline underline-offset-4" href="/reports">Review your report</Link> or add your next improvement to the action plan.</p>
      )}
    </section>
  );
}
