import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { usePermissions } from "@/lib/permissions";
import { ListChecks, Inbox, Check, X } from "lucide-react";

const ENTITY_LABELS: Record<string, string> = {
  metricValues: "Metric Values",
  rawDataInputs: "Raw Data",
  reportRuns: "Reports",
  generatedPolicies: "Policies",
  questionnaireQuestions: "Questionnaire Answers",
};

const ENTITY_TYPE_MAP: Record<string, string> = {
  metricValues: "metric_value",
  rawDataInputs: "raw_data",
  reportRuns: "report",
  generatedPolicies: "generated_policy",
  questionnaireQuestions: "questionnaire_question",
};

function ApprovalItem({ item, entityType }: { item: any; entityType: string }) {
  const [comment, setComment] = useState("");
  const { toast } = useToast();

  const reviewMutation = useMutation({
    mutationFn: async ({ action }: { action: string }) => {
      if (action === "reject" && !comment.trim()) {
        throw new Error("Comment required for rejection");
      }
      const res = await apiRequest("POST", "/api/workflow/review", {
        entityType,
        entityId: item.id,
        action,
        comment: comment.trim() || undefined,
      });
      return res.json();
    },
    onSuccess: (_, { action }) => {
      toast({ title: action === "approve" ? "Item approved" : "Item rejected" });
      queryClient.invalidateQueries({ queryKey: ["/api/my-approvals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/count"] });
    },
    onError: (e: Error) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  return (
    <div className="flex items-center gap-3 p-3 rounded-md border border-border" data-testid={`approval-item-${entityType}-${item.id}`}>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{item.name || item.period || "Unnamed"}</p>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs text-muted-foreground" data-testid={`text-submitted-by-${item.id}`}>
            By: {item.submitterUsername || "Unknown"}
          </span>
          {item.submitted_at && (
            <span className="text-xs text-muted-foreground">
              {new Date(item.submitted_at).toLocaleDateString()}
            </span>
          )}
          <Badge variant="outline" className="text-xs">submitted</Badge>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Input
          placeholder="Comment..."
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          className="w-40 h-8 text-xs"
          data-testid={`input-review-comment-${item.id}`}
        />
        <Button
          size="sm"
          variant="default"
          className="h-8 bg-green-600 hover:bg-green-700"
          onClick={() => reviewMutation.mutate({ action: "approve" })}
          disabled={reviewMutation.isPending}
          data-testid={`button-approve-${item.id}`}
        >
          <Check className="w-3.5 h-3.5" />
        </Button>
        <Button
          size="sm"
          variant="destructive"
          className="h-8"
          onClick={() => reviewMutation.mutate({ action: "reject" })}
          disabled={reviewMutation.isPending}
          data-testid={`button-reject-${item.id}`}
        >
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}

export default function MyApprovals() {
  const { can } = usePermissions();
  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/my-approvals"],
    enabled: can("report_generation"),
  });

  if (!can("report_generation")) {
    return (
      <div className="p-6 max-w-4xl mx-auto" data-testid="page-my-approvals">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="text-muted-foreground">You don't have approval permissions</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const groups = Object.keys(ENTITY_LABELS);
  const hasAnyItems = data && groups.some(g => data[g]?.length > 0);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6" data-testid="page-my-approvals">
      <div className="flex items-center gap-3">
        <ListChecks className="w-6 h-6 text-primary" />
        <h1 className="text-2xl font-semibold">My Approvals</h1>
      </div>

      {isLoading && (
        <div className="space-y-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-32 w-full" />)}
        </div>
      )}

      {!isLoading && !hasAnyItems && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Inbox className="w-12 h-12 text-muted-foreground mb-3" />
            <p className="text-muted-foreground" data-testid="text-no-approvals">No items pending approval</p>
          </CardContent>
        </Card>
      )}

      {!isLoading && data && groups.map(group => {
        const items = data[group];
        if (!items || items.length === 0) return null;
        const entityType = ENTITY_TYPE_MAP[group];
        return (
          <Card key={group} data-testid={`approval-group-${entityType}`}>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <CardTitle className="text-base">{ENTITY_LABELS[group]}</CardTitle>
                <Badge variant="secondary" className="ml-auto">{items.length}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {items.map((item: any) => (
                <ApprovalItem key={item.id} item={item} entityType={entityType} />
              ))}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
