import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Paperclip, Trash2, FileText, ExternalLink, Plus } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

type MetricEvidence = {
  id: string;
  metricValueId: string;
  fileUrl: string | null;
  storageKey: string | null;
  fileName: string;
  fileType: string | null;
  uploadedByUserId: string | null;
  uploadedAt: string | null;
  notes: string | null;
};

interface MetricEvidenceAttachmentProps {
  metricValueId: string;
  readOnly?: boolean;
}

export function MetricEvidenceAttachment({ metricValueId, readOnly = false }: MetricEvidenceAttachmentProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [fileName, setFileName] = useState("");
  const [fileUrl, setFileUrl] = useState("");
  const [notes, setNotes] = useState("");

  const { data: evidence = [], isLoading } = useQuery<MetricEvidence[]>({
    queryKey: ["/api/metric-evidence", metricValueId],
    queryFn: () => fetch(`/api/metric-evidence/${metricValueId}`, { credentials: "include" }).then(r => r.json()),
    enabled: !!metricValueId,
  });

  const addMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/metric-evidence", {
      metricValueId,
      fileName: fileName.trim(),
      fileUrl: fileUrl.trim() || null,
      notes: notes.trim() || null,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/metric-evidence", metricValueId] });
      setShowAdd(false);
      setFileName("");
      setFileUrl("");
      setNotes("");
      toast({ title: "Evidence attached", description: "Evidence record linked to this metric value." });
    },
    onError: (e: Error) => toast({ title: "Failed to attach evidence", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/metric-evidence/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/metric-evidence", metricValueId] });
      toast({ title: "Evidence removed" });
    },
    onError: (e: Error) => toast({ title: "Failed to remove", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-2" data-testid="metric-evidence-attachment">
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground flex items-center gap-1">
          <Paperclip className="w-3 h-3" />
          Evidence ({evidence.length})
        </Label>
        {!readOnly && (
          <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={() => setShowAdd(true)} data-testid="button-add-evidence">
            <Plus className="w-3 h-3 mr-1" />
            Add
          </Button>
        )}
      </div>

      {isLoading && <div className="text-xs text-muted-foreground">Loading...</div>}

      {evidence.length > 0 && (
        <div className="space-y-1">
          {evidence.map(ev => (
            <div
              key={ev.id}
              className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-2 py-1.5 text-xs"
              data-testid={`evidence-item-${ev.id}`}
            >
              <FileText className="w-3 h-3 text-muted-foreground shrink-0" />
              <span className="flex-1 truncate font-medium">{ev.fileName}</span>
              {ev.notes && <span className="text-muted-foreground truncate max-w-[100px]">{ev.notes}</span>}
              <div className="flex items-center gap-1 shrink-0">
                {ev.fileUrl && (
                  <a href={ev.fileUrl} target="_blank" rel="noopener noreferrer" data-testid={`link-evidence-${ev.id}`}>
                    <Button size="icon" variant="ghost" className="h-5 w-5">
                      <ExternalLink className="w-3 h-3" />
                    </Button>
                  </a>
                )}
                {!readOnly && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-5 w-5 text-destructive hover:text-destructive"
                    onClick={() => deleteMutation.mutate(ev.id)}
                    disabled={deleteMutation.isPending}
                    data-testid={`button-delete-evidence-${ev.id}`}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-sm" data-testid="dialog-add-evidence">
          <DialogHeader>
            <DialogTitle>Attach Evidence</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label htmlFor="ev-filename" className="text-xs">File name *</Label>
              <Input
                id="ev-filename"
                placeholder="e.g. Q1 Electricity Bill.pdf"
                value={fileName}
                onChange={e => setFileName(e.target.value)}
                data-testid="input-evidence-filename"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ev-url" className="text-xs">File URL (optional)</Label>
              <Input
                id="ev-url"
                placeholder="https://..."
                value={fileUrl}
                onChange={e => setFileUrl(e.target.value)}
                data-testid="input-evidence-url"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ev-notes" className="text-xs">Notes (optional)</Label>
              <Textarea
                id="ev-notes"
                placeholder="Additional context..."
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={2}
                data-testid="input-evidence-notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)} data-testid="button-cancel-evidence">Cancel</Button>
            <Button
              onClick={() => addMutation.mutate()}
              disabled={!fileName.trim() || addMutation.isPending}
              data-testid="button-confirm-evidence"
            >
              {addMutation.isPending ? "Attaching..." : "Attach"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
