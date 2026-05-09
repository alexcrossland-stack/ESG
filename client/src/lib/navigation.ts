export type BreadcrumbItem = {
  label: string;
  href?: string;
};

export type NavItem = {
  label: string;
  href: string;
  permission?: "metrics_data_entry" | "report_generation" | "settings_admin";
};

export const MAIN_NAV_TOP_LEVEL_LABELS = [
  "Dashboard",
  "ESG Setup",
  "Data and Evidence",
  "Reports",
] as const;

export const ESG_SETUP_HOME_HREF = "/topics";

export const ESG_SETUP_BASE_ITEMS: NavItem[] = [
  { label: "Topics", href: "/topics" },
  { label: "ESG Profile", href: "/esg-profile" },
  { label: "Roadmap", href: "/roadmap" },
  { label: "Team", href: "/team", permission: "settings_admin" },
  { label: "Policy Generator", href: "/policy-generator" },
  { label: "Policy Templates", href: "/policy-templates" },
  { label: "Control Centre", href: "/control-centre" },
];

export const ESG_SETUP_BASE_ROUTES = ESG_SETUP_BASE_ITEMS.map(item => item.href);
export const ESG_SETUP_ADVANCED_ROUTES = [
  "/framework-readiness",
  "/framework-settings",
  "/materiality",
  "/esg-targets",
  "/esg-risks",
  "/compliance",
  "/benchmarks",
  "/my-tasks",
  "/my-approvals",
  "/questionnaire",
  "/carbon-calculator",
  "/answer-library",
];
export const ESG_SETUP_ROUTES = [...ESG_SETUP_BASE_ROUTES, ...ESG_SETUP_ADVANCED_ROUTES];

export const DATA_AND_METRICS_ROUTES = [
  "/metrics",
  "/metrics-library",
  "/data-entry",
  "/esg-policy-register",
];
export const DATA_EVIDENCE_ROUTES = [...DATA_AND_METRICS_ROUTES, "/evidence"];

export const FRAMEWORK_NAV_ITEMS: NavItem[] = [
  { label: "Frameworks", href: "/framework-readiness" },
  { label: "Framework Settings", href: "/framework-settings", permission: "settings_admin" },
];

export const ESG_SETUP_ADVANCED_PRIMARY_ITEMS: NavItem[] = [
  ...FRAMEWORK_NAV_ITEMS,
  { label: "Materiality", href: "/materiality" },
  { label: "Targets and Actions", href: "/esg-targets" },
  { label: "Risk Register", href: "/esg-risks" },
];

export const ESG_SETUP_ADVANCED_SUPPORT_ITEMS: NavItem[] = [
  { label: "Compliance", href: "/compliance" },
  { label: "Benchmarks", href: "/benchmarks" },
  { label: "My Tasks", href: "/my-tasks" },
  { label: "My Approvals", href: "/my-approvals", permission: "report_generation" },
  { label: "Questionnaires", href: "/questionnaire" },
  { label: "Carbon Calculator", href: "/carbon-calculator" },
  { label: "Answer Library", href: "/answer-library" },
];

export const DATA_AND_METRICS_ITEMS: NavItem[] = [
  { label: "Metrics", href: "/metrics" },
  { label: "Metrics Library", href: "/metrics-library" },
  { label: "Enter Data", href: "/data-entry", permission: "metrics_data_entry" },
  { label: "Policy Register", href: "/esg-policy-register" },
];

export const MOVED_MENU_ITEM_TARGETS = {
  frameworks: "/framework-readiness",
  materiality: "/materiality",
  targetsAndActions: "/esg-targets",
  riskRegister: "/esg-risks",
  policyRegister: "/esg-policy-register",
  roadmap: "/roadmap",
  policyGenerator: "/policy-generator",
  policyTemplates: "/policy-templates",
  controlCentre: "/control-centre",
} as const;

export function isActive(location: string, href: string) {
  if (href === "/") return location === "/";
  return location === href || location.startsWith(href + "/");
}

export function isGroupActive(location: string, routes: string[]) {
  return routes.some(route => isActive(location, route));
}

export const SETTINGS_MENU_HREF = "/settings";
export const SETTINGS_MENU_ROUTES = [SETTINGS_MENU_HREF, "/settings/sites", "/sites"];

export function canAccessPlatformAdmin(role: string | undefined) {
  return role === "super_admin";
}

export function canAccessTenantAdmin(role: string | undefined) {
  return role === "admin" || role === "super_admin";
}

export function canShowAdminMenu(role: string | undefined) {
  return canAccessPlatformAdmin(role) || canAccessTenantAdmin(role);
}

export function getAdminMenuHref(role: string | undefined) {
  return SETTINGS_MENU_HREF;
}

export function getAdminMenuRoutes(role: string | undefined) {
  if (canShowAdminMenu(role)) return SETTINGS_MENU_ROUTES;
  return [];
}

const BREADCRUMBS: Record<string, BreadcrumbItem[]> = {
  "/": [{ label: "Dashboard", href: "/" }],
  "/policy": [{ label: "ESG Setup", href: ESG_SETUP_HOME_HREF }, { label: "Policies" }],
  "/topics": [{ label: "ESG Setup", href: ESG_SETUP_HOME_HREF }, { label: "Topics" }],
  "/esg-profile": [{ label: "ESG Setup", href: ESG_SETUP_HOME_HREF }, { label: "ESG Profile" }],
  "/roadmap": [{ label: "ESG Setup", href: ESG_SETUP_HOME_HREF }, { label: "Roadmap" }],
  "/team": [{ label: "ESG Setup", href: ESG_SETUP_HOME_HREF }, { label: "Team" }],
  "/policy-generator": [{ label: "ESG Setup", href: ESG_SETUP_HOME_HREF }, { label: "Policy Generator" }],
  "/policy-templates": [{ label: "ESG Setup", href: ESG_SETUP_HOME_HREF }, { label: "Policy Templates" }],
  "/control-centre": [{ label: "ESG Setup", href: ESG_SETUP_HOME_HREF }, { label: "Control Centre" }],
  "/recommendations": [{ label: "ESG Setup", href: ESG_SETUP_HOME_HREF }, { label: "Recommendations" }],
  "/framework-readiness": [
    { label: "ESG Setup", href: ESG_SETUP_HOME_HREF },
    { label: "Advanced", href: "/framework-readiness" },
    { label: "Frameworks" },
  ],
  "/framework-settings": [
    { label: "ESG Setup", href: ESG_SETUP_HOME_HREF },
    { label: "Advanced", href: "/framework-readiness" },
    { label: "Frameworks", href: "/framework-readiness" },
    { label: "Framework Settings" },
  ],
  "/materiality": [
    { label: "ESG Setup", href: ESG_SETUP_HOME_HREF },
    { label: "Advanced", href: "/framework-readiness" },
    { label: "Materiality" },
  ],
  "/esg-targets": [
    { label: "ESG Setup", href: ESG_SETUP_HOME_HREF },
    { label: "Advanced", href: "/framework-readiness" },
    { label: "Targets and Actions" },
  ],
  "/esg-risks": [
    { label: "ESG Setup", href: ESG_SETUP_HOME_HREF },
    { label: "Advanced", href: "/framework-readiness" },
    { label: "Risk Register" },
  ],
  "/metrics": [
    { label: "Data and Evidence", href: "/metrics" },
    { label: "Metrics" },
  ],
  "/metrics-library": [
    { label: "Data and Evidence", href: "/metrics" },
    { label: "Metrics Library" },
  ],
  "/data-entry": [
    { label: "Data and Evidence", href: "/metrics" },
    { label: "Enter Data" },
  ],
  "/esg-policy-register": [
    { label: "Data and Evidence", href: "/metrics" },
    { label: "Policy Register" },
  ],
  "/evidence": [{ label: "Data and Evidence", href: "/metrics" }, { label: "Evidence" }],
  "/reports": [{ label: "Reports", href: "/reports" }],
  "/portfolio": [{ label: "Portfolio", href: "/portfolio" }],
  "/help": [{ label: "Help", href: "/help" }],
  "/settings": [{ label: "Settings", href: "/settings" }],
  "/settings/sites": [{ label: "Settings", href: "/settings" }, { label: "Sites" }],
  "/sites": [{ label: "Settings", href: "/settings" }, { label: "Sites" }],
  "/billing": [{ label: "Settings", href: "/settings" }, { label: "Billing" }],
  "/admin": [{ label: "Settings", href: "/admin" }],
  "/admin/security": [{ label: "Settings", href: "/admin" }, { label: "Security" }],
};

export function getBreadcrumbs(location: string): BreadcrumbItem[] {
  const [pathname] = location.split("?");
  const match = Object.keys(BREADCRUMBS)
    .sort((a, b) => b.length - a.length)
    .find(route => isActive(pathname, route));

  return match ? BREADCRUMBS[match] : [];
}
