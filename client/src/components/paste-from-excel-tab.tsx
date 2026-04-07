import { startTransition, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addMonths, format, subMonths } from "date-fns";
import { AlertCircle, CheckCircle2, ClipboardPaste, Loader2, Table, Upload } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { authFetch, apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useSiteContext } from "@/hooks/use-site-context";

type GridMetric = {
  id: string;
  name: string;
  category: string;
  unit: string | null;
  metricType: string | null;
  enabled: boolean;
  readOnly: boolean;
};

type GridValue = {
  id: string;
  metricId: string;
  period: string;
  value: string | null;
  locked: boolean;
  dataSourceType: string | null;
  workflowStatus: string | null;
  siteId: string | null;
};

type GridResponse = {
  periods: string[];
  metrics: GridMetric[];
  values: GridValue[];
  lockedPeriods: string[];
};

type ValidationCell = {
  metricId: string;
  metricName: string | null;
  period: string;
  rawValue: string | null;
  normalizedValue: number | null;
  existingValue: number | null;
  status: "create" | "update" | "clear" | "unchanged" | "error";
  errors: string[];
  warnings: string[];
  readOnly: boolean;
  locked: boolean;
  rowIndex?: number;
  columnIndex?: number;
};

type ValidationResponse = {
  ok: boolean;
  committed: boolean;
  cells: ValidationCell[];
  summary: {
    totalCells: number;
    changedCells: number;
    createCount: number;
    updateCount: number;
    clearCount: number;
    unchangedCount: number;
    errorCount: number;
    warningCount: number;
  };
  rowIssues: Array<{
    metricId: string;
    metricName: string | null;
    errors: string[];
    warnings: string[];
  }>;
};

type CellCoord = { row: number; col: number };
type PasteNotice = { kind: "warning" | "error"; message: string } | null;

function keyFor(metricId: string, period: string) {
  return `${metricId}::${period}`;
}

function buildVisiblePeriods(selectedPeriod: string, monthCount: number) {
  const anchor = new Date(`${selectedPeriod}-01T00:00:00`);
  return Array.from({ length: monthCount }, (_, index) => (
    format(addMonths(subMonths(anchor, monthCount - 1), index), "yyyy-MM")
  ));
}

function parseClipboardBlock(text: string) {
  const rows = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  if (rows[rows.length - 1] === "") rows.pop();
  return rows.map((row) => row.split("\t"));
}

function looksLikePeriod(value: string) {
  return /^\d{4}-\d{2}$/.test(value.trim());
}

function normalizeClipboardBlock(block: string[][], params: {
  visiblePeriods: string[];
  metrics: GridMetric[];
  startRow: number;
  startCol: number;
}) {
  // Paste semantics:
  // - blanks inside the pasted rectangle clear existing values
  // - blanks outside the pasted rectangle are ignored
  // - warnings do not block save
  // - errors block save
  // Header/label stripping intentionally fails safe: we only strip when the signal is
  // very strong so we do not silently shift data into the wrong month or metric.
  let rows = block.map((row) => row.map((value) => value ?? ""));
  let strippedHeaderRow = false;
  let strippedMetricColumn = false;

  const firstRow = rows[0] || [];
  const firstRowPeriodMatches = firstRow.filter((value, index) => index > 0 && params.visiblePeriods.includes(value.trim())).length;
  const firstCell = (firstRow[0] || "").trim().toLowerCase();
  const hasHeaderLeadCell = firstCell === "" || firstCell.includes("metric") || firstCell.includes("month") || firstCell.includes("period");
  const strongPeriodHeaderMatch = firstRow.length > 1 && firstRowPeriodMatches >= Math.max(1, firstRow.length - 2);
  if (hasHeaderLeadCell && strongPeriodHeaderMatch) {
    rows = rows.slice(1);
    strippedHeaderRow = true;
  }

  const targetMetricNames = params.metrics.slice(params.startRow, params.startRow + rows.length).map((metric) => metric.name.trim().toLowerCase());
  const firstColumnMatches = rows.filter((row, index) => (row[0] || "").trim().toLowerCase() === targetMetricNames[index]).length;
  if (rows.length > 0 && firstColumnMatches === rows.length) {
    rows = rows.map((row) => row.slice(1));
    strippedMetricColumn = true;
  }

  rows = rows.filter((row) => row.length > 0);
  return { rows, strippedHeaderRow, strippedMetricColumn };
}

function sameCell(a: CellCoord, b: CellCoord) {
  return a.row === b.row && a.col === b.col;
}

function withinSelection(cell: CellCoord, start: CellCoord, end: CellCoord) {
  const top = Math.min(start.row, end.row);
  const bottom = Math.max(start.row, end.row);
  const left = Math.min(start.col, end.col);
  const right = Math.max(start.col, end.col);
  return cell.row >= top && cell.row <= bottom && cell.col >= left && cell.col <= right;
}

export function PasteFromExcelTab({
  selectedPeriod,
  onSwitchToUpload,
}: {
  selectedPeriod: string;
  onSwitchToUpload: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { activeSiteId } = useSiteContext();
  const [monthCount, setMonthCount] = useState("6");
  const [draftValues, setDraftValues] = useState<Record<string, string>>({});
  const [baseValues, setBaseValues] = useState<Record<string, string>>({});
  const [activeCell, setActiveCell] = useState<CellCoord>({ row: 0, col: 0 });
  const [selectionStart, setSelectionStart] = useState<CellCoord>({ row: 0, col: 0 });
  const [selectionEnd, setSelectionEnd] = useState<CellCoord>({ row: 0, col: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [validation, setValidation] = useState<ValidationResponse | null>(null);
  const [pasteNotice, setPasteNotice] = useState<PasteNotice>(null);
  const [heuristicReviewRequired, setHeuristicReviewRequired] = useState(false);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  // Lightweight scale safeguard for now: defer draft propagation so validation/review
  // work does not fire on every keystroke at full priority. If the grid grows much
  // larger, this is the place to reassess row memoization or virtualization.
  const deferredDraftValues = useDeferredValue(draftValues);

  const visiblePeriods = useMemo(
    () => buildVisiblePeriods(selectedPeriod, Number(monthCount)),
    [monthCount, selectedPeriod],
  );

  const { data, isLoading } = useQuery<GridResponse>({
    queryKey: ["/api/data-entry/bulk-grid", visiblePeriods.join(","), activeSiteId || "__org__"],
    queryFn: () => authFetch(`/api/data-entry/bulk-grid?periods=${visiblePeriods.join(",")}&siteId=${activeSiteId || "null"}`).then((res) => res.json()),
  });

  useEffect(() => {
    if (!data) return;
    const nextBase: Record<string, string> = {};
    for (const metric of data.metrics) {
      for (const period of data.periods) {
        nextBase[keyFor(metric.id, period)] = "";
      }
    }
    for (const value of data.values) {
      nextBase[keyFor(value.metricId, value.period)] = value.value ?? "";
    }
    setBaseValues(nextBase);
    setDraftValues(nextBase);
    setValidation(null);
    setActiveCell({ row: 0, col: 0 });
    setSelectionStart({ row: 0, col: 0 });
    setSelectionEnd({ row: 0, col: 0 });
    setPasteNotice(null);
    setHeuristicReviewRequired(false);
  }, [data]);

  const dirtyCells = useMemo(() => {
    if (!data) return [];
    const results: Array<{ metricId: string; period: string; rawValue: string | null; rowIndex: number; columnIndex: number }> = [];
    data.metrics.forEach((metric, rowIndex) => {
      data.periods.forEach((period, columnIndex) => {
        const key = keyFor(metric.id, period);
        const currentValue = deferredDraftValues[key] ?? "";
        const originalValue = baseValues[key] ?? "";
        if (currentValue !== originalValue) {
          results.push({
            metricId: metric.id,
            period,
            rawValue: currentValue,
            rowIndex,
            columnIndex,
          });
        }
      });
    });
    return results;
  }, [baseValues, data, deferredDraftValues]);

  const cellValidationMap = useMemo(() => {
    const map = new Map<string, ValidationCell>();
    for (const cell of validation?.cells || []) {
      map.set(keyFor(cell.metricId, cell.period), cell);
    }
    return map;
  }, [validation]);
  const changePreview = useMemo(() => {
    return (validation?.cells || [])
      .filter((cell) => cell.status === "create" || cell.status === "update" || cell.status === "clear")
      .slice(0, 50);
  }, [validation]);

  const validateMutation = useMutation({
    mutationFn: (cells: typeof dirtyCells) =>
      apiRequest("POST", "/api/data-entry/bulk-upsert", {
        mode: "validate",
        siteId: activeSiteId || null,
        cells,
      }).then((res) => res.json() as Promise<ValidationResponse>),
    onSuccess: (result) => startTransition(() => setValidation(result)),
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/data-entry/bulk-upsert", {
        mode: "commit",
        siteId: activeSiteId || null,
        cells: dirtyCells,
      }).then((res) => res.json() as Promise<ValidationResponse>),
    onSuccess: (result) => {
      startTransition(() => setValidation(result));
      queryClient.invalidateQueries({ queryKey: ["/api/data-entry"] });
      queryClient.invalidateQueries({ queryKey: ["/api/metrics"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/enhanced"] });
      queryClient.invalidateQueries({ queryKey: ["/api/data-entry/bulk-grid"] });
      toast({
        title: "Bulk paste saved",
        description: `${result.summary.createCount} values created and ${result.summary.updateCount} updated.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Bulk save failed",
        description: error?.message || "Please review the highlighted cells and try again.",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (!data || dirtyCells.length === 0) {
      setValidation(null);
      return;
    }
    const timer = window.setTimeout(() => {
      validateMutation.mutate(dirtyCells);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [data, dirtyCells, validateMutation]);

  const moveFocus = (row: number, col: number) => {
    if (!data) return;
    const nextRow = Math.max(0, Math.min(row, data.metrics.length - 1));
    const nextCol = Math.max(0, Math.min(col, data.periods.length - 1));
    const metric = data.metrics[nextRow];
    const period = data.periods[nextCol];
    const key = keyFor(metric.id, period);
    setActiveCell({ row: nextRow, col: nextCol });
    setSelectionStart({ row: nextRow, col: nextCol });
    setSelectionEnd({ row: nextRow, col: nextCol });
    inputRefs.current[key]?.focus();
    inputRefs.current[key]?.select();
  };

  const applyPaste = (row: number, col: number, clipboardText: string) => {
    if (!data) return;
    const rawBlock = parseClipboardBlock(clipboardText);
    if (rawBlock.length === 0) return;
    const normalizedBlock = normalizeClipboardBlock(rawBlock, {
      visiblePeriods: data.periods,
      metrics: data.metrics,
      startRow: row,
      startCol: col,
    });
    const block = normalizedBlock.rows;
    if (block.length === 0 || block.every((pasteRow) => pasteRow.length === 0)) {
      setPasteNotice({ kind: "warning", message: "The pasted selection only contained headers or labels, so no values were applied." });
      return;
    }
    let ignoredCells = 0;
    setDraftValues((current) => {
      const next = { ...current };
      block.forEach((pasteRow, rowOffset) => {
        pasteRow.forEach((value, colOffset) => {
          const targetRow = row + rowOffset;
          const targetCol = col + colOffset;
          if (!data.metrics[targetRow] || !data.periods[targetCol]) {
            ignoredCells += 1;
            return;
          }
          next[keyFor(data.metrics[targetRow].id, data.periods[targetCol])] = value ?? "";
        });
      });
      return next;
    });
    const targetEndRow = Math.min(row + block.length - 1, data.metrics.length - 1);
    const targetEndCol = Math.min(col + Math.max(...block.map((pasteRow) => pasteRow.length), 1) - 1, data.periods.length - 1);
    setSelectionStart({ row, col });
    setSelectionEnd({ row: targetEndRow, col: targetEndCol });
    setActiveCell({ row, col });
    if (ignoredCells > 0) {
      setPasteNotice({ kind: "warning", message: `${ignoredCells} pasted cells were outside the visible grid and were ignored.` });
      setHeuristicReviewRequired(false);
    } else if (normalizedBlock.strippedHeaderRow || normalizedBlock.strippedMetricColumn) {
      const parts = [
        normalizedBlock.strippedHeaderRow ? "header row ignored" : null,
        normalizedBlock.strippedMetricColumn ? "metric label column ignored" : null,
      ].filter(Boolean);
      setPasteNotice({ kind: "warning", message: `Paste applied with ${parts.join(" and ")}. Review the mapping table before saving.` });
      setHeuristicReviewRequired(true);
    } else {
      setPasteNotice(null);
      setHeuristicReviewRequired(false);
    }
  };

  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        Loading paste grid...
      </div>
    );
  }

  const lockedPeriods = new Set(data.lockedPeriods);
  const hasErrors = (validation?.summary.errorCount || 0) > 0;
  const canSave = dirtyCells.length > 0 && !hasErrors && !saveMutation.isPending && !validateMutation.isPending && !heuristicReviewRequired;

  return (
    <div className="space-y-4">
      <Alert className="border-sky-200 bg-sky-50 dark:bg-sky-950/20 dark:border-sky-800">
        <ClipboardPaste className="w-4 h-4 text-sky-600" />
        <AlertDescription className="text-sm space-y-2">
          <p>
            Paste a rectangular block directly from Excel. Metrics stay in the first column, months stay across the top, and the pasted range fills from the selected cell.
          </p>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="outline" className="border-sky-300 text-sky-700 dark:border-sky-700 dark:text-sky-300">Paste from Excel</Badge>
            <span>Changed cells are highlighted immediately and validated before save.</span>
            <Button variant="ghost" size="sm" className="h-auto p-0 text-sky-700 underline-offset-2 hover:underline dark:text-sky-300" onClick={onSwitchToUpload} data-testid="button-open-upload-fallback">
              Use file upload fallback
            </Button>
          </div>
          <p className="text-xs text-sky-700 dark:text-sky-300">
            Blank cells inside the pasted range clear existing values. Blank cells outside the pasted range are ignored.
          </p>
        </AlertDescription>
      </Alert>

      {pasteNotice && (
        <Alert variant={pasteNotice.kind === "error" ? "destructive" : "default"} data-testid="alert-paste-notice">
          <AlertCircle className="w-4 h-4" />
          <AlertDescription className="text-sm">{pasteNotice.message}</AlertDescription>
        </Alert>
      )}

      {heuristicReviewRequired && (
        <Alert data-testid="alert-heuristic-review-required">
          <AlertCircle className="w-4 h-4" />
          <AlertDescription className="text-sm">
            Header or metric-label stripping was used. Save is temporarily disabled so you can confirm the mapping in the review table below, or reset and paste a header-free range instead.
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Select value={monthCount} onValueChange={setMonthCount}>
            <SelectTrigger className="w-36" data-testid="select-paste-window">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="6">Last 6 months</SelectItem>
              <SelectItem value="12">Last 12 months</SelectItem>
            </SelectContent>
          </Select>
          <Badge variant="outline" data-testid="badge-grid-metric-count">
            {data.metrics.length} metrics
          </Badge>
          <Badge variant="outline" data-testid="badge-grid-period-count">
            {data.periods.length} months
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setDraftValues(baseValues);
              setValidation(null);
            }}
            disabled={dirtyCells.length === 0}
            data-testid="button-clear-paste-review"
          >
            Reset changes
          </Button>
          <Button
            size="sm"
            onClick={() => saveMutation.mutate()}
            disabled={!canSave}
            data-testid="button-save-paste-grid"
          >
            {saveMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <ClipboardPaste className="w-3.5 h-3.5 mr-1.5" />}
            Save all changes
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Table className="w-4 h-4 text-primary" />
            Spreadsheet Grid
          </CardTitle>
          <CardDescription className="text-xs">
            Click any data cell, paste from Excel, then review creates, updates, clears, warnings, and errors before saving.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-muted/50 border-b">
                  <th className="sticky left-0 z-20 min-w-[260px] border-r bg-muted/50 px-3 py-2 text-left font-medium">Metric</th>
                  {data.periods.map((period) => (
                    <th
                      key={period}
                      className={cn(
                        "min-w-[130px] px-2 py-2 text-center font-medium",
                        lockedPeriods.has(period) && "bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-300",
                      )}
                    >
                      <div>{period}</div>
                      {lockedPeriods.has(period) && <div className="mt-1 text-[10px] font-normal">Locked</div>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.metrics.map((metric, rowIndex) => (
                  <tr key={metric.id} className="border-b last:border-0">
                    <td className="sticky left-0 z-10 border-r bg-background px-3 py-2 align-middle">
                      <div className="font-medium">{metric.name}</div>
                      <div className="text-[11px] text-muted-foreground">{metric.unit || "Value"}</div>
                    </td>
                    {data.periods.map((period, colIndex) => {
                      const key = keyFor(metric.id, period);
                      const validationCell = cellValidationMap.get(key);
                      const dirty = (draftValues[key] ?? "") !== (baseValues[key] ?? "");
                      const selected = withinSelection({ row: rowIndex, col: colIndex }, selectionStart, selectionEnd);
                      return (
                        <td
                          key={key}
                          className={cn(
                            "relative border-l align-middle",
                            selected && "bg-primary/10",
                          )}
                          onMouseDown={() => {
                            setIsDragging(true);
                            setActiveCell({ row: rowIndex, col: colIndex });
                            setSelectionStart({ row: rowIndex, col: colIndex });
                            setSelectionEnd({ row: rowIndex, col: colIndex });
                          }}
                          onMouseEnter={() => {
                            if (isDragging) setSelectionEnd({ row: rowIndex, col: colIndex });
                          }}
                          onMouseUp={() => setIsDragging(false)}
                        >
                          <input
                            ref={(node) => { inputRefs.current[key] = node; }}
                            value={draftValues[key] ?? ""}
                            onFocus={() => {
                              setActiveCell({ row: rowIndex, col: colIndex });
                              setSelectionStart({ row: rowIndex, col: colIndex });
                              setSelectionEnd({ row: rowIndex, col: colIndex });
                            }}
                            onChange={(event) => {
                              const nextValue = event.target.value;
                              setDraftValues((current) => ({ ...current, [key]: nextValue }));
                            }}
                            onPaste={(event) => {
                              event.preventDefault();
                              applyPaste(rowIndex, colIndex, event.clipboardData.getData("text/plain"));
                            }}
                            onKeyDown={(event) => {
                              if (event.key === "ArrowRight") {
                                event.preventDefault();
                                if (event.shiftKey) {
                                  setSelectionEnd({ row: rowIndex, col: Math.min(colIndex + 1, data.periods.length - 1) });
                                } else {
                                  moveFocus(rowIndex, colIndex + 1);
                                }
                              } else if (event.key === "ArrowLeft") {
                                event.preventDefault();
                                if (event.shiftKey) {
                                  setSelectionEnd({ row: rowIndex, col: Math.max(colIndex - 1, 0) });
                                } else {
                                  moveFocus(rowIndex, colIndex - 1);
                                }
                              } else if (event.key === "ArrowDown" || event.key === "Enter") {
                                event.preventDefault();
                                if (event.shiftKey && event.key === "ArrowDown") {
                                  setSelectionEnd({ row: Math.min(rowIndex + 1, data.metrics.length - 1), col: colIndex });
                                } else {
                                  moveFocus(rowIndex + 1, colIndex);
                                }
                              } else if (event.key === "ArrowUp") {
                                event.preventDefault();
                                if (event.shiftKey) {
                                  setSelectionEnd({ row: Math.max(rowIndex - 1, 0), col: colIndex });
                                } else {
                                  moveFocus(rowIndex - 1, colIndex);
                                }
                              } else if (event.key === "Tab") {
                                event.preventDefault();
                                moveFocus(rowIndex, colIndex + (event.shiftKey ? -1 : 1));
                              }
                            }}
                            className={cn(
                              "h-11 w-full bg-transparent px-2 text-right tabular-nums outline-none",
                              dirty && "bg-emerald-50 dark:bg-emerald-950/20",
                              validationCell?.status === "create" && "bg-emerald-50 dark:bg-emerald-950/20",
                              validationCell?.status === "update" && "bg-sky-50 dark:bg-sky-950/20",
                              validationCell?.status === "clear" && "bg-slate-100 dark:bg-slate-900/50",
                              validationCell?.warnings.length && "bg-amber-50 dark:bg-amber-950/20",
                              validationCell?.errors.length && "bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-300",
                              sameCell(activeCell, { row: rowIndex, col: colIndex }) && "ring-1 ring-primary",
                            )}
                            aria-invalid={validationCell?.errors.length ? "true" : "false"}
                            data-testid={`paste-grid-cell-${rowIndex}-${colIndex}`}
                          />
                          {(validationCell?.errors.length || validationCell?.warnings.length) ? (
                            <div className="pointer-events-none absolute right-1 top-1 text-[10px] text-muted-foreground">
                              {validationCell.errors.length ? "!" : "?"}
                            </div>
                          ) : null}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card className={cn(
        "border",
        hasErrors ? "border-red-300 bg-red-50 dark:bg-red-950/20 dark:border-red-800" : "border-emerald-300 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-800",
      )}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            {validateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : hasErrors ? <AlertCircle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
            Review before save
          </CardTitle>
          <CardDescription className="text-xs">
            {dirtyCells.length === 0
              ? "Paste or edit values to start a bulk review."
              : validateMutation.isPending
                ? "Validating pasted values..."
                : `${validation?.summary.createCount || 0} new, ${validation?.summary.updateCount || 0} updated, and ${validation?.summary.clearCount || 0} cleared.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 text-xs sm:grid-cols-2">
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-red-700 dark:border-red-900 dark:bg-red-950/20 dark:text-red-300">
              Errors block save. Fix any highlighted red cells before committing the batch.
            </div>
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-700 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-300">
              Warnings do not block save. Outliers are surfaced for review but can still be committed.
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="outline">{dirtyCells.length} changed cells</Badge>
            <Badge variant="outline">{validation?.summary.createCount || 0} create</Badge>
            <Badge variant="outline">{validation?.summary.updateCount || 0} update</Badge>
            <Badge variant="outline">{validation?.summary.clearCount || 0} clear</Badge>
            <Badge variant="outline">{validation?.summary.warningCount || 0} warnings</Badge>
            <Badge variant="outline" className={cn(hasErrors && "border-red-300 text-red-700 dark:border-red-800 dark:text-red-300")}>
              {validation?.summary.errorCount || 0} errors
            </Badge>
          </div>

          {!!changePreview.length && (
            <div className="rounded-md border bg-background">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="px-3 py-2 text-left font-medium">Metric</th>
                    <th className="px-3 py-2 text-left font-medium">Month</th>
                    <th className="px-3 py-2 text-left font-medium">Action</th>
                    <th className="px-3 py-2 text-right font-medium">Before</th>
                    <th className="px-3 py-2 text-right font-medium">After</th>
                  </tr>
                </thead>
                <tbody>
                  {changePreview.map((cell) => (
                    <tr key={`${cell.metricId}-${cell.period}`} className="border-b last:border-0">
                      <td className="px-3 py-2">{cell.metricName || "Unknown metric"}</td>
                      <td className="px-3 py-2">{cell.period}</td>
                      <td className="px-3 py-2">
                        <Badge variant="outline" className={cn(
                          cell.status === "create" && "border-emerald-300 text-emerald-700 dark:border-emerald-800 dark:text-emerald-300",
                          cell.status === "update" && "border-sky-300 text-sky-700 dark:border-sky-800 dark:text-sky-300",
                          cell.status === "clear" && "border-slate-300 text-slate-700 dark:border-slate-700 dark:text-slate-300",
                        )}>
                          {cell.status}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{cell.existingValue ?? "Empty"}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{cell.normalizedValue ?? "Cleared"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {(validation?.summary.changedCells || 0) > changePreview.length && (
                <div className="border-t px-3 py-2 text-[11px] text-muted-foreground">
                  Showing the first {changePreview.length} changed cells of {validation?.summary.changedCells}.
                </div>
              )}
            </div>
          )}

          {!!validation?.rowIssues.length && (
            <div className="rounded-md border bg-background">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="px-3 py-2 text-left font-medium">Metric</th>
                    <th className="px-3 py-2 text-left font-medium">Errors</th>
                    <th className="px-3 py-2 text-left font-medium">Warnings</th>
                  </tr>
                </thead>
                <tbody>
                  {validation.rowIssues
                    .filter((row) => row.errors.length > 0 || row.warnings.length > 0)
                    .map((row) => (
                      <tr key={row.metricId} className="border-b last:border-0 align-top">
                        <td className="px-3 py-2 font-medium">{row.metricName || "Unknown metric"}</td>
                        <td className="px-3 py-2 text-red-700 dark:text-red-300">
                          {row.errors.length ? row.errors.join(" | ") : "None"}
                        </td>
                        <td className="px-3 py-2 text-amber-700 dark:text-amber-300">
                          {row.warnings.length ? row.warnings.join(" | ") : "None"}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}

          {hasErrors && (
            <p className="text-xs text-red-700 dark:text-red-300">
              Fix the highlighted cells before saving. Blank pasted cells clear existing values only when included in the pasted range; invalid formats, locked months, duplicate cells, and read-only combinations block commit.
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="bg-muted/30">
        <CardContent className="pt-4 text-xs text-muted-foreground space-y-2">
          <p>Clipboard rules: columns are tab-separated, rows are newline-separated, blanks stay empty, and values like `1,234`, `£450`, or `12%` are normalized automatically.</p>
          <p>Keyboard support: arrows move cell-to-cell, `Tab` moves across months, `Enter` moves down, and `Shift` with arrows expands the current selection.</p>
          <div className="flex items-center gap-2">
            <Upload className="w-3.5 h-3.5" />
            <span>Need the old flow for a full file? The upload tab is still available as a fallback.</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
