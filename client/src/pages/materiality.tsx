import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Leaf, Users, Shield, ChevronDown, ChevronUp, Info, Star } from "lucide-react";
import { PageGuidance } from "@/components/page-guidance";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type MaterialTopic = {
  id: string;
  topic: string;
  category: "environmental" | "social" | "governance";
  selected: boolean;
  financialMateriality: number | null;
  impactMateriality: number | null;
  rationale: string | null;
};

const CATEGORY_CONFIG = {
  environmental: { label: "Environmental", icon: Leaf, color: "text-green-600", bg: "bg-green-50 dark:bg-green-950/30", badge: "default" as const },
  social: { label: "Social", icon: Users, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-950/30", badge: "secondary" as const },
  governance: { label: "Governance", icon: Shield, color: "text-purple-600", bg: "bg-purple-50 dark:bg-purple-950/30", badge: "outline" as const },
};

const SCORE_LABELS: Record<number, string> = {
  1: "Not material",
  2: "Low",
  3: "Medium",
  4: "High",
  5: "Very High",
};

function getScoreColor(score: number | null) {
  if (!score) return "text-muted-foreground";
  if (score >= 4) return "text-red-500";
  if (score >= 3) return "text-amber-500";
  return "text-green-600";
}

function getRiskLevel(financial: number | null, impact: number | null): { label: string; color: string } {
  const avg = financial && impact ? (financial + impact) / 2 : null;
  if (!avg) return { label: "Not scored", color: "text-muted-foreground" };
  if (avg >= 4) return { label: "High Priority", color: "text-red-500" };
  if (avg >= 3) return { label: "Medium Priority", color: "text-amber-500" };
  return { label: "Low Priority", color: "text-green-600" };
}

export default function MaterialityPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [localScores, setLocalScores] = useState<Record<string, { financial: number; impact: number; rationale: string }>>({});

  const { data: topics = [], isLoading } = useQuery<MaterialTopic[]>({
    queryKey: ["/api/materiality/topics"],
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      apiRequest("PATCH", `/api/materiality/topics/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/materiality/topics"] });
      toast({ title: "Topic saved" });
    },
    onError: () => toast({ title: "Save failed", variant: "destructive" }),
  });

  const handleSave = (topic: MaterialTopic) => {
    const local = localScores[topic.id];
    updateMutation.mutate({
      id: topic.id,
      data: {
        selected: local?.financial > 0 || local?.impact > 0,
        financialMateriality: local?.financial ?? topic.financialMateriality,
        impactMateriality: local?.impact ?? topic.impactMateriality,
        rationale: local?.rationale ?? topic.rationale,
      },
    });
  };

  const getLocal = (topic: MaterialTopic) => ({
    financial: localScores[topic.id]?.financial ?? topic.financialMateriality ?? 1,
    impact: localScores[topic.id]?.impact ?? topic.impactMateriality ?? 1,
    rationale: localScores[topic.id]?.rationale ?? topic.rationale ?? "",
  });

  const setLocal = (id: string, key: "financial" | "impact" | "rationale", value: any) => {
    setLocalScores(prev => ({
      ...prev,
      [id]: { ...getLocal({ id, financialMateriality: null, impactMateriality: null, rationale: null } as any), ...prev[id], [key]: value },
    }));
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-64" />)}
        </div>
      </div>
    );
  }

  const grouped = {
    environmental: topics.filter(t => t.category === "environmental"),
    social: topics.filter(t => t.category === "social"),
    governance: topics.filter(t => t.category === "governance"),
  };

  const scoredTopics = topics.filter(t => t.financialMateriality && t.impactMateriality)
    .sort((a, b) => {
      const avgA = ((a.financialMateriality ?? 0) + (a.impactMateriality ?? 0)) / 2;
      const avgB = ((b.financialMateriality ?? 0) + (b.impactMateriality ?? 0)) / 2;
      return avgB - avgA;
    });

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Star className="w-5 h-5 text-primary" />
            Materiality Assessment
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Score each topic on financial materiality (risk/opportunity to business) and impact materiality (effect on people/planet)
          </p>
        </div>
        <Badge variant="secondary" data-testid="badge-scored-count">
          {scoredTopics.length} of {topics.length} scored
        </Badge>
      </div>

      <PageGuidance
        pageKey="materiality"
        title="What is Materiality Assessment?"
        summary="Materiality assessment helps you identify which ESG topics matter most to your business and its stakeholders. You score each topic on two dimensions: how much it affects your financial performance (financial materiality), and how much your business affects people and the planet (impact materiality). The results guide where to focus your ESG efforts."
        goodLooksLike="All topics have been scored on both dimensions with a written rationale. High-priority topics (scoring 4–5) are actively addressed in your action plan, targets, and reports. Your assessment is reviewed annually and after major business changes."
        steps={[
          "Review each Environmental, Social, and Governance topic in the list.",
          "Set the Financial Materiality score (1–5): how significant is this topic to your business risk or opportunity?",
          "Set the Impact Materiality score (1–5): how significant is your business's impact on this topic?",
          "Add a rationale note explaining your scoring decision.",
          "Use the Priority Matrix tab to see which topics land in the high-priority quadrant.",
          "Focus your ESG programme on the topics that score highest on both dimensions.",
        ]}
      />

      <Tabs defaultValue="score" className="w-full">
        <TabsList>
          <TabsTrigger value="score" data-testid="tab-score">Score Topics</TabsTrigger>
          <TabsTrigger value="matrix" data-testid="tab-matrix">Priority Matrix</TabsTrigger>
          <TabsTrigger value="ranked" data-testid="tab-ranked">Ranked List</TabsTrigger>
        </TabsList>

        <TabsContent value="score" className="space-y-6 mt-4">
          <p className="text-sm text-muted-foreground bg-muted/50 rounded-md p-3 border border-border">
            Score each topic from 1 (not material) to 5 (very high). Financial materiality = risk or opportunity to your business. Impact materiality = effect on society, environment, or stakeholders.
          </p>
          {(Object.entries(grouped) as [keyof typeof CATEGORY_CONFIG, MaterialTopic[]][]).map(([cat, catTopics]) => {
            const config = CATEGORY_CONFIG[cat];
            const Icon = config.icon;
            return (
              <div key={cat}>
                <div className="flex items-center gap-2 mb-3">
                  <div className={`p-1.5 rounded-md ${config.bg}`}>
                    <Icon className={`w-4 h-4 ${config.color}`} />
                  </div>
                  <h2 className="font-medium text-sm">{config.label}</h2>
                </div>
                <div className="space-y-2">
                  {catTopics.map(topic => {
                    const local = getLocal(topic);
                    const isOpen = expanded === topic.id;
                    const riskLevel = getRiskLevel(topic.financialMateriality, topic.impactMateriality);

                    return (
                      <Card key={topic.id} data-testid={`topic-card-${topic.id}`} className="border border-border">
                        <button
                          className="w-full text-left p-4 flex items-center justify-between"
                          onClick={() => setExpanded(isOpen ? null : topic.id)}
                          data-testid={`button-expand-topic-${topic.id}`}
                        >
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <span className="text-sm font-medium truncate">{topic.topic}</span>
                            {topic.financialMateriality && topic.impactMateriality && (
                              <span className={`text-xs font-medium ${riskLevel.color}`}>{riskLevel.label}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {topic.financialMateriality && (
                              <span className="text-xs text-muted-foreground">
                                F:{topic.financialMateriality} I:{topic.impactMateriality}
                              </span>
                            )}
                            {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </div>
                        </button>

                        {isOpen && (
                          <CardContent className="pt-0 pb-4 space-y-4 border-t border-border">
                            <div className="space-y-3">
                              <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <label className="text-sm font-medium flex items-center gap-1">
                                    Financial Materiality
                                    <Tooltip>
                                      <TooltipTrigger><Info className="w-3.5 h-3.5 text-muted-foreground" /></TooltipTrigger>
                                      <TooltipContent>How significant is this topic as a risk or opportunity to your business finances?</TooltipContent>
                                    </Tooltip>
                                  </label>
                                  <span className={`text-sm font-semibold ${getScoreColor(local.financial)}`}>
                                    {local.financial} – {SCORE_LABELS[local.financial]}
                                  </span>
                                </div>
                                <Slider
                                  min={1} max={5} step={1}
                                  value={[local.financial]}
                                  onValueChange={([v]) => setLocal(topic.id, "financial", v)}
                                  data-testid={`slider-financial-${topic.id}`}
                                />
                              </div>
                              <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <label className="text-sm font-medium flex items-center gap-1">
                                    Impact Materiality
                                    <Tooltip>
                                      <TooltipTrigger><Info className="w-3.5 h-3.5 text-muted-foreground" /></TooltipTrigger>
                                      <TooltipContent>How significant is this topic's impact on society, environment, or stakeholders?</TooltipContent>
                                    </Tooltip>
                                  </label>
                                  <span className={`text-sm font-semibold ${getScoreColor(local.impact)}`}>
                                    {local.impact} – {SCORE_LABELS[local.impact]}
                                  </span>
                                </div>
                                <Slider
                                  min={1} max={5} step={1}
                                  value={[local.impact]}
                                  onValueChange={([v]) => setLocal(topic.id, "impact", v)}
                                  data-testid={`slider-impact-${topic.id}`}
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-sm font-medium">Rationale (optional)</label>
                                <Textarea
                                  placeholder="Why is this topic scored this way? What evidence supports this?"
                                  value={local.rationale}
                                  onChange={e => setLocal(topic.id, "rationale", e.target.value)}
                                  className="resize-none text-sm"
                                  rows={2}
                                  data-testid={`textarea-rationale-${topic.id}`}
                                />
                              </div>
                              {topic.recommendedPolicySlugs && topic.recommendedPolicySlugs.length > 0 && (
                                <div className="text-xs text-muted-foreground">
                                  <span className="font-medium">Recommended policies: </span>
                                  {topic.recommendedPolicySlugs.join(", ")}
                                </div>
                              )}
                            </div>
                            <Button
                              size="sm"
                              onClick={() => handleSave(topic)}
                              disabled={updateMutation.isPending}
                              data-testid={`button-save-topic-${topic.id}`}
                            >
                              Save Scores
                            </Button>
                          </CardContent>
                        )}
                      </Card>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </TabsContent>

        <TabsContent value="matrix" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Priority Matrix</CardTitle>
              <CardDescription>Topics plotted by financial materiality (x-axis) vs impact materiality (y-axis)</CardDescription>
            </CardHeader>
            <CardContent>
              {scoredTopics.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Score topics first to see the priority matrix</p>
              ) : (
                <div className="relative border border-border rounded-lg bg-muted/20" style={{ height: 400 }} data-testid="risk-matrix">
                  <div className="absolute left-2 top-2 text-xs text-muted-foreground font-medium">Impact Materiality →</div>
                  <div className="absolute bottom-2 right-2 text-xs text-muted-foreground font-medium">Financial Materiality →</div>
                  {/* Grid quadrant labels */}
                  <div className="absolute top-[15%] left-[55%] text-xs text-red-400 font-medium opacity-60">High Priority</div>
                  <div className="absolute top-[65%] left-[5%] text-xs text-green-500 font-medium opacity-60">Low Priority</div>
                  <div className="absolute top-[15%] left-[5%] text-xs text-amber-500 font-medium opacity-60">Impact Focus</div>
                  <div className="absolute top-[65%] left-[55%] text-xs text-blue-500 font-medium opacity-60">Financial Focus</div>
                  {/* Quadrant lines */}
                  <div className="absolute left-1/2 top-8 bottom-8 w-px bg-border" />
                  <div className="absolute top-1/2 left-8 right-8 h-px bg-border" />
                  {scoredTopics.map(topic => {
                    const config = CATEGORY_CONFIG[topic.category];
                    const x = ((topic.financialMateriality ?? 1) - 1) / 4 * 85 + 5;
                    const y = (1 - ((topic.impactMateriality ?? 1) - 1) / 4) * 80 + 8;
                    return (
                      <Tooltip key={topic.id}>
                        <TooltipTrigger asChild>
                          <div
                            className={`absolute w-3 h-3 rounded-full border-2 border-white cursor-pointer ${
                              topic.category === "environmental" ? "bg-green-500" :
                              topic.category === "social" ? "bg-blue-500" : "bg-purple-500"
                            }`}
                            style={{ left: `${x}%`, top: `${y}%`, transform: "translate(-50%, -50%)" }}
                            data-testid={`matrix-dot-${topic.id}`}
                          />
                        </TooltipTrigger>
                        <TooltipContent>
                          <div className="text-xs">
                            <div className="font-medium">{topic.topic}</div>
                            <div>Financial: {topic.financialMateriality}/5 | Impact: {topic.impactMateriality}/5</div>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </div>
              )}
              <div className="flex gap-3 mt-4 text-xs">
                <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-green-500" /> Environmental</div>
                <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-blue-500" /> Social</div>
                <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-purple-500" /> Governance</div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ranked" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Ranked Topics</CardTitle>
              <CardDescription>Topics ranked by average materiality score (financial + impact)</CardDescription>
            </CardHeader>
            <CardContent>
              {scoredTopics.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Score topics first to see the ranked list</p>
              ) : (
                <div className="space-y-2">
                  {scoredTopics.map((topic, idx) => {
                    const avg = ((topic.financialMateriality ?? 0) + (topic.impactMateriality ?? 0)) / 2;
                    const riskLevel = getRiskLevel(topic.financialMateriality, topic.impactMateriality);
                    const config = CATEGORY_CONFIG[topic.category];
                    return (
                      <div
                        key={topic.id}
                        className="flex items-center gap-3 p-3 rounded-md border border-border bg-muted/30"
                        data-testid={`ranked-topic-${topic.id}`}
                      >
                        <span className="text-sm font-bold text-muted-foreground w-6 text-center">{idx + 1}</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium">{topic.topic}</div>
                          <div className="text-xs text-muted-foreground">{config.label}</div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className={`text-sm font-semibold ${riskLevel.color}`}>{avg.toFixed(1)}/5</div>
                          <div className={`text-xs ${riskLevel.color}`}>{riskLevel.label}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
