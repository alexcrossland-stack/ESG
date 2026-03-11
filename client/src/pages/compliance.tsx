import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Shield, CheckCircle, XCircle, ChevronDown, ChevronUp,
  Leaf, Users, Scale, ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { Link } from "wouter";

const CATEGORY_ICONS: Record<string, any> = {
  environmental: Leaf,
  social: Users,
  governance: Scale,
  planning: Shield,
  support: Users,
  operation: Shield,
  performance: CheckCircle,
};

function ScoreRing({ score, size = 80 }: { score: number; size?: number }) {
  const radius = (size - 16) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;
  const color = score >= 70 ? "stroke-emerald-500" : score >= 40 ? "stroke-amber-500" : "stroke-red-500";
  const textColor = score >= 70 ? "text-emerald-600" : score >= 40 ? "text-amber-600" : "text-red-600";

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg className="-rotate-90" viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
        <circle cx={size/2} cy={size/2} r={radius} fill="none" className="stroke-muted" strokeWidth="6" />
        <circle cx={size/2} cy={size/2} r={radius} fill="none" className={color} strokeWidth="6" strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={`text-sm font-bold ${textColor}`}>{score}%</span>
      </div>
    </div>
  );
}

function FrameworkCard({ framework }: { framework: any }) {
  const [expanded, setExpanded] = useState(false);

  const categories = [...new Set(framework.requirements.map((r: any) => r.category))];

  return (
    <Card data-testid={`card-framework-${framework.id}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="w-4 h-4 text-primary" />
              {framework.name}
            </CardTitle>
            <CardDescription className="mt-1">{framework.description}</CardDescription>
            {framework.version && (
              <Badge variant="outline" className="text-xs mt-2">v{framework.version}</Badge>
            )}
          </div>
          <div className="flex items-center gap-3">
            <ScoreRing score={framework.compliancePercent} />
            <div className="text-right">
              <p className="text-lg font-bold" data-testid={`text-compliance-percent-${framework.id}`}>
                {framework.compliancePercent}%
              </p>
              <p className="text-xs text-muted-foreground">
                {framework.metRequirements}/{framework.totalRequirements} met
              </p>
            </div>
          </div>
        </div>
        <Progress value={framework.compliancePercent} className="h-2 mt-3" />
      </CardHeader>
      <CardContent className="pt-0">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-center text-xs"
          onClick={() => setExpanded(!expanded)}
          data-testid={`button-expand-${framework.id}`}
        >
          {expanded ? <ChevronUp className="w-3.5 h-3.5 mr-1" /> : <ChevronDown className="w-3.5 h-3.5 mr-1" />}
          {expanded ? "Hide Requirements" : `View ${framework.totalRequirements} Requirements`}
        </Button>

        {expanded && (
          <div className="mt-3 space-y-4">
            {categories.map((cat: any) => {
              const catReqs = framework.requirements.filter((r: any) => r.category === cat);
              const CatIcon = CATEGORY_ICONS[cat] || Shield;
              return (
                <div key={cat}>
                  <div className="flex items-center gap-2 mb-2">
                    <CatIcon className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{cat}</span>
                  </div>
                  <div className="space-y-1">
                    {catReqs.map((req: any) => (
                      <div
                        key={req.id}
                        className="flex items-start justify-between gap-3 py-2 px-3 rounded hover:bg-muted/50"
                        data-testid={`requirement-${req.id}`}
                      >
                        <div className="flex items-start gap-2 flex-1 min-w-0">
                          {req.isMet ? (
                            <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                          ) : (
                            <XCircle className="w-4 h-4 text-muted-foreground/40 shrink-0 mt-0.5" />
                          )}
                          <div className="min-w-0">
                            <p className="text-sm font-medium">
                              <span className="text-muted-foreground">{req.code}</span> — {req.title}
                            </p>
                            {req.description && (
                              <p className="text-xs text-muted-foreground mt-0.5">{req.description}</p>
                            )}
                            {req.linkedMetricIds?.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {req.linkedMetricIds.map((name: string) => (
                                  <Badge key={name} variant="outline" className="text-xs py-0 h-5">
                                    {name}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                        <Badge
                          variant={req.isMet ? "default" : "secondary"}
                          className={`text-xs shrink-0 ${req.isMet ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" : ""}`}
                          data-testid={`badge-requirement-status-${req.id}`}
                        >
                          {req.isMet ? "Met" : req.hasLinkedMetrics ? "Data needed" : "Policy only"}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function Compliance() {
  const { data: frameworkStatus, isLoading } = useQuery<any[]>({
    queryKey: ["/api/compliance/status"],
  });

  if (isLoading) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-4">
        <Skeleton className="h-8 w-64" />
        {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-48" />)}
      </div>
    );
  }

  const frameworks = frameworkStatus || [];
  const overallCompliance = frameworks.length > 0
    ? Math.round(frameworks.reduce((s, f) => s + f.compliancePercent, 0) / frameworks.length)
    : 0;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5" data-testid="page-compliance">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            Compliance Tracking
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Track your alignment with ESG reporting frameworks and standards
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Overall Compliance</p>
            <p className="text-2xl font-bold">{overallCompliance}%</p>
          </div>
          <ScoreRing score={overallCompliance} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {frameworks.map((fw: any) => (
          <Card key={fw.id} className="text-center">
            <CardContent className="pt-6 pb-4">
              <ScoreRing score={fw.compliancePercent} size={64} />
              <p className="text-sm font-medium mt-2">{fw.name}</p>
              <p className="text-xs text-muted-foreground">
                {fw.metRequirements}/{fw.totalRequirements} requirements met
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="space-y-4">
        {frameworks.map((fw: any) => (
          <FrameworkCard key={fw.id} framework={fw} />
        ))}
      </div>

      {frameworks.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <Shield className="w-10 h-10 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">No compliance frameworks configured</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
