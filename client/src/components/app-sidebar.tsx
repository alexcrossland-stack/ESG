import { useLocation, Link } from "wouter";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarHeader, SidebarFooter, SidebarSeparator,
} from "@/components/ui/sidebar";
import {
  LayoutDashboard, FileText, Target, BarChart3, ClipboardList,
  CheckSquare, Download, Settings, LogOut, Leaf, ChevronRight,
  Wand2, Calculator, FileQuestion, Library, FileCheck, Bell,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { logout } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import { usePermissions } from "@/lib/permissions";

const navItems = [
  { title: "Dashboard", href: "/", icon: LayoutDashboard, group: "main" },
  { title: "ESG Policy", href: "/policy", icon: FileText, group: "main" },
  { title: "Priority Topics", href: "/topics", icon: Target, group: "main" },
  { title: "Metrics Library", href: "/metrics", icon: BarChart3, group: "main" },
  { title: "Data Entry", href: "/data-entry", icon: ClipboardList, group: "main" },
  { title: "Action Tracker", href: "/actions", icon: CheckSquare, group: "main" },
  { title: "Evidence", href: "/evidence", icon: FileCheck, group: "main" },
  { title: "Reports", href: "/reports", icon: Download, group: "main" },
  { title: "Policy Templates", href: "/policy-templates", icon: Library, group: "ai" },
  { title: "Policy Generator", href: "/policy-generator", icon: Wand2, group: "ai" },
  { title: "Questionnaire", href: "/questionnaire", icon: FileQuestion, group: "ai" },
  { title: "Carbon Calculator", href: "/carbon-calculator", icon: Calculator, group: "ai" },
  { title: "Settings", href: "/settings", icon: Settings, group: "settings" },
];

export function AppSidebar() {
  const [location] = useLocation();
  const { can, isAdmin } = usePermissions();

  const { data: authData } = useQuery<{ user: any; company: any }>({
    queryKey: ["/api/auth/me"],
  });

  const { data: notifCount } = useQuery<{ count: number }>({
    queryKey: ["/api/notifications/count"],
    refetchInterval: 60000,
  });

  const user = authData?.user;
  const company = authData?.company;
  const activeNotifs = notifCount?.count || 0;

  const mainItems = navItems.filter(i => i.group === "main").filter(item => {
    if (item.title === "Data Entry" && !can("metrics_data_entry")) return false;
    return true;
  });
  const aiItems = navItems.filter(i => i.group === "ai");
  const settingsItems = navItems.filter(i => i.group === "settings");

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center w-8 h-8 rounded-md bg-primary">
            <Leaf className="w-4 h-4 text-primary-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-sidebar-foreground leading-tight">ESG Manager</p>
            <p className="text-xs text-muted-foreground leading-tight">
              {company?.name || "Your Company"}
            </p>
          </div>
          {activeNotifs > 0 && (
            <Link href="/">
              <Button variant="ghost" size="icon" className="relative w-8 h-8" data-testid="button-notification-bell">
                <Bell className="w-4 h-4" />
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center" data-testid="badge-notification-count">
                  {activeNotifs > 9 ? "9+" : activeNotifs}
                </span>
              </Button>
            </Link>
          )}
        </div>
      </SidebarHeader>

      <SidebarSeparator />

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainItems.map((item) => {
                const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild data-active={isActive}>
                      <Link href={item.href} data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, "-")}`}>
                        <item.icon className="w-4 h-4" />
                        <span>{item.title}</span>
                        {isActive && (
                          <ChevronRight className="w-3.5 h-3.5 ml-auto text-sidebar-primary" />
                        )}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Tools</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {aiItems.map((item) => {
                const isActive = location === item.href || location.startsWith(item.href);
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild data-active={isActive}>
                      <Link href={item.href} data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, "-")}`}>
                        <item.icon className="w-4 h-4" />
                        <span>{item.title}</span>
                        {isActive && (
                          <ChevronRight className="w-3.5 h-3.5 ml-auto text-sidebar-primary" />
                        )}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Account</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {settingsItems.map((item) => {
                const isActive = location === item.href;
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild data-active={isActive}>
                      <Link href={item.href} data-testid={`nav-${item.title.toLowerCase()}`}>
                        <item.icon className="w-4 h-4" />
                        <span>{item.title}</span>
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

      <SidebarFooter className="p-3">
        <div className="flex items-center gap-2 px-1">
          <Avatar className="w-7 h-7">
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
