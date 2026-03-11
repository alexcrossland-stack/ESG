import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { MessageSquare, Search, ChevronRight, RefreshCw, Clock, User, Building, Tag, ExternalLink } from "lucide-react";
import { format } from "date-fns";

const STATUS_COLORS: Record<string, string> = {
  new: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  open: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  in_progress: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  resolved: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  closed: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  normal: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  high: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  urgent: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[status] || STATUS_COLORS.new}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${PRIORITY_COLORS[priority] || PRIORITY_COLORS.normal}`}>
      {priority}
    </span>
  );
}

function RequestDetail({ request, onClose }: { request: any; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [adminNotes, setAdminNotes] = useState(request.adminNotes || "");
  const [status, setStatus] = useState(request.status);
  const [priority, setPriority] = useState(request.priority);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", `/api/admin/support-requests/${request.id}`, {
        status,
        priority,
        adminNotes,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/support-requests"] });
      toast({ title: "Request updated" });
      onClose();
    },
    onError: (e: any) => {
      toast({ title: "Failed to update", description: e.message, variant: "destructive" });
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={onClose} className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
          <ChevronRight className="w-4 h-4 rotate-180" /> Back to list
        </button>
        <span className="text-muted-foreground">/</span>
        <span className="text-sm font-mono text-muted-foreground">{request.refNumber}</span>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle className="text-base">{request.subject}</CardTitle>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <StatusBadge status={request.status} />
                <PriorityBadge priority={request.priority} />
                <span className="text-xs text-muted-foreground font-mono">{request.refNumber}</span>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="space-y-0.5">
              <p className="text-xs text-muted-foreground flex items-center gap-1"><User className="w-3 h-3" /> Submitted by</p>
              <p className="font-medium">{request.userName || "—"}</p>
              <p className="text-muted-foreground">{request.userEmail || "—"}</p>
            </div>
            <div className="space-y-0.5">
              <p className="text-xs text-muted-foreground flex items-center gap-1"><Building className="w-3 h-3" /> Company</p>
              <p className="font-medium">{request.companyName || "—"}</p>
            </div>
            <div className="space-y-0.5">
              <p className="text-xs text-muted-foreground flex items-center gap-1"><Tag className="w-3 h-3" /> Category</p>
              <p>{request.category}</p>
            </div>
            <div className="space-y-0.5">
              <p className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" /> Submitted</p>
              <p>{request.createdAt ? format(new Date(request.createdAt), "d MMM yyyy, HH:mm") : "—"}</p>
            </div>
          </div>

          {request.pageContext && (
            <div className="text-xs text-muted-foreground">
              Page context: <span className="font-mono">{request.pageContext}</span>
            </div>
          )}

          <Separator />

          <div>
            <p className="text-sm font-medium mb-2">Message</p>
            <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap bg-muted/40 rounded-lg p-3">{request.message}</p>
          </div>

          <Separator />

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <p className="text-sm font-medium mb-1.5">Status</p>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger data-testid="select-ticket-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">New</SelectItem>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <p className="text-sm font-medium mb-1.5">Priority</p>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger data-testid="select-ticket-priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <p className="text-sm font-medium mb-1.5">Admin Notes</p>
            <Textarea
              placeholder="Internal notes (not visible to the user)..."
              className="min-h-[80px] resize-y text-sm"
              value={adminNotes}
              onChange={e => setAdminNotes(e.target.value)}
              data-testid="textarea-admin-notes"
            />
          </div>

          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending} data-testid="button-save-ticket">
            {mutation.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default function AdminSupportPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: requests = [], isLoading, refetch } = useQuery<any[]>({
    queryKey: ["/api/admin/support-requests"],
  });

  const filtered = requests.filter(r => {
    const matchesSearch = !search ||
      r.subject?.toLowerCase().includes(search.toLowerCase()) ||
      r.refNumber?.toLowerCase().includes(search.toLowerCase()) ||
      r.userEmail?.toLowerCase().includes(search.toLowerCase()) ||
      r.companyName?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || r.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const selectedRequest = selectedId ? requests.find(r => r.id === selectedId) : null;

  const counts = {
    all: requests.length,
    new: requests.filter(r => r.status === "new").length,
    open: requests.filter(r => r.status === "open").length,
    in_progress: requests.filter(r => r.status === "in_progress").length,
    resolved: requests.filter(r => r.status === "resolved").length,
  };

  if (selectedRequest) {
    return (
      <div className="p-4 sm:p-6 max-w-3xl mx-auto">
        <RequestDetail request={selectedRequest} onClose={() => setSelectedId(null)} />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Support Requests</h1>
          <p className="text-sm text-muted-foreground">{requests.length} total requests</p>
        </div>
        <Button variant="outline" size="icon" onClick={() => refetch()} data-testid="button-refresh-tickets">
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {(["all", "new", "open", "in_progress", "resolved"] as const).map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            data-testid={`filter-status-${s}`}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${statusFilter === s ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}
          >
            {s.replace(/_/g, " ")} {counts[s as keyof typeof counts] > 0 && <span className="ml-1">({counts[s as keyof typeof counts]})</span>}
          </button>
        ))}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Search by subject, ref, email, or company..."
          className="pl-9"
          value={search}
          onChange={e => setSearch(e.target.value)}
          data-testid="input-search-tickets"
        />
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      )}

      {!isLoading && filtered.length === 0 && (
        <div className="text-center py-12 space-y-2">
          <MessageSquare className="w-8 h-8 text-muted-foreground mx-auto" />
          <p className="text-sm text-muted-foreground">No support requests found</p>
        </div>
      )}

      <div className="space-y-2">
        {filtered.map(req => (
          <Card
            key={req.id}
            className="cursor-pointer hover:shadow-sm transition-shadow"
            onClick={() => setSelectedId(req.id)}
            data-testid={`ticket-row-${req.id}`}
          >
            <CardContent className="py-3 px-4">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <StatusBadge status={req.status} />
                    <PriorityBadge priority={req.priority} />
                    <span className="text-xs font-mono text-muted-foreground">{req.refNumber}</span>
                  </div>
                  <p className="font-medium text-sm mt-1 truncate">{req.subject}</p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    <span>{req.userEmail || req.userName || "Unknown"}</span>
                    {req.companyName && <span>{req.companyName}</span>}
                    <span className="ml-auto shrink-0">{req.createdAt ? format(new Date(req.createdAt), "d MMM yyyy") : ""}</span>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
