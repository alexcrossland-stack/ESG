import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeProvider, useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { Moon, Sun } from "lucide-react";
import NotFound from "@/pages/not-found";
import Auth from "@/pages/auth";
import Dashboard from "@/pages/dashboard";
import Policy from "@/pages/policy";
import Topics from "@/pages/topics";
import Metrics from "@/pages/metrics";
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
import MyTasks from "@/pages/my-tasks";
import MyApprovals from "@/pages/my-approvals";
import Compliance from "@/pages/compliance";

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  return (
    <Button size="icon" variant="ghost" onClick={toggleTheme} data-testid="button-theme-toggle">
      {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </Button>
  );
}

function ProtectedApp() {
  const { data, isLoading } = useQuery<{ user: any; company: any }>({
    queryKey: ["/api/auth/me"],
    retry: false,
  });

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

  if (!data?.company?.onboardingComplete) {
    return <Onboarding />;
  }

  return (
    <SidebarProvider style={{ "--sidebar-width": "14rem", "--sidebar-width-icon": "3rem" } as React.CSSProperties}>
      <div className="flex h-screen w-full bg-background">
        <AppSidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <header className="flex items-center justify-between px-4 py-2 border-b border-border bg-background shrink-0">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <ThemeToggle />
          </header>
          <main className="flex-1 overflow-auto">
            <Switch>
              <Route path="/" component={Dashboard} />
              <Route path="/policy" component={Policy} />
              <Route path="/topics" component={Topics} />
              <Route path="/metrics" component={Metrics} />
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
              <Route component={NotFound} />
            </Switch>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/auth" component={Auth} />
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
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
