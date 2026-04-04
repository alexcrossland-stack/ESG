import { useState, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { usePermissions } from "@/lib/permissions";
import { ListChecks, Inbox, Check, X, CheckCheck, XCircle } from "lucide-react";
import { PermissionBlockedCard } from "@/components/permission-gate";

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

function ApprovalItem({
  item,
  entityType,
  isSelected,
  onToggle,
}: {
  item: any;
  entityType: string;
  isSelected: boolean;
  onToggle: (entityType: string, entityId: string) => void;
}) {
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
      <Checkbox
        checked={isSelected}
        onCheckedChange={() => onToggle(entityType, item.id)}
        data-testid={`checkbox-select-${entityType}-${item.id}`}
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{item.name || item.period || "Unnamed"}</p>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
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
          className="w-40 text-xs"
          data-testid={`input-review-comment-${item.id}`}
        />
        <Button
          size="sm"
          variant="default"
          className="bg-green-600"
          onClick={() => reviewMutation.mutate({ action: "approve" })}
          disabled={reviewMutation.isPending}
          data-testid={`button-approve-${item.id}`}
        >
          <Check className="w-3.5 h-3.5" />
        </Button>
        <Button
          size="sm"
          variant="destructive"
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
  const { toast } = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectComment, setRejectComment] = useState("");

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/my-approvals"],
    enabled: can("report_generation"),
  });

  const makeKey = (entityType: string, entityId: string) => `${entityType}:${entityId}`;

  const toggleItem = useCallback((entityType: string, entityId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      const key = makeKey(entityType, entityId);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const toggleGroup = useCallback((group: string, items: any[]) => {
    const entityType = ENTITY_TYPE_MAP[group];
    setSelected((prev) => {
      const next = new Set(prev);
      const groupKeys = items.map((item: any) => makeKey(entityType, item.id));
      const allSelected = groupKeys.every((k) => next.has(k));
      if (allSelected) {
        groupKeys.forEach((k) => next.delete(k));
      } else {
        groupKeys.forEach((k) => next.add(k));
      }
      return next;
    });
  }, []);

  const getSelectedItems = useCallback(() => {
    return Array.from(selected).map((key) => {
      const [entityType, entityId] = key.split(":");
      return { entityType, entityId };
    });
  }, [selected]);

  const bulkMutation = useMutation({
    mutationFn: async ({ action, comment }: { action: string; comment?: string }) => {
      const items = getSelectedItems();
      const res = await apiRequest("POST", "/api/workflow/bulk-review", {
        items,
        action,
        comment: comment || undefined,
      });
      return res.json();
    },
    onSuccess: (result: { succeeded: number; failed: number; errors: string[] }, { action }) => {
      setSelected(new Set());
      setRejectComment("");
      setRejectDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/my-approvals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/count"] });
      if (result.failed > 0) {
        toast({
          title: `Bulk ${action}: ${result.succeeded} succeeded, ${result.failed} failed`,
          description: result.errors.join("; "),
          variant: "destructive",
        });
      } else {
        toast({
          title: `${result.succeeded} item${result.succeeded !== 1 ? "s" : ""} ${action === "approve" ? "approved" : "rejected"}`,
        });
      }
    },
    onError: (e: Error) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  const handleBulkApprove = () => {
    bulkMutation.mutate({ action: "approve" });
  };

  const handleBulkReject = () => {
    setRejectDialogOpen(true);
  };

  const confirmBulkReject = () => {
    if (!rejectComment.trim()) {
      toast({ title: "Comment required", description: "Please enter a reason for rejection", variant: "destructive" });
      return;
    }
    bulkMutation.mutate({ action: "reject", comment: rejectComment.trim() });
  };

  if (!can("report_generation")) {
    return (
      <div className="p-6 max-w-4xl mx-auto" data-testid="page-my-approvals">
        <div className="mb-5">
          <h1 className="text-lg sm:text-xl font-semibold flex items-center gap-2">
            <ListChecks className="w-5 h-5 text-primary" />
            My Approvals
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Review and approve submitted data</p>
        </div>
        <PermissionBlockedCard
          module="report_generation"
          pageName="Approvals"
          customTitle="Approval access required"
          customDescription="Reviewing and approving submissions is reserved for Approvers and Company Admins. Your current role does not include this capability."
        />
      </div>
    );
  }

  const groups = Object.keys(ENTITY_LABELS);
  const hasAnyItems = data && groups.some((g) => data[g]?.length > 0);
  const selectedCount = selected.size;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6" data-testid="page-my-approvals">
      <div className="flex items-center gap-3">
        <ListChecks className="w-6 h-6 text-primary" />
        <h1 className="text-2xl font-semibold">My Approvals</h1>
      </div>

      {isLoading && (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
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

      {!isLoading &&
        data &&
        groups.map((group) => {
          const items = data[group];
          if (!items || items.length === 0) return null;
          const entityType = ENTITY_TYPE_MAP[group];
          const groupKeys = items.map((item: any) => makeKey(entityType, item.id));
          const allGroupSelected = groupKeys.every((k: string) => selected.has(k));
          const someGroupSelected = groupKeys.some((k: string) => selected.has(k));
          return (
            <Card key={group} data-testid={`approval-group-${entityType}`}>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={allGroupSelected}
                    onCheckedChange={() => toggleGroup(group, items)}
                    data-testid={`checkbox-select-all-${entityType}`}
                    {...(someGroupSelected && !allGroupSelected ? { "data-state": "indeterminate" } : {})}
                  />
                  <CardTitle className="text-base">{ENTITY_LABELS[group]}</CardTitle>
                  <Badge variant="secondary" className="ml-auto">
                    {items.length}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {items.map((item: any) => (
                  <ApprovalItem
                    key={item.id}
                    item={item}
                    entityType={entityType}
                    isSelected={selected.has(makeKey(entityType, item.id))}
                    onToggle={toggleItem}
                  />
                ))}
              </CardContent>
            </Card>
          );
        })}

      {selectedCount > 0 && (
        <div className="sticky bottom-4 z-50 flex items-center justify-between gap-4 p-4 rounded-md border border-border bg-card shadow-lg">
          <span className="text-sm font-medium" data-testid="text-selected-count">
            {selectedCount} item{selectedCount !== 1 ? "s" : ""} selected
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="default"
              className="bg-green-600"
              onClick={handleBulkApprove}
              disabled={bulkMutation.isPending}
              data-testid="button-bulk-approve"
            >
              <CheckCheck className="w-4 h-4 mr-1.5" />
              Bulk Approve
            </Button>
            <Button
              variant="destructive"
              onClick={handleBulkReject}
              disabled={bulkMutation.isPending}
              data-testid="button-bulk-reject"
            >
              <XCircle className="w-4 h-4 mr-1.5" />
              Bulk Reject
            </Button>
          </div>
        </div>
      )}

      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bulk Reject</DialogTitle>
            <DialogDescription>
              Provide a reason for rejecting {selectedCount} selected item{selectedCount !== 1 ? "s" : ""}.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Enter rejection reason..."
            value={rejectComment}
            onChange={(e) => setRejectComment(e.target.value)}
            className="min-h-[100px]"
            data-testid="textarea-bulk-reject-comment"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmBulkReject}
              disabled={bulkMutation.isPending || !rejectComment.trim()}
              data-testid="button-confirm-bulk-reject"
            >
              Reject {selectedCount} Item{selectedCount !== 1 ? "s" : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
