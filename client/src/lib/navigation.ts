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
};

export type NavSection = {
  label: string;
  items: NavItem[];
};

export const MAIN_NAV_TOP_LEVEL_LABELS = [
  "Home",
  "Measure",
  "Improve",
  "Share",
  "Advanced",
] as const;

export const MEASURE_HOME_HREF = "/data-entry";
export const IMPROVE_HOME_HREF = "/control-centre";
export const SHARE_HOME_HREF = "/reports";

/**
 * The default SME journey stays intentionally small. Measure falls back to the
 * read-only metrics view when the user cannot enter data, so every role keeps a
 * useful primary destination without exposing an editing affordance.
 */
export const SME_PRIMARY_NAV_ITEMS: NavItem[] = [
  { label: "Home", href: "/" },
  {
    label: "Measure",
    href: MEASURE_HOME_HREF,
    permission: "metrics_data_entry",
    fallbackHref: "/metrics",
  },
  { label: "Improve", href: IMPROVE_HOME_HREF },
  { label: "Share", href: SHARE_HOME_HREF },
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
      { label: "Metrics", href: "/metrics" },
      { label: "Metrics Library", href: "/metrics-library" },
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

export const ADVANCED_NAV_ITEMS = ADVANCED_NAV_SECTIONS.flatMap(section => section.items);
export const ADVANCED_NAV_ROUTES = ADVANCED_NAV_ITEMS.map(item => item.href);

export function isActive(location: string, href: string) {
  if (href === "/") return location === "/";
  return location === href || location.startsWith(href + "/");
}

export function isGroupActive(location: string, routes: string[]) {
  return routes.some(route => isActive(location, route));
}

const BREADCRUMBS: Record<string, BreadcrumbItem[]> = {
  "/": [{ label: "Home", href: "/" }],

  "/data-entry": [{ label: "Measure", href: MEASURE_HOME_HREF }],
  "/metrics": [{ label: "Measure", href: MEASURE_HOME_HREF }, { label: "Metrics" }],
  "/metrics-library": [{ label: "Measure", href: MEASURE_HOME_HREF }, { label: "Metrics Library" }],
  "/evidence": [{ label: "Measure", href: MEASURE_HOME_HREF }, { label: "Supporting Documents" }],
  "/carbon-calculator": [{ label: "Measure", href: MEASURE_HOME_HREF }, { label: "Carbon Estimator" }],
  "/benchmarks": [{ label: "Measure", href: MEASURE_HOME_HREF }, { label: "Benchmarks" }],

  "/control-centre": [{ label: "Improve", href: IMPROVE_HOME_HREF }],
  "/topics": [{ label: "Improve", href: IMPROVE_HOME_HREF }, { label: "Priority Topics" }],
  "/policy": [{ label: "Improve", href: IMPROVE_HOME_HREF }, { label: "ESG Policy" }],
  "/policy-generator": [
    { label: "Improve", href: IMPROVE_HOME_HREF },
    { label: "Policies", href: "/policy" },
    { label: "Policy Generator" },
  ],
  "/policy-templates": [
    { label: "Improve", href: IMPROVE_HOME_HREF },
    { label: "Policies", href: "/policy" },
    { label: "Policy Templates" },
  ],
  "/esg-policy-register": [
    { label: "Improve", href: IMPROVE_HOME_HREF },
    { label: "Policies", href: "/policy" },
    { label: "Policy Register" },
  ],
  "/materiality": [{ label: "Improve", href: IMPROVE_HOME_HREF }, { label: "Materiality" }],
  "/esg-targets": [{ label: "Improve", href: IMPROVE_HOME_HREF }, { label: "Targets and Actions" }],
  "/actions": [{ label: "Improve", href: IMPROVE_HOME_HREF }, { label: "Action Tracker" }],
  "/esg-risks": [{ label: "Improve", href: IMPROVE_HOME_HREF }, { label: "Risk Register" }],
  "/recommendations": [{ label: "Improve", href: IMPROVE_HOME_HREF }, { label: "Recommendations" }],
  "/my-tasks": [{ label: "Improve", href: IMPROVE_HOME_HREF }, { label: "My Tasks" }],
  "/my-approvals": [{ label: "Improve", href: IMPROVE_HOME_HREF }, { label: "My Approvals" }],

  "/reports": [{ label: "Share", href: SHARE_HOME_HREF }],
  "/esg-profile": [{ label: "Share", href: SHARE_HOME_HREF }, { label: "ESG Profile" }],
  "/questionnaire": [{ label: "Share", href: SHARE_HOME_HREF }, { label: "Questionnaires" }],
  "/answer-library": [
    { label: "Share", href: SHARE_HOME_HREF },
    { label: "Questionnaires", href: "/questionnaire" },
    { label: "Answer Library" },
  ],
  "/framework-readiness": [{ label: "Share", href: SHARE_HOME_HREF }, { label: "Frameworks" }],
  "/framework-settings": [
    { label: "Share", href: SHARE_HOME_HREF },
    { label: "Frameworks", href: "/framework-readiness" },
    { label: "Framework Settings" },
  ],
  "/compliance": [
    { label: "Share", href: SHARE_HOME_HREF },
    { label: "Frameworks", href: "/framework-readiness" },
    { label: "Compliance" },
  ],

  "/team": [{ label: "Settings", href: "/settings" }, { label: "Team" }],
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
