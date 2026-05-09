/**
 * API tests: ESG roadmap CRUD
 *
 * Covers:
 * - Tenant-scoped roadmap item create/update/delete
 * - Viewer write protection
 * - Cross-tenant item IDs are not addressable
 *
 * Run: npx tsx tests/api/esg-roadmap.test.ts
 */

import { apiRequest, seedTestTenants } from "../fixtures/seed.js";
import type { SeededTenants } from "../fixtures/seed.js";

interface TestResult { name: string; passed: boolean; detail?: string }
const results: TestResult[] = [];

function pass(name: string, detail?: string) {
  results.push({ name, passed: true, detail });
  console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`);
}

function fail(name: string, detail?: string) {
  results.push({ name, passed: false, detail });
  console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
}

function parseJson<T>(res: { body: string }): T {
  return JSON.parse(res.body) as T;
}

async function run(tenants: SeededTenants): Promise<void> {
  const { tenantA, tenantB } = tenants;

  let itemId: string | null = null;

  {
    const name = "admin can create tenant-scoped roadmap item";
    const res = await apiRequest("POST", "/api/esg/roadmap/items", {
      title: "Establish ESG data ownership",
      description: "Assign metric owners and monthly review cadence.",
      targetLabel: "Month 1",
      status: "planned",
      owner: "Operations",
      category: "data",
    }, tenantA.adminToken);

    if (res.status !== 201) fail(name, `status=${res.status} body=${res.body.slice(0, 200)}`);
    else {
      const body = parseJson<{ item?: { id?: string; title?: string; status?: string }; roadmap?: { items?: unknown[] } }>(res);
      itemId = body.item?.id || null;
      if (!itemId) fail(name, "missing item id");
      else if (body.item?.title !== "Establish ESG data ownership") fail(name, `title=${body.item?.title}`);
      else if (body.item?.status !== "planned") fail(name, `status=${body.item?.status}`);
      else pass(name, `itemId=${itemId}`);
    }
  }

  {
    const name = "GET /api/esg/roadmap returns created items for the same tenant";
    const res = await apiRequest("GET", "/api/esg/roadmap", undefined, tenantA.adminToken);
    if (res.status !== 200) fail(name, `status=${res.status}`);
    else {
      const body = parseJson<{ roadmap?: { items?: Array<{ id?: string; title?: string }> } }>(res);
      const found = body.roadmap?.items?.find(item => item.id === itemId);
      if (!found) fail(name, "created item not returned");
      else pass(name);
    }
  }

  {
    const name = "admin can update tenant-scoped roadmap item";
    if (!itemId) {
      fail(name, "missing item id");
    } else {
      const res = await apiRequest("PATCH", `/api/esg/roadmap/items/${itemId}`, {
        title: "Establish ESG data ownership and evidence cadence",
        status: "in_progress",
      }, tenantA.adminToken);
      if (res.status !== 200) fail(name, `status=${res.status} body=${res.body.slice(0, 200)}`);
      else {
        const body = parseJson<{ item?: { title?: string; status?: string } }>(res);
        if (body.item?.status !== "in_progress") fail(name, `status=${body.item?.status}`);
        else if (body.item?.title !== "Establish ESG data ownership and evidence cadence") fail(name, `title=${body.item?.title}`);
        else pass(name);
      }
    }
  }

  {
    const name = "foreign tenant cannot update another tenant roadmap item";
    if (!itemId) {
      fail(name, "missing item id");
    } else {
      const res = await apiRequest("PATCH", `/api/esg/roadmap/items/${itemId}`, {
        title: "Cross tenant update attempt",
      }, tenantB.adminToken);
      if (res.status === 404) pass(name);
      else fail(name, `status=${res.status} body=${res.body.slice(0, 200)}`);
    }
  }

  {
    const name = "viewer cannot create roadmap items";
    const res = await apiRequest("POST", "/api/esg/roadmap/items", {
      title: "Viewer write attempt",
      status: "planned",
    }, tenantA.viewerToken);
    if (res.status === 403) pass(name);
    else fail(name, `status=${res.status} body=${res.body.slice(0, 200)}`);
  }

  {
    const name = "admin can delete tenant-scoped roadmap item";
    if (!itemId) {
      fail(name, "missing item id");
    } else {
      const res = await apiRequest("DELETE", `/api/esg/roadmap/items/${itemId}`, undefined, tenantA.adminToken);
      if (res.status !== 200) fail(name, `status=${res.status} body=${res.body.slice(0, 200)}`);
      else {
        const getRes = await apiRequest("GET", "/api/esg/roadmap", undefined, tenantA.adminToken);
        const body = parseJson<{ roadmap?: { items?: Array<{ id?: string }> } }>(getRes);
        if (body.roadmap?.items?.some(item => item.id === itemId)) fail(name, "deleted item still returned");
        else pass(name);
      }
    }
  }
}

async function main() {
  try {
    const tenants = await seedTestTenants();
    await run(tenants);
  } catch (error: any) {
    fail("test harness", error?.message || String(error));
  }

  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  console.log(`\n=== ESG roadmap API: ${passed}/${total} passed ===\n`);
  if (passed !== total) process.exit(1);
}

main();
