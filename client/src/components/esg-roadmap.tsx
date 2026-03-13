import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Map, RefreshCw, CheckCircle2, Circle, Loader2 } from "lucide-react";

interface RoadmapMonth {
  month: number;
  title: string;
  actions: string[];
}

interface Roadmap {
  months: RoadmapMonth[];
  generatedAt?: string;
  maturityLevel?: string;
}

export function EsgRoadmap() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<{ roadmap: Roadmap | null }>({
    queryKey: ["/api/esg/roadmap"],
  });

  const generateMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/esg/roadmap", {}).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/esg/roadmap"] });
      toast({ title: "Roadmap generated", description: "Your 12-month ESG implementation roadmap is ready." });
    },
    onError: (e: any) => {
      toast({ title: "Generation failed", description: e.message || "Could not generate roadmap", variant: "destructive" });
    },
  });

  const roadmap = data?.roadmap;
  const currentMonth = new Date().getMonth() + 1;
  const generatedDate = roadmap?.generatedAt ? new Date(roadmap.generatedAt) : null;
  const startMonth = generatedDate ? generatedDate.getMonth() + 1 : 1;

  if (isLoading) {
    return (
      <Card>
        <CardHeader><Skeleton className="h-6 w-48" /></CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-20" />)}
        </CardContent>
      </Card>
    );
  }

  if (!roadmap) {
    return (
      <Card data-testid="card-roadmap-empty">
        <CardContent className="flex flex-col items-center justify-center py-12 text-center space-y-4">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
            <Map className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-lg">ESG Implementation Roadmap</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-md">
              Generate a personalised 12-month roadmap based on your company's ESG maturity level and priority topics.
            </p>
          </div>
          <Button
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending}
            data-testid="button-generate-roadmap"
          >
            {generateMutation.isPending ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating...</>
            ) : (
              <><Map className="w-4 h-4 mr-2" /> Generate Roadmap</>
            )}
          </Button>
        </CardContent>
      </Card>
    );
  }

  function getMonthStatus(monthNum: number): "past" | "current" | "future" {
    const adjustedMonth = ((startMonth - 1 + monthNum - 1) % 12) + 1;
    if (adjustedMonth < currentMonth) return "past";
    if (adjustedMonth === currentMonth) return "current";
    return "future";
  }

  return (
    <Card data-testid="card-roadmap">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-lg flex items-center gap-2">
            <Map className="w-5 h-5 text-primary" />
            12-Month ESG Roadmap
          </CardTitle>
          {generatedDate && (
            <p className="text-xs text-muted-foreground mt-1">
              Generated {generatedDate.toLocaleDateString()}
              {roadmap.maturityLevel && (
                <> for <Badge variant="secondary" className="ml-1 text-[10px] py-0">{roadmap.maturityLevel.replace(/_/g, " ")}</Badge></>
              )}
            </p>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => generateMutation.mutate()}
          disabled={generateMutation.isPending}
          data-testid="button-regenerate-roadmap"
        >
          {generateMutation.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <><RefreshCw className="w-4 h-4 mr-1" /> Regenerate</>
          )}
        </Button>
      </CardHeader>
      <CardContent>
        <div className="relative space-y-0">
          {roadmap.months.map((m, idx) => {
            const status = getMonthStatus(m.month);
            const isPast = status === "past";
            const isCurrent = status === "current";

            return (
              <div key={m.month} className="relative flex gap-4" data-testid={`roadmap-month-${m.month}`}>
                <div className="flex flex-col items-center">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                    isCurrent ? "bg-primary text-primary-foreground" :
                    isPast ? "bg-muted text-muted-foreground" :
                    "bg-primary/10 text-primary"
                  }`}>
                    {isPast ? (
                      <CheckCircle2 className="w-4 h-4" />
                    ) : (
                      <span className="text-xs font-bold">{m.month}</span>
                    )}
                  </div>
                  {idx < roadmap.months.length - 1 && (
                    <div className={`w-0.5 flex-1 min-h-[16px] ${
                      isPast ? "bg-muted-foreground/30" : "bg-primary/20"
                    }`} />
                  )}
                </div>

                <div className={`pb-6 flex-1 ${isPast ? "opacity-50" : ""}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium text-muted-foreground">Month {m.month}</span>
                    {isCurrent && <Badge className="text-[10px] py-0 h-4">Current</Badge>}
                  </div>
                  <h4 className="font-semibold text-sm">{m.title}</h4>
                  <ul className="mt-2 space-y-1">
                    {m.actions.map((action, ai) => (
                      <li key={ai} className="flex items-start gap-2 text-sm text-muted-foreground">
                        <Circle className="w-2 h-2 mt-1.5 shrink-0 fill-current" />
                        <span>{action}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
