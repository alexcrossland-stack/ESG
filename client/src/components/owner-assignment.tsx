import { useMutation, useQuery } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { usePermissions } from "@/lib/permissions";

export function OwnerAssignment({
  entityType,
  entityId,
  currentUserId,
  currentUsername,
  invalidateKeys = [],
}: {
  entityType: string;
  entityId: string;
  currentUserId?: string | null;
  currentUsername?: string | null;
  invalidateKeys?: string[][];
}) {
  const { isAdmin } = usePermissions();
  const { toast } = useToast();

  const { data: companyUsers = [] } = useQuery<any[]>({
    queryKey: ["/api/users"],
    enabled: isAdmin,
  });

  const assignMutation = useMutation({
    mutationFn: async (assignedUserId: string) => {
      await apiRequest("PUT", `/api/assign/${entityType}/${entityId}`, {
        assignedUserId: assignedUserId === "__none__" ? "" : assignedUserId,
      });
    },
    onSuccess: () => {
      toast({ title: "Owner updated" });
      for (const key of invalidateKeys) {
        queryClient.invalidateQueries({ queryKey: key });
      }
    },
    onError: (e: any) => {
      toast({ title: "Failed to assign owner", description: e.message, variant: "destructive" });
    },
  });

  if (!isAdmin) {
    const displayName = currentUsername || (currentUserId ? "Assigned" : "Unassigned");
    return (
      <span className="text-xs text-muted-foreground" data-testid={`text-assigned-user-${entityId}`}>
        {displayName}
      </span>
    );
  }

  const currentUser = companyUsers.find((u: any) => u.id === currentUserId);

  return (
    <Select
      value={currentUserId || "__none__"}
      onValueChange={(val) => assignMutation.mutate(val)}
      disabled={assignMutation.isPending}
    >
      <SelectTrigger className="w-32 h-7 text-xs" data-testid={`select-assign-owner-${entityType}-${entityId}`}>
        <SelectValue placeholder="Unassigned">{currentUser?.username || "Unassigned"}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">Unassigned</SelectItem>
        {companyUsers.map((u: any) => (
          <SelectItem key={u.id} value={u.id}>{u.username}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
