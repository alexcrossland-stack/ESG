import { Switch, Route, Redirect, useLocation } from "wouter";
import { queryClient, authFetch, StepUpRequiredError } from "./lib/queryClient";
import { QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeProvider, useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { Moon, Sun, TriangleAlert } from "lucide-react";
import { SupportAssistant } from "@/components/support-assistant";
import { useEffect, useRef, Component, useState, createContext, useContext, useCallback, type ComponentType } from "react";
import type { ReactNode, ErrorInfo } from "react";
import { StepUpDialog } from "@/pages/settings";
import NotFound from "@/pages/not-found";
import Auth from "@/pages/auth";
import Dashboard from "@/pages/dashboard";
import Policy from "@/pages/policy";
import Topics from "@/pages/topics";
import Metrics from "@/pages/metrics";
import MetricsLibrary from "@/pages/metrics-library";
import DataEntry from "@/pages/data-entry";
import Actions from "@/pages/actions";
import Reports from "@/pages/reports";
import Settings from "@/pages/settings";
import QuestionnairePage from "@/pages/questionnaire";
import PolicyGenerator from "@/pages/policy-generator";
import CarbonCalculator from "@/pages/carbon-calculator";
import PolicyTemplatesPage from "@/pages/policy-templates";
import Evidence from "@/pages/evidence";
import Onboarding from "@/pages/onboarding";
import Recommendations from "@/pages/recommendations";
import MyTasks from "@/pages/my-tasks";
import MyApprovals from "@/pages/my-approvals";
import Compliance from "@/pages/compliance";
import AnswerLibrary from "@/pages/answer-library";
import ControlCentre from "@/pages/control-centre";
import BenchmarksPage from "@/pages/benchmarks";
import EsgProfilePage from "@/pages/esg-profile";
import PublicProfilePage from "@/pages/public-profile";
import AdminHealthPage from "@/pages/admin-health";
import AdminAnalyticsPage from "@/pages/admin-analytics";
import HelpPage from "@/pages/help";
import HelpArticlePage from "@/pages/help-article";
import AdminSupportPage from "@/pages/admin-support";
import AdminPage from "@/pages/admin";
import AdminCompanyPage from "@/pages/admin-company";
import AdminEsgPage from "@/pages/admin-esg";
import AdminSecurityPage from "@/pages/admin-security";
import BillingPage from "@/pages/billing";
import TeamPage from "@/pages/team";
import SitesPage from "@/pages/sites";
import SiteDashboardPage from "@/pages/site-dashboard";
import { TermsPage, PrivacyPage, CookiesPage, DpaPage } from "@/pages/legal";
import MaterialityPage from "@/pages/materiality";
import EsgPolicyRegisterPage from "@/pages/esg-policy-register";
import EsgTargetsPage from "@/pages/esg-targets";
import EsgRisksPage from "@/pages/esg-risks";
import { AppFooter } from "@/components/app-footer";
import { SiteProvider } from "@/hooks/use-site-context";
import FrameworkSettingsPage from "@/pages/framework-settings";
import FrameworkReadinessPage from "@/pages/framework-readiness";
import PortfolioPage from "@/pages/portfolio";
import CreateCompanyPage from "@/pages/create-company";

// ============================================================
// GLOBAL STEP-UP AUTHENTICATION CONTEXT
// ============================================================

interface StepUpContextValue {
  requestStepUp: (onComplete: () => void) => void;
}

const StepUpContext = createContext<StepUpContextValue>({ requestStepUp: () => {} });

export function useStepUp() {
  return useContext(StepUpContext);
}

function StepUpProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const pendingCallback = useRef<(() => void) | null>(null);

  const requestStepUp = useCallback((onComplete: () => void) => {
    pendingCallback.current = onComplete;
    setOpen(true);
  }, []);

  const handleSuccess = useCallback(() => {
    setOpen(false);
    const cb = pendingCallback.current;
    pendingCallback.current = null;
    if (cb) cb();
  }, []);

  const handleClose = useCallback(() => {
    setOpen(false);
    pendingCallback.current = null;
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<{ retry: () => void }>;
      requestStepUp(ce.detail.retry);
    };
    window.addEventListener("stepup-required", handler);
    return () => window.removeEventListener("stepup-required", handler);
  }, [requestStepUp]);

  return (
    <StepUpContext.Provider value={{ requestStepUp }}>
      {children}
      <StepUpDialog open={open} onClose={handleClose} onSuccess={handleSuccess} />
    </StepUpContext.Provider>
  );
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

class AppErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error.message || "An unexpected error occurred" };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    fetch("/api/health/client-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: error.message,
        stack: error.stack,
        componentStack: info.componentStack,
        url: window.location.href,
      }),
    }).catch(() => {});
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
          <div className="max-w-md w-full text-center space-y-4">
            <div className="w-12 h-12 rounded-xl bg-destructive/10 flex items-center justify-center mx-auto">
              <TriangleAlert className="w-6 h-6 text-destructive" />
            </div>
            <h1 className="text-xl font-semibold">Something went wrong</h1>
            <p className="text-sm text-muted-foreground">{this.state.message}</p>
            <Button onClick={() => window.location.reload()} data-testid="button-reload">
              Reload page
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  return (
    <Button size="icon" variant="ghost" onClick={toggleTheme} data-testid="button-theme-toggle">
      {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </Button>
  );
}

function usePageTracking() {
  const [location] = useLocation();
  const lastTracked = useRef("");
  const debounceTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (location === lastTracked.current) return;
    lastTracked.current = location;

    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      authFetch("/api/activity/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "page_view", page: location }),
      }).catch(() => {});
    }, 500);
  }, [location]);
}

function SuperAdminRoute({ component: Component }: { component: ComponentType<any> }) {
  const { data, isLoading } = useQuery<{ user: any; company: any }>({
    queryKey: ["/api/auth/me"],
    retry: false,
  });
  if (isLoading) return null;
  if (!data?.user || data.user.role !== "super_admin") return <Redirect to="/" />;
  return <Component />;
}

function ImpersonationBanner() {
  const { data } = useQuery<{ isImpersonating: boolean; companyId?: string; companyName?: string }>({
    queryKey: ["/api/admin/impersonation/status"],
    refetchInterval: 30000,
  });

  if (!data?.isImpersonating) return null;

  const exit = async () => {
    await fetch("/api/admin/impersonation/exit", { method: "POST", credentials: "include" });
    window.location.href = "/admin";
  };

  return (
    <div className="bg-amber-500 text-white text-sm px-4 py-2 flex items-center justify-between shrink-0" data-testid="banner-impersonation">
      <span>
        Viewing as <strong>{data.companyName}</strong> (Impersonation Mode)
      </span>
      <Button size="sm" variant="secondary" onClick={exit} data-testid="button-exit-impersonation">
        Return to Admin
      </Button>
    </div>
  );
}

function ConsentBanner() {
  const { data } = useQuery<{ user: any; company: any; consentOutdated?: boolean }>({
    queryKey: ["/api/auth/me"],
  });
  const queryClient = useQueryClient();

  const accept = async () => {
    await fetch("/api/auth/accept-terms", { method: "POST", credentials: "include" });
    queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
  };

  if (!data?.consentOutdated) return null;

  return (
    <div className="bg-yellow-500 text-white text-sm px-4 py-2 flex items-center justify-between shrink-0" data-testid="banner-consent-outdated">
      <span>Our terms and privacy policy have been updated. Please review and accept them to continue using the platform.</span>
      <Button size="sm" variant="secondary" onClick={accept} data-testid="button-accept-terms-banner">
        Accept
      </Button>
    </div>
  );
}

const PORTFOLIO_ROLES = ["portfolio_owner", "portfolio_viewer", "super_admin"];

function ProtectedApp() {
  const { data, isLoading } = useQuery<{ user: any; company: any; defaultLandingContext?: string; portfolioGroups?: any[] }>({
    queryKey: ["/api/auth/me"],
    retry: false,
  });
  const [location] = useLocation();

  usePageTracking();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!data?.user) {
    return <Redirect to="/auth" />;
  }

  const isPortfolioUser = PORTFOLIO_ROLES.includes(data?.user?.role);

  // A company needs onboarding when onboardingComplete is falsy.
  // onboardingComplete is the authoritative flag — it is set to true (and lifecycleState
  // updated to "active") by POST /api/onboarding/complete, so we do not let a stale
  // lifecycleState override a completed flag.
  const needsOnboarding = !data?.company?.onboardingComplete;

  if (data?.user?.role !== "super_admin" && !isPortfolioUser && needsOnboarding) {
    return <Onboarding />;
  }

  // Post-login redirect logic (deterministic, applied only at root path):
  // 1. Portfolio users with multiple accessible companies  → /portfolio
  // 2. Single-company users with a direct company         → /  (dashboard)
  // 3. Newly provisioned company (admin who just created) → / (dashboard or will hit onboarding above)
  const hasPortfolioRedirectParam = typeof window !== "undefined" && (
    new URLSearchParams(window.location.search).get("from") === "portfolio" ||
    new URLSearchParams(window.location.search).get("portfolioCompanyId")
  );
  // Use defaultLandingContext from server-side access resolution (resolvePortfolioAccess)
  // as the authoritative landing decision. This handles mixed-access users correctly —
  // a user can have group memberships even if their global role is not a portfolio role.
  if (
    location === "/" &&
    !hasPortfolioRedirectParam &&
    data?.defaultLandingContext === "portfolio" &&
    (data?.portfolioGroups?.length || 0) > 0
  ) {
    return <Redirect to="/portfolio" />;
  }

  return (
    <SiteProvider>
    <SidebarProvider style={{ "--sidebar-width": "14rem", "--sidebar-width-icon": "3rem" } as React.CSSProperties}>
      <div className="flex h-screen w-full bg-background">
        <AppSidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <ImpersonationBanner />
          <ConsentBanner />
          <header className="flex items-center justify-between px-4 py-2 border-b border-border bg-background shrink-0">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <ThemeToggle />
          </header>
          <main className="flex-1 overflow-auto">
            <AppErrorBoundary>
              <Switch>
                <Route path="/" component={Dashboard} />
                <Route path="/control-centre" component={ControlCentre} />
                <Route path="/policy" component={Policy} />
                <Route path="/topics" component={Topics} />
                <Route path="/metrics" component={Metrics} />
                <Route path="/metrics-library" component={MetricsLibrary} />
                <Route path="/data-entry" component={DataEntry} />
                <Route path="/actions" component={Actions} />
                <Route path="/evidence" component={Evidence} />
                <Route path="/reports" component={Reports} />
                <Route path="/policy-generator" component={PolicyGenerator} />
                <Route path="/policy-templates" component={PolicyTemplatesPage} />
                <Route path="/carbon-calculator" component={CarbonCalculator} />
                <Route path="/settings" component={Settings} />
                <Route path="/questionnaire" component={QuestionnairePage} />
                <Route path="/my-tasks" component={MyTasks} />
                <Route path="/my-approvals" component={MyApprovals} />
                <Route path="/compliance" component={Compliance} />
                <Route path="/answer-library" component={AnswerLibrary} />
                <Route path="/benchmarks" component={BenchmarksPage} />
                <Route path="/esg-profile" component={EsgProfilePage} />
                <Route path="/admin" component={() => <SuperAdminRoute component={AdminPage} />} />
                <Route path="/admin/companies/:companyId" component={() => <SuperAdminRoute component={AdminCompanyPage} />} />
                <Route path="/admin/health" component={() => <SuperAdminRoute component={AdminHealthPage} />} />
                <Route path="/admin/analytics" component={() => <SuperAdminRoute component={AdminAnalyticsPage} />} />
                <Route path="/admin/support" component={() => <SuperAdminRoute component={AdminSupportPage} />} />
                <Route path="/admin/esg" component={() => <SuperAdminRoute component={AdminEsgPage} />} />
                <Route path="/admin/security" component={() => <SuperAdminRoute component={AdminSecurityPage} />} />
                <Route path="/billing" component={BillingPage} />
                <Route path="/onboarding" component={Onboarding} />
                <Route path="/recommendations" component={Recommendations} />
                <Route path="/team" component={TeamPage} />
                <Route path="/settings/sites" component={SitesPage} />
                <Route path="/sites" component={SitesPage} />
                <Route path="/sites/:siteId/dashboard" component={SiteDashboardPage} />
                <Route path="/help" component={HelpPage} />
                <Route path="/help/:slug" component={HelpArticlePage} />
                <Route path="/framework-settings" component={FrameworkSettingsPage} />
                <Route path="/framework-readiness" component={FrameworkReadinessPage} />
                <Route path="/portfolio" component={PortfolioPage} />
                <Route path="/create-company" component={CreateCompanyPage} />
                <Route path="/materiality" component={MaterialityPage} />
                <Route path="/esg-policy-register" component={EsgPolicyRegisterPage} />
                <Route path="/esg-targets" component={EsgTargetsPage} />
                <Route path="/esg-risks" component={EsgRisksPage} />
                <Route component={NotFound} />
              </Switch>
            </AppErrorBoundary>
          </main>
          <AppFooter />
        </div>
      </div>
      <SupportAssistant />
    </SidebarProvider>
    </SiteProvider>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/auth" component={Auth} />
      <Route path="/terms" component={TermsPage} />
      <Route path="/privacy" component={PrivacyPage} />
      <Route path="/cookies" component={CookiesPage} />
      <Route path="/dpa" component={DpaPage} />
      <Route path="/public/esg/:token" component={PublicProfilePage} />
      <Route component={ProtectedApp} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <Toaster />
          <StepUpProvider>
            <Router />
          </StepUpProvider>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
