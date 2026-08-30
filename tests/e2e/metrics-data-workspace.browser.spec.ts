import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";

type MockRole = "admin" | "viewer";

type MockBulkCell = {
  metricId: string;
  period: string;
  rawValue: string | null;
  rowIndex: number;
  columnIndex: number;
};

type MockGridValue = {
  id: string;
  metricId: string;
  period: string;
  value: string | null;
  locked: boolean;
  dataSourceType: string | null;
  workflowStatus: string | null;
  siteId: string | null;
};

type MockManualRequest = {
  metricId: string;
  period: string;
  value: string;
  notes?: string;
  dataSourceType?: string;
  siteId: string | null;
};

type MockWorkspaceState = {
  definitions: Array<Record<string, any>>;
  metrics: Array<Record<string, any>>;
  sites: Array<Record<string, any>>;
  gridValues: Map<string, MockGridValue>;
  manualValues: Map<string, Record<string, any>>;
  rawRows: Map<string, Array<Record<string, any>>>;
  bulkRequests: Array<{ mode: "validate" | "commit"; siteId: string | null; cells: MockBulkCell[] }>;
  manualRequests: MockManualRequest[];
  importParseRequests: Array<Record<string, any>>;
  importConfirmRequests: Array<Record<string, any>>;
  dataEntryGets: Array<{ period: string; siteId: string | null }>;
  evidenceGets: Array<{ period: string; siteId: string | null }>;
  rawDataGets: Array<{ period: string; siteId: string | null }>;
  rawDataGetCount: number;
  bulkGridGetCount: number;
  lastGridPeriods: string[];
};

const metricDefinitions = [
  {
    id: "def-electricity",
    code: "ENV-ELECTRICITY",
    name: "Electricity consumed",
    pillar: "environmental",
    category: "Energy",
    description: "Electricity used during the reporting period.",
    dataType: "numeric",
    unit: "kWh",
    inputFrequency: "monthly",
    isCore: true,
    isActive: true,
    isDerived: false,
    formulaJson: null,
    frameworkTags: ["VSME"],
    scoringWeight: null,
    evidenceRequired: true,
    rollupMethod: "sum",
    sortOrder: 1,
    metricType: "manual",
    formulaText: null,
  },
  {
    id: "def-turnover",
    code: "SOC-TURNOVER",
    name: "Employee turnover rate",
    pillar: "social",
    category: "Workforce",
    description: "Share of employees who left during the reporting period.",
    dataType: "numeric",
    unit: "%",
    inputFrequency: "monthly",
    isCore: true,
    isActive: true,
    isDerived: false,
    formulaJson: null,
    frameworkTags: ["VSME"],
    scoringWeight: null,
    evidenceRequired: true,
    rollupMethod: "average",
    sortOrder: 2,
    metricType: "manual",
    formulaText: null,
  },
  {
    id: "def-board",
    code: "GOV-BOARD-MEETINGS",
    name: "Board meetings held",
    pillar: "governance",
    category: "Governance",
    description: "Number of board meetings held in the quarter.",
    dataType: "numeric",
    unit: "meetings",
    inputFrequency: "quarterly",
    isCore: true,
    isActive: true,
    isDerived: false,
    formulaJson: null,
    frameworkTags: ["VSME"],
    scoringWeight: null,
    evidenceRequired: false,
    rollupMethod: "latest",
    sortOrder: 3,
    metricType: "manual",
    formulaText: null,
  },
  {
    id: "def-policy",
    code: "GOV-WHISTLEBLOWING",
    name: "Whistleblowing policy in place",
    pillar: "governance",
    category: "Policies",
    description: "Whether a whistleblowing policy is in force.",
    dataType: "boolean",
    unit: null,
    inputFrequency: "annual",
    isCore: true,
    isActive: true,
    isDerived: false,
    formulaJson: null,
    frameworkTags: ["VSME"],
    scoringWeight: null,
    evidenceRequired: true,
    rollupMethod: "latest",
    sortOrder: 4,
    metricType: "manual",
    formulaText: null,
  },
  {
    id: "def-intensity",
    code: "ENV-CARBON-INTENSITY",
    name: "Carbon intensity per employee",
    pillar: "environmental",
    category: "Emissions",
    description: "Emissions divided by full-time equivalent employees.",
    dataType: "numeric",
    unit: "tCO2e/FTE",
    inputFrequency: "monthly",
    isCore: true,
    isActive: true,
    isDerived: false,
    formulaJson: { operation: "divide", inputs: ["scope_total", "employee_headcount"] },
    frameworkTags: ["VSME"],
    scoringWeight: null,
    evidenceRequired: false,
    rollupMethod: "average",
    sortOrder: 5,
    metricType: "calculated",
    formulaText: "Total scope 1 and 2 emissions / employee headcount",
  },
] as const;

const companyMetrics = [
  {
    id: "metric-electricity",
    name: "Electricity consumed",
    category: "environmental",
    description: "Electricity used during the reporting period.",
    unit: "kWh",
    frequency: "monthly",
    dataType: "numeric",
    enabled: true,
    metricType: "manual",
    direction: "lower_is_better",
    helpText: "Use the total shown on electricity bills.",
    formulaText: null,
  },
  {
    id: "metric-turnover",
    name: "Employee turnover rate",
    category: "social",
    description: "Share of employees who left during the reporting period.",
    unit: "%",
    frequency: "monthly",
    dataType: "numeric",
    enabled: true,
    metricType: "manual",
    direction: "lower_is_better",
    helpText: "Use payroll records for the selected month.",
    formulaText: null,
  },
  {
    id: "metric-board",
    name: "Board meetings held",
    category: "governance",
    description: "Number of board meetings held in the quarter.",
    unit: "meetings",
    frequency: "quarterly",
    dataType: "numeric",
    enabled: true,
    metricType: "manual",
    direction: "higher_is_better",
    helpText: "Use the count from board minutes for the selected quarter.",
    formulaText: null,
  },
  {
    id: "metric-policy",
    name: "Whistleblowing policy in place",
    category: "governance",
    description: "Whether a whistleblowing policy is in force.",
    unit: null,
    frequency: "annual",
    dataType: "boolean",
    enabled: true,
    metricType: "manual",
    direction: "compliance_yes_no",
    helpText: "Answer Yes or No and attach the current policy.",
    formulaText: null,
  },
  {
    id: "metric-intensity",
    name: "Carbon intensity per employee",
    category: "environmental",
    description: "Emissions divided by full-time equivalent employees.",
    unit: "tCO2e/FTE",
    frequency: "monthly",
    dataType: "numeric",
    enabled: true,
    metricType: "calculated",
    direction: "lower_is_better",
    helpText: "Updated automatically from emissions and workforce inputs.",
    formulaText: "Total scope 1 and 2 emissions / employee headcount",
  },
] as const;

function valueKey(metricId: string, period: string, siteId: string | null) {
  return `${metricId}::${period}::${siteId || "__org__"}`;
}

function valuesForPeriod(period: string, state: MockWorkspaceState, siteId: string | null): Array<Record<string, unknown>> {
  const values: Array<Record<string, unknown>> = [];

  if (/^\d{4}-\d{2}$/.test(period)) {
    values.push(
      {
        id: `value-turnover-${period}-${siteId || "org"}`,
        metricId: "metric-turnover",
        period,
        value: null,
        valueNumeric: 0,
        valueText: null,
        valueBoolean: null,
        valueJson: null,
        notes: "No leavers in this period",
        dataSourceType: "manual",
        workflowStatus: "draft",
        locked: false,
        siteId,
      },
      {
        id: `value-intensity-${period}-${siteId || "org"}`,
        metricId: "metric-intensity",
        period,
        value: null,
        valueNumeric: 2.5,
        valueText: null,
        valueBoolean: null,
        valueJson: null,
        notes: "Calculated automatically",
        dataSourceType: "calculated",
        workflowStatus: "draft",
        locked: false,
        siteId,
      },
    );
  }

  if (/^\d{4}$/.test(period)) {
    values.push({
      id: `value-policy-${period}-${siteId || "org"}`,
      metricId: "metric-policy",
      period,
      value: null,
      valueNumeric: null,
      valueText: "No",
      valueBoolean: false,
      valueJson: null,
      notes: "Policy is being refreshed",
      dataSourceType: "evidenced",
      workflowStatus: "draft",
      locked: false,
      siteId,
    });
  }

  for (const value of state.manualValues.values()) {
    if (value.period === period && value.siteId === siteId) {
      const index = values.findIndex((candidate) => candidate.metricId === value.metricId);
      if (index >= 0) values[index] = value;
      else values.push(value);
    }
  }

  const importedElectricity = state.gridValues.get(`metric-electricity::${period}`);
  if (importedElectricity?.value !== null && importedElectricity?.value !== undefined) {
    values.unshift({
      id: importedElectricity.id,
      metricId: importedElectricity.metricId,
      period,
      value: importedElectricity.value,
      valueNumeric: Number(importedElectricity.value),
      valueText: null,
      valueBoolean: null,
      valueJson: null,
      notes: "Imported from spreadsheet",
      dataSourceType: "manual",
      workflowStatus: "draft",
      locked: false,
      siteId,
    });
  }
  return values;
}

function evidenceForPeriod(period: string, siteId: string | null) {
  if (/^\d{4}$/.test(period)) {
    return [{
      id: `evidence-policy-${period}-${siteId || "org"}`,
      filename: "whistleblowing-policy.pdf",
      fileUrl: `/api/evidence/evidence-policy-${period}/file`,
      fileType: "application/pdf",
      description: "Current whistleblowing policy",
      linkedModule: "metric_value",
      linkedEntityId: `value-policy-${period}-${siteId || "org"}`,
      linkedPeriod: period,
      evidenceStatus: "approved",
      uploadedAt: `${period}-08-15T12:00:00.000Z`,
      siteId,
    }];
  }

  if (/^\d{4}-\d{2}$/.test(period)) {
    return [
      {
        id: `evidence-turnover-rejected-${period}-${siteId || "org"}`,
        filename: "turnover-working-paper.xlsx",
        fileUrl: `/api/evidence/evidence-turnover-rejected-${period}/file`,
        fileType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        description: "Working paper rejected during review",
        linkedModule: "metric_value",
        linkedEntityId: `value-turnover-${period}-${siteId || "org"}`,
        linkedPeriod: period,
        evidenceStatus: "rejected",
        uploadedAt: `${period}-15T12:00:00.000Z`,
        siteId,
      },
      {
        id: `evidence-policy-wrong-period-${period}-${siteId || "org"}`,
        filename: "out-of-period-policy.pdf",
        fileUrl: `/api/evidence/evidence-policy-wrong-period-${period}/file`,
        fileType: "application/pdf",
        description: "A policy file linked to the wrong reporting cadence",
        linkedModule: "metric",
        linkedEntityId: "metric-policy",
        linkedPeriod: period,
        evidenceStatus: "approved",
        uploadedAt: `${period}-10T12:00:00.000Z`,
        siteId,
      },
    ];
  }

  return [];
}

function parseSiteScope(value: string | null): string | null {
  return !value || value === "null" || value === "__org__" ? null : value;
}

function historyValuesForMetric(metricId: string, siteId: string | null) {
  const shared = { siteId, workflowStatus: "draft", locked: false };
  if (metricId === "metric-policy") {
    return [
      { ...shared, id: "history-policy-current", metricId, period: "2026", value: null, valueNumeric: null, valueText: "No", valueBoolean: false, status: "green" },
      { ...shared, id: "history-policy-previous", metricId, period: "2025", value: null, valueNumeric: null, valueText: "Yes", valueBoolean: true, status: "green" },
    ];
  }
  if (metricId === "metric-electricity") {
    return [
      { ...shared, id: "history-electricity-current", metricId, period: "2026-08", value: "126", valueNumeric: 126, valueText: null, valueBoolean: null, status: "green", percentChange: 5 },
      { ...shared, id: "history-electricity-previous", metricId, period: "2026-07", value: "120", valueNumeric: 120, valueText: null, valueBoolean: null, status: "green" },
      { ...shared, id: "history-electricity-older", metricId, period: "2026-05", value: "115", valueNumeric: 115, valueText: null, valueBoolean: null, status: "green" },
    ];
  }
  if (metricId === "metric-turnover") {
    return [{ ...shared, id: "history-turnover-current", metricId, period: "2026-08", value: "0", valueNumeric: 0, valueText: null, valueBoolean: null, status: "green" }];
  }
  if (metricId === "metric-board") {
    return [{ ...shared, id: "history-board-current", metricId, period: "2026-Q3", value: "4", valueNumeric: 4, valueText: null, valueBoolean: null, status: "green" }];
  }
  return [{ ...shared, id: "history-intensity-current", metricId, period: "2026-08", value: "2.5", valueNumeric: 2.5, valueText: null, valueBoolean: null, status: "green" }];
}

async function openMetricsWorkspace(
  browser: Browser,
  role: MockRole,
  options: {
    viewport?: { width: number; height: number };
    path?: string;
    sites?: Array<Record<string, any>>;
    activeSiteId?: string;
    disabledDefinitionIds?: string[];
  } = {},
) {
  const context = await browser.newContext(options.viewport ? { viewport: options.viewport } : undefined);
  const page = await context.newPage();
  const disabledDefinitionIds = new Set(options.disabledDefinitionIds || []);
  const state: MockWorkspaceState = {
    definitions: metricDefinitions.map((definition) => ({
      ...definition,
      isActive: disabledDefinitionIds.has(definition.id) ? false : definition.isActive,
    })),
    metrics: companyMetrics.map((metric) => {
      const matchingDefinition = metricDefinitions.find((definition) => definition.name === metric.name);
      return {
        ...metric,
        enabled: matchingDefinition && disabledDefinitionIds.has(matchingDefinition.id) ? false : metric.enabled,
      };
    }),
    sites: options.sites || [],
    gridValues: new Map(),
    manualValues: new Map(),
    rawRows: new Map(),
    bulkRequests: [],
    manualRequests: [],
    importParseRequests: [],
    importConfirmRequests: [],
    dataEntryGets: [],
    evidenceGets: [],
    rawDataGets: [],
    rawDataGetCount: 0,
    bulkGridGetCount: 0,
    lastGridPeriods: [],
  };

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const apiPath = url.pathname;
    const method = request.method();
    const json = (body: unknown, status = 200) => route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
    });

    if (apiPath === "/api/auth/me") {
      return json({
        user: {
          id: `mock-${role}`,
          username: `${role} user`,
          email: `${role}@example.test`,
          role,
          companyId: "mock-company",
        },
        company: {
          id: "mock-company",
          name: "Mock SME",
          onboardingComplete: true,
          lifecycleState: "active",
        },
        defaultLandingContext: "company",
        portfolioGroups: [],
      });
    }
    if (apiPath === "/api/sites") return json(state.sites);
    if (apiPath === "/api/billing/status") return json({ planTier: "pro", subscriptionStatus: "active" });
    if (apiPath === "/api/onboarding/status") {
      return json({
        onboardingComplete: true,
        hasAddedData: true,
        hasUploadedEvidence: true,
        hasGeneratedReport: false,
        activationComplete: false,
        overallPercent: 75,
        completedCount: 3,
        totalSteps: 4,
        steps: [],
        nextStep: null,
      });
    }
    if (apiPath === "/api/admin/impersonation/status") return json({ isImpersonating: false });
    if (apiPath === "/api/activity/track" && method === "POST") return json({ ok: true });
    if (apiPath === "/api/metric-definitions") return json(state.definitions);
    if (apiPath.startsWith("/api/metric-definitions/") && apiPath.endsWith("/toggle") && method === "PATCH") {
      const definitionId = apiPath.split("/")[3];
      const definition = state.definitions.find((candidate) => candidate.id === definitionId);
      if (!definition) return json({ error: "Metric definition not found" }, 404);
      definition.isActive = !definition.isActive;
      const companyMetric = state.metrics.find((candidate) => candidate.name === definition.name);
      if (companyMetric) companyMetric.enabled = definition.isActive;
      return json({ ...definition });
    }
    const metricValuesMatch = /^\/api\/metrics\/([^/]+)\/values$/.exec(apiPath);
    if (metricValuesMatch && method === "GET") {
      return json(historyValuesForMetric(metricValuesMatch[1], parseSiteScope(url.searchParams.get("siteId"))));
    }
    const metricHistoryMatch = /^\/api\/metrics\/([^/]+)\/history$/.exec(apiPath);
    if (metricHistoryMatch && method === "GET") {
      const metricId = metricHistoryMatch[1];
      const metric = state.metrics.find((candidate) => candidate.id === metricId);
      return json({
        metric,
        history: [...historyValuesForMetric(metricId, parseSiteScope(url.searchParams.get("siteId")))].reverse(),
      });
    }
    const metricEvidenceMatch = /^\/api\/metrics\/([^/]+)\/evidence$/.exec(apiPath);
    if (metricEvidenceMatch && method === "GET") {
      const metricId = metricEvidenceMatch[1];
      return json(metricId === "metric-policy" ? [{
        id: "history-evidence-policy",
        filename: "whistleblowing-policy.pdf",
        fileType: "application/pdf",
        fileSize: 2048,
        linkedPeriod: "2026",
        resolvedLinkedPeriod: "2026",
        evidenceStatus: "approved",
        downloadUrl: "/api/evidence/history-evidence-policy/download",
      }] : []);
    }
    if (apiPath === "/api/metrics") return json(state.metrics);
    if (apiPath === "/api/data-quality") return json({ overallScore: 80, perMetric: [] });
    if (apiPath === "/api/reporting-periods") return json([]);
    if (apiPath === "/api/evidence/coverage") {
      return json({
        metricCoverage: [{
          metricId: "metric-policy",
          metricName: "Whistleblowing policy in place",
          category: "governance",
          hasEvidence: true,
          dataSourceType: "evidenced",
        }],
      });
    }
    if (apiPath === "/api/evidence/suggestions") return json([]);
    if (apiPath === "/api/evidence") {
      const period = url.searchParams.get("period") || "2026-01";
      const siteId = parseSiteScope(url.searchParams.get("siteId"));
      state.evidenceGets.push({ period, siteId });
      return json(evidenceForPeriod(period, siteId));
    }
    if (apiPath === "/api/raw-data/import/parse" && method === "POST") {
      const payload = JSON.parse(request.postData() || "{}");
      state.importParseRequests.push(payload);
      return json({
        columns: ["Electricity kWh"],
        rows: [{ "Electricity kWh": "321" }],
        mappings: [{ column: "Electricity kWh", inputKey: "electricity_kwh", confidence: 98 }],
      });
    }
    if (apiPath === "/api/raw-data/import/confirm" && method === "POST") {
      const payload = JSON.parse(request.postData() || "{}");
      state.importConfirmRequests.push(payload);
      const siteId = parseSiteScope(payload.siteId ?? null);
      state.rawRows.set(valueKey("raw", payload.period, siteId), [{
        id: `raw-electricity-${payload.period}-${siteId || "org"}`,
        inputName: "electricity_kwh",
        value: "321",
        period: payload.period,
        siteId,
        workflowStatus: "draft",
      }]);
      return json({ imported: 1, skipped: 0, period: payload.period, partialSuccess: false, unmatched: [] });
    }
    if (apiPath.startsWith("/api/raw-data/") && method === "GET") {
      const period = apiPath.slice("/api/raw-data/".length);
      const siteId = parseSiteScope(url.searchParams.get("siteId"));
      state.rawDataGetCount += 1;
      state.rawDataGets.push({ period, siteId });
      return json(state.rawRows.get(valueKey("raw", period, siteId)) || []);
    }
    if (apiPath === "/api/data-entry/bulk-grid" && method === "GET") {
      const periods = (url.searchParams.get("periods") || "").split(",").filter(Boolean);
      state.bulkGridGetCount += 1;
      state.lastGridPeriods = periods;
      return json({
        periods,
        metrics: state.metrics
          .filter((metric) => metric.enabled && metric.metricType === "manual" && metric.frequency === "monthly")
          .map((metric) => ({
          id: metric.id,
          name: metric.name,
          category: metric.category,
          unit: metric.unit,
          frequency: metric.frequency,
          metricType: metric.metricType,
          dataType: metric.dataType,
          enabled: true,
          readOnly: false,
        })),
        values: [...state.gridValues.values()].filter((value) => periods.includes(value.period)),
        lockedPeriods: [],
      });
    }
    if (apiPath === "/api/data-entry/bulk-upsert" && method === "POST") {
      const payload = JSON.parse(request.postData() || "{}") as {
        mode: "validate" | "commit";
        siteId: string | null;
        cells: MockBulkCell[];
      };
      state.bulkRequests.push(payload);
      const responseCells = payload.cells.map((cell) => {
        const metric = state.metrics.find((candidate) => candidate.id === cell.metricId);
        const existing = state.gridValues.get(`${cell.metricId}::${cell.period}`);
        const rawValue = cell.rawValue?.trim() ?? "";
        const normalizedValue = rawValue === "" ? null : Number(rawValue);
        const status = rawValue === "" ? "clear" : existing ? "update" : "create";
        return {
          ...cell,
          metricName: metric?.name ?? null,
          normalizedValue,
          normalizedText: null,
          normalizedBoolean: null,
          normalizedDisplayValue: normalizedValue === null ? null : String(normalizedValue),
          existingValue: existing?.value === null || existing?.value === undefined ? null : Number(existing.value),
          existingText: null,
          existingBoolean: null,
          existingDisplayValue: existing?.value ?? null,
          status,
          errors: [],
          warnings: [],
          readOnly: false,
          locked: false,
        };
      });
      if (payload.mode === "commit") {
        for (const cell of responseCells) {
          const key = `${cell.metricId}::${cell.period}`;
          if (cell.status === "clear") {
            state.gridValues.delete(key);
          } else {
            state.gridValues.set(key, {
              id: `bulk-${cell.metricId}-${cell.period}`,
              metricId: cell.metricId,
              period: cell.period,
              value: cell.normalizedDisplayValue,
              locked: false,
              dataSourceType: "manual",
              workflowStatus: "draft",
              siteId: payload.siteId,
            });
          }
        }
      }
      const createCount = responseCells.filter((cell) => cell.status === "create").length;
      const updateCount = responseCells.filter((cell) => cell.status === "update").length;
      const clearCount = responseCells.filter((cell) => cell.status === "clear").length;
      return json({
        ok: true,
        committed: payload.mode === "commit",
        cells: responseCells,
        summary: {
          totalCells: responseCells.length,
          changedCells: responseCells.length,
          createCount,
          updateCount,
          clearCount,
          unchangedCount: 0,
          errorCount: 0,
          warningCount: 0,
        },
        rowIssues: [],
      });
    }
    if (apiPath === "/api/data-entry" && method === "POST") {
      const payload = JSON.parse(request.postData() || "{}") as MockManualRequest;
      const siteId = parseSiteScope(payload.siteId ?? null);
      const metric = state.metrics.find((candidate) => candidate.id === payload.metricId);
      const isBoolean = metric?.dataType === "boolean";
      const stored = {
        id: payload.metricId === "metric-policy"
          ? `value-policy-${payload.period}-${siteId || "org"}`
          : `saved-${payload.metricId}-${payload.period}-${siteId || "org"}`,
        metricId: payload.metricId,
        period: payload.period,
        value: isBoolean ? null : payload.value,
        valueNumeric: isBoolean ? null : Number(payload.value),
        valueText: isBoolean ? payload.value : null,
        valueBoolean: isBoolean ? payload.value.trim().toLowerCase() === "yes" : null,
        valueJson: null,
        notes: payload.notes || "",
        dataSourceType: payload.dataSourceType || "manual",
        workflowStatus: "draft",
        locked: false,
        siteId,
      };
      state.manualRequests.push({ ...payload, siteId });
      state.manualValues.set(valueKey(payload.metricId, payload.period, siteId), stored);
      return json(stored, 201);
    }
    if (apiPath.startsWith("/api/data-entry/") && method === "GET") {
      const period = apiPath.slice("/api/data-entry/".length);
      const siteId = parseSiteScope(url.searchParams.get("siteId"));
      state.dataEntryGets.push({ period, siteId });
      return json({ metrics: [], values: valuesForPeriod(period, state, siteId), periodLocked: false });
    }
    if (apiPath === "/api/data-entries/estimate" && method === "POST") return json({ estimates: [] });
    return json([]);
  });

  await page.addInitScript((activeSiteId) => {
    localStorage.setItem("auth_token", "mock-token");
    if (activeSiteId) localStorage.setItem("activeSiteId", activeSiteId);
    else localStorage.removeItem("activeSiteId");
  }, options.activeSiteId || null);
  await page.goto(options.path || "/data-entry");
  await expect(page.getByRole("heading", { name: "Metrics & data", exact: true })).toBeVisible();
  return { context, page, state };
}

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth, JSON.stringify(dimensions)).toBeLessThanOrEqual(dimensions.clientWidth);
}

async function pasteClipboardBlock(locator: Locator, text: string) {
  await locator.focus();
  await locator.evaluate((element, clipboardText) => {
    const clipboardData = new DataTransfer();
    clipboardData.setData("text/plain", clipboardText);
    element.dispatchEvent(new ClipboardEvent("paste", {
      bubbles: true,
      cancelable: true,
      clipboardData,
    }));
  }, text);
}

test.describe("Unified Metrics & data workspace", () => {
  test("keeps cadence-aware completion counts aligned and rejects unusable or wrong-period evidence", async ({ browser }) => {
    const { context, page, state } = await openMetricsWorkspace(browser, "admin", {
      viewport: { width: 1280, height: 800 },
    });
    const overview = page.getByTestId("metrics-data-overview");
    const stateBadges = overview.locator('[data-testid^="metric-data-state-"]');
    const selectedMonth = state.dataEntryGets.find(({ period }) => /^\d{4}-\d{2}$/.test(period))?.period;
    expect(selectedMonth).toBeTruthy();
    const selectedYear = selectedMonth!.slice(0, 4);
    const selectedQuarter = `${selectedYear}-Q${Math.ceil(Number(selectedMonth!.slice(5, 7)) / 3)}`;

    expect(new Set(state.dataEntryGets.map(({ period }) => period))).toEqual(new Set([selectedMonth, selectedQuarter, selectedYear]));
    expect(new Set(state.evidenceGets.map(({ period }) => period))).toEqual(new Set([selectedMonth, selectedQuarter, selectedYear]));
    await expect(page.getByTestId("metrics-data-summary")).toHaveText("2 of 5 complete · 2 need updating · 1 need evidence");
    await expect(stateBadges).toHaveCount(5);
    await expect(stateBadges.filter({ hasText: "Needs update" })).toHaveCount(2);
    await expect(stateBadges.filter({ hasText: "Needs evidence" })).toHaveCount(1);
    await expect(stateBadges.filter({ hasText: "Complete" })).toHaveCount(2);

    const filterCount = async (testId: string) => Number(await page.getByTestId(testId).locator("span").first().innerText());
    const total = await filterCount("filter-metrics-all");
    const needsData = await filterCount("filter-metrics-needs-data");
    const needsEvidence = await filterCount("filter-metrics-needs-evidence");
    const complete = await filterCount("filter-metrics-complete");
    expect(needsData + needsEvidence + complete).toBe(total);

    const turnoverRow = page.getByTestId("metric-data-row-metric-turnover");
    const boardRow = page.getByTestId("metric-data-row-metric-board");
    const policyRow = page.getByTestId("metric-data-row-metric-policy");
    const calculatedRow = page.getByTestId("metric-data-row-metric-intensity");
    await expect(turnoverRow).toContainText("0 %");
    await expect(page.getByTestId("metric-data-state-metric-turnover")).toHaveText("Needs evidence");
    await expect(turnoverRow.getByText("Evidence needs replacing", { exact: true })).toBeVisible();
    await expect(boardRow).toContainText(`No value for ${selectedQuarter}`);
    await expect(boardRow.getByText("quarterly", { exact: true })).toBeVisible();
    await expect(policyRow.getByText("No", { exact: true })).toBeVisible();
    await expect(policyRow.getByText("annual", { exact: true })).toBeVisible();
    await expect(page.getByTestId("metric-data-state-metric-policy")).toHaveText("Complete");
    await expect(policyRow.getByText("Evidence attached", { exact: true })).toBeVisible();
    await expect(calculatedRow).toContainText("2.5 tCO2e/FTE");
    await expect(page.getByTestId("metric-data-state-metric-intensity")).toHaveText("Complete");
    await expect(calculatedRow.getByText("Source inputs used", { exact: true })).toBeVisible();
    await expect(calculatedRow.getByText("Evidence needed", { exact: true })).toHaveCount(0);
    await page.screenshot({ path: "output/playwright/metrics-data-desktop.png" });

    await page.getByTestId("filter-metrics-needs-data").click();
    await expect(page.locator('[data-testid^="metric-data-row-"]')).toHaveCount(2);
    await expect(page.getByTestId("metric-data-row-metric-electricity")).toBeVisible();
    await expect(boardRow).toBeVisible();

    await page.getByTestId("filter-metrics-needs-evidence").click();
    await expect(page.locator('[data-testid^="metric-data-row-"]')).toHaveCount(1);
    await expect(turnoverRow).toBeVisible();

    await page.getByTestId("filter-metrics-complete").click();
    await expect(page.locator('[data-testid^="metric-data-row-"]')).toHaveCount(2);
    await expect(policyRow).toBeVisible();
    await expect(calculatedRow).toBeVisible();

    await page.getByTestId("filter-metrics-all").click();
    await page.getByTestId("input-search-tracked-metrics").fill("turnover");
    await expect(page.locator('[data-testid^="metric-data-row-"]')).toHaveCount(1);
    await expect(turnoverRow).toBeVisible();
    await page.getByTestId("filter-metrics-needs-data").click();
    await expect(page.getByTestId("empty-state-title")).toHaveText("No metrics match");
    await page.getByTestId("empty-state-primary-action").click();
    await expect(page.getByTestId("input-search-tracked-metrics")).toHaveValue("");
    await expect(page.locator('[data-testid^="metric-data-row-"]')).toHaveCount(5);

    await page.getByTestId("button-open-metric-metric-turnover").click();
    const turnoverEvidence = page.locator('[data-testid^="metric-evidence-metric-turnover-"]');
    await expect(turnoverEvidence).toHaveCount(1);
    await expect(turnoverEvidence).toContainText("turnover-working-paper.xlsx");
    await expect(turnoverEvidence).toContainText("Rejected");
    await page.getByTestId("button-back-from-manual-entry").click();

    await page.getByTestId("button-open-metric-metric-policy").click();
    const policyDetail = page.getByTestId("manual-row-metric-policy");
    await expect(policyDetail).toBeVisible();
    await expect(policyDetail.getByText("No", { exact: true })).toBeVisible();
    const policyEvidence = page.locator('[data-testid^="metric-evidence-metric-policy-"]');
    await expect(policyEvidence).toHaveCount(1);
    await expect(policyEvidence).toContainText("whistleblowing-policy.pdf");
    await expect(policyDetail).not.toContainText("out-of-period-policy.pdf");
    await expect(page.getByTestId("button-attach-evidence-metric-policy")).toContainText("1");
    await page.getByTestId("button-back-from-manual-entry").click();

    await page.getByTestId("button-open-metric-metric-intensity").click();
    const calculationDetail = page.getByTestId("manual-row-metric-intensity");
    await expect(calculationDetail).toBeVisible();
    await expect(page.getByTestId("calculation-detail-metric-intensity")).toContainText("Total scope 1 and 2 emissions / employee headcount");
    await expect(page.getByTestId("calculated-value-metric-intensity")).toContainText("2.5 tCO2e/FTE");
    await expect(page.getByTestId("calculated-value-metric-intensity")).toContainText(selectedMonth!);
    await expect(page.getByTestId("calculated-value-metric-intensity")).toContainText("Read only");
    await expect(page.getByTestId("input-manual-metric-intensity")).toHaveCount(0);
    await expect(page.getByTestId("input-notes-metric-intensity")).toHaveCount(0);
    await expect(page.getByTestId("select-source-type-metric-intensity")).toHaveCount(0);
    await expect(page.getByTestId("button-attach-evidence-metric-intensity")).toHaveCount(0);
    await expect(page.getByTestId("button-save-manual-metric-intensity")).toHaveCount(0);
    await expect(calculationDetail.getByText("Evidence needed", { exact: true })).toHaveCount(0);

    await context.close();
  });

  test("launches update methods, embeds metric management, and keeps only two workspace tabs", async ({ browser }) => {
    const { context, page, state } = await openMetricsWorkspace(browser, "admin");
    const workspaceNavigation = page.getByRole("navigation", { name: "Data and evidence workspace" });

    await expect(workspaceNavigation.getByRole("link")).toHaveCount(2);
    await expect(page.getByTestId("tab-metrics-data")).toHaveAttribute("aria-current", "page");
    await expect(page.getByTestId("tab-documents")).not.toHaveAttribute("aria-current", "page");

    await page.getByTestId("button-update-data").click();
    await expect(page.getByTestId("action-guided-entry")).toBeVisible();
    await expect(page.getByTestId("action-spreadsheet-import")).toBeVisible();
    await page.getByTestId("action-guided-entry").click();
    await expect(page.getByTestId("panel-guided-entry")).toBeVisible();
    await page.getByTestId("button-back-from-guided-entry").click();
    await expect(page.getByTestId("metrics-data-overview")).toBeVisible();

    await page.getByTestId("button-update-data").click();
    await page.getByTestId("action-spreadsheet-import").click();
    await expect(page.getByTestId("panel-spreadsheet-import")).toBeVisible();
    await page.getByTestId("button-back-from-spreadsheet-import").click();
    await expect(page.getByTestId("metrics-data-overview")).toBeVisible();

    await page.getByTestId("button-manage-metrics").click();
    await expect(page.getByTestId("panel-manage-metrics")).toBeVisible();
    await expect(page.getByTestId("metrics-library-embedded")).toBeVisible();
    await expect(page.getByTestId("button-library-add-metric")).toBeVisible();
    await page.getByTestId("input-search-metrics").fill("Electricity consumed");
    const electricityToggle = page.getByTestId("toggle-metric-def-electricity");
    await expect(electricityToggle).toHaveAttribute("aria-checked", "true");
    await electricityToggle.click();
    await expect(electricityToggle).toHaveAttribute("aria-checked", "false");
    expect(state.definitions.find((definition) => definition.id === "def-electricity")?.isActive).toBe(false);
    await page.getByTestId("button-back-to-metrics-data").click();
    await expect(page.getByTestId("metrics-data-overview")).toBeVisible();
    await expect(page.getByTestId("metric-data-row-metric-electricity")).toHaveCount(0);
    await expect(page.getByTestId("metrics-data-summary")).toHaveText("2 of 4 complete · 1 need updating · 1 need evidence");

    await page.getByTestId("tab-documents").click();
    await expect(page).toHaveURL(/\/evidence\?period=\d{4}-\d{2}&siteId=__org__$/);
    await expect(page.getByTestId("tab-documents")).toHaveAttribute("aria-current", "page");
    await context.close();
  });

  test("resolves Framework Readiness definition links and explains disabled mappings", async ({ browser }) => {
    const { context, page } = await openMetricsWorkspace(browser, "admin", {
      path: "/data-entry?metric=def-policy&period=2026-08&siteId=__org__",
    });

    await expect(page).toHaveURL(/\/data-entry\?metric=def-policy&period=2026-08&siteId=__org__$/);
    await expect(page.getByTestId("panel-manual-metric-entry")).toBeVisible();
    await expect(page.getByTestId("heading-metric-details")).toHaveText("Metric details");
    await expect(page.locator('[data-testid^="manual-row-"]')).toHaveCount(1);
    await expect(page.getByTestId("manual-row-metric-policy")).toBeVisible();
    await expect(page.locator('[data-testid^="metric-evidence-metric-policy-"]')).toHaveCount(1);
    await expect(page.locator('[data-testid^="metric-evidence-metric-policy-"]')).toContainText("whistleblowing-policy.pdf");

    await context.close();

    const disabled = await openMetricsWorkspace(browser, "admin", {
      path: "/data-entry?metric=def-board&period=2026-08&siteId=__org__",
      disabledDefinitionIds: ["def-board"],
    });
    await expect(disabled.page.getByTestId("panel-manual-metric-entry")).toBeVisible();
    await expect(disabled.page.getByTestId("empty-state-title")).toHaveText("Enable this metric first");
    await expect(disabled.page.getByTestId("empty-state-description")).toContainText("Board meetings held");
    await disabled.page.getByTestId("empty-state-primary-action").click();
    await expect(disabled.page.getByTestId("panel-manage-metrics")).toBeVisible();
    await disabled.page.getByTestId("input-search-metrics").fill("Board meetings held");
    await expect(disabled.page.getByTestId("toggle-metric-def-board")).toHaveAttribute("aria-checked", "false");
    await disabled.context.close();
  });

  test("saves quarterly and annual manual metrics to canonical periods while calculated results stay monthly", async ({ browser }) => {
    const { context, page, state } = await openMetricsWorkspace(browser, "admin", {
      path: "/data-entry?period=2026-08&siteId=__org__",
    });

    await page.getByTestId("button-open-metric-metric-board").click();
    await expect(page.getByTestId("manual-row-metric-board")).toContainText("2026-Q3");
    await page.getByTestId("input-manual-metric-board").fill("4");
    await page.getByTestId("button-save-manual-metric-board").click();
    await expect.poll(() => state.manualRequests.filter(({ metricId }) => metricId === "metric-board").length).toBe(1);
    expect(state.manualRequests.find(({ metricId }) => metricId === "metric-board")).toMatchObject({
      metricId: "metric-board",
      period: "2026-Q3",
      value: "4",
      siteId: null,
    });
    await page.getByTestId("button-back-from-manual-entry").click();
    await expect(page.getByTestId("metric-data-row-metric-board")).toContainText("4 meetings");

    await page.getByTestId("button-open-metric-metric-policy").click();
    await expect(page.getByTestId("manual-row-metric-policy")).toContainText("2026");
    await page.getByTestId("input-manual-metric-policy").click();
    await page.getByRole("option", { name: "Yes", exact: true }).click();
    await page.getByTestId("button-save-manual-metric-policy").click();
    await expect.poll(() => state.manualRequests.filter(({ metricId }) => metricId === "metric-policy").length).toBe(1);
    expect(state.manualRequests.find(({ metricId }) => metricId === "metric-policy")).toMatchObject({
      metricId: "metric-policy",
      period: "2026",
      value: "Yes",
      siteId: null,
    });
    await page.getByTestId("button-back-from-manual-entry").click();
    await expect(page.getByTestId("metric-data-row-metric-policy").getByText("Yes", { exact: true })).toBeVisible();

    await page.getByTestId("button-open-metric-metric-intensity").click();
    await expect(page.getByTestId("calculated-value-metric-intensity")).toContainText("Calculated result for 2026-08");
    await expect(page.getByTestId("button-save-manual-metric-intensity")).toHaveCount(0);
    expect(state.manualRequests.some(({ metricId }) => metricId === "metric-intensity")).toBe(false);

    await context.close();
  });

  test("pastes, validates, commits and reloads spreadsheet values into the overview", async ({ browser }) => {
    const { context, page, state } = await openMetricsWorkspace(browser, "admin");

    await page.getByTestId("button-update-data").click();
    await page.getByTestId("action-spreadsheet-import").click();
    await expect(page.getByTestId("panel-spreadsheet-import")).toBeVisible();
    await expect(page.getByTestId("paste-grid-cell-0-0")).toBeVisible();
    expect(state.lastGridPeriods).toHaveLength(6);
    const initialGridGetCount = state.bulkGridGetCount;
    const penultimatePeriod = state.lastGridPeriods[4];
    const selectedPeriod = state.lastGridPeriods[5];

    await pasteClipboardBlock(page.getByTestId("paste-grid-cell-0-4"), "125\t126");
    await expect(page.getByTestId("paste-grid-cell-0-4")).toHaveValue("125");
    await expect(page.getByTestId("paste-grid-cell-0-5")).toHaveValue("126");
    await expect.poll(() => state.bulkRequests.filter((request) => request.mode === "validate").length).toBeGreaterThan(0);
    await expect(page.getByText("2 new, 0 updated, and 0 cleared.", { exact: true })).toBeVisible();
    await expect(page.getByTestId("button-save-paste-grid")).toBeEnabled();

    const validateRequest = state.bulkRequests.filter((request) => request.mode === "validate").at(-1);
    expect(validateRequest).toMatchObject({
      mode: "validate",
      siteId: null,
      cells: [
        { metricId: "metric-electricity", period: penultimatePeriod, rawValue: "125", rowIndex: 0, columnIndex: 4 },
        { metricId: "metric-electricity", period: selectedPeriod, rawValue: "126", rowIndex: 0, columnIndex: 5 },
      ],
    });

    await page.getByTestId("button-save-paste-grid").click();
    await expect.poll(() => state.bulkRequests.filter((request) => request.mode === "commit").length).toBe(1);
    const commitRequest = state.bulkRequests.find((request) => request.mode === "commit");
    expect(commitRequest).toMatchObject({
      mode: "commit",
      siteId: null,
      cells: validateRequest?.cells,
    });
    await expect.poll(() => state.bulkGridGetCount).toBeGreaterThan(initialGridGetCount);
    await expect(page.getByTestId("paste-grid-cell-0-4")).toHaveValue("125");
    await expect(page.getByTestId("paste-grid-cell-0-5")).toHaveValue("126");
    await expect(page.getByTestId("button-save-paste-grid")).toBeDisabled();
    expect(state.gridValues.get(`metric-electricity::${selectedPeriod}`)?.value).toBe("126");

    await page.getByTestId("button-back-from-spreadsheet-import").click();
    await expect(page.getByTestId("metric-data-row-metric-electricity")).toContainText("126 kWh");
    await expect(page.getByTestId("metric-data-state-metric-electricity")).toHaveText("Needs evidence");
    await expect(page.getByTestId("metrics-data-summary")).toHaveText("2 of 5 complete · 1 need updating · 2 need evidence");

    await context.close();
  });

  test("switches workspace scope after importing a CSV into another site", async ({ browser }) => {
    const sites = [
      { id: "site-a", companyId: "mock-company", name: "London Office", type: "office", status: "active" },
      { id: "site-b", companyId: "mock-company", name: "Bristol Office", type: "office", status: "active" },
    ];
    const { context, page, state } = await openMetricsWorkspace(browser, "admin", {
      path: "/data-entry?period=2026-08&siteId=site-a",
      sites,
      activeSiteId: "site-a",
    });
    const initialRawGetCount = state.rawDataGetCount;

    await page.getByTestId("button-update-data").click();
    await page.getByTestId("action-spreadsheet-import").click();
    await page.getByTestId("button-open-carbon-import").click();
    const dialog = page.getByRole("dialog", { name: "Upload a CSV file" });
    await expect(dialog).toBeVisible();
    await page.getByTestId("select-import-site").click();
    await page.getByRole("option", { name: "Bristol Office", exact: true }).click();
    await dialog.locator('input[type="file"][accept=".csv"]').setInputFiles({
      name: "electricity.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("Electricity kWh\n321\n"),
    });

    await expect.poll(() => state.importParseRequests.length).toBe(1);
    expect(state.importParseRequests[0]).toMatchObject({ format: "csv", siteId: "site-b" });
    await expect(dialog.getByText("1 row parsed, 1 column detected", { exact: true })).toBeVisible();
    await expect(page.getByTestId("select-mapping-0")).toContainText("Electricity Consumption");
    await page.getByTestId("button-confirm-import").click();

    await expect.poll(() => state.importConfirmRequests.length).toBe(1);
    expect(state.importConfirmRequests[0]).toMatchObject({
      mappings: [{ column: "Electricity kWh", inputKey: "electricity_kwh" }],
      rows: [{ "Electricity kWh": "321" }],
      period: "2026-08",
      siteId: "site-b",
    });
    await expect(dialog.getByText("Import Complete", { exact: true })).toBeVisible();
    await expect(dialog).toContainText("Imported: 1");
    await expect.poll(() => state.rawDataGetCount).toBeGreaterThan(initialRawGetCount);
    await page.getByTestId("button-import-done").click();
    await expect(page).toHaveURL(/siteId=site-b/);
    await expect(page.getByTestId("select-data-entry-site-scope")).toContainText("Bristol Office");
    await expect.poll(() => state.rawDataGets.at(-1)).toEqual({ period: "2026-08", siteId: "site-b" });
    await page.getByTestId("button-back-from-spreadsheet-import").click();

    await page.getByTestId("button-update-data").click();
    await page.getByTestId("action-guided-entry").click();
    await expect(page.getByTestId("input-raw-electricity_kwh")).toHaveValue("321");

    await context.close();
  });

  test("preserves period and site scope when moving to Documents and back", async ({ browser }) => {
    const site = { id: "site-a", companyId: "mock-company", name: "London Office", type: "office", status: "active" };
    const { context, page } = await openMetricsWorkspace(browser, "admin", {
      path: "/data-entry?period=2026-08&siteId=site-a",
      sites: [site],
      activeSiteId: "site-a",
    });

    await expect(page.getByTestId("select-period")).toContainText("2026-08");
    await expect(page.getByTestId("select-data-entry-site-scope")).toContainText("London Office");
    await expect(page.getByTestId("tab-documents")).toHaveAttribute("href", "/evidence?period=2026-08&siteId=site-a");
    await page.getByTestId("tab-documents").click();
    await expect(page.getByTestId("text-evidence-title")).toContainText("Documents");
    await expect(page.getByTestId("tab-documents")).toHaveAttribute("aria-current", "page");
    expect(new URL(page.url()).searchParams.get("period")).toBe("2026-08");
    expect(new URL(page.url()).searchParams.get("siteId")).toBe("site-a");

    const metricsDataLink = page.getByTestId("tab-metrics-data");
    const reverseHref = await metricsDataLink.getAttribute("href");
    expect(reverseHref).toBeTruthy();
    const reverseUrl = new URL(reverseHref!, "http://example.test");
    expect(reverseUrl.searchParams.get("period")).toBe("2026-08");
    expect(reverseUrl.searchParams.get("siteId")).toBe("site-a");
    await metricsDataLink.click();
    await expect(page.getByRole("heading", { name: "Metrics & data", exact: true })).toBeVisible();
    await expect(page.getByTestId("select-period")).toContainText("2026-08");
    await expect(page.getByTestId("select-data-entry-site-scope")).toContainText("London Office");

    await context.close();
  });

  test("opens scoped history for boolean and numeric metrics with typed values", async ({ browser }) => {
    const site = { id: "site-a", companyId: "mock-company", name: "London Office", type: "office", status: "active" };
    const { context, page } = await openMetricsWorkspace(browser, "admin", {
      path: "/data-entry?period=2026-08&siteId=site-a",
      sites: [site],
      activeSiteId: "site-a",
    });

    await page.getByTestId("button-open-metric-metric-policy").click();
    await page.getByTestId("button-view-metric-history").click();
    let historyUrl = new URL(page.url());
    expect(historyUrl.pathname).toBe("/metrics");
    expect(historyUrl.searchParams.get("metric")).toBe("metric-policy");
    expect(historyUrl.searchParams.get("period")).toBe("2026-08");
    expect(historyUrl.searchParams.get("metricPeriod")).toBe("2026");
    expect(historyUrl.searchParams.get("siteId")).toBe("site-a");
    const policyDialog = page.getByRole("dialog", { name: /Whistleblowing policy in place/i });
    await expect(policyDialog).toBeVisible();
    await expect(policyDialog.getByTestId("status-dot-red")).toHaveCount(2);
    await expect(policyDialog.getByTestId("text-current-value")).toHaveText("No");
    await expect(policyDialog.getByTestId("metric-detail-evidence-history-evidence-policy")).toContainText("whistleblowing-policy.pdf");

    await page.keyboard.press("Escape");
    await expect(page.getByRole("heading", { name: "Metrics & data", exact: true })).toBeVisible();
    expect(new URL(page.url()).searchParams.get("period")).toBe("2026-08");
    expect(new URL(page.url()).searchParams.get("siteId")).toBe("site-a");

    await page.getByTestId("button-open-metric-metric-electricity").click();
    await page.getByTestId("button-view-metric-history").click();
    historyUrl = new URL(page.url());
    expect(historyUrl.searchParams.get("metric")).toBe("metric-electricity");
    expect(historyUrl.searchParams.get("metricPeriod")).toBe("2026-08");
    expect(historyUrl.searchParams.get("siteId")).toBe("site-a");
    const electricityDialog = page.getByRole("dialog", { name: /Electricity consumed/i });
    await expect(electricityDialog.getByTestId("text-current-value")).toHaveText("126");
    await expect(electricityDialog.getByText("Trend", { exact: true })).toBeVisible();

    await context.close();
  });

  test("keeps a missing selected history period empty and shows the actual prior value", async ({ browser }) => {
    const site = { id: "site-a", companyId: "mock-company", name: "London Office", type: "office", status: "active" };
    const { context, page } = await openMetricsWorkspace(browser, "admin", {
      path: "/data-entry?period=2026-06&siteId=site-a",
      sites: [site],
      activeSiteId: "site-a",
    });

    await page.getByTestId("button-open-metric-metric-electricity").click();
    await page.getByTestId("button-view-metric-history").click();

    const historyUrl = new URL(page.url());
    expect(historyUrl.pathname).toBe("/metrics");
    expect(historyUrl.searchParams.get("metricPeriod")).toBe("2026-06");
    expect(historyUrl.searchParams.get("siteId")).toBe("site-a");

    const dialog = page.getByRole("dialog", { name: /Electricity consumed/i });
    await expect(dialog.getByText("Selected (2026-06)", { exact: true })).toBeVisible();
    await expect(dialog.getByTestId("text-current-value")).toHaveText("—");
    await expect(dialog.getByTestId("text-previous-value")).toHaveText("115");
    await expect(dialog.getByTestId("text-current-value")).not.toHaveText(/126|120/);

    await context.close();
  });

  test("keeps the viewer workspace and embedded metric set read-only", async ({ browser }) => {
    const { context, page } = await openMetricsWorkspace(browser, "viewer");

    await expect(page.getByTestId("badge-read-only")).toBeVisible();
    await expect(page.getByTestId("button-update-data")).toHaveCount(0);
    await expect(page.getByTestId("button-manage-metrics")).toHaveText("View metric set");
    await expect(page.locator('[data-testid^="metric-data-row-"]')).toHaveCount(5);
    await expect(page.getByTestId("button-open-metric-metric-turnover")).toHaveText("View");

    await page.getByTestId("button-open-metric-metric-turnover").click();
    await expect(page.getByTestId("input-manual-metric-turnover")).toBeDisabled();
    await expect(page.getByTestId("button-attach-evidence-metric-turnover")).toBeDisabled();
    await expect(page.getByTestId("button-save-manual-metric-turnover")).toHaveCount(0);
    await page.getByTestId("button-back-from-manual-entry").click();

    await page.getByTestId("button-manage-metrics").click();
    await expect(page.getByTestId("metrics-library-embedded")).toContainText("read-only access");
    await expect(page.getByTestId("button-library-add-metric")).toHaveCount(0);
    await page.getByTestId("input-search-metrics").fill("Whistleblowing policy");
    await expect(page.getByTestId("toggle-metric-def-policy")).toBeVisible();
    await expect(page.getByTestId("toggle-metric-def-policy")).toBeDisabled();
    await page.getByTestId("button-back-to-metrics-data").click();
    await expect(page.getByTestId("metrics-data-overview")).toBeVisible();

    await context.close();
  });

  test("keeps core actions usable at 360px without horizontal page overflow", async ({ browser }) => {
    const { context, page } = await openMetricsWorkspace(browser, "admin", {
      viewport: { width: 360, height: 740 },
    });

    await expect(page.getByTestId("tab-metrics-data")).toBeVisible();
    await expect(page.getByTestId("tab-documents")).toBeVisible();
    await expect(page.getByTestId("button-update-data")).toBeVisible();
    await expect(page.getByTestId("button-manage-metrics")).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.getByTestId("button-update-data").click();
    await expect(page.getByTestId("action-guided-entry")).toBeVisible();
    await expect(page.getByTestId("action-spreadsheet-import")).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await page.getByTestId("action-guided-entry").click();
    await expect(page.getByTestId("panel-guided-entry")).toBeVisible();
    await page.getByTestId("button-back-from-guided-entry").click();

    await page.getByTestId("button-update-data").click();
    await page.getByTestId("action-spreadsheet-import").click();
    await expect(page.getByTestId("paste-grid-cell-0-0")).toBeVisible();
    await page.getByTestId("button-open-carbon-import").click();
    const importDialog = page.getByRole("dialog", { name: "Upload a CSV file" });
    await expect(importDialog).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await importDialog.locator('input[type="file"][accept=".csv"]').setInputFiles({
      name: "mobile-electricity.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("Electricity kWh\n321\n"),
    });
    await expect(page.getByTestId("select-mapping-0")).toBeVisible();
    await expect(page.getByTestId("button-confirm-import")).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await page.screenshot({ path: "output/playwright/metrics-data-import-mobile.png" });
    await page.keyboard.press("Escape");
    await expect(importDialog).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
    const gridScroller = page.getByTestId("paste-grid-cell-0-0").locator("xpath=ancestor::div[contains(@class, 'overflow-x-auto')]");
    const gridDimensions = await gridScroller.evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }));
    expect(gridDimensions.scrollWidth).toBeGreaterThan(gridDimensions.clientWidth);
    await page.getByTestId("button-back-from-spreadsheet-import").click();

    await page.getByTestId("button-manage-metrics").click();
    await expect(page.getByTestId("metrics-library-embedded")).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await page.getByTestId("button-back-to-metrics-data").click();
    await expect(page.getByTestId("metrics-data-overview")).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await page.screenshot({ path: "output/playwright/metrics-data-mobile.png" });

    await context.close();
  });
});
