import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, Zap, Crown, AlertCircle } from "lucide-react";
import { useEffect } from "react";

const FREE_FEATURES = [
  "Up to 3 team members",
  "Core ESG metrics tracking",
  "Basic reporting",
  "Evidence file storage",
  "Community support",
];

const PRO_FEATURES = [
  "Unlimited team members",
  "Full ESG metrics suite",
  "AI-powered policy generator",
  "Advanced carbon calculator",
  "Questionnaire autofill (AI)",
  "Custom report templates",
  "Priority email support",
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
  const isPastDue = billing?.planStatus === "past_due";
  const isCancelled = billing?.planStatus === "cancelled";

  const periodEnd = billing?.currentPeriodEnd
    ? new Date(billing.currentPeriodEnd).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
    : null;

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
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
          {periodEnd && (
            <p className="text-xs text-muted-foreground">
              {isCancelled ? `Cancels on ${periodEnd}` : `Renews on ${periodEnd}`}
            </p>
          )}
        </div>
        <Badge variant={isPro ? "default" : "secondary"} className="capitalize" data-testid="badge-plan-tier">
          {billing?.planTier || "free"}
        </Badge>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <Card className={`relative ${!isPro ? "ring-2 ring-muted" : ""}`}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Free</CardTitle>
              <span className="text-xl font-bold">£0</span>
            </div>
            <CardDescription>Everything you need to get started with ESG.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {FREE_FEATURES.map(f => (
              <div key={f} className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="w-4 h-4 text-muted-foreground shrink-0" />
                <span>{f}</span>
              </div>
            ))}
            {!isPro && (
              <div className="pt-3">
                <Badge variant="outline" className="w-full justify-center">Current plan</Badge>
              </div>
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
            <CardDescription>Full suite for growing sustainability programmes.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {PRO_FEATURES.map(f => (
              <div key={f} className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                <span>{f}</span>
              </div>
            ))}
            {!isPro && (
              <div className="pt-3">
                <Button
                  className="w-full"
                  disabled={checkoutMutation.isPending}
                  onClick={() => checkoutMutation.mutate()}
                  data-testid="button-upgrade-pro"
                >
                  {checkoutMutation.isPending ? "Loading..." : "Upgrade to Pro"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {isPro && !isCancelled && (
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
