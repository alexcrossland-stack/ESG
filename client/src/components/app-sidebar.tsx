import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import {
  BarChart3,
  ChevronRight,
  ClipboardCheck,
  FileQuestion,
  FileText,
  HelpCircle,
  LayoutDashboard,
  Leaf,
  LogOut,
  MapPin,
  MoreHorizontal,
  Settings,
  Target,
  UploadCloud,
  UserCog,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { usePortfolioAccess } from "@/hooks/use-portfolio-access";
import { useSiteContext } from "@/hooks/use-site-context";
import { logout } from "@/lib/auth";
import { SME_PRIMARY_NAV_ITEMS, isActive, isNavItemActive, type NavItem } from "@/lib/navigation";
import { getRoleLabel, usePermissions } from "@/lib/permissions";

const PRIMARY_ICON_BY_LABEL: Record<string, LucideIcon> = {
  Overview: LayoutDashboard,
  "Data & evidence": UploadCloud,
  Policies: FileText,
  "Action plan": Target,
  Reports: BarChart3,
  Questionnaires: FileQuestion,
  "More tools": MoreHorizontal,
};

const PRIMARY_TEST_ID_BY_LABEL: Record<string, string> = {
  Overview: "nav-dashboard",
  "Data & evidence": "nav-measure",
  Policies: "nav-policies",
  "Action plan": "nav-control-centre",
  Reports: "nav-reports",
  Questionnaires: "nav-questionnaires",
  "More tools": "nav-more-tools",
};

function SiteSwitcher() {
  const { activeSites, activeSiteId, setActiveSiteId } = useSiteContext();
  if (activeSites.length === 0) return null;

  return (
    <div className="mt-3" data-testid="site-switcher">
      <Select value={activeSiteId ?? "__all__"} onValueChange={value => setActiveSiteId(value === "__all__" ? null : value)}>
        <SelectTrigger className="h-9 bg-background text-xs" data-testid="select-active-site" aria-label="Active site">
          <div className="flex min-w-0 items-center gap-2">
            <MapPin className="h-3.5 w-3.5 shrink-0 text-primary" />
            <SelectValue placeholder="All sites" />
          </div>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__" data-testid="site-option-all">All sites</SelectItem>
          {activeSites.map(site => (
            <SelectItem key={site.id} value={site.id} data-testid={`site-option-${site.id}`}>{site.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function canShowItem(item: NavItem, can: ReturnType<typeof usePermissions>["can"]) {
  return !item.permission || can(item.permission);
}

export function AppSidebar() {
  const [location] = useLocation();
  const { can, isSuperAdmin } = usePermissions();
  const { canAccessPortfolio } = usePortfolioAccess();
  const { data: authData } = useQuery<{ user: any; company: any }>({ queryKey: ["/api/auth/me"] });

  const user = authData?.user;
  const company = authData?.company;
  const primaryItems = SME_PRIMARY_NAV_ITEMS.flatMap(item => {
    if (canShowItem(item, can)) return [item];
    if (item.fallbackHref) return [{ ...item, href: item.fallbackHref, permission: undefined }];
    return [];
  });

  return (
    <Sidebar>
      <SidebarHeader className="px-4 pb-3 pt-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary">
            <Leaf className="h-4 w-4 text-primary-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold leading-tight text-sidebar-foreground">SimplyESG</p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{company?.name || "Your company"}</p>
          </div>
        </div>
        <SiteSwitcher />
      </SidebarHeader>

      <SidebarSeparator />

      <SidebarContent className="overflow-y-auto px-2 py-3">
        <SidebarGroup className="p-0">
          <SidebarGroupContent>
            <SidebarMenu className="gap-1" data-testid="primary-navigation" aria-label="Primary navigation">
              {primaryItems.map(item => {
                const Icon = PRIMARY_ICON_BY_LABEL[item.label] ?? LayoutDashboard;
                const active = isNavItemActive(location, item);
                return (
                  <SidebarMenuItem key={item.label}>
                    <SidebarMenuButton asChild data-active={active} className="h-10">
                      <Link href={item.href} data-testid={PRIMARY_TEST_ID_BY_LABEL[item.label]} aria-current={active ? "page" : undefined}>
                        <Icon className="h-4 w-4 shrink-0" />
                        <span
                          className="min-w-0 flex-1 truncate"
                          data-testid={item.label === "Data & evidence" && item.href === "/data-entry" ? "nav-enter-data" : undefined}
                        >
                          {item.label}
                        </span>
                        {active && <ChevronRight className="ml-auto h-3.5 w-3.5 shrink-0 text-sidebar-primary" />}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarSeparator />

      <SidebarFooter className="space-y-2 p-3">
        <SidebarMenu aria-label="Support and settings" data-testid="utility-navigation">
          {canAccessPortfolio && (
            <SidebarMenuItem>
              <SidebarMenuButton asChild data-active={isActive(location, "/portfolio")}>
                <Link href="/portfolio" data-testid="nav-utility-portfolio">
                  <ClipboardCheck className="h-4 w-4" />
                  <span>Portfolio</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
          <SidebarMenuItem>
            <SidebarMenuButton asChild data-active={isActive(location, "/help")}>
              <Link href="/help" data-testid="nav-utility-help">
                <HelpCircle className="h-4 w-4" />
                <span>Help</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild data-active={isActive(location, "/settings")}>
              <Link href="/settings" data-testid="nav-utility-settings">
                <Settings className="h-4 w-4" />
                <span>Settings</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          {isSuperAdmin && (
            <SidebarMenuItem>
              <SidebarMenuButton asChild data-active={isActive(location, "/admin")}>
                <Link href="/admin" data-testid="nav-utility-platform-settings">
                  <UserCog className="h-4 w-4" />
                  <span>Platform admin</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
        </SidebarMenu>

        <div className="flex items-center gap-2 border-t border-sidebar-border px-2 pt-3">
          <Avatar className="h-8 w-8 shrink-0">
            <AvatarFallback className="bg-primary text-xs text-primary-foreground">
              {user?.username?.charAt(0)?.toUpperCase() || "U"}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium">{user?.username || "User"}</p>
            <p className="truncate text-[11px] text-muted-foreground" data-testid="badge-user-role">{getRoleLabel(user?.role)}</p>
          </div>
          <Button size="icon" variant="ghost" onClick={logout} data-testid="button-logout" title="Log out" aria-label="Log out">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
