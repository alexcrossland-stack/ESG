import { useQuery } from "@tanstack/react-query";
import { useBillingStatus, UpgradeOverlay } from "@/components/upgrade-prompt";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { BarChart3, Info, TrendingUp, TrendingDown, Minus } from "lucide-react";

interface BenchmarkComparison {
  metricKey: string;
  label: string;
  unit: string;
  companyValue: number;
  rangeLow: number;
  rangeMedian: number;
  rangeHigh: number;
  rating: "below_range" | "within_range" | "above_range";
  source: string;
}

interface BenchmarkDef {
  metricKey: string;
  label: string;
  unit: string;
  rangeLow: number;
  rangeMedian: number;
  rangeHigh: number;
  source: string;
  notes?: string;
  direction: string;
}

function RatingBadge({ rating, direction }: { rating: string; direction?: string }) {
  const isGood = (rating === "below_range" && direction === "lower_is_better") ||
    (rating === "above_range" && direction === "higher_is_better") ||
    rating === "within_range";

  const variant = isGood ? "default" : "destructive";
  const label = rating === "below_range" ? "Below Range" : rating === "above_range" ? "Above Range" : "Within Range";

  return (
    <Badge variant={variant} className={isGood ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200" : ""} data-testid={`badge-rating-${rating}`}>
      {rating === "within_range" ? <Minus className="w-3 h-3 mr-1" /> : rating === "above_range" ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
      {label}
    </Badge>
  );
}

function RangeBar({ low, median, high, value, direction }: { low: number; median: number; high: number; value: number; direction?: string }) {
  const rangeSpan = high - low;
  const extendedMin = low - rangeSpan * 0.2;
  const extendedMax = high + rangeSpan * 0.2;
  const totalSpan = extendedMax - extendedMin;

  const lowPct = ((low - extendedMin) / totalSpan) * 100;
  const highPct = ((high - extendedMin) / totalSpan) * 100;
  const medianPct = ((median - extendedMin) / totalSpan) * 100;
  const valuePct = Math.max(0, Math.min(100, ((value - extendedMin) / totalSpan) * 100));

  const isGood = (value <= high && value >= low) ||
    (direction === "lower_is_better" && value < low) ||
    (direction === "higher_is_better" && value > high);

  return (
    <div className="relative h-8 mt-2 mb-4">
      <div className="absolute inset-y-2 left-0 right-0 bg-muted rounded-full" />
      <div
        className="absolute inset-y-2 bg-emerald-100 dark:bg-emerald-900 rounded-full"
        style={{ left: `${lowPct}%`, width: `${highPct - lowPct}%` }}
      />
      <div
        className="absolute top-1 w-0.5 h-6 bg-muted-foreground/40"
        style={{ left: `${medianPct}%` }}
      />
      <div
        className={`absolute top-0 w-3 h-3 rounded-full border-2 border-white shadow-md ${isGood ? "bg-emerald-500" : "bg-red-500"}`}
        style={{ left: `${valuePct}%`, transform: "translateX(-50%)", top: "50%", marginTop: "-6px" }}
      />
      <div className="absolute -bottom-3 text-[10px] text-muted-foreground" style={{ left: `${lowPct}%`, transform: "translateX(-50%)" }}>{low}</div>
      <div className="absolute -bottom-3 text-[10px] text-muted-foreground" style={{ left: `${medianPct}%`, transform: "translateX(-50%)" }}>{median}</div>
      <div className="absolute -bottom-3 text-[10px] text-muted-foreground" style={{ left: `${highPct}%`, transform: "translateX(-50%)" }}>{high}</div>
    </div>
  );
}

export default function BenchmarksPage() {
  const { isPro, isLoading: billingLoading } = useBillingStatus();

  const { data: benchmarks, isLoading: loadingBenchmarks } = useQuery<BenchmarkDef[]>({
    queryKey: ["/api/benchmarks"],
  });

  const { data: comparison, isLoading: loadingComparison } = useQuery<BenchmarkComparison[]>({
    queryKey: ["/api/benchmarks/comparison"],
    enabled: isPro,
    retry: false,
  });

  if (loadingBenchmarks || billingLoading || (isPro && loadingComparison)) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-48" />)}
        </div>
      </div>
    );
  }

  const allBenchmarks = benchmarks || [];
  const comparisonMap = new Map((comparison || []).map(c => [c.metricKey, c]));

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-benchmarks-title">ESG Benchmarks</h1>
        <p className="text-sm text-muted-foreground mt-1">Compare your performance against SME reference ranges</p>
      </div>

      <Alert>
        <Info className="w-4 h-4" />
        <AlertDescription>
          These ranges are suggested reference points for SME businesses. They are not authoritative industry standards unless individually cited. Actual performance depends on sector, size, and operating context.
        </AlertDescription>
      </Alert>

      {!isPro ? (
        <UpgradeOverlay
          feature="ESG Benchmarks"
          title="Unlock your benchmark comparison"
          description="See how your ESG performance compares to SME industry ranges. Available on the Pro plan."
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {allBenchmarks.slice(0, 4).map(b => (
              <Card key={b.metricKey} data-testid={`card-benchmark-preview-${b.metricKey}`}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">{b.label}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="text-2xl font-bold text-muted-foreground">—</span>
                    <span className="text-sm text-muted-foreground">{b.unit}</span>
                  </div>
                  <RangeBar low={b.rangeLow} median={b.rangeMedian} high={b.rangeHigh} value={b.rangeMedian} direction={b.direction} />
                  <div className="mt-4 space-y-1">
                    <p className="text-xs text-muted-foreground">Reference range: {b.rangeLow} – {b.rangeHigh} {b.unit} (median: {b.rangeMedian})</p>
                    <p className="text-[10px] text-muted-foreground/70 italic">{b.source}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </UpgradeOverlay>
      ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {allBenchmarks.map(b => {
          const comp = comparisonMap.get(b.metricKey);

          return (
            <Card key={b.metricKey} data-testid={`card-benchmark-${b.metricKey}`}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold">{b.label}</CardTitle>
                  {comp && <RatingBadge rating={comp.rating} direction={b.direction} />}
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline gap-2 mb-1">
                  {comp ? (
                    <>
                      <span className="text-2xl font-bold" data-testid={`text-value-${b.metricKey}`}>{comp.companyValue.toFixed(1)}</span>
                      <span className="text-sm text-muted-foreground">{b.unit}</span>
                    </>
                  ) : (
                    <span className="text-sm text-muted-foreground">No data available</span>
                  )}
                </div>

                <RangeBar
                  low={b.rangeLow}
                  median={b.rangeMedian}
                  high={b.rangeHigh}
                  value={comp?.companyValue || b.rangeMedian}
                  direction={b.direction}
                />

                <div className="mt-4 space-y-1">
                  <p className="text-xs text-muted-foreground">
                    Reference range: {b.rangeLow} – {b.rangeHigh} {b.unit} (median: {b.rangeMedian})
                  </p>
                  <p className="text-[10px] text-muted-foreground/70 italic">{b.source}</p>
                  {b.notes && <p className="text-[10px] text-muted-foreground/60">{b.notes}</p>}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
      )}
    </div>
  );
}
