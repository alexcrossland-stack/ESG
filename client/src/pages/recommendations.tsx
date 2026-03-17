import { useQuery } from "@tanstack/react-query";
import { useBillingStatus, UpgradeLimitBanner } from "@/components/upgrade-prompt";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Lightbulb, AlertTriangle, TrendingUp, ArrowRight, FileWarning,
  BarChart3, Clock, Shield, CheckCircle, RefreshCw,
} from "lucide-react";
import { Link } from "wouter";

interface Recommendation {
  id: string;
  title: string;
  description: string;
  impact: "high" | "medium" | "low";
  category: string;
  actionUrl: string;
  type: string;
}

const CATEGORY_CONFIG: Record<string, { icon: typeof Lightbulb; color: string }> = {
  data: { icon: BarChart3, color: "text-blue-600 dark:text-blue-400" },
  evidence: { icon: FileWarning, color: "text-amber-600 dark:text-amber-400" },
  actions: { icon: Clock, color: "text-red-600 dark:text-red-400" },
  compliance: { icon: Shield, color: "text-purple-600 dark:text-purple-400" },
  governance: { icon: CheckCircle, color: "text-green-600 dark:text-green-400" },
};

const IMPACT_CONFIG: Record<string, { label: string; variant: "destructive" | "secondary" | "outline" }> = {
  high: { label: "High impact", variant: "destructive" },
  medium: { label: "Medium impact", variant: "secondary" },
  low: { label: "Low impact", variant: "outline" },
};

function RecommendationCard({ rec }: { rec: Recommendation }) {
  const catConfig = CATEGORY_CONFIG[rec.category] || { icon: Lightbulb, color: "text-muted-foreground" };
  const CatIcon = catConfig.icon;
  const impactConfig = IMPACT_CONFIG[rec.impact] || IMPACT_CONFIG.medium;

  return (
    <Card className={`transition-all hover:shadow-sm ${rec.impact === "high" ? "border-red-200 dark:border-red-800/50" : ""}`} data-testid={`card-recommendation-${rec.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className={`p-2 rounded-lg bg-muted shrink-0`}>
            <CatIcon className={`w-4 h-4 ${catConfig.color}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <p className="text-sm font-medium">{rec.title}</p>
              <Badge variant={impactConfig.variant} className="text-xs shrink-0">{impactConfig.label}</Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{rec.description}</p>
            <div className="mt-3">
              <Link href={rec.actionUrl}>
                <Button variant="outline" size="sm" className="h-7 text-xs" data-testid={`button-rec-action-${rec.id}`}>
                  Take action <ArrowRight className="w-3 h-3 ml-1" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Recommendations() {
  const { isPro } = useBillingStatus();
  const { data, isLoading, refetch, isRefetching } = useQuery<{ recommendations: Recommendation[]; total: number; limited?: boolean }>({
    queryKey: ["/api/recommendations"],
  });

  const highCount = data?.recommendations.filter(r => r.impact === "high").length || 0;
  const mediumCount = data?.recommendations.filter(r => r.impact === "medium").length || 0;
  const isLimited = !isPro && (data?.limited ?? false);

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-5" data-testid="page-recommendations">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-lg sm:text-xl font-semibold">ESG Recommendations</h1>
          <p className="text-sm text-muted-foreground">
            Personalised suggestions based on your current ESG data
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!isLoading && data && highCount > 0 && (
            <Badge variant="destructive" data-testid="badge-high-impact">{highCount} high impact</Badge>
          )}
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isRefetching} data-testid="button-refresh-recommendations">
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isRefetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {!isLoading && data && data.total > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <Card className="p-3 text-center">
            <p className="text-2xl font-bold text-red-600 dark:text-red-400">{highCount}</p>
            <p className="text-xs text-muted-foreground mt-0.5">High impact</p>
          </Card>
          <Card className="p-3 text-center">
            <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{mediumCount}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Medium impact</p>
          </Card>
          <Card className="p-3 text-center">
            <p className="text-2xl font-bold">{data.total}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Total</p>
          </Card>
        </div>
      )}

      {isLimited && (
        <UpgradeLimitBanner
          current={3}
          limit={data?.total ?? 3}
          noun="Recommendations"
          feature="recommendations"
          valueMessage="Upgrade to see your full prioritised action list — tailored to your biggest ESG gaps."
          data-testid="banner-recommendations-limit"
        />
      )}

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28 w-full" />)}
        </div>
      ) : data && data.total > 0 ? (
        <div className="space-y-3">
          {data.recommendations.map(rec => (
            <RecommendationCard key={rec.id} rec={rec} />
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-14 text-center">
            <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center mx-auto mb-4">
              <TrendingUp className="w-6 h-6 text-green-600 dark:text-green-400" />
            </div>
            <p className="font-medium">No recommendations right now</p>
            <p className="text-sm text-muted-foreground mt-1">
              Your ESG programme looks good. Keep your data up to date and check back regularly.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
