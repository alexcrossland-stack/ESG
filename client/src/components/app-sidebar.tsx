import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarHeader, SidebarFooter, SidebarSeparator,
  SidebarMenuSub, SidebarMenuSubItem, SidebarMenuSubButton,
} from "@/components/ui/sidebar";
import { usePortfolioAccess } from "@/hooks/use-portfolio-access";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  LayoutDashboard, FileText, Target, BarChart3, ClipboardList,
  Download, Settings, LogOut, Leaf, ChevronDown,
  Wand2, Calculator, FileQuestion, Library, FileCheck, Bell,
  ClipboardCheck, ListChecks, Shield, Bookmark, Gauge,
  TrendingUp, Building2, Sparkles, HelpCircle,
  Users, ChevronRight, MapPin, Globe, BookOpen,
  Star, AlertTriangle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { logout } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import { usePermissions } from "@/lib/permissions";
import { useSiteContext } from "@/hooks/use-site-context";
import {
  DATA_AND_METRICS_ITEMS,
  DATA_AND_METRICS_ROUTES,
  DATA_EVIDENCE_ROUTES,
  ESG_SETUP_ADVANCED_PRIMARY_ITEMS,
  ESG_SETUP_ADVANCED_ROUTES,
  ESG_SETUP_ADVANCED_SUPPORT_ITEMS,
  ESG_SETUP_ROUTES,
  isActive,
  isGroupActive,
  type NavItem,
} from "@/lib/navigation";

const STORAGE_KEY = "sidebar_collapsed_groups";

function useGroupState(groupKey: string, defaultOpen: boolean) {
  const [open, setOpen] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (typeof parsed[groupKey] === "boolean") return parsed[groupKey];
      }
    } catch {}
    return defaultOpen;
  });

  const toggle = (value: boolean) => {
    setOpen(value);
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      const parsed = stored ? JSON.parse(stored) : {};
      parsed[groupKey] = value;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
    } catch {}
  };

  return [open, toggle] as const;
}

const ICON_BY_HREF: Record<string, LucideIcon> = {
  "/policy": FileText,
  "/topics": Target,
  "/esg-profile": Building2,
  "/team": Users,
  "/framework-readiness": Globe,
  "/framework-settings": Settings,
  "/materiality": Star,
  "/esg-targets": Target,
  "/esg-risks": AlertTriangle,
  "/compliance": Shield,
  "/benchmarks": TrendingUp,
  "/recommendations": Sparkles,
  "/my-tasks": ClipboardCheck,
  "/my-approvals": ListChecks,
  "/questionnaire": FileQuestion,
  "/carbon-calculator": Calculator,
  "/policy-templates": Library,
  "/policy-generator": Wand2,
  "/answer-library": Bookmark,
  "/control-centre": Gauge,
  "/metrics": BarChart3,
  "/metrics-library": BookOpen,
  "/data-entry": ClipboardList,
  "/esg-policy-register": FileText,
  "/evidence": FileCheck,
};

function navTestId(label: string) {
  return `nav-${label.toLowerCase().replace(/&/g, "and").replace(/\s+/g, "-")}`;
}

interface NavBadgeProps { show: boolean }
function NextBadge({ show }: NavBadgeProps) {
  if (!show) return null;
  return (
    <span className="ml-auto shrink-0 text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-primary/10 text-primary leading-tight">
      Next
    </span>
  );
}

function SiteSwitcher() {
  const { activeSites, activeSiteId, setActiveSiteId } = useSiteContext();
  if (activeSites.length === 0) return null;
  return (
    <div className="mt-2 px-0" data-testid="site-switcher">
      <Select value={activeSiteId ?? "__all__"} onValueChange={v => setActiveSiteId(v === "__all__" ? null : v)}>
        <SelectTrigger className="h-7 text-xs border-border bg-background" data-testid="select-active-site">
          <div className="flex items-center gap-1.5 min-w-0">
            {activeSiteId ? <MapPin className="w-3 h-3 shrink-0 text-primary" /> : <Globe className="w-3 h-3 shrink-0 text-muted-foreground" />}
            <SelectValue placeholder="All Sites" />
          </div>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__" data-testid="site-option-all">
            <span className="flex items-center gap-1.5"><Globe className="w-3 h-3" /> All Sites</span>
          </SelectItem>
          {activeSites.map(s => (
            <SelectItem key={s.id} value={s.id} data-testid={`site-option-${s.id}`}>
              <span className="flex items-center gap-1.5"><MapPin className="w-3 h-3" /> {s.name}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function canShowItem(item: NavItem, can: ReturnType<typeof usePermissions>["can"]) {
  return !item.permission || can(item.permission);
}

function AdvancedNavLink({ item, location }: { item: NavItem; location: string }) {
  const Icon = ICON_BY_HREF[item.href] ?? FileText;
  return (
    <Link
      href={item.href}
      data-testid={navTestId(item.label)}
      className={`flex items-center gap-2 w-full rounded-md px-2 py-1.5 text-xs transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground ${isActive(location, item.href) ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium" : "text-muted-foreground"}`}
      aria-current={isActive(location, item.href) ? "page" : undefined}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" />
      <span>{item.label}</span>
    </Link>
  );
}

export function AppSidebar() {
  const [location] = useLocation();
  const { can, isAdmin, isSuperAdmin } = usePermissions();
  const { canAccessPortfolio } = usePortfolioAccess();

  const { data: authData } = useQuery<{ user: any; company: any }>({
    queryKey: ["/api/auth/me"],
  });

  const { data: notifCount } = useQuery<{ count: number }>({
    queryKey: ["/api/notifications/count"],
    refetchInterval: 60000,
  });

  const { data: programmeStatus } = useQuery<any>({
    queryKey: ["/api/programme/status"],
  });

  const nextUrls = new Set<string>(
    (programmeStatus?.nextBestActions ?? []).map((a: any) => a.url as string)
  );

  const user = authData?.user;
  const company = authData?.company;
  const activeNotifs = notifCount?.count || 0;

  const esgGroupDefault = isGroupActive(location, ESG_SETUP_ROUTES);
  const dataGroupDefault = isGroupActive(location, DATA_EVIDENCE_ROUTES);
  const advancedGroupDefault = isGroupActive(location, ESG_SETUP_ADVANCED_ROUTES);
  const dataMetricsGroupDefault = isGroupActive(location, DATA_AND_METRICS_ROUTES);

  const [esgOpen, setEsgOpen] = useGroupState("esg_setup", esgGroupDefault);
  const [dataOpen, setDataOpen] = useGroupState("data_evidence", dataGroupDefault);
  const [advancedOpen, setAdvancedOpen] = useGroupState("esg_advanced", advancedGroupDefault);
  const [dataMetricsOpen, setDataMetricsOpen] = useGroupState("data_metrics", dataMetricsGroupDefault);

  useEffect(() => {
    if (isGroupActive(location, ESG_SETUP_ROUTES)) setEsgOpen(true);
    if (isGroupActive(location, DATA_EVIDENCE_ROUTES)) setDataOpen(true);
    if (isGroupActive(location, ESG_SETUP_ADVANCED_ROUTES)) setAdvancedOpen(true);
    if (isGroupActive(location, DATA_AND_METRICS_ROUTES)) setDataMetricsOpen(true);
  }, [location]);

  const advancedPrimaryItems = ESG_SETUP_ADVANCED_PRIMARY_ITEMS.filter(item => canShowItem(item, can));
  const advancedSupportItems = ESG_SETUP_ADVANCED_SUPPORT_ITEMS.filter(item => canShowItem(item, can));
  const dataMetricItems = DATA_AND_METRICS_ITEMS.filter(item => canShowItem(item, can));

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center w-8 h-8 rounded-md bg-primary shrink-0">
            <Leaf className="w-4 h-4 text-primary-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-sidebar-foreground leading-tight">ESG Manager</p>
            <p className="text-xs text-muted-foreground leading-tight truncate">
              {company?.name || "Your Company"}
            </p>
          </div>
          {activeNotifs > 0 && (
            <Link href="/">
              <Button variant="ghost" size="icon" className="relative w-8 h-8 shrink-0" data-testid="button-notification-bell">
                <Bell className="w-4 h-4" />
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center" data-testid="badge-notification-count">
                  {activeNotifs > 9 ? "9+" : activeNotifs}
                </span>
              </Button>
            </Link>
          )}
        </div>
        <SiteSwitcher />
      </SidebarHeader>

      <SidebarSeparator />

      <SidebarContent className="overflow-y-auto">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu data-testid="primary-navigation" aria-label="Primary navigation">

              <SidebarMenuItem>
                <SidebarMenuButton asChild data-active={isActive(location, "/")}>
                  <Link href="/" data-testid="nav-dashboard" aria-current={isActive(location, "/") ? "page" : undefined}>
                    <LayoutDashboard className="w-4 h-4 shrink-0" />
                    <span>Dashboard</span>
                    {isActive(location, "/") && <ChevronRight className="w-3.5 h-3.5 ml-auto text-sidebar-primary shrink-0" />}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <Collapsible open={esgOpen} onOpenChange={setEsgOpen}>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton
                      data-active={isGroupActive(location, ESG_SETUP_ROUTES) && !esgOpen}
                      data-testid="nav-group-esg-setup"
                    >
                      <FileText className="w-4 h-4 shrink-0" />
                      <span>ESG Setup</span>
                      <ChevronDown className={`w-3.5 h-3.5 ml-auto shrink-0 transition-transform duration-200 ${esgOpen ? "rotate-180" : ""}`} />
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton asChild data-active={isActive(location, "/policy")}>
                          <Link href="/policy" data-testid="nav-policies" aria-current={isActive(location, "/policy") ? "page" : undefined}>
                            <FileText className="w-3.5 h-3.5 shrink-0" />
                            <span>Policies</span>
                          </Link>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton asChild data-active={isActive(location, "/topics")}>
                          <Link href="/topics" data-testid="nav-topics" aria-current={isActive(location, "/topics") ? "page" : undefined}>
                            <Target className="w-3.5 h-3.5 shrink-0" />
                            <span>Topics</span>
                          </Link>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton asChild data-active={isActive(location, "/esg-profile")}>
                          <Link href="/esg-profile" data-testid="nav-esg-profile" aria-current={isActive(location, "/esg-profile") ? "page" : undefined}>
                            <Building2 className="w-3.5 h-3.5 shrink-0" />
                            <span>ESG Profile</span>
                          </Link>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      {isAdmin && (
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild data-active={isActive(location, "/team")}>
                            <Link href="/team" data-testid="nav-team" aria-current={isActive(location, "/team") ? "page" : undefined}>
                              <Users className="w-3.5 h-3.5 shrink-0" />
                              <span>Team</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      )}

                      <SidebarMenuSubItem>
                        <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
                          <CollapsibleTrigger asChild>
                            <SidebarMenuSubButton
                              data-active={isGroupActive(location, ESG_SETUP_ADVANCED_ROUTES) && !advancedOpen}
                              data-testid="nav-group-esg-advanced"
                              className="w-full"
                            >
                              <Gauge className="w-3.5 h-3.5 shrink-0" />
                              <span>Advanced</span>
                              <ChevronDown className={`w-3 h-3 ml-auto shrink-0 transition-transform duration-200 ${advancedOpen ? "rotate-180" : ""}`} />
                            </SidebarMenuSubButton>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <div className="ml-2 mt-0.5 space-y-0.5 border-l border-border pl-3" data-testid="nav-esg-advanced-items">
                              {advancedPrimaryItems.map(item => (
                                <AdvancedNavLink key={item.href} item={item} location={location} />
                              ))}
                              {advancedSupportItems.length > 0 && (
                                <div className="my-1 h-px bg-border" aria-hidden="true" />
                              )}
                              {advancedSupportItems.map(item => (
                                <AdvancedNavLink key={item.href} item={item} location={location} />
                              ))}
                            </div>
                          </CollapsibleContent>
                        </Collapsible>
                      </SidebarMenuSubItem>
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </Collapsible>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <Collapsible open={dataOpen} onOpenChange={setDataOpen}>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton
                      data-active={isGroupActive(location, DATA_EVIDENCE_ROUTES) && !dataOpen}
                      data-testid="nav-group-data-evidence"
                    >
                      <ClipboardList className="w-4 h-4 shrink-0" />
                      <span>Data and Evidence</span>
                      <ChevronDown className={`w-3.5 h-3.5 ml-auto shrink-0 transition-transform duration-200 ${dataOpen ? "rotate-180" : ""}`} />
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      <SidebarMenuSubItem>
                        <Collapsible open={dataMetricsOpen} onOpenChange={setDataMetricsOpen}>
                          <CollapsibleTrigger asChild>
                            <SidebarMenuSubButton
                              data-active={isGroupActive(location, DATA_AND_METRICS_ROUTES) && !dataMetricsOpen}
                              data-testid="nav-group-data-and-metrics"
                              className="w-full"
                            >
                              <BarChart3 className="w-3.5 h-3.5 shrink-0" />
                              <span>Data and Metrics</span>
                              <ChevronDown className={`w-3 h-3 ml-auto shrink-0 transition-transform duration-200 ${dataMetricsOpen ? "rotate-180" : ""}`} />
                            </SidebarMenuSubButton>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <div className="ml-2 mt-0.5 space-y-0.5 border-l border-border pl-3" data-testid="nav-data-and-metrics-items">
                              {dataMetricItems.map(item => {
                                const Icon = ICON_BY_HREF[item.href] ?? BarChart3;
                                return (
                                  <Link
                                    key={item.href}
                                    href={item.href}
                                    data-testid={item.href === "/esg-policy-register" ? "nav-esg-policy-register" : navTestId(item.label)}
                                    aria-current={isActive(location, item.href) ? "page" : undefined}
                                    className={`flex items-center gap-2 w-full rounded-md px-2 py-1.5 text-xs transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground ${isActive(location, item.href) ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium" : "text-muted-foreground"}`}
                                  >
                                    <Icon className="w-3.5 h-3.5 shrink-0" />
                                    <span>{item.label}</span>
                                    <NextBadge show={nextUrls.has(item.href)} />
                                  </Link>
                                );
                              })}
                            </div>
                          </CollapsibleContent>
                        </Collapsible>
                      </SidebarMenuSubItem>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton asChild data-active={isActive(location, "/evidence")}>
                          <Link href="/evidence" data-testid="nav-evidence" aria-current={isActive(location, "/evidence") ? "page" : undefined}>
                            <FileCheck className="w-3.5 h-3.5 shrink-0" />
                            <span>Evidence</span>
                            <NextBadge show={nextUrls.has("/evidence")} />
                          </Link>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </Collapsible>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton asChild data-active={isActive(location, "/reports")}>
                  <Link href="/reports" data-testid="nav-reports" aria-current={isActive(location, "/reports") ? "page" : undefined}>
                    <Download className="w-4 h-4 shrink-0" />
                    <span>Reports</span>
                    {isActive(location, "/reports") && <ChevronRight className="w-3.5 h-3.5 ml-auto text-sidebar-primary shrink-0" />}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarSeparator />

      <SidebarFooter className="p-3">
        <div className="flex items-center gap-2 px-1">
          <Avatar className="w-7 h-7 shrink-0">
            <AvatarFallback className="text-xs bg-primary text-primary-foreground">
              {user?.username?.charAt(0)?.toUpperCase() || "U"}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium truncate">{user?.username || "User"}</p>
            <Badge variant="secondary" className="text-xs py-0 h-4" data-testid="badge-user-role">
              {user?.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : "User"}
            </Badge>
          </div>
          <div className="flex items-center gap-0.5" data-testid="utility-navigation" aria-label="Utility navigation">
            {canAccessPortfolio && (
              <Button size="icon" variant="ghost" asChild title="Portfolio" aria-label="Portfolio" data-testid="nav-utility-portfolio">
                <Link href="/portfolio"><BarChart3 className="w-3.5 h-3.5" /></Link>
              </Button>
            )}
            <Button size="icon" variant="ghost" asChild title="Help" aria-label="Help" data-testid="nav-utility-help">
              <Link href="/help"><HelpCircle className="w-3.5 h-3.5" /></Link>
            </Button>
            <Button size="icon" variant="ghost" asChild title="Settings" aria-label="Settings" data-testid="nav-utility-settings">
              <Link href="/settings"><Settings className="w-3.5 h-3.5" /></Link>
            </Button>
            {isSuperAdmin && (
              <Button size="icon" variant="ghost" asChild title="Admin" aria-label="Admin" data-testid="nav-utility-admin">
                <Link href="/admin"><Shield className="w-3.5 h-3.5" /></Link>
              </Button>
            )}
            {isSuperAdmin && (
              <Button size="icon" variant="ghost" asChild title="Security" aria-label="Security" data-testid="nav-utility-security">
                <Link href="/admin/security"><AlertTriangle className="w-3.5 h-3.5" /></Link>
              </Button>
            )}
            <Button
              size="icon"
              variant="ghost"
              onClick={logout}
              data-testid="button-logout"
              title="Log out"
              aria-label="Log out"
            >
              <LogOut className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
