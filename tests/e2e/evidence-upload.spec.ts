/**
 * E2E: Evidence upload and retrieval
 *
 * Flow 8 of the ten release-critical flows.
 * Verifies: upload creates a record, the row appears in the list,
 * the record is retrievable, and access controls are enforced.
 *
 * @group regression
 */
import { test, expect } from "@playwright/test";
import fs from "fs";

function readSeedInfo() {
  return JSON.parse(
    fs.readFileSync("tests/e2e/.auth/seed-info.json", "utf-8")
  ) as {
    tenantA: {
      adminToken: string;
      contributorToken: string;
      viewerToken: string;
    };
  };
}

test.describe("REGR-EV: Evidence upload and retrieval", () => {
  let uploadedId: string | null = null;
  const uniqueFilename = `e2e-evidence-${Date.now()}.pdf`;

  test("admin can upload an evidence record (POST /api/evidence)", async ({ request }) => {
    const { tenantA } = readSeedInfo();

    const res = await request.post("/api/evidence", {
      data: {
        filename: uniqueFilename,
        fileUrl: "https://example.com/e2e-test-doc.pdf",
        fileType: "pdf",
        linkedModule: "metric_value",
        description: "Evidence upload E2E test",
      },
      headers: { Authorization: `Bearer ${tenantA.adminToken}` },
    });
    expect(res.status()).not.toBe(500);
    expect(res.status()).toBe(200);
    const body = await res.json() as { id?: string; filename?: string };
    expect(body.id).toBeTruthy();
    expect(body.filename).toBe(uniqueFilename);
    uploadedId = body.id!;
  });

  test("uploaded evidence row appears in GET /api/evidence list", async ({ request }) => {
    const { tenantA } = readSeedInfo();

    const res = await request.get("/api/evidence", {
      headers: { Authorization: `Bearer ${tenantA.adminToken}` },
    });
    expect(res.status()).toBe(200);
    const list = await res.json() as Array<{ id?: string; filename?: string }>;
    expect(Array.isArray(list)).toBe(true);

    if (uploadedId) {
      const found = list.find(e => e.id === uploadedId);
      expect(found, `Evidence id=${uploadedId} must appear in list`).toBeTruthy();
      expect(found?.filename).toBe(uniqueFilename);
    }
  });

  test("uploaded evidence filename is present in the list response", async ({ request }) => {
    const { tenantA } = readSeedInfo();

    const res = await request.get("/api/evidence", {
      headers: { Authorization: `Bearer ${tenantA.adminToken}` },
    });
    expect(res.status()).toBe(200);
    const list = await res.json() as Array<{ filename?: string }>;
    const byFilename = list.find(e => e.filename === uniqueFilename);
    expect(byFilename, `filename=${uniqueFilename} must be in list`).toBeTruthy();
  });

  test("viewer can GET /api/evidence list (read-only access)", async ({ request }) => {
    const { tenantA } = readSeedInfo();

    const res = await request.get("/api/evidence", {
      headers: { Authorization: `Bearer ${tenantA.viewerToken}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test("viewer cannot upload evidence (403)", async ({ request }) => {
    const { tenantA } = readSeedInfo();

    const res = await request.post("/api/evidence", {
      data: {
        filename: `viewer-blocked-${Date.now()}.pdf`,
        fileType: "pdf",
        linkedModule: "metric_value",
      },
      headers: { Authorization: `Bearer ${tenantA.viewerToken}` },
    });
    expect(res.status()).toBe(403);
  });

  test("contributor can upload evidence", async ({ request }) => {
    const { tenantA } = readSeedInfo();

    const res = await request.post("/api/evidence", {
      data: {
        filename: `contrib-e2e-${Date.now()}.pdf`,
        fileUrl: "https://example.com/contrib-doc.pdf",
        fileType: "pdf",
        linkedModule: "metric_value",
      },
      headers: { Authorization: `Bearer ${tenantA.contributorToken}` },
    });
    expect(res.status()).not.toBe(500);
    expect([200, 201]).toContain(res.status());
  });

  test("POST /api/evidence without filename returns 400 (not 500)", async ({ request }) => {
    const { tenantA } = readSeedInfo();

    const res = await request.post("/api/evidence", {
      data: { linkedModule: "metric_value" },
      headers: {
        Authorization: `Bearer ${tenantA.adminToken}`,
        "Content-Type": "application/json",
      },
    });
    expect(res.status()).not.toBe(500);
    expect([400, 403]).toContain(res.status());
  });

  test("GET /api/evidence/coverage returns 200 or 404, never 500", async ({ request }) => {
    const { tenantA } = readSeedInfo();

    const res = await request.get("/api/evidence/coverage", {
      headers: { Authorization: `Bearer ${tenantA.adminToken}` },
    });
    expect(res.status()).not.toBe(500);
    expect([200, 404]).toContain(res.status());
  });
});
