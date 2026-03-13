import { useState, useEffect } from "react";
import { ChevronDown, ChevronUp, Info, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PageGuidanceProps {
  pageKey: string;
  title: string;
  summary: string;
  goodLooksLike: string;
  steps: string[];
  icon?: React.ReactNode;
}

export function PageGuidance({ pageKey, title, summary, goodLooksLike, steps, icon }: PageGuidanceProps) {
  const storageKey = `guidance_dismissed_${pageKey}`;
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved === "true") {
        setDismissed(true);
        setExpanded(false);
      }
    } catch {}
  }, [storageKey]);

  function dismiss() {
    try { localStorage.setItem(storageKey, "true"); } catch {}
    setDismissed(true);
    setExpanded(false);
  }

  function restore() {
    try { localStorage.removeItem(storageKey); } catch {}
    setDismissed(false);
    setExpanded(true);
  }

  if (dismissed) {
    return (
      <button
        onClick={restore}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-muted-foreground/30 text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors text-xs mb-4"
        data-testid={`guidance-restore-${pageKey}`}
      >
        <Info className="w-3.5 h-3.5 shrink-0" />
        <span>What is this page for?</span>
        <ChevronDown className="w-3.5 h-3.5 ml-auto" />
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/60 dark:bg-blue-950/20 mb-5" data-testid={`guidance-panel-${pageKey}`}>
      <button
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
        onClick={() => setExpanded(e => !e)}
        data-testid={`guidance-toggle-${pageKey}`}
      >
        <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
        <span className="text-sm font-medium text-blue-800 dark:text-blue-200 flex-1">{title}</span>
        <div className="flex items-center gap-1">
          {expanded ? <ChevronUp className="w-4 h-4 text-blue-500" /> : <ChevronDown className="w-4 h-4 text-blue-500" />}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          <p className="text-sm text-blue-700 dark:text-blue-300 leading-relaxed">{summary}</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3 rounded-md bg-white/60 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-800">
              <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-1">What good looks like</p>
              <p className="text-xs text-blue-600 dark:text-blue-400 leading-relaxed">{goodLooksLike}</p>
            </div>
            <div className="p-3 rounded-md bg-white/60 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-800">
              <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-1">What to do</p>
              <ol className="space-y-1">
                {steps.map((s, i) => (
                  <li key={i} className="text-xs text-blue-600 dark:text-blue-400 flex items-start gap-1.5">
                    <span className="shrink-0 font-bold">{i + 1}.</span>
                    <span className="leading-relaxed">{s}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-7 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
              onClick={dismiss}
              data-testid={`guidance-dismiss-${pageKey}`}
            >
              <X className="w-3 h-3 mr-1" /> Dismiss
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
