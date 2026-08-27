import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarHeader, SidebarFooter, SidebarSeparator,
  SidebarMenuSub, SidebarMenuSubItem,
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
  Users, ChevronRight, Map, MapPin, Globe, BookOpen,
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
  ADVANCED_NAV_SECTIONS,
  SME_PRIMARY_NAV_ITEMS,
  canShowAdminMenu,
  getAdminMenuHref,
  getAdminMenuRoutes,
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
  "/roadmap": Map,
  "/team": Users,
  "/framework-readiness": Globe,
  "/framework-settings": Settings,
  "/materiality": Star,
  "/esg-targets": Target,
  "/actions": ClipboardCheck,
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

const PRIMARY_ICON_BY_LABEL: Record<string, LucideIcon> = {
  Home: LayoutDashboard,
  Measure: ClipboardList,
  Improve: TrendingUp,
  Share: Download,
};

const PRIMARY_TEST_ID_BY_LABEL: Record<string, string> = {
  Home: "nav-dashboard",
  Measure: "nav-measure",
  Improve: "nav-control-centre",
  Share: "nav-reports",
};

function navTestId(label: string) {
  return `nav-${label.toLowerCase().replace(/&/g, "and").replace(/\s+/g, "-")}`;
}

function NavItemLabel({ children }: { children: string }) {
  return <span className="min-w-0 flex-1 truncate whitespace-nowrap">{children}</span>;
}

interface NavBadgeProps { show: boolean }
function NextBadge({ show }: NavBadgeProps) {
  if (!show) return null;
  return (
    <span className="ml-auto shrink-0 text-[9px] font-semibold uppercase tracking-wide px-1 py-0.5 rounded bg-primary/10 text-primary leading-tight">
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

function advancedNavTestId(item: NavItem) {
  const preservedIds: Record<string, string> = {
    "/topics": "nav-topics",
    "/esg-policy-register": "nav-esg-policy-register",
    "/evidence": "nav-evidence",
    "/carbon-calculator": "nav-carbon-calculator",
  };
  if (preservedIds[item.href]) return preservedIds[item.href];
  return navTestId(item.label);
}

function AdvancedNavLink({ item, location, showNext }: { item: NavItem; location: string; showNext: boolean }) {
  const Icon = ICON_BY_HREF[item.href] ?? FileText;
  return (
    <Link
      href={item.href}
      data-testid={advancedNavTestId(item)}
      className={`flex items-center gap-2 w-full rounded-md px-2 py-1.5 text-xs transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground ${isActive(location, item.href) ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium" : "text-muted-foreground"}`}
      aria-current={isActive(location, item.href) ? "page" : undefined}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" />
      <NavItemLabel>{item.label}</NavItemLabel>
      <NextBadge show={showNext} />
    </Link>
  );
}

export function AppSidebar() {
  const [location] = useLocation();
  const { can, isSuperAdmin, role } = usePermissions();
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
    (programmeStatus?.nextBestActions ?? []).map((action: any) => action.url as string)
  );

  const user = authData?.user;
  const company = authData?.company;
  const activeNotifs = notifCount?.count || 0;

  const primaryItems = SME_PRIMARY_NAV_ITEMS.flatMap(item => {
    if (canShowItem(item, can)) return [item];
    if (item.fallbackHref) return [{ ...item, href: item.fallbackHref, permission: undefined }];
    return [];
  });
  const primaryHrefs = new Set(primaryItems.map(item => item.href));
  const advancedSections = ADVANCED_NAV_SECTIONS
    .map(section => ({
      ...section,
      items: section.items.filter(item => canShowItem(item, can) && !primaryHrefs.has(item.href)),
    }))
    .filter(section => section.items.length > 0);
  const visibleAdvancedRoutes = advancedSections.flatMap(section => section.items.map(item => item.href));
  const advancedGroupActive = isGroupActive(location, visibleAdvancedRoutes);
  const [advancedOpen, setAdvancedOpen] = useGroupState("advanced_tools", advancedGroupActive);

  useEffect(() => {
    if (advancedGroupActive) setAdvancedOpen(true);
  }, [advancedGroupActive]);

  const adminMenuHref = getAdminMenuHref(role);
  const adminMenuActive = isGroupActive(location, getAdminMenuRoutes(role));

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

              {primaryItems.map(item => {
                const Icon = PRIMARY_ICON_BY_LABEL[item.label] ?? LayoutDashboard;
                const active = isActive(location, item.href);
                return (
                  <SidebarMenuItem key={item.label}>
                    <SidebarMenuButton asChild data-active={active}>
                      <Link
                        href={item.href}
                        data-testid={PRIMARY_TEST_ID_BY_LABEL[item.label] ?? navTestId(item.label)}
                        aria-current={active ? "page" : undefined}
                      >
                        <Icon className="w-4 h-4 shrink-0" />
                        <span data-testid={item.label === "Measure" && item.href === "/data-entry" ? "nav-enter-data" : undefined}>
                          {item.label}
                        </span>
                        <NextBadge show={nextUrls.has(item.href)} />
                        {active && <ChevronRight className="w-3.5 h-3.5 ml-auto text-sidebar-primary shrink-0" />}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}

              <SidebarMenuItem>
                <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton
                      data-active={advancedGroupActive && !advancedOpen}
                      data-testid="nav-group-esg-advanced"
                    >
                      <Gauge className="w-4 h-4 shrink-0" />
                      <span>Advanced</span>
                      <ChevronDown className={`w-3.5 h-3.5 ml-auto shrink-0 transition-transform duration-200 ${advancedOpen ? "rotate-180" : ""}`} />
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenuSub className="mx-2.5 px-2">
                      <div className="space-y-2 py-1" data-testid="nav-esg-advanced-items">
                        {advancedSections.map((section, sectionIndex) => (
                          <div key={section.label} data-testid={`nav-advanced-section-${sectionIndex}`}>
                            {sectionIndex > 0 && <div className="my-2 h-px bg-border" aria-hidden="true" />}
                            <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/80">
                              {section.label}
                            </p>
                            <div className="space-y-0.5">
                              {section.items.map(item => (
                                <SidebarMenuSubItem key={item.href}>
                                  <AdvancedNavLink
                                    item={item}
                                    location={location}
                                    showNext={nextUrls.has(item.href)}
                                  />
                                </SidebarMenuSubItem>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </Collapsible>
              </SidebarMenuItem>

            </SidebarMenu>

            {canShowAdminMenu(role) && (
              <SidebarMenu className="mt-2" data-testid="settings-navigation" aria-label="Settings navigation">
                <SidebarMenuItem>
                  <SidebarMenuButton asChild data-active={adminMenuActive}>
                    <Link href={adminMenuHref} data-testid="nav-settings-console" aria-current={adminMenuActive ? "page" : undefined}>
                      <Shield className="w-4 h-4 shrink-0" />
                      <span>Settings</span>
                      {adminMenuActive && <ChevronRight className="w-3.5 h-3.5 ml-auto text-sidebar-primary shrink-0" />}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            )}
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
              <Button size="icon" variant="ghost" asChild title="Platform Settings" aria-label="Platform Settings" data-testid="nav-utility-platform-settings">
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
