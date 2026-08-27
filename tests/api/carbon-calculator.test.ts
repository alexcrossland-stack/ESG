/**
 * API regression: UK 2026 carbon calculator provenance, totals, permissions,
 * tenant isolation, and organisation/site scoping.
 *
 * This suite creates isolated fixture tenants and must only be run against a
 * disposable API/database pair:
 *   BASE_URL=http://localhost:5000 DATABASE_URL=postgresql://... \
 *     npx tsx tests/api/carbon-calculator.test.ts
 */

import {
  CURRENT_UK_FACTOR_SOURCE,
  CURRENT_UK_FACTOR_SOURCE_URL,
  CURRENT_UK_FACTOR_YEAR,
} from "../../shared/emission-factor-metadata";
import { apiRequest, apiRequestRaw, seedTestTenants } from "../fixtures/seed.js";
import type { SeededTenants } from "../fixtures/seed.js";

interface TestResult {
  name: string;
  passed: boolean;
  detail?: string;
}

interface ApiEmissionFactor {
  name: string;
  category: string;
  country: string;
  unit: string;
  factor: string;
  sourceLabel?: string | null;
  factorYear?: number | null;
  methodology?: string | null;
}

interface CarbonLineItem {
  source?: string;
  scope?: number;
  calculation?: string;
  factorSource?: string;
  factorYear?: number;
  methodology?: string;
  dataQuality?: string;
}

interface CarbonCalculation {
  id: string;
  companyId?: string;
  reportingPeriod?: string;
  periodType?: string;
  siteId?: string | null;
  scope1Total?: string;
  scope2Total?: string;
  scope3Total?: string;
  totalEmissions?: string;
  factorYear?: number;
  methodologyNotes?: CarbonLineItem[];
  results?: {
    scope1Total?: number;
    scope2Total?: number;
    scope3Total?: number;
    totalEmissions?: number;
    factorYear?: number;
    unit?: string;
    breakdown?: Record<string, number>;
    lineItems?: CarbonLineItem[];
  };
}

const results: TestResult[] = [];

function pass(name: string, detail?: string) {
  results.push({ name, passed: true, detail });
  console.log(`  PASS  ${name}${detail ? ` - ${detail}` : ""}`);
}

function fail(name: string, detail?: string) {
  results.push({ name, passed: false, detail });
  console.error(`  FAIL  ${name}${detail ? ` - ${detail}` : ""}`);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function check(name: string, fn: () => Promise<string | void> | string | void) {
  try {
    const detail = await fn();
    pass(name, typeof detail === "string" ? detail : undefined);
  } catch (error: any) {
    fail(name, error?.message || String(error));
  }
}

function parseJson<T>(response: { status: number; body: string }, context: string): T {
  assert(
    response.status >= 200 && response.status < 300,
    `${context} status=${response.status} body=${response.body.slice(0, 400)}`,
  );
  return JSON.parse(response.body) as T;
}

function parseError(response: { status: number; body: string }) {
  try {
    return JSON.parse(response.body) as { error?: string; code?: string };
  } catch {
    return {};
  }
}

async function createSite(token: string, name: string): Promise<string> {
  const response = await apiRequest("POST", "/api/sites", {
    name,
    type: "office",
    country: "United Kingdom",
  }, token);
  const site = parseJson<{ id?: string }>(response, "POST /api/sites");
  assert(site.id, "created site response is missing id");
  return site.id;
}

const EXACT_INPUTS = {
  country: "UK",
  electricity: 1000,
  gas: 1000,
  diesel: 10,
  domesticFlights: 100,
  railTravel: 100,
  hotelNights: 2,
};

function calculationPayload(
  reportingPeriod: string,
  siteId: string | null,
  inputs: Record<string, string | number> = EXACT_INPUTS,
) {
  return {
    inputs,
    reportingPeriod,
    periodType: "annual",
    employeeCount: 10,
    dataQuality: {
      electricity: "actual",
      gas: "actual",
      diesel: "actual",
      domesticFlights: "actual",
      railTravel: "actual",
      hotelNights: "actual",
    },
    siteId,
  };
}

async function calculate(
  token: string,
  reportingPeriod: string,
  siteId: string | null,
  inputs?: Record<string, string | number>,
): Promise<CarbonCalculation> {
  const response = await apiRequest(
    "POST",
    "/api/carbon/calculate",
    calculationPayload(reportingPeriod, siteId, inputs),
    token,
  );
  const calculation = parseJson<CarbonCalculation>(response, "POST /api/carbon/calculate");
  assert(calculation.id, "created carbon calculation response is missing id");
  return calculation;
}

function assertStatus(
  response: { status: number; body: string },
  expected: number,
  context: string,
) {
  assert(
    response.status === expected,
    `${context}: expected ${expected}, got ${response.status}; body=${response.body.slice(0, 400)}`,
  );
}

async function run(tenants: SeededTenants) {
  const suffix = Date.now().toString();
  const period = "2198";
  const siteAId = await createSite(tenants.tenantA.adminToken, `Carbon Site A ${suffix}`);
  const tenantBSiteId = await createSite(tenants.tenantB.adminToken, `Carbon Site B ${suffix}`);

  await check("factor endpoint returns one coherent 2026 UK Government factor set", async () => {
    const response = await apiRequest("GET", "/api/carbon/factors?country=UK", undefined, tenants.tenantA.adminToken);
    const factors = parseJson<ApiEmissionFactor[]>(response, "GET /api/carbon/factors");
    assert(factors.length === 11, `expected exactly 11 UK factors, got ${factors.length}`);

    const factorYears = [...new Set(factors.map((factor) => factor.factorYear))];
    assert(
      factorYears.length === 1 && factorYears[0] === CURRENT_UK_FACTOR_YEAR,
      `factor response mixed publication years: ${JSON.stringify(factorYears)}`,
    );
    assert(
      factors.every((factor) => factor.sourceLabel === CURRENT_UK_FACTOR_SOURCE),
      "one or more UK factors has unexpected source provenance",
    );
    assert(
      factors.every((factor) => factor.methodology?.includes(CURRENT_UK_FACTOR_SOURCE_URL)),
      "one or more UK factors omits the official source URL",
    );

    const byName = new Map(factors.map((factor) => [factor.name, factor]));
    const expectedFactors: Record<string, { factor: string; unit: string }> = {
      "Grid Electricity": { factor: "0.130960", unit: "kgCO2e/kWh" },
      "Natural Gas": { factor: "0.182310", unit: "kgCO2e/kWh" },
      Diesel: { factor: "2.583540", unit: "kgCO2e/litre" },
      Petrol: { factor: "2.075000", unit: "kgCO2e/litre" },
      LPG: { factor: "1.557130", unit: "kgCO2e/litre" },
      "Average Company Car": { factor: "0.266990", unit: "kgCO2e/mile" },
      "Domestic Flight": { factor: "0.229280", unit: "kgCO2e/passenger-km" },
      "Short-haul Flight": { factor: "0.127860", unit: "kgCO2e/passenger-km" },
      "Long-haul Flight": { factor: "0.152820", unit: "kgCO2e/passenger-km" },
      "Rail Travel": { factor: "0.030920", unit: "kgCO2e/passenger-km" },
      "Hotel Nights": { factor: "10.400000", unit: "kgCO2e/room-night" },
    };
    for (const [name, expected] of Object.entries(expectedFactors)) {
      const factor = byName.get(name);
      assert(factor, `${name} factor is missing`);
      assert(factor.factor === expected.factor, `${name}: expected ${expected.factor}, got ${factor.factor}`);
      assert(factor.unit === expected.unit, `${name}: expected ${expected.unit}, got ${factor.unit}`);
    }
    return `${factors.length} factors, all ${CURRENT_UK_FACTOR_YEAR}`;
  });

  await check("an active-site company must explicitly choose organisation or site scope", async () => {
    const payload = calculationPayload(period, null);
    const { siteId: _omitted, ...withoutScope } = payload;
    const response = await apiRequest("POST", "/api/carbon/calculate", withoutScope, tenants.tenantA.adminToken);
    assertStatus(response, 400, "missing scope calculation");
    const error = parseError(response).error || "";
    assert(/select a site|organisation-wide/i.test(error), `unclear scope error: ${error}`);
  });

  const organisationCalculation = await calculate(tenants.tenantA.adminToken, period, null);

  await check("calculator persists exact line-rounded Scope 1, 2, 3 and total emissions", () => {
    assert(organisationCalculation.siteId === null, `expected organisation siteId=null, got ${organisationCalculation.siteId}`);
    assert(organisationCalculation.scope1Total === "208.1500", `scope1=${organisationCalculation.scope1Total}`);
    assert(organisationCalculation.scope2Total === "130.9600", `scope2=${organisationCalculation.scope2Total}`);
    assert(organisationCalculation.scope3Total === "46.8200", `scope3=${organisationCalculation.scope3Total}`);
    assert(organisationCalculation.totalEmissions === "385.9300", `total=${organisationCalculation.totalEmissions}`);
    assert(organisationCalculation.factorYear === CURRENT_UK_FACTOR_YEAR, `factorYear=${organisationCalculation.factorYear}`);

    const calculated = organisationCalculation.results;
    assert(calculated?.scope1Total === 208.15, `results.scope1Total=${calculated?.scope1Total}`);
    assert(calculated?.scope2Total === 130.96, `results.scope2Total=${calculated?.scope2Total}`);
    assert(calculated?.scope3Total === 46.82, `results.scope3Total=${calculated?.scope3Total}`);
    assert(calculated?.totalEmissions === 385.93, `results.totalEmissions=${calculated?.totalEmissions}`);
    assert(calculated?.unit === "kgCO2e", `results.unit=${calculated?.unit}`);

    const expectedBreakdown: Record<string, number> = {
      electricity: 130.96,
      gas: 182.31,
      diesel: 25.84,
      domesticFlights: 22.93,
      rail: 3.09,
      hotelNights: 20.8,
    };
    for (const [key, expected] of Object.entries(expectedBreakdown)) {
      assert(calculated?.breakdown?.[key] === expected, `${key}=${calculated?.breakdown?.[key]}, expected ${expected}`);
    }
    return "scope1=208.1500 scope2=130.9600 scope3=46.8200 total=385.9300 kgCO2e";
  });

  await check("calculation methodology does not mix factor years or provenance", () => {
    const lineItems = organisationCalculation.methodologyNotes || organisationCalculation.results?.lineItems || [];
    assert(lineItems.length === 6, `expected 6 line items, got ${lineItems.length}`);
    assert(
      lineItems.every((line) => line.factorYear === CURRENT_UK_FACTOR_YEAR),
      `mixed line-item factor years: ${JSON.stringify(lineItems.map((line) => line.factorYear))}`,
    );
    assert(
      lineItems.every((line) => line.factorSource === CURRENT_UK_FACTOR_SOURCE),
      "line-item source provenance does not match the selected factor set",
    );
    assert(
      lineItems.every((line) => line.methodology?.includes(CURRENT_UK_FACTOR_SOURCE_URL)),
      "line-item methodology omits the official source URL",
    );
  });

  const siteCalculation = await calculate(
    tenants.tenantA.adminToken,
    period,
    siteAId,
    { country: "UK", electricity: 100 },
  );
  const tenantBCalculation = await calculate(
    tenants.tenantB.adminToken,
    period,
    null,
    { country: "UK", electricity: 50 },
  );

  await check("organisation, site and all-scope calculation lists are isolated correctly", async () => {
    const orgResponse = await apiRequest(
      "GET",
      `/api/carbon/calculations?period=${period}&siteId=null`,
      undefined,
      tenants.tenantA.adminToken,
    );
    const siteResponse = await apiRequest(
      "GET",
      `/api/carbon/calculations?period=${period}&siteId=${encodeURIComponent(siteAId)}`,
      undefined,
      tenants.tenantA.adminToken,
    );
    const allResponse = await apiRequest(
      "GET",
      `/api/carbon/calculations?period=${period}`,
      undefined,
      tenants.tenantA.adminToken,
    );
    const orgRows = parseJson<CarbonCalculation[]>(orgResponse, "GET organisation carbon calculations");
    const siteRows = parseJson<CarbonCalculation[]>(siteResponse, "GET site carbon calculations");
    const allRows = parseJson<CarbonCalculation[]>(allResponse, "GET all carbon calculations");

    assert(orgRows.length === 1 && orgRows[0].id === organisationCalculation.id, `unexpected org rows ${JSON.stringify(orgRows)}`);
    assert(siteRows.length === 1 && siteRows[0].id === siteCalculation.id, `unexpected site rows ${JSON.stringify(siteRows)}`);
    const allIds = new Set(allRows.map((row) => row.id));
    assert(allIds.size === 2, `expected two all-scope rows, got ${JSON.stringify(allRows)}`);
    assert(allIds.has(organisationCalculation.id), "organisation calculation missing from all-scope list");
    assert(allIds.has(siteCalculation.id), "site calculation missing from all-scope list");
    assert(allRows.every((row) => row.companyId === tenants.tenantA.companyId), "cross-tenant calculation leaked into list");
  });

  await check("archived sites cannot accept new carbon calculations", async () => {
    const archivedSiteId = await createSite(tenants.tenantA.adminToken, `Archived Carbon Site ${suffix}`);
    const archive = await apiRequest(
      "DELETE",
      `/api/sites/${archivedSiteId}`,
      undefined,
      tenants.tenantA.adminToken,
    );
    assertStatus(archive, 200, "archive carbon site");

    const write = await apiRequest(
      "POST",
      "/api/carbon/calculate",
      calculationPayload(period, archivedSiteId, { country: "UK", electricity: 1 }),
      tenants.tenantA.adminToken,
    );
    assertStatus(write, 400, "archived-site calculation");
    assert(/archived.*cannot accept new data/i.test(parseError(write).error || ""), `unclear archived-site error: ${write.body}`);
  });

  await check("foreign site scope is rejected for reads and calculations", async () => {
    const read = await apiRequest(
      "GET",
      `/api/carbon/calculations?siteId=${encodeURIComponent(tenantBSiteId)}`,
      undefined,
      tenants.tenantA.adminToken,
    );
    const write = await apiRequest(
      "POST",
      "/api/carbon/calculate",
      calculationPayload(period, tenantBSiteId, { country: "UK", electricity: 1 }),
      tenants.tenantA.adminToken,
    );
    assertStatus(read, 404, "foreign-site list");
    assertStatus(write, 404, "foreign-site calculation");
    assert(/does not belong|site not found/i.test(parseError(write).error || ""), `unclear site error: ${write.body}`);
  });

  await check("viewer can read but cannot create or delete carbon calculations", async () => {
    const read = await apiRequest(
      "GET",
      `/api/carbon/calculations?period=${period}&siteId=null`,
      undefined,
      tenants.tenantA.viewerToken,
    );
    assertStatus(read, 200, "viewer calculation list");
    const exportRead = await apiRequest(
      "GET",
      `/api/carbon/calculations/${organisationCalculation.id}/export`,
      undefined,
      tenants.tenantA.viewerToken,
    );
    assertStatus(exportRead, 200, "viewer calculation export");

    const create = await apiRequest(
      "POST",
      "/api/carbon/calculate",
      calculationPayload(period, null, { country: "UK", electricity: 1 }),
      tenants.tenantA.viewerToken,
    );
    const remove = await apiRequest(
      "DELETE",
      `/api/carbon/calculations/${organisationCalculation.id}`,
      undefined,
      tenants.tenantA.viewerToken,
    );
    assertStatus(create, 403, "viewer create");
    assertStatus(remove, 403, "viewer delete");
  });

  await check("calculation export is tenant-isolated", async () => {
    const response = await apiRequest(
      "GET",
      `/api/carbon/calculations/${tenantBCalculation.id}/export`,
      undefined,
      tenants.tenantA.adminToken,
    );
    assertStatus(response, 404, "cross-tenant export");
  });

  await check("calculation deletion is tenant-isolated", async () => {
    const response = await apiRequest(
      "DELETE",
      `/api/carbon/calculations/${tenantBCalculation.id}`,
      undefined,
      tenants.tenantA.adminToken,
    );
    assertStatus(response, 404, "cross-tenant delete");

    const ownerRead = await apiRequest(
      "GET",
      `/api/carbon/calculations/${tenantBCalculation.id}/export`,
      undefined,
      tenants.tenantB.adminToken,
    );
    assertStatus(ownerRead, 200, "tenant B calculation after denied delete");
  });

  await check("unsupported country returns a clear 422 factor-unavailable response", async () => {
    const response = await apiRequest(
      "POST",
      "/api/carbon/calculate",
      calculationPayload(period, null, { country: `UNSUPPORTED-${suffix}`, electricity: 1 }),
      tenants.tenantA.adminToken,
    );
    assertStatus(response, 422, "unsupported-country calculation");
    const error = parseError(response);
    assert(error.code === "EMISSION_FACTOR_UNAVAILABLE", `unexpected code ${error.code}`);
    assert(/no emission factor set is configured/i.test(error.error || ""), `unclear factor error: ${response.body}`);
  });

  await check("plain-text export preserves totals, units and official factor provenance", async () => {
    const response = await apiRequestRaw(
      "GET",
      `/api/carbon/calculations/${organisationCalculation.id}/export`,
      undefined,
      tenants.tenantA.adminToken,
    );
    assert(response.status === 200, `export status=${response.status} body=${response.body.toString("utf8").slice(0, 400)}`);
    assert((response.headers.get("content-type") || "").includes("text/plain"), `content-type=${response.headers.get("content-type")}`);
    assert(
      (response.headers.get("content-disposition") || "").includes(`carbon-estimate-${period}.txt`),
      `content-disposition=${response.headers.get("content-disposition")}`,
    );

    const text = response.body.toString("utf8");
    for (const expected of [
      `Factor Year: ${CURRENT_UK_FACTOR_YEAR}`,
      "Scope 1 (Direct): 208.15 kgCO2e",
      "Scope 2 (Electricity): 130.96 kgCO2e",
      "Scope 3 (Travel): 46.82 kgCO2e",
      "Total: 385.93 kgCO2e",
      CURRENT_UK_FACTOR_SOURCE,
      CURRENT_UK_FACTOR_SOURCE_URL,
      "Grid Electricity (Scope 2)",
      "Natural Gas (Scope 1)",
      "Domestic Flights (Scope 3)",
    ]) {
      assert(text.includes(expected), `export is missing ${JSON.stringify(expected)}`);
    }
    assert(!/Factor (?:Year|Source):[^\n]*(?:2024|2025)/.test(text), "export contains mixed or stale factor-year provenance");
  });
}

async function main() {
  console.log("\n=== API: Carbon Calculator 2026 Contract ===\n");
  try {
    const tenants = await seedTestTenants();
    await run(tenants);
  } catch (error: any) {
    fail("carbon calculator test setup", error?.message || String(error));
  }

  const passed = results.filter((result) => result.passed).length;
  console.log(`\n=== Carbon Calculator 2026 Contract: ${passed}/${results.length} passed ===\n`);
  if (passed !== results.length) process.exit(1);
}

main();
