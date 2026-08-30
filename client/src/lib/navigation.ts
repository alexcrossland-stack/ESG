export type BreadcrumbItem = {
  label: string;
  href?: string;
};

export type NavPermission = "metrics_data_entry" | "report_generation" | "settings_admin";

export type NavItem = {
  label: string;
  href: string;
  permission?: NavPermission;
  fallbackHref?: string;
  activeRoutes?: string[];
  description?: string;
};

export type NavSection = {
  label: string;
  items: NavItem[];
};

export const MAIN_NAV_TOP_LEVEL_LABELS = [
  "Overview",
  "Data & evidence",
  "Action plan",
  "Reports",
  "Questionnaires",
  "More tools",
] as const;

export const MEASURE_HOME_HREF = "/data-entry";
export const IMPROVE_HOME_HREF = "/control-centre";
export const SHARE_HOME_HREF = "/reports";

export const DATA_WORKSPACE_ROUTES = [
  "/data-entry",
  "/metrics",
  "/metrics-library",
  "/evidence",
];

export const ACTION_PLAN_WORKSPACE_ROUTES = [
  "/control-centre",
  "/actions",
  "/esg-targets",
  "/esg-risks",
  "/recommendations",
  "/roadmap",
  "/topics",
  "/policy",
  "/policy-generator",
  "/policy-templates",
  "/esg-policy-register",
  "/my-tasks",
  "/my-approvals",
];

export const QUESTIONNAIRE_WORKSPACE_ROUTES = ["/questionnaire", "/answer-library"];

export const MORE_TOOLS_ROUTES = [
  "/more-tools",
  "/framework-readiness",
  "/framework-settings",
  "/compliance",
  "/esg-profile",
  "/materiality",
  "/carbon-calculator",
  "/benchmarks",
  "/team",
];

/** The unified Metrics & data workspace adapts its actions to each role, so every
 * user shares one reliable route and read-only roles never need a fallback page. */
export const SME_PRIMARY_NAV_ITEMS: NavItem[] = [
  { label: "Overview", href: "/" },
  {
    label: "Data & evidence",
    href: MEASURE_HOME_HREF,
    activeRoutes: DATA_WORKSPACE_ROUTES,
  },
  { label: "Action plan", href: IMPROVE_HOME_HREF, activeRoutes: ACTION_PLAN_WORKSPACE_ROUTES },
  { label: "Reports", href: SHARE_HOME_HREF },
  { label: "Questionnaires", href: "/questionnaire", activeRoutes: QUESTIONNAIRE_WORKSPACE_ROUTES },
  { label: "More tools", href: "/more-tools", activeRoutes: MORE_TOOLS_ROUTES },
];

// Retained compatibility exports for existing route consumers and tests. The
// task-based sidebar below is the canonical presentation of these destinations.
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

/**
 * Specialist workflows remain available without competing with the four core
 * jobs in the default navigation. Sections are visual labels inside one
 * progressive-disclosure group; they do not add another collapsible level.
 */
export const ADVANCED_NAV_SECTIONS: NavSection[] = [
  {
    label: "Plan and improve",
    items: [
      { label: "Priority Topics", href: "/topics" },
      { label: "Roadmap", href: "/roadmap" },
      { label: "ESG Policy", href: "/policy" },
      { label: "Policy Generator", href: "/policy-generator" },
      { label: "Policy Templates", href: "/policy-templates" },
      { label: "Policy Register", href: "/esg-policy-register" },
      { label: "Materiality", href: "/materiality" },
      { label: "Targets and Actions", href: "/esg-targets" },
      { label: "Action Tracker", href: "/actions" },
      { label: "Risk Register", href: "/esg-risks" },
      { label: "Recommendations", href: "/recommendations" },
    ],
  },
  {
    label: "Measure and assure",
    items: [
      { label: "Metrics & data", href: "/data-entry" },
      { label: "Supporting Documents", href: "/evidence" },
      { label: "Carbon Estimator", href: "/carbon-calculator" },
      { label: "Benchmarks", href: "/benchmarks" },
    ],
  },
  {
    label: "Share and coordinate",
    items: [
      { label: "ESG Profile", href: "/esg-profile" },
      { label: "Frameworks", href: "/framework-readiness" },
      { label: "Framework Settings", href: "/framework-settings", permission: "settings_admin" },
      { label: "Compliance", href: "/compliance" },
      { label: "My Tasks", href: "/my-tasks" },
      { label: "My Approvals", href: "/my-approvals", permission: "report_generation" },
      { label: "Questionnaires", href: "/questionnaire" },
      { label: "Answer Library", href: "/answer-library" },
      { label: "Team", href: "/team", permission: "settings_admin" },
    ],
  },
];

/** Specialist destinations presented as a calm, searchable workspace instead
 * of a second navigation tree. Keep these groups short and outcome-oriented. */
export const MORE_TOOLS_SECTIONS: NavSection[] = [
  {
    label: "Frameworks & assurance",
    items: [
      { label: "Framework readiness", href: "/framework-readiness", description: "See how your current evidence maps to common ESG frameworks." },
      { label: "Framework settings", href: "/framework-settings", permission: "settings_admin", description: "Choose the frameworks and requirements your company follows." },
      { label: "Compliance", href: "/compliance", description: "Review requirement gaps and supporting information." },
    ],
  },
  {
    label: "Company & governance",
    items: [
      { label: "ESG profile", href: "/esg-profile", description: "Maintain a clear, shareable summary of your ESG position." },
      { label: "Priority topics", href: "/topics", description: "Focus effort on the topics that matter most to your business." },
      { label: "Materiality", href: "/materiality", description: "Assess business and stakeholder importance." },
      { label: "Policy templates", href: "/policy-templates", description: "Start practical ESG policies from proven templates." },
      { label: "Policy register", href: "/esg-policy-register", description: "Track policy ownership, status and review dates." },
    ],
  },
  {
    label: "Analysis & coordination",
    items: [
      { label: "Carbon estimator", href: "/carbon-calculator", description: "Create an initial emissions estimate from accessible business data." },
      { label: "Benchmarks", href: "/benchmarks", description: "Compare performance and identify useful improvement areas." },
      { label: "My tasks", href: "/my-tasks", description: "See work assigned to you across the ESG programme." },
      { label: "My approvals", href: "/my-approvals", permission: "report_generation", description: "Review submitted data and decisions awaiting approval." },
      { label: "Team", href: "/team", permission: "settings_admin", description: "Manage team access and responsibilities." },
    ],
  },
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
  { label: "Metrics & data", href: "/data-entry" },
  { label: "Documents", href: "/evidence" },
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

export const ADVANCED_NAV_ITEMS = ADVANCED_NAV_SECTIONS.flatMap(section => section.items);
export const ADVANCED_NAV_ROUTES = ADVANCED_NAV_ITEMS.map(item => item.href);

export function isActive(location: string, href: string) {
  const [pathname] = location.split(/[?#]/);
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

export function isNavItemActive(location: string, item: NavItem) {
  return isGroupActive(location, item.activeRoutes ?? [item.href]);
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
  "/": [{ label: "Overview", href: "/" }],

  "/data-entry": [{ label: "Data & evidence", href: MEASURE_HOME_HREF }],
  "/metrics": [{ label: "Data & evidence", href: MEASURE_HOME_HREF }, { label: "Metrics" }],
  "/metrics-library": [{ label: "Data & evidence", href: MEASURE_HOME_HREF }, { label: "Metrics library" }],
  "/evidence": [{ label: "Data & evidence", href: MEASURE_HOME_HREF }, { label: "Documents" }],

  "/control-centre": [{ label: "Action plan", href: IMPROVE_HOME_HREF }],
  "/topics": [{ label: "Action plan", href: IMPROVE_HOME_HREF }, { label: "Priority topics" }],
  "/roadmap": [{ label: "Action plan", href: IMPROVE_HOME_HREF }, { label: "Roadmap" }],
  "/policy": [{ label: "Action plan", href: IMPROVE_HOME_HREF }, { label: "ESG policy" }],
  "/policy-generator": [
    { label: "Action plan", href: IMPROVE_HOME_HREF },
    { label: "Policies", href: "/policy" },
    { label: "Policy Generator" },
  ],
  "/policy-templates": [
    { label: "Action plan", href: IMPROVE_HOME_HREF },
    { label: "Policies", href: "/policy" },
    { label: "Policy Templates" },
  ],
  "/esg-policy-register": [
    { label: "Action plan", href: IMPROVE_HOME_HREF },
    { label: "Policies", href: "/policy" },
    { label: "Policy Register" },
  ],
  "/esg-targets": [{ label: "Action plan", href: IMPROVE_HOME_HREF }, { label: "Targets and actions" }],
  "/actions": [{ label: "Action plan", href: IMPROVE_HOME_HREF }, { label: "Action tracker" }],
  "/esg-risks": [{ label: "Action plan", href: IMPROVE_HOME_HREF }, { label: "Risk register" }],
  "/recommendations": [{ label: "Action plan", href: IMPROVE_HOME_HREF }, { label: "Recommendations" }],
  "/my-tasks": [{ label: "Action plan", href: IMPROVE_HOME_HREF }, { label: "My tasks" }],
  "/my-approvals": [{ label: "Action plan", href: IMPROVE_HOME_HREF }, { label: "My approvals" }],

  "/reports": [{ label: "Reports", href: SHARE_HOME_HREF }],
  "/questionnaire": [{ label: "Questionnaires", href: "/questionnaire" }],
  "/answer-library": [
    { label: "Questionnaires", href: "/questionnaire" },
    { label: "Answer library" },
  ],
  "/more-tools": [{ label: "More tools", href: "/more-tools" }],
  "/esg-profile": [{ label: "More tools", href: "/more-tools" }, { label: "ESG profile" }],
  "/materiality": [{ label: "More tools", href: "/more-tools" }, { label: "Materiality" }],
  "/carbon-calculator": [{ label: "More tools", href: "/more-tools" }, { label: "Carbon estimator" }],
  "/benchmarks": [{ label: "More tools", href: "/more-tools" }, { label: "Benchmarks" }],
  "/framework-readiness": [{ label: "More tools", href: "/more-tools" }, { label: "Framework readiness" }],
  "/framework-settings": [
    { label: "More tools", href: "/more-tools" },
    { label: "Framework readiness", href: "/framework-readiness" },
    { label: "Framework settings" },
  ],
  "/compliance": [
    { label: "More tools", href: "/more-tools" },
    { label: "Framework readiness", href: "/framework-readiness" },
    { label: "Compliance" },
  ],

  "/team": [{ label: "More tools", href: "/more-tools" }, { label: "Team" }],
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
