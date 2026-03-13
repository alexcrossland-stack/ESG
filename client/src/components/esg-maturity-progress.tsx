import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, CheckCircle2 } from "lucide-react";

const STAGES = [
  { key: "starter", label: "Starter", description: "Beginning your ESG journey" },
  { key: "developing", label: "Developing", description: "Building ESG capabilities" },
  { key: "established", label: "Established", description: "Mature ESG programme" },
] as const;

function getNextStepMessage(stage: string, details: any): string {
  if (stage === "starter") {
    const policiesNeeded = Math.max(0, 2 - (details?.policiesAdopted || 0));
    const metricsNeeded = Math.max(0, 5 - (details?.metricsWithData || 0));
    const parts: string[] = [];
    if (policiesNeeded > 0) parts.push(`adopt ${policiesNeeded} more polic${policiesNeeded === 1 ? "y" : "ies"}`);
    if (metricsNeeded > 0) parts.push(`enter data for ${metricsNeeded} more metric${metricsNeeded === 1 ? "" : "s"}`);
    return parts.length > 0 ? `To reach Developing: ${parts.join(" and ")}.` : "Almost at Developing level!";
  }
  if (stage === "developing") {
    const policiesNeeded = Math.max(0, 5 - (details?.policiesAdopted || 0));
    const metricsNeeded = Math.max(0, 10 - (details?.metricsWithData || 0));
    const coverageNeeded = (details?.evidenceCoverage || 0) < 50;
    const parts: string[] = [];
    if (policiesNeeded > 0) parts.push(`adopt ${policiesNeeded} more polic${policiesNeeded === 1 ? "y" : "ies"}`);
    if (metricsNeeded > 0) parts.push(`enter data for ${metricsNeeded} more metric${metricsNeeded === 1 ? "" : "s"}`);
    if (coverageNeeded) parts.push("improve evidence coverage above 50%");
    return parts.length > 0 ? `To reach Established: ${parts.join(", ")}.` : "Almost at Established level!";
  }
  return "You've reached the highest maturity stage. Keep maintaining your programme.";
}

export function EsgMaturityProgress({ compact = false }: { compact?: boolean }) {
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/esg/maturity"] });

  if (isLoading) return <Skeleton className={compact ? "h-16" : "h-36"} />;
  if (!data) return null;

  const stageIndex = STAGES.findIndex(s => s.key === data.stage);
  const nextMessage = getNextStepMessage(data.stage, data.details);

  if (compact) {
    return (
      <div className="flex items-center gap-3" data-testid="card-maturity-compact">
        <TrendingUp className="w-4 h-4 text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-xs font-medium">Maturity</p>
            <Badge variant={stageIndex >= 2 ? "default" : "secondary"} className="text-[10px]" data-testid="badge-maturity-compact">
              {STAGES[stageIndex]?.label || data.stage}
            </Badge>
          </div>
        </div>
      </div>
    );
  }

  return (
    <Card data-testid="card-maturity-progress">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-primary" />
          ESG Maturity Progress
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-1" data-testid="maturity-stages">
          {STAGES.map((s, i) => {
            const isActive = i === stageIndex;
            const isPast = i < stageIndex;
            return (
              <div key={s.key} className="flex items-center flex-1" data-testid={`maturity-stage-${s.key}`}>
                <div className="flex flex-col items-center flex-1">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                      isActive
                        ? "bg-primary text-primary-foreground ring-2 ring-primary/30"
                        : isPast
                          ? "bg-primary/20 text-primary"
                          : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {isPast ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
                  </div>
                  <p className={`text-[10px] mt-1 text-center leading-tight ${isActive ? "font-bold text-primary" : isPast ? "text-primary/70" : "text-muted-foreground"}`}>
                    {s.label}
                  </p>
                </div>
                {i < STAGES.length - 1 && (
                  <div className={`h-0.5 w-full mx-1 rounded-full ${isPast ? "bg-primary/40" : "bg-muted"}`} />
                )}
              </div>
            );
          })}
        </div>

        <p className="text-xs text-muted-foreground" data-testid="text-maturity-next-step">{nextMessage}</p>
      </CardContent>
    </Card>
  );
}
