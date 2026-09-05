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
  return <section className="rounded-lg border bg-card p-4 sm:p-5 space-y-4" aria-labelledby="next-tasks-title" data-testid="sme-next-tasks">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 id="next-tasks-title" className="text-base font-semibold">Your next steps</h2><p className="text-sm text-muted-foreground">Figures for {month}, plus outstanding company-wide work.</p></div>
      <div className="flex gap-2"><Button asChild variant="outline" size="sm"><Link href="/my-tasks">My work</Link></Button><Button asChild variant="ghost" size="sm"><Link href="/control-centre">All actions</Link></Button></div>
    </div>
    {isLoading ? <Skeleton className="h-24" /> : isError ? <p role="alert" className="text-sm">Your tasks could not be loaded. <button className="underline" onClick={() => refetch()}>Try again</button></p> : tasks.length ? <ol className="divide-y">{tasks.map((task, index) => <li key={task.key} className="flex flex-col sm:flex-row gap-3 sm:items-center py-3">
      <div className="flex-1"><p className="text-sm font-medium">{index + 1}. {task.title}</p><p className="text-xs text-muted-foreground mt-1">{task.why}</p>{task.dueDate && <p className="text-xs text-destructive mt-1">Due {new Date(task.dueDate).toLocaleDateString()}</p>}</div>
      <Button asChild variant={index === 0 ? "default" : "outline"} size="sm"><Link href={task.href}>{task.actionLabel}</Link></Button>
    </li>)}</ol> : <p className="text-sm">No outstanding items in this check. <Link className="underline text-primary" href="/reports">Review your report</Link> or add your next improvement to the action plan.</p>}
  </section>;
}
