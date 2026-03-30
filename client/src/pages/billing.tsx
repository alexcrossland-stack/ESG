import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, XCircle, Zap, Crown, AlertCircle, Minus } from "lucide-react";
import { useEffect } from "react";

const COMPARISON_ROWS: {
  category: string;
  rows: { label: string; free: string | null; pro: string }[];
}[] = [
  {
    category: "AI Tools",
    rows: [
      {
        label: "AI Policy Generator",
        free: null,
        pro: "Generate complete, regulation-aware ESG policies from your answers",
      },
      {
        label: "AI Questionnaire Autofill",
        free: null,
        pro: "Auto-fill supplier & investor questionnaires from your existing data",
      },
      {
        label: "AI Support Assistant",
        free: null,
        pro: "Get instant, context-aware ESG guidance without leaving the platform",
      },
    ],
  },
  {
    category: "Reports",
    rows: [
      {
        label: "PDF & Word export",
        free: null,
        pro: "Download boardroom-ready reports to share with your board or investors",
      },
      {
        label: "Report templates",
        free: "Management summary only",
        pro: "All templates — Board Pack, Investor, Regulatory, and more",
      },
    ],
  },
  {
    category: "Questionnaires",
    rows: [
      {
        label: "Supplier & customer questionnaires",
        free: null,
        pro: "Create, manage, and respond to unlimited ESG questionnaires",
      },
    ],
  },
  {
    category: "Benchmarks",
    rows: [
      {
        label: "SME benchmark comparison",
        free: null,
        pro: "Compare your emissions, diversity, and governance to SME reference ranges",
      },
    ],
  },
  {
    category: "Team",
    rows: [
      {
        label: "Team seats",
        free: "Up to 3 members",
        pro: "Unlimited team members with role-based access",
      },
    ],
  },
  {
    category: "Data Import",
    rows: [
      {
        label: "CSV / Excel bulk import",
        free: null,
        pro: "Import a full year of ESG data from spreadsheets in one upload",
      },
    ],
  },
  {
    category: "Core platform",
    rows: [
      {
        label: "ESG metrics tracking",
        free: "Core metrics",
        pro: "Full metrics suite",
      },
      {
        label: "Evidence file storage",
        free: "Up to 10 files",
        pro: "Unlimited uploads",
      },
      {
        label: "Basic reporting",
        free: "✓",
        pro: "✓",
      },
      {
        label: "Carbon footprint calculator",
        free: "✓",
        pro: "✓",
      },
    ],
  },
];

export default function BillingPage() {
  const { toast } = useToast();
  const params = new URLSearchParams(window.location.search);
  const success = params.get("success");
  const cancelled = params.get("cancelled");

  useEffect(() => {
    if (success === "1") {
      toast({ title: "Subscription activated", description: "Your Pro plan is now active. Welcome to ESG Manager Pro!" });
      queryClient.invalidateQueries({ queryKey: ["/api/billing/status"] });
    }
    if (cancelled === "1") {
      toast({ title: "Checkout cancelled", description: "Your subscription was not changed.", variant: "default" });
    }
  }, []);

  const { data: billing, isLoading } = useQuery<{
    planTier: string;
    planStatus: string;
    currentPeriodEnd: string | null;
    stripeCustomerId: string | null;
    isBeta: boolean;
    betaExpiresAt: string | null;
    isComped: boolean;
    compedUntil: string | null;
  }>({
    queryKey: ["/api/billing/status"],
  });

  const checkoutMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/billing/create-checkout", {});
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      return data;
    },
    onError: (e: any) => {
      toast({ title: "Unable to start checkout", description: e.message, variant: "destructive" });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/billing/cancel", {});
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Subscription cancelled", description: "Your plan will revert to Free at the end of the current billing period." });
      queryClient.invalidateQueries({ queryKey: ["/api/billing/status"] });
    },
    onError: (e: any) => {
      toast({ title: "Cancellation failed", description: e.message, variant: "destructive" });
    },
  });

  const isPro = billing?.planTier === "pro";
  const isBeta = billing?.isBeta ?? false;
  const isComped = billing?.isComped ?? false;
  const isPastDue = billing?.planStatus === "past_due";
  const isCancelled = billing?.planStatus === "cancelled";

  const periodEnd = billing?.currentPeriodEnd
    ? new Date(billing.currentPeriodEnd).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
    : null;

  const betaExpiry = billing?.betaExpiresAt
    ? new Date(billing.betaExpiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
    : null;

  const compedExpiry = billing?.compedUntil
    ? new Date(billing.compedUntil).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
    : null;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Billing & Plan</h1>
        <p className="text-muted-foreground text-sm mt-1">Manage your subscription and billing settings.</p>
      </div>

      {isPastDue && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm" data-testid="alert-past-due">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>Your last payment failed. Please update your payment method to avoid service interruption.</span>
        </div>
      )}

      <div className="flex items-center gap-3 p-4 rounded-lg border bg-muted/30" data-testid="current-plan-summary">
        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
          {isPro ? <Crown className="w-5 h-5 text-primary" /> : <Zap className="w-5 h-5 text-muted-foreground" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm">{isPro ? "ESG Manager Pro" : "ESG Manager Free"}</p>
          {isComped && compedExpiry && (
            <p className="text-xs text-emerald-600 dark:text-emerald-400">Complimentary access · Expires {compedExpiry}</p>
          )}
          {!isComped && periodEnd && (
            <p className="text-xs text-muted-foreground">
              {isCancelled ? `Cancels on ${periodEnd}` : `Renews on ${periodEnd}`}
            </p>
          )}
        </div>
        <Badge
          variant={isPro ? "default" : "secondary"}
          className={isComped ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200 border-emerald-300" : "capitalize"}
          data-testid="badge-plan-tier"
        >
          {isComped ? "Complimentary Pro" : isPro && isBeta ? "Pro (Beta)" : billing?.planTier || "free"}
        </Badge>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <Card className={`relative ${!isPro ? "ring-2 ring-muted" : ""}`}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Free</CardTitle>
              <span className="text-xl font-bold">£0</span>
            </div>
            <CardDescription>Everything you need to get started with ESG reporting.</CardDescription>
          </CardHeader>
          <CardContent>
            {!isPro && (
              <Badge variant="outline" className="w-full justify-center">Current plan</Badge>
            )}
          </CardContent>
        </Card>

        <Card className={`relative ${isPro ? "ring-2 ring-primary" : ""}`}>
          {isPro && (
            <div className="absolute -top-3 left-1/2 -translate-x-1/2">
              <Badge className="shadow-sm">Current plan</Badge>
            </div>
          )}
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-1.5">
                <Crown className="w-4 h-4 text-primary" />
                Pro
              </CardTitle>
              <div className="text-right">
                <span className="text-xl font-bold">£49</span>
                <span className="text-xs text-muted-foreground">/mo</span>
              </div>
            </div>
            <CardDescription>Full AI-powered suite for serious sustainability programmes.</CardDescription>
          </CardHeader>
          <CardContent>
            {!isPro ? (
              <Button
                className="w-full"
                disabled={checkoutMutation.isPending}
                onClick={() => checkoutMutation.mutate()}
                data-testid="button-upgrade-pro"
              >
                {checkoutMutation.isPending ? "Loading..." : "Upgrade to Pro"}
              </Button>
            ) : (
              <Badge className="w-full justify-center bg-primary/10 text-primary hover:bg-primary/10 border border-primary/20">Active</Badge>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-1" data-testid="plan-comparison-table">
        <h2 className="text-base font-semibold">What's included</h2>
        <p className="text-sm text-muted-foreground">A full breakdown of what each plan includes.</p>

        <div className="mt-4 rounded-lg border border-border overflow-hidden">
          <div className="grid grid-cols-[1fr_auto_auto] bg-muted/50 border-b border-border">
            <div className="px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Feature</div>
            <div className="px-6 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-center w-28">Free</div>
            <div className="px-6 py-2.5 text-xs font-semibold text-primary uppercase tracking-wide text-center w-36 flex items-center gap-1 justify-center">
              <Crown className="w-3 h-3" /> Pro
            </div>
          </div>

          {COMPARISON_ROWS.map((section, si) => (
            <div key={section.category}>
              <div className="px-4 py-2 bg-muted/30 border-b border-border">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{section.category}</span>
              </div>
              {section.rows.map((row, ri) => (
                <div
                  key={row.label}
                  className={`grid grid-cols-[1fr_auto_auto] border-b border-border last:border-b-0 hover:bg-muted/20 transition-colors ${si === COMPARISON_ROWS.length - 1 && ri === section.rows.length - 1 ? "rounded-b-lg" : ""}`}
                  data-testid={`comparison-row-${row.label.replace(/\s+/g, "-").toLowerCase()}`}
                >
                  <div className="px-4 py-3 text-sm text-foreground">{row.label}</div>
                  <div className="px-4 py-3 w-28 flex items-center justify-center">
                    {row.free === null ? (
                      <XCircle className="w-4 h-4 text-muted-foreground/50" />
                    ) : row.free === "✓" ? (
                      <CheckCircle2 className="w-4 h-4 text-muted-foreground" />
                    ) : (
                      <span className="text-xs text-muted-foreground text-center leading-tight">{row.free}</span>
                    )}
                  </div>
                  <div className="px-4 py-3 w-36 flex items-start gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                    {row.pro === "✓" ? null : (
                      <span className="text-xs text-muted-foreground leading-snug">{row.pro}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>

        {!isPro && (
          <div className="pt-4">
            <Button
              className="w-full sm:w-auto gap-2"
              disabled={checkoutMutation.isPending}
              onClick={() => checkoutMutation.mutate()}
              data-testid="button-upgrade-pro-bottom"
            >
              <Zap className="w-4 h-4" />
              {checkoutMutation.isPending ? "Loading..." : "Upgrade to Pro — £49/month"}
            </Button>
            <p className="text-xs text-muted-foreground mt-2">No long-term contracts · Cancel anytime</p>
          </div>
        )}
      </div>

      {isComped && (
        <div className="flex items-start gap-3 p-4 rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-800" data-testid="banner-comped-access">
          <Crown className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">You have Complimentary Pro access.</p>
            {compedExpiry && (
              <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-0.5">This complimentary access expires on {compedExpiry}.</p>
            )}
          </div>
        </div>
      )}

      {isBeta && (
        <div className="flex items-start gap-3 p-4 rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-800" data-testid="banner-beta-access">
          <Crown className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-blue-800 dark:text-blue-300">You currently have beta access to Pro features.</p>
            {betaExpiry && (
              <p className="text-xs text-blue-700 dark:text-blue-400 mt-0.5">This access expires on {betaExpiry}.</p>
            )}
          </div>
        </div>
      )}

      {isPro && !isCancelled && !isBeta && !isComped && (
        <div className="border rounded-lg p-4 space-y-3">
          <p className="font-medium text-sm">Cancel subscription</p>
          <p className="text-sm text-muted-foreground">
            Your plan will remain active until the end of the current billing period ({periodEnd || "your period end"}), then revert to Free.
          </p>
          <Button
            variant="destructive"
            size="sm"
            disabled={cancelMutation.isPending}
            onClick={() => {
              if (window.confirm("Are you sure you want to cancel your Pro subscription?")) {
                cancelMutation.mutate();
              }
            }}
            data-testid="button-cancel-subscription"
          >
            {cancelMutation.isPending ? "Cancelling..." : "Cancel subscription"}
          </Button>
        </div>
      )}

      {isCancelled && (
        <div className="border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 rounded-lg p-4">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Subscription scheduled for cancellation</p>
          <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
            Your Pro features remain active until {periodEnd}. You can re-subscribe at any time.
          </p>
          <Button size="sm" className="mt-3" onClick={() => checkoutMutation.mutate()} data-testid="button-resubscribe">
            Re-subscribe
          </Button>
        </div>
      )}
    </div>
  );
}
