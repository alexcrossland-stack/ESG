import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Target, Leaf, Users, Shield } from "lucide-react";
import { usePermissions } from "@/lib/permissions";

type Topic = {
  id: string;
  topic: string;
  category: "environmental" | "social" | "governance";
  selected: boolean;
};

const CATEGORY_CONFIG = {
  environmental: {
    label: "Environmental",
    icon: Leaf,
    color: "text-primary",
    bg: "bg-primary/10",
    badge: "default" as const,
  },
  social: {
    label: "Social",
    icon: Users,
    color: "text-blue-500",
    bg: "bg-blue-500/10",
    badge: "secondary" as const,
  },
  governance: {
    label: "Governance",
    icon: Shield,
    color: "text-purple-500",
    bg: "bg-purple-500/10",
    badge: "outline" as const,
  },
};

export default function Topics() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { can } = usePermissions();

  const { data: topics = [], isLoading } = useQuery<Topic[]>({ queryKey: ["/api/topics"] });

  const updateMutation = useMutation({
    mutationFn: ({ id, selected }: { id: string; selected: boolean }) =>
      apiRequest("PUT", `/api/topics/${id}`, { selected }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/topics"] }),
    onError: () => toast({ title: "Update failed", variant: "destructive" }),
  });

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

  const selectedCount = topics.filter(t => t.selected).length;

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Target className="w-5 h-5 text-primary" />
            Priority Topics
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Select the ESG topics that matter most to your business
          </p>
        </div>
        <Badge variant="secondary" data-testid="badge-selected-count">
          {selectedCount} of {topics.length} selected
        </Badge>
      </div>

      <p className="text-sm text-muted-foreground bg-muted/50 rounded-md p-3 border border-border">
        Your priority topics will appear on your dashboard and in your ESG reports. 
        Select the topics that are most relevant to your business and stakeholders.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {(Object.entries(grouped) as [keyof typeof CATEGORY_CONFIG, Topic[]][]).map(([cat, catTopics]) => {
          const config = CATEGORY_CONFIG[cat];
          const Icon = config.icon;
          const selectedInCat = catTopics.filter(t => t.selected).length;

          return (
            <Card key={cat} data-testid={`card-${cat}`}>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <div className={`p-1.5 rounded-md ${config.bg}`}>
                    <Icon className={`w-4 h-4 ${config.color}`} />
                  </div>
                  <div>
                    <CardTitle className="text-sm">{config.label}</CardTitle>
                    <CardDescription className="text-xs">
                      {selectedInCat}/{catTopics.length} selected
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-1 pt-0">
                {catTopics.map((topic) => (
                  <div
                    key={topic.id}
                    className={`flex items-center justify-between gap-2 p-2.5 rounded-md transition-colors ${
                      topic.selected ? "bg-muted/70" : ""
                    }`}
                    data-testid={`topic-${topic.id}`}
                  >
                    <span className={`text-sm flex-1 ${topic.selected ? "font-medium" : "text-muted-foreground"}`}>
                      {topic.topic}
                    </span>
                    <Switch
                      checked={topic.selected}
                      onCheckedChange={(checked) => updateMutation.mutate({ id: topic.id, selected: checked })}
                      disabled={!can("settings_admin")}
                      data-testid={`switch-topic-${topic.id}`}
                    />
                  </div>
                ))}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
