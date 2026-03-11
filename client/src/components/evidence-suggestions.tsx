import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileCheck, Link as LinkIcon, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

interface EvidenceSuggestionsProps {
  metricId?: string;
  category?: string;
  onLink?: (evidenceId: string) => void;
}

export function EvidenceSuggestions({ metricId, category, onLink }: EvidenceSuggestionsProps) {
  const [expanded, setExpanded] = useState(false);
  const params = new URLSearchParams();
  if (metricId) params.set("metricId", metricId);
  if (category) params.set("category", category);

  const { data: suggestions = [] } = useQuery<any[]>({
    queryKey: ["/api/evidence/suggestions", metricId, category],
    queryFn: () => fetch(`/api/evidence/suggestions?${params.toString()}`, { credentials: "include" }).then(r => r.json()),
    enabled: !!(metricId || category),
  });

  if (suggestions.length === 0) return null;

  return (
    <div className="mt-1" data-testid="panel-evidence-suggestions">
      <button
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        onClick={() => setExpanded(!expanded)}
      >
        <FileCheck className="w-3 h-3" />
        <span>{suggestions.length} evidence file{suggestions.length !== 1 ? "s" : ""} available</span>
        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>
      {expanded && (
        <div className="mt-1 space-y-1 pl-4 border-l-2 border-muted">
          {suggestions.map((e: any) => (
            <div key={e.id} className="flex items-center justify-between gap-2 text-xs py-1">
              <div className="flex items-center gap-1.5 min-w-0">
                <FileCheck className="w-3 h-3 text-muted-foreground shrink-0" />
                <span className="truncate">{e.fileName || e.file_name || "Evidence"}</span>
                {(e.status === "approved") && (
                  <Badge className="text-[9px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 border-0 py-0">Approved</Badge>
                )}
              </div>
              {onLink && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-5 px-1.5 text-xs"
                  onClick={() => onLink(e.id)}
                  data-testid={`button-link-evidence-${e.id}`}
                >
                  <LinkIcon className="w-3 h-3 mr-0.5" />
                  Link
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
