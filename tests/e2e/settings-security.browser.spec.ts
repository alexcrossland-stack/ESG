/**
 * Browser regression: Settings/Security fetch boundaries
 *
 * Keeps browser coverage focused on client-executable security paths:
 * protected settings writes, step-up required responses, and stale token
 * invalidation after logout.
 */

import { expect, test } from "@playwright/test";
import fs from "fs";
import { ADMIN_STATE_FILE, SEED_INFO_FILE, VIEWER_STATE_FILE } from "./global-setup.js";

function readSeedInfo() {
  return JSON.parse(fs.readFileSync(SEED_INFO_FILE, "utf-8")) as {
    tenantA: {
      adminEmail: string;
      viewerToken: string;
      contributorToken: string;
    };
  };
}

test.describe("Settings/Security browser boundaries", () => {
  test("viewer and contributor browser fetches cannot mutate protected settings", async ({ browser }) => {
    const { tenantA } = readSeedInfo();
    const context = await browser.newContext({ storageState: VIEWER_STATE_FILE });
    const page = await context.newPage();
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const result = await page.evaluate(async ({ viewerToken, contributorToken }) => {
      async function request(method: string, path: string, token: string, body?: unknown) {
        const res = await fetch(path, {
          method,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        return { status: res.status, body: await res.json().catch(() => ({})) };
      }

      return {
        viewerListKeys: await request("GET", "/api/company/api-keys", viewerToken),
        viewerCreateKey: await request("POST", "/api/company/api-keys", viewerToken, { label: "blocked", scopes: ["read:metrics"] }),
        viewerMfaPolicy: await request("PATCH", "/api/admin/mfa-policy", viewerToken, { mfaPolicy: "all_required" }),
        contributorCreateKey: await request("POST", "/api/company/api-keys", contributorToken, { label: "blocked", scopes: ["read:metrics"] }),
        contributorRoleChange: await request("PUT", "/api/users/not-a-real-user/role", contributorToken, { role: "admin" }),
      };
    }, tenantA);

    expect(result.viewerListKeys.status).toBe(403);
    expect(result.viewerCreateKey.status).toBe(403);
    expect(result.viewerMfaPolicy.status).toBe(403);
    expect(result.contributorCreateKey.status).toBe(403);
    expect(result.contributorRoleChange.status).toBe(403);

    await context.close();
  });

  test("admin browser fetch sees step-up requirement before sensitive settings mutation", async ({ browser }) => {
    const context = await browser.newContext({ storageState: ADMIN_STATE_FILE });
    const page = await context.newPage();
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const result = await page.evaluate(async () => {
      const token = localStorage.getItem("auth_token");
      const res = await fetch("/api/company/api-keys", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ label: "Needs step-up", scopes: ["read:metrics"] }),
      });
      return { status: res.status, body: await res.json().catch(() => ({})) };
    });

    expect(result.status).toBe(403);
    expect(result.body.code).toBe("STEP_UP_REQUIRED");

    await context.close();
  });

  test("logout from browser fetch invalidates the same bearer token", async ({ browser, request }) => {
    const { tenantA } = readSeedInfo();
    const login = await request.post("/api/auth/login", {
      data: { email: tenantA.adminEmail, password: "Test1234!" },
    });
    expect(login.status()).toBe(200);
    const { token } = await login.json() as { token: string };
    expect(token).toBeTruthy();

    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto("/");

    const result = await page.evaluate(async (authToken) => {
      const logout = await fetch("/api/auth/logout", {
        method: "POST",
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const me = await fetch("/api/auth/me", {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      return { logoutStatus: logout.status, meStatus: me.status };
    }, token);

    expect(result.logoutStatus).toBe(200);
    expect(result.meStatus).toBe(401);

    await context.close();
  });
});
