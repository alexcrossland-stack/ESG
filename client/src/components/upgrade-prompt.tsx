import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Lock, Sparkles, ArrowRight, Zap } from "lucide-react";
import { Link } from "wouter";

export function useBillingStatus() {
  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/billing/status"],
  });
  const isPro = data?.planTier === "pro";
  const isBeta = data?.isBeta === true;
  return { billing: data, isPro, isBeta, isLoading };
}

interface UpgradeButtonProps {
  feature: string;
  children: React.ReactNode;
  className?: string;
  size?: "sm" | "default" | "lg";
  "data-testid"?: string;
}

export function UpgradeButton({ feature, children, className, size = "default", "data-testid": testId }: UpgradeButtonProps) {
  return (
    <Link href="/billing">
      <Button
        variant="outline"
        size={size}
        className={`relative gap-2 border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-950 ${className ?? ""}`}
        data-testid={testId ?? `upgrade-button-${feature.replace(/\s+/g, "-").toLowerCase()}`}
      >
        <Lock className="w-3.5 h-3.5 shrink-0" />
        {children}
        <Badge
          variant="outline"
          className="ml-1 text-[10px] px-1.5 py-0 h-4 border-amber-400 text-amber-700 dark:border-amber-600 dark:text-amber-400 font-semibold"
        >
          Pro
        </Badge>
      </Button>
    </Link>
  );
}

interface UpgradePageGateProps {
  feature: string;
  title?: string;
  description?: string;
  icon?: React.ReactNode;
  bullets?: string[];
}

export function UpgradePageGate({
  feature,
  title,
  description,
  icon,
  bullets,
}: UpgradePageGateProps) {
  return (
    <div className="flex items-center justify-center min-h-[60vh] p-6" data-testid={`upgrade-gate-${feature.replace(/\s+/g, "-").toLowerCase()}`}>
      <Card className="max-w-md w-full border-amber-200 dark:border-amber-800 shadow-sm">
        <CardContent className="pt-8 pb-8 text-center space-y-4">
          <div className="w-14 h-14 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mx-auto">
            {icon ?? <Lock className="w-6 h-6 text-amber-600 dark:text-amber-400" />}
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">{title ?? `${feature} requires Pro`}</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {description ?? `Upgrade to the Pro plan to unlock ${feature} and the full ESG toolkit for your business.`}
            </p>
          </div>

          {bullets && bullets.length > 0 && (
            <ul className="text-left space-y-1.5 text-sm text-muted-foreground">
              {bullets.map((b, i) => (
                <li key={i} className="flex items-start gap-2">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          )}

          <Link href="/billing">
            <Button className="w-full gap-2 mt-2 bg-amber-500 hover:bg-amber-600 text-white" data-testid="button-upgrade-cta">
              <Zap className="w-4 h-4" />
              Upgrade to Pro
              <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
          <p className="text-xs text-muted-foreground">No long-term contracts · Cancel anytime</p>
        </CardContent>
      </Card>
    </div>
  );
}

interface UpgradeOverlayProps {
  feature: string;
  title?: string;
  description?: string;
  children: React.ReactNode;
}

export function UpgradeOverlay({ feature, title, description, children }: UpgradeOverlayProps) {
  return (
    <div className="relative" data-testid={`upgrade-overlay-${feature.replace(/\s+/g, "-").toLowerCase()}`}>
      <div className="pointer-events-none select-none" style={{ filter: "blur(4px)", opacity: 0.4 }}>
        {children}
      </div>
      <div className="absolute inset-0 flex items-center justify-center">
        <Card className="border-amber-200 dark:border-amber-800 shadow-lg max-w-sm w-full mx-4">
          <CardContent className="pt-6 pb-6 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mx-auto">
              <Lock className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="space-y-1">
              <p className="font-semibold text-sm">{title ?? `Unlock ${feature}`}</p>
              <p className="text-xs text-muted-foreground">{description ?? `This insight is available on the Pro plan.`}</p>
            </div>
            <Link href="/billing">
              <Button size="sm" className="gap-1.5 bg-amber-500 hover:bg-amber-600 text-white" data-testid="button-overlay-upgrade">
                <Zap className="w-3.5 h-3.5" />
                Upgrade to Pro
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

interface UpgradeLimitBannerProps {
  current: number;
  limit: number;
  noun: string;
  feature: string;
  "data-testid"?: string;
}

export function UpgradeLimitBanner({ current, limit, noun, feature, "data-testid": testId }: UpgradeLimitBannerProps) {
  const atLimit = current >= limit;
  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm ${atLimit ? "border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30" : "border-border bg-muted/40"}`}
      data-testid={testId ?? `limit-banner-${noun}`}
    >
      <div className="flex items-center gap-2">
        {atLimit ? <Lock className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" /> : <Sparkles className="w-4 h-4 text-muted-foreground shrink-0" />}
        <span className={atLimit ? "text-amber-800 dark:text-amber-300 font-medium" : "text-muted-foreground"}>
          {atLimit
            ? `${noun} limit reached (${current}/${limit}) — upgrade to add more`
            : `${current} of ${limit} ${noun.toLowerCase()} used on Free plan`}
        </span>
      </div>
      {atLimit && (
        <Link href="/billing">
          <Button variant="outline" size="sm" className="h-7 text-xs border-amber-400 text-amber-700 hover:bg-amber-100 dark:border-amber-600 dark:text-amber-400 shrink-0" data-testid={`button-upgrade-${feature}`}>
            Upgrade
          </Button>
        </Link>
      )}
    </div>
  );
}
