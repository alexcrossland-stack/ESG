import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { ClipboardCheck, BarChart3, CheckSquare, FileCheck, FileText, FileQuestion, Inbox } from "lucide-react";

const TYPE_CONFIG: Record<string, { label: string; groupLabel: string; icon: any }> = {
  metric: { label: "Metric", groupLabel: "Metrics Due", icon: BarChart3 },
  action: { label: "Action", groupLabel: "Actions", icon: CheckSquare },
  evidence_request: { label: "Evidence", groupLabel: "Evidence Requests", icon: FileCheck },
  policy: { label: "Policy", groupLabel: "Policy Reviews", icon: FileText },
  questionnaire: { label: "Questionnaire", groupLabel: "Questionnaires", icon: FileQuestion },
};

function getDueBadge(dueDate: string | null, isOverdue: boolean) {
  if (!dueDate) return null;
  const due = new Date(dueDate);
  const now = new Date();
  const diffDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (isOverdue) {
    return <Badge variant="destructive" data-testid={`badge-overdue`}>{Math.abs(diffDays)} days overdue</Badge>;
  }
  if (diffDays <= 7) {
    return <Badge className="bg-amber-500 text-white hover:bg-amber-600">Due in {diffDays} days</Badge>;
  }
  return <Badge variant="secondary">Due {due.toLocaleDateString()}</Badge>;
}

export default function MyTasks() {
  const { data: tasks, isLoading } = useQuery<any[]>({
    queryKey: ["/api/my-tasks"],
  });

  const grouped = (tasks || []).reduce((acc: Record<string, any[]>, task: any) => {
    const type = task.entityType;
    if (!acc[type]) acc[type] = [];
    acc[type].push(task);
    return acc;
  }, {});

  const typeOrder = ["metric", "action", "evidence_request", "policy", "questionnaire"];

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6" data-testid="page-my-tasks">
      <div className="flex items-center gap-3">
        <ClipboardCheck className="w-6 h-6 text-primary" />
        <h1 className="text-2xl font-semibold">My Tasks</h1>
      </div>

      {isLoading && (
        <div className="space-y-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-32 w-full" />)}
        </div>
      )}

      {!isLoading && (!tasks || tasks.length === 0) && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Inbox className="w-12 h-12 text-muted-foreground mb-3" />
            <p className="text-muted-foreground" data-testid="text-no-tasks">No tasks assigned to you</p>
          </CardContent>
        </Card>
      )}

      {!isLoading && typeOrder.map(type => {
        const items = grouped[type];
        if (!items || items.length === 0) return null;
        const config = TYPE_CONFIG[type] || { label: type, groupLabel: type, icon: ClipboardCheck };
        const Icon = config.icon;
        return (
          <Card key={type} data-testid={`task-group-${type}`}>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Icon className="w-4 h-4 text-muted-foreground" />
                <CardTitle className="text-base">{config.groupLabel}</CardTitle>
                <Badge variant="secondary" className="ml-auto">{items.length}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {items.map((task: any) => (
                <div key={task.entityId} className="flex items-center justify-between p-3 rounded-md border border-border hover:bg-muted/50 transition-colors" data-testid={`task-item-${task.entityType}-${task.entityId}`}>
                  <div className="flex-1 min-w-0">
                    <Link href={task.linkUrl} data-testid={`link-task-${task.entityId}`}>
                      <span className="text-sm font-medium hover:underline cursor-pointer">{task.title}</span>
                    </Link>
                    <p className="text-xs text-muted-foreground mt-0.5">{task.status?.replace(/_/g, " ")}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0" data-testid={`badge-overdue-${task.entityId}`}>
                    {getDueBadge(task.dueDate, task.isOverdue)}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
