import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  CheckSquare,
  ChevronDown,
  ClipboardList,
  FileCheck2,
  FileText,
  Gauge,
  Map,
  Shield,
  ShieldAlert,
  Target,
  UserRound,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { usePermissions } from "@/lib/permissions";
import {
  buildSmeImprovementPlan,
  countOpenImprovementItems,
  type ControlCentreData,
  type ControlCentreSection,
  type ImprovementPlanItem,
} from "@/lib/sme-improvement-plan";

const OPEN_WORK_AREAS: Array<{
  key: ControlCentreSection;
  label: string;
  description: string;
  href: string;
  icon: typeof AlertTriangle;
}> = [
  {
    key: "overdueActions",
    label: "Overdue actions",
    description: "Delivery tasks that have passed their due date.",
    href: "/actions",
    icon: CheckSquare,
  },
  {
    key: "missingData",
    label: "Missing data",
    description: "Current-period figures that still need to be entered.",
    href: "/data-entry",
    icon: ClipboardList,
  },
  {
    key: "expiredEvidence",
    label: "Expired evidence",
    description: "Sources that need to be renewed or replaced.",
    href: "/evidence",
    icon: FileCheck2,
  },
  {
    key: "lowQuality",
    label: "Data to strengthen",
    description: "Figures that need a stronger source, note or review.",
    href: "/data-entry",
    icon: BarChart3,
  },
  {
    key: "unmetCompliance",
    label: "Framework gaps",
    description: "Requirements that are not yet supported by your ESG data.",
    href: "/framework-readiness",
    icon: Shield,
  },
  {
    key: "pendingApprovals",
    label: "Pending reviews",
    description: "Submitted information waiting for an approver.",
    href: "/my-approvals",
    icon: FileCheck2,
  },
  {
    key: "unapprovedPolicies",
    label: "Policies to approve",
    description: "Draft company commitments that still need approval.",
    href: "/policy-templates",
    icon: FileText,
  },
];

const SPECIALIST_TOOLS = [
  {
    label: "Action tracker",
    description: "Create and update individual improvement tasks.",
    href: "/actions",
    icon: CheckSquare,
  },
  {
    label: "Targets and actions",
    description: "Set measurable outcomes and link delivery actions.",
    href: "/esg-targets",
    icon: Target,
  },
  {
    label: "Risk register",
    description: "Assess and manage material ESG risks.",
    href: "/esg-risks",
    icon: ShieldAlert,
  },
  {
    label: "Roadmap",
    description: "Sequence longer-term work across the year.",
    href: "/roadmap",
    icon: Map,
  },
];

function formatPlanDate(value: string | null): string {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not set";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function PlanItem({ item, position }: { item: ImprovementPlanItem; position: number }) {
  return (
    <article
      className="border-t border-border px-4 py-5 first:border-t-0 sm:px-6"
      data-testid={`improvement-plan-item-${item.type}-${item.id}`}
    >
      <div className="flex items-start gap-3 sm:gap-4">
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground"
          aria-label={`Priority ${position}`}
        >
          {position}
        </div>
        <div className="min-w-0 flex-1 space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold leading-snug">{item.title}</h3>
                <Badge variant={item.statusTone} className="shrink-0 text-xs">
                  {item.status}
                </Badge>
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground">
                <span className="font-medium text-foreground">Why this matters: </span>
                {item.why}
              </p>
            </div>
            <Button
              asChild
              variant={position === 1 ? "default" : "outline"}
              size="sm"
              className="w-full shrink-0 sm:w-auto"
              data-testid={`button-open-plan-item-${item.type}-${item.id}`}
            >
              <Link href={item.href}>
                {item.actionLabel}
                <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>

          <dl className="grid grid-cols-1 gap-3 rounded-lg bg-muted/45 p-3 sm:grid-cols-3">
            <div className="min-w-0">
              <dt className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <UserRound className="h-3.5 w-3.5" />
                Owner
              </dt>
              <dd className="mt-1 truncate text-sm" data-testid={`plan-owner-${item.type}-${item.id}`}>
                {item.owner}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <CalendarDays className="h-3.5 w-3.5" />
                Due date
              </dt>
              <dd className="mt-1 text-sm" data-testid={`plan-due-${item.type}-${item.id}`}>
                {formatPlanDate(item.dueDate)}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <FileCheck2 className="h-3.5 w-3.5" />
                Evidence or result
              </dt>
              <dd className="mt-1 text-sm" data-testid={`plan-evidence-${item.type}-${item.id}`}>
                {item.evidenceOrResult}
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </article>
  );
}

function Disclosure({
  testId,
  title,
  description,
  badge,
  children,
}: {
  testId: string;
  title: string;
  description: string;
  badge?: number;
  children: React.ReactNode;
}) {
  return (
    <details className="group rounded-lg border border-border bg-card" data-testid={testId}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg px-4 py-3 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">{title}</span>
            {badge !== undefined && <Badge variant="secondary">{badge}</Badge>}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        </div>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-border p-3 sm:p-4">{children}</div>
    </details>
  );
}

export default function ControlCentre() {
  const { data, isLoading } = useQuery<ControlCentreData>({ queryKey: ["/api/control-centre"] });
  const { can } = usePermissions();

  const plan = data ? buildSmeImprovementPlan(data, 3) : [];
  const totalOpen = data ? countOpenImprovementItems(data) : 0;
  const remainingOpen = Math.max(0, totalOpen - plan.length);

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6" data-testid="page-control-centre">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold" data-testid="text-improve-title">Action plan</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            The three most useful things to do next, based on your current data, evidence and commitments.
          </p>
        </div>
        {!isLoading && data && (
          <Badge variant={totalOpen > 0 ? "secondary" : "outline"} data-testid="badge-total-open-work">
            {totalOpen > 0 ? `${totalOpen} open item${totalOpen === 1 ? "" : "s"}` : "Plan clear"}
          </Badge>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-4" data-testid="improvement-plan-loading">
          <Skeleton className="h-20 w-full rounded-lg" />
          <Skeleton className="h-72 w-full rounded-lg" />
          <Skeleton className="h-14 w-full rounded-lg" />
        </div>
      ) : data ? (
        <>
          <div className="grid grid-cols-1 overflow-hidden rounded-lg border border-border bg-card sm:grid-cols-3" data-testid="improve-plan-summary">
            <div className="flex items-center gap-3 border-b border-border p-3 sm:border-b-0 sm:border-r">
              <ClipboardList className="h-4 w-4 text-primary" />
              <div>
                <p className="text-xs text-muted-foreground">In your short plan</p>
                <p className="text-sm font-semibold">{plan.length} next action{plan.length === 1 ? "" : "s"}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 border-b border-border p-3 sm:border-b-0 sm:border-r">
              <Gauge className="h-4 w-4 text-primary" />
              <div>
                <p className="text-xs text-muted-foreground">Gap indicator</p>
                <p className="text-sm font-semibold">{data.gapScore}/100 <span className="font-normal text-muted-foreground">· lower is better</span></p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3">
              <Shield className="h-4 w-4 text-primary" />
              <div>
                <p className="text-xs text-muted-foreground">Scope</p>
                <p className="text-sm font-semibold">Organisation-wide</p>
              </div>
            </div>
          </div>

          <Card data-testid="card-next-actions">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Your next actions</CardTitle>
              <p className="text-sm text-muted-foreground">
                Start with number 1. We combine the most urgent delivery, data, evidence and governance work here.
              </p>
            </CardHeader>
            <CardContent className="p-0">
              {plan.length > 0 ? (
                <>
                  {plan.map((item, index) => (
                    <PlanItem key={item.key} item={item} position={index + 1} />
                  ))}
                  {remainingOpen > 0 && (
                    <div className="border-t border-border bg-muted/25 px-4 py-3 text-center text-xs text-muted-foreground sm:px-6">
                      Showing the top {plan.length}. {remainingOpen} more open item{remainingOpen === 1 ? " is" : "s are"} available by area below.
                    </div>
                  )}
                </>
              ) : (
                <div className="px-5 py-12 text-center" data-testid="empty-improvement-plan">
                  <CheckCircle2 className="mx-auto h-10 w-10 text-green-600" />
                  <p className="mt-3 font-semibold">Your improvement plan is clear</p>
                  <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                    There are no overdue actions or open data, evidence, review, policy or framework gaps right now.
                  </p>
                  <Button asChild variant="outline" size="sm" className="mt-4">
                    <Link href="/actions">
                      {can("metrics_data_entry") ? "Plan a new action" : "View action tracker"}
                      <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Disclosure
            testId="disclosure-open-work"
            title="Open work by area"
            description="See the full workload without adding another dashboard."
            badge={totalOpen}
          >
            {totalOpen > 0 ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {OPEN_WORK_AREAS.filter((area) => data.summary[area.key] > 0).map((area) => {
                  const Icon = area.icon;
                  const count = data.summary[area.key];
                  return (
                    <Link
                      key={area.key}
                      href={area.href}
                      data-testid={`open-work-area-${area.key}`}
                    >
                      <div
                        className="flex h-full items-start gap-3 rounded-md border border-border p-3 transition-colors hover:bg-muted/35"
                      >
                        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-medium">{area.label}</p>
                            <Badge variant="secondary">{count}</Badge>
                          </div>
                          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{area.description}</p>
                        </div>
                        <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      </div>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No open work is waiting in any area.</p>
            )}
          </Disclosure>

          <Disclosure
            testId="disclosure-specialist-tools"
            title="Specialist planning tools"
            description="Use these when you need more detail than the simple plan above."
          >
            <div className="grid gap-2 sm:grid-cols-2">
              {SPECIALIST_TOOLS.map((tool) => {
                const Icon = tool.icon;
                return (
                  <Link key={tool.href} href={tool.href}>
                    <div
                      className="flex h-full items-start gap-3 rounded-md border border-border p-3 transition-colors hover:bg-muted/35"
                      data-testid={`specialist-tool-${tool.href.slice(1)}`}
                    >
                      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{tool.label}</p>
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{tool.description}</p>
                      </div>
                      <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    </div>
                  </Link>
                );
              })}
            </div>
          </Disclosure>
        </>
      ) : (
        <Card>
          <CardContent className="py-10 text-center">
            <AlertTriangle className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-2 text-sm text-muted-foreground">The improvement plan could not be loaded.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
