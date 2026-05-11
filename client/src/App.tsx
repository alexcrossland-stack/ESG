import { Switch, Route, Redirect, useLocation, Link } from "wouter";
import { queryClient, authFetch, StepUpRequiredError } from "./lib/queryClient";
import { QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeProvider, useTheme } from "@/components/theme-provider";
import { StepUpDialog } from "@/components/step-up-dialog";
import { Button } from "@/components/ui/button";
import { Moon, Sun, TriangleAlert } from "lucide-react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { SupportAssistant } from "@/components/support-assistant";
import { useEffect, useRef, Component, useState, createContext, useContext, useCallback, Fragment, lazy, Suspense, type ComponentType, type LazyExoticComponent } from "react";
import type { ReactNode, ErrorInfo } from "react";
import NotFound from "@/pages/not-found";
import Auth from "@/pages/auth";
import Onboarding from "@/pages/onboarding";
import PublicProfilePage from "@/pages/public-profile";
import { TermsPage, PrivacyPage, CookiesPage, DpaPage } from "@/pages/legal";
import { AppFooter } from "@/components/app-footer";
import { SiteProvider } from "@/hooks/use-site-context";
import { getBreadcrumbs } from "@/lib/navigation";

const Dashboard = lazy(() => import("@/pages/dashboard"));
const ControlCentre = lazy(() => import("@/pages/control-centre"));
const Policy = lazy(() => import("@/pages/policy"));
const Topics = lazy(() => import("@/pages/topics"));
const Metrics = lazy(() => import("@/pages/metrics"));
const MetricsLibrary = lazy(() => import("@/pages/metrics-library"));
const DataEntry = lazy(() => import("@/pages/data-entry"));
const Actions = lazy(() => import("@/pages/actions"));
const Evidence = lazy(() => import("@/pages/evidence"));
const Reports = lazy(() => import("@/pages/reports"));
const PolicyGenerator = lazy(() => import("@/pages/policy-generator"));
const PolicyTemplatesPage = lazy(() => import("@/pages/policy-templates"));
const CarbonCalculator = lazy(() => import("@/pages/carbon-calculator"));
const Settings = lazy(() => import("@/pages/settings"));
const QuestionnairePage = lazy(() => import("@/pages/questionnaire"));
const MyTasks = lazy(() => import("@/pages/my-tasks"));
const MyApprovals = lazy(() => import("@/pages/my-approvals"));
const Compliance = lazy(() => import("@/pages/compliance"));
const AnswerLibrary = lazy(() => import("@/pages/answer-library"));
const BenchmarksPage = lazy(() => import("@/pages/benchmarks"));
const EsgProfilePage = lazy(() => import("@/pages/esg-profile"));
const RoadmapPage = lazy(() => import("@/pages/roadmap"));
const AdminPage = lazy(() => import("@/pages/admin"));
const AdminCompanyPage = lazy(() => import("@/pages/admin-company"));
const AdminHealthPage = lazy(() => import("@/pages/admin-health"));
const AdminAnalyticsPage = lazy(() => import("@/pages/admin-analytics"));
const AdminSupportPage = lazy(() => import("@/pages/admin-support"));
const AdminEsgPage = lazy(() => import("@/pages/admin-esg"));
const AdminSecurityPage = lazy(() => import("@/pages/admin-security"));
const BillingPage = lazy(() => import("@/pages/billing"));
const Recommendations = lazy(() => import("@/pages/recommendations"));
const TeamPage = lazy(() => import("@/pages/team"));
const SitesPage = lazy(() => import("@/pages/sites"));
const SiteDashboardPage = lazy(() => import("@/pages/site-dashboard"));
const HelpPage = lazy(() => import("@/pages/help"));
const HelpArticlePage = lazy(() => import("@/pages/help-article"));
const FrameworkSettingsPage = lazy(() => import("@/pages/framework-settings"));
const FrameworkReadinessPage = lazy(() => import("@/pages/framework-readiness"));
const PortfolioPage = lazy(() => import("@/pages/portfolio"));
const CreateCompanyPage = lazy(() => import("@/pages/create-company"));
const MaterialityPage = lazy(() => import("@/pages/materiality"));
const EsgPolicyRegisterPage = lazy(() => import("@/pages/esg-policy-register"));
const EsgTargetsPage = lazy(() => import("@/pages/esg-targets"));
const EsgRisksPage = lazy(() => import("@/pages/esg-risks"));

// ============================================================
// GLOBAL STEP-UP AUTHENTICATION CONTEXT
// ============================================================

interface StepUpContextValue {
  requestStepUp: (onComplete: () => void) => void;
}

const StepUpContext = createContext<StepUpContextValue>({ requestStepUp: () => {} });
type RoutableComponent = ComponentType<any> | LazyExoticComponent<ComponentType<any>>;

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

class SidebarErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error.message || "Sidebar error" };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    fetch("/api/health/client-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `[Sidebar] ${error.message}`,
        stack: error.stack,
        componentStack: info.componentStack,
        url: window.location.href,
      }),
    }).catch(() => {});
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="w-14 flex flex-col items-center py-4 border-r border-border bg-sidebar shrink-0" data-testid="sidebar-error-fallback">
          <div className="w-8 h-8 rounded-md bg-destructive/10 flex items-center justify-center">
            <TriangleAlert className="w-4 h-4 text-destructive" />
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

class SupportAssistantErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error.message || "Component error" };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    fetch("/api/health/client-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `[SupportAssistant] ${error.message}`,
        stack: error.stack,
        componentStack: info.componentStack,
        url: window.location.href,
      }),
    }).catch(() => {});
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2 shadow-md" data-testid="support-assistant-error">
          <TriangleAlert className="w-4 h-4 text-destructive shrink-0" />
          <span className="text-xs text-destructive font-medium">Something went wrong</span>
          <Button size="sm" variant="outline" className="h-6 text-xs px-2" onClick={() => window.location.reload()} data-testid="button-support-reload">
            Reload page
          </Button>
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

function PageFallback() {
  return (
    <div className="flex items-center justify-center min-h-[18rem]">
      <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
    </div>
  );
}

function AppBreadcrumbs() {
  const [location] = useLocation();
  const items = getBreadcrumbs(location);

  if (items.length === 0) return null;

  return (
    <Breadcrumb data-testid="app-breadcrumbs">
      <BreadcrumbList>
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <Fragment key={`${item.label}-${index}`}>
              <BreadcrumbItem>
                {isLast || !item.href ? (
                  <BreadcrumbPage data-testid={`breadcrumb-${item.label.toLowerCase().replace(/\s+/g, "-")}`}>
                    {item.label}
                  </BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link href={item.href} data-testid={`breadcrumb-${item.label.toLowerCase().replace(/\s+/g, "-")}`}>
                      {item.label}
                    </Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {!isLast && <BreadcrumbSeparator />}
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
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

function SuperAdminRoute({ component: Component }: { component: RoutableComponent }) {
  const { data, isLoading } = useQuery<{ user: any; company: any }>({
    queryKey: ["/api/auth/me"],
    retry: false,
  });
  if (isLoading) return null;
  if (!data?.user || data.user.role !== "super_admin") return <Redirect to="/" />;
  return <Component />;
}

function ImpersonationBanner() {
  const { data } = useQuery<{ isImpersonating: boolean; companyId?: string; companyName?: string; supportMode?: string }>({
    queryKey: ["/api/admin/impersonation/status"],
    refetchInterval: 30000,
  });

  if (!data?.isImpersonating) return null;

  const exit = async () => {
    await fetch("/api/admin/impersonation/exit", { method: "POST", credentials: "include" });
    window.location.href = "/admin";
  };

  const isReadOnly = !data.supportMode || data.supportMode === "read_only";

  return (
    <div
      className="bg-amber-600 text-white text-sm px-4 py-2 flex items-center justify-between shrink-0 border-b-2 border-amber-800"
      data-testid="banner-impersonation"
    >
      <div className="flex items-center gap-3">
        <span className="bg-amber-800/50 text-white text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded" data-testid="badge-support-mode">
          {isReadOnly ? "Read-Only Support Mode" : "Support Mode"}
        </span>
        <span>
          Viewing <strong>{data.companyName}</strong> as admin
          {isReadOnly && <span className="text-amber-200 ml-2 text-xs">— changes made here are not saved</span>}
        </span>
      </div>
      <Button size="sm" variant="secondary" onClick={exit} data-testid="button-exit-impersonation">
        Exit Support Mode
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
    return <Redirect to="/auth" replace />;
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
    return <Redirect to="/portfolio" replace />;
  }

  return (
    <SiteProvider>
    <SidebarProvider style={{ "--sidebar-width": "14rem", "--sidebar-width-icon": "3rem" } as React.CSSProperties}>
      <div className="flex h-screen w-full bg-background">
        <SidebarErrorBoundary><AppSidebar /></SidebarErrorBoundary>
        <div className="flex flex-col flex-1 min-w-0">
          <ImpersonationBanner />
          <ConsentBanner />
          <header className="flex items-center justify-between gap-3 px-4 py-2 border-b border-border bg-background shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <SidebarTrigger data-testid="button-sidebar-toggle" />
              <AppBreadcrumbs />
            </div>
            <ThemeToggle />
          </header>
          <main className="flex-1 overflow-auto">
            <AppErrorBoundary>
              <Suspense fallback={<PageFallback />}>
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
                  <Route path="/roadmap" component={RoadmapPage} />
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
              </Suspense>
            </AppErrorBoundary>
          </main>
          <AppFooter />
        </div>
      </div>
      <SupportAssistantErrorBoundary><SupportAssistant /></SupportAssistantErrorBoundary>
    </SidebarProvider>
    </SiteProvider>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/invite" component={Auth} />
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
