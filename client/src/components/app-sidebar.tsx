import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarHeader, SidebarFooter, SidebarSeparator,
  SidebarMenuSub, SidebarMenuSubItem, SidebarMenuSubButton, SidebarMenuBadge,
} from "@/components/ui/sidebar";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  LayoutDashboard, FileText, Target, BarChart3, ClipboardList,
  CheckSquare, Download, Settings, LogOut, Leaf, ChevronDown,
  Wand2, Calculator, FileQuestion, Library, FileCheck, Bell,
  ClipboardCheck, ListChecks, Shield, Bookmark, Gauge,
  TrendingUp, Building2, Activity, HeartPulse, Sparkles, HelpCircle,
  MessageSquare, CreditCard, Users, ChevronRight, MapPin, Globe,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { logout } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import { usePermissions } from "@/lib/permissions";
import { useSiteContext } from "@/hooks/use-site-context";

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

const ESG_SETUP_ROUTES = ["/policy", "/topics", "/esg-profile", "/team"];
const DATA_EVIDENCE_ROUTES = ["/metrics", "/data-entry", "/evidence"];
const SETTINGS_ROUTES = [
  "/settings", "/billing", "/settings/sites", "/sites",
  "/compliance", "/benchmarks", "/recommendations",
  "/my-tasks", "/my-approvals", "/questionnaire",
  "/carbon-calculator", "/policy-templates", "/policy-generator",
  "/answer-library", "/control-centre",
];
const ADVANCED_ROUTES = [
  "/compliance", "/benchmarks", "/recommendations",
  "/my-tasks", "/my-approvals", "/questionnaire",
  "/carbon-calculator", "/policy-templates", "/policy-generator",
  "/answer-library", "/control-centre",
];

function isActive(location: string, href: string) {
  if (href === "/") return location === "/";
  return location === href || location.startsWith(href + "/");
}

function isGroupActive(location: string, routes: string[]) {
  return routes.some(r => isActive(location, r));
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
  const { sites, activeSiteId, setActiveSiteId } = useSiteContext();
  if (sites.length === 0) return null;
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
          {sites.map(s => (
            <SelectItem key={s.id} value={s.id} data-testid={`site-option-${s.id}`}>
              <span className="flex items-center gap-1.5"><MapPin className="w-3 h-3" /> {s.name}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function AppSidebar() {
  const [location] = useLocation();
  const { can, isAdmin, isSuperAdmin } = usePermissions();

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
  const settingsGroupDefault = isGroupActive(location, SETTINGS_ROUTES);
  const advancedGroupDefault = isGroupActive(location, ADVANCED_ROUTES);

  const [esgOpen, setEsgOpen] = useGroupState("esg_setup", esgGroupDefault);
  const [dataOpen, setDataOpen] = useGroupState("data_evidence", dataGroupDefault);
  const [settingsOpen, setSettingsOpen] = useGroupState("settings", settingsGroupDefault);
  const [advancedOpen, setAdvancedOpen] = useGroupState("advanced", advancedGroupDefault);

  useEffect(() => {
    if (isGroupActive(location, ESG_SETUP_ROUTES)) setEsgOpen(true);
    if (isGroupActive(location, DATA_EVIDENCE_ROUTES)) setDataOpen(true);
    if (isGroupActive(location, SETTINGS_ROUTES)) setSettingsOpen(true);
    if (isGroupActive(location, ADVANCED_ROUTES)) setAdvancedOpen(true);
  }, [location]);

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
            <SidebarMenu>

              {/* Dashboard */}
              <SidebarMenuItem>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <SidebarMenuButton asChild data-active={isActive(location, "/")}>
                      <Link href="/" data-testid="nav-dashboard">
                        <LayoutDashboard className="w-4 h-4 shrink-0" />
                        <span>Dashboard</span>
                        {isActive(location, "/") && <ChevronRight className="w-3.5 h-3.5 ml-auto text-sidebar-primary shrink-0" />}
                      </Link>
                    </SidebarMenuButton>
                  </TooltipTrigger>
                  <TooltipContent side="right">See your ESG progress and next actions</TooltipContent>
                </Tooltip>
              </SidebarMenuItem>

              {/* ESG Setup */}
              <Collapsible open={esgOpen} onOpenChange={setEsgOpen} asChild>
                <SidebarMenuItem>
                  <Tooltip>
                    <TooltipTrigger asChild>
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
                    </TooltipTrigger>
                    <TooltipContent side="right">Set up your ESG framework</TooltipContent>
                  </Tooltip>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton asChild data-active={isActive(location, "/policy")}>
                          <Link href="/policy" data-testid="nav-policies">
                            <FileText className="w-3.5 h-3.5 shrink-0" />
                            <span>Policies</span>
                          </Link>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton asChild data-active={isActive(location, "/topics")}>
                          <Link href="/topics" data-testid="nav-topics">
                            <Target className="w-3.5 h-3.5 shrink-0" />
                            <span>Topics</span>
                          </Link>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton asChild data-active={isActive(location, "/esg-profile")}>
                          <Link href="/esg-profile" data-testid="nav-esg-profile">
                            <Building2 className="w-3.5 h-3.5 shrink-0" />
                            <span>ESG Profile</span>
                          </Link>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      {isAdmin && (
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild data-active={isActive(location, "/team")}>
                            <Link href="/team" data-testid="nav-team">
                              <Users className="w-3.5 h-3.5 shrink-0" />
                              <span>Team</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      )}
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </SidebarMenuItem>
              </Collapsible>

              {/* Data & Evidence */}
              <Collapsible open={dataOpen} onOpenChange={setDataOpen} asChild>
                <SidebarMenuItem>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton
                          data-active={isGroupActive(location, DATA_EVIDENCE_ROUTES) && !dataOpen}
                          data-testid="nav-group-data-evidence"
                        >
                          <ClipboardList className="w-4 h-4 shrink-0" />
                          <span>Data &amp; Evidence</span>
                          <ChevronDown className={`w-3.5 h-3.5 ml-auto shrink-0 transition-transform duration-200 ${dataOpen ? "rotate-180" : ""}`} />
                        </SidebarMenuButton>
                      </CollapsibleTrigger>
                    </TooltipTrigger>
                    <TooltipContent side="right">Enter data and upload supporting documents</TooltipContent>
                  </Tooltip>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton asChild data-active={isActive(location, "/metrics")}>
                          <Link href="/metrics" data-testid="nav-metrics">
                            <BarChart3 className="w-3.5 h-3.5 shrink-0" />
                            <span>Metrics</span>
                            <NextBadge show={nextUrls.has("/metrics")} />
                          </Link>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      {can("metrics_data_entry") && (
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild data-active={isActive(location, "/data-entry")}>
                            <Link href="/data-entry" data-testid="nav-data-entry">
                              <ClipboardList className="w-3.5 h-3.5 shrink-0" />
                              <span>Enter Data</span>
                              <NextBadge show={nextUrls.has("/data-entry")} />
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      )}
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton asChild data-active={isActive(location, "/evidence")}>
                          <Link href="/evidence" data-testid="nav-evidence">
                            <FileCheck className="w-3.5 h-3.5 shrink-0" />
                            <span>Evidence</span>
                            <NextBadge show={nextUrls.has("/evidence")} />
                          </Link>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </SidebarMenuItem>
              </Collapsible>

              {/* Reports */}
              <SidebarMenuItem>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <SidebarMenuButton asChild data-active={isActive(location, "/reports")}>
                      <Link href="/reports" data-testid="nav-reports">
                        <Download className="w-4 h-4 shrink-0" />
                        <span>Reports</span>
                        {isActive(location, "/reports") && <ChevronRight className="w-3.5 h-3.5 ml-auto text-sidebar-primary shrink-0" />}
                      </Link>
                    </SidebarMenuButton>
                  </TooltipTrigger>
                  <TooltipContent side="right">Generate ESG reports for stakeholders</TooltipContent>
                </Tooltip>
              </SidebarMenuItem>

              {/* Help */}
              <SidebarMenuItem>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <SidebarMenuButton asChild data-active={isActive(location, "/help")}>
                      <Link href="/help" data-testid="nav-help">
                        <HelpCircle className="w-4 h-4 shrink-0" />
                        <span>Help</span>
                        {isActive(location, "/help") && <ChevronRight className="w-3.5 h-3.5 ml-auto text-sidebar-primary shrink-0" />}
                      </Link>
                    </SidebarMenuButton>
                  </TooltipTrigger>
                  <TooltipContent side="right">Guidance and support</TooltipContent>
                </Tooltip>
              </SidebarMenuItem>

              {/* Settings */}
              <Collapsible open={settingsOpen} onOpenChange={setSettingsOpen} asChild>
                <SidebarMenuItem>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton
                          data-active={isGroupActive(location, SETTINGS_ROUTES) && !settingsOpen}
                          data-testid="nav-group-settings"
                        >
                          <Settings className="w-4 h-4 shrink-0" />
                          <span>Settings</span>
                          <ChevronDown className={`w-3.5 h-3.5 ml-auto shrink-0 transition-transform duration-200 ${settingsOpen ? "rotate-180" : ""}`} />
                        </SidebarMenuButton>
                      </CollapsibleTrigger>
                    </TooltipTrigger>
                    <TooltipContent side="right">Manage company and account settings</TooltipContent>
                  </Tooltip>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton asChild data-active={isActive(location, "/settings")}>
                          <Link href="/settings" data-testid="nav-settings">
                            <Settings className="w-3.5 h-3.5 shrink-0" />
                            <span>Company Settings</span>
                          </Link>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton asChild data-active={isActive(location, "/settings/sites") || isActive(location, "/sites")}>
                          <Link href="/settings/sites" data-testid="nav-sites">
                            <Building2 className="w-3.5 h-3.5 shrink-0" />
                            <span>Sites</span>
                          </Link>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton asChild data-active={isActive(location, "/billing")}>
                          <Link href="/billing" data-testid="nav-billing">
                            <CreditCard className="w-3.5 h-3.5 shrink-0" />
                            <span>Billing</span>
                          </Link>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>

                      {/* Advanced nested collapsible */}
                      <SidebarMenuSubItem>
                        <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
                          <CollapsibleTrigger asChild>
                            <SidebarMenuSubButton
                              data-active={isGroupActive(location, ADVANCED_ROUTES) && !advancedOpen}
                              data-testid="nav-group-advanced"
                              className="w-full"
                            >
                              <Gauge className="w-3.5 h-3.5 shrink-0" />
                              <span>Advanced</span>
                              <ChevronDown className={`w-3 h-3 ml-auto shrink-0 transition-transform duration-200 ${advancedOpen ? "rotate-180" : ""}`} />
                            </SidebarMenuSubButton>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <div className="ml-2 mt-0.5 space-y-0.5 border-l border-border pl-3">
                              {[
                                { href: "/compliance", label: "Compliance", icon: Shield },
                                { href: "/benchmarks", label: "Benchmarks", icon: TrendingUp },
                                { href: "/recommendations", label: "Recommendations", icon: Sparkles },
                                { href: "/my-tasks", label: "My Tasks", icon: ClipboardCheck },
                                ...(can("report_generation") ? [{ href: "/my-approvals", label: "My Approvals", icon: ListChecks }] : []),
                                { href: "/questionnaire", label: "Questionnaires", icon: FileQuestion },
                                { href: "/carbon-calculator", label: "Carbon Calculator", icon: Calculator },
                                { href: "/policy-templates", label: "Policy Templates", icon: Library },
                                { href: "/policy-generator", label: "Policy Generator", icon: Wand2 },
                                { href: "/answer-library", label: "Answer Library", icon: Bookmark },
                                { href: "/control-centre", label: "Control Centre", icon: Gauge },
                              ].map(({ href, label, icon: Icon }) => (
                                <Link
                                  key={href}
                                  href={href}
                                  data-testid={`nav-advanced-${label.toLowerCase().replace(/\s+/g, "-")}`}
                                  className={`flex items-center gap-2 w-full rounded-md px-2 py-1.5 text-xs transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground ${isActive(location, href) ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium" : "text-muted-foreground"}`}
                                >
                                  <Icon className="w-3.5 h-3.5 shrink-0" />
                                  <span>{label}</span>
                                </Link>
                              ))}
                            </div>
                          </CollapsibleContent>
                        </Collapsible>
                      </SidebarMenuSubItem>
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </SidebarMenuItem>
              </Collapsible>

              {/* Admin — super admins only */}
              {isSuperAdmin && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild data-active={isActive(location, "/admin")}>
                    <Link href="/admin" data-testid="nav-admin-console">
                      <Shield className="w-4 h-4 shrink-0" />
                      <span>Admin</span>
                      {isActive(location, "/admin") && <ChevronRight className="w-3.5 h-3.5 ml-auto text-sidebar-primary shrink-0" />}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}

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
          <Button
            size="icon"
            variant="ghost"
            onClick={logout}
            data-testid="button-logout"
            title="Log out"
          >
            <LogOut className="w-3.5 h-3.5" />
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
