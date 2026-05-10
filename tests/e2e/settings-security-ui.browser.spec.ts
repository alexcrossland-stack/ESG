/**
 * Browser regression: Settings/Security UI flows
 *
 * Covers MFA recovery-code display/use/reuse prevention and API key
 * create/display-once/revoke from the browser.
 */

import { expect, test } from "@playwright/test";
import bcrypt from "bcryptjs";
import fs from "fs";
import { Client } from "pg";
import { generateTotpToken } from "../../server/mfa.js";
import { ADMIN_STATE_FILE, SEED_INFO_FILE } from "./global-setup.js";

const TEST_PASSWORD = "Test1234!";

function readSeedInfo() {
  return JSON.parse(fs.readFileSync(SEED_INFO_FILE, "utf-8")) as {
    tenantA: {
      adminEmail: string;
      adminToken: string;
      companyId: string;
    };
  };
}

async function withDb<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL env var not set");
  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function createAdminUser(companyId: string) {
  const suffix = Date.now().toString();
  const email = `mfa-browser-${suffix}@test-esg.example`;
  await withDb(async (client) => {
    const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);
    await client.query(
      `INSERT INTO users (username, email, password, role, company_id,
        terms_accepted_at, privacy_accepted_at, terms_version_accepted, privacy_version_accepted)
       VALUES ($1, $2, $3, 'admin', $4, NOW(), NOW(), '1.0', '1.0')`,
      [`mfabrowser${suffix}`, email, passwordHash, companyId],
    );
  });
  return email;
}

async function login(page: any, email: string, password = TEST_PASSWORD) {
  await page.goto("/auth");
  await page.getByTestId("input-email").fill(email);
  await page.getByTestId("input-password").fill(password);
  await page.getByTestId("button-login").click();
}

async function logoutInBrowser(page: any) {
  await page.evaluate(async () => {
    const token = window.localStorage.getItem("auth_token");
    await fetch("/api/auth/logout", {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    }).catch(() => undefined);
    window.localStorage.removeItem("auth_token");
  });
}

test.describe("Settings/Security UI flows", () => {
  test("MFA setup displays recovery codes and backup-code login invalidates used code", async ({ page }) => {
    const { tenantA } = readSeedInfo();
    const email = await createAdminUser(tenantA.companyId);

    await login(page, email);
    await expect(page).not.toHaveURL(/\/auth/);

    await page.goto("/settings");
    await page.getByTestId("button-setup-mfa").click();
    await expect(page.getByTestId("img-mfa-qr")).toBeVisible();

    const secret = (await page.getByTestId("text-mfa-secret").textContent())?.trim();
    expect(secret).toBeTruthy();
    const setupToken = await generateTotpToken(secret!);
    await page.getByTestId("input-mfa-verify-token").fill(setupToken);
    await page.getByTestId("button-verify-mfa-setup").click();

    const backupCodes = page.getByTestId("div-backup-codes");
    await expect(backupCodes).toBeVisible();
    const firstBackupCode = (await backupCodes.locator("span").first().textContent())?.trim();
    expect(firstBackupCode).toBeTruthy();
    await expect(backupCodes.locator("span")).toHaveCount(10);

    await page.getByTestId("button-mfa-done").click();
    await expect(page.getByTestId("status-mfa-enabled")).toBeVisible();
    await logoutInBrowser(page);

    await login(page, email);
    await expect(page.getByTestId("input-mfa-token")).toBeVisible();
    await page.getByTestId("link-use-backup-code").click();
    await page.getByTestId("input-mfa-backup-code").fill(firstBackupCode!);
    await page.getByTestId("button-mfa-verify-backup").click();
    await expect(page).not.toHaveURL(/\/auth/);

    await logoutInBrowser(page);
    await login(page, email);
    await expect(page.getByTestId("input-mfa-token")).toBeVisible();
    await page.getByTestId("link-use-backup-code").click();
    await page.getByTestId("input-mfa-backup-code").fill(firstBackupCode!);
    const reused = page.waitForResponse((res) =>
      res.url().includes("/api/auth/mfa/verify") && res.request().method() === "POST",
    );
    await page.getByTestId("button-mfa-verify-backup").click();
    expect((await reused).status()).toBe(401);
    await expect(page.getByTestId("button-mfa-verify-backup")).toBeVisible();
  });

  test("API key UI creates, displays once, copies, revokes, and blocks revoked authentication", async ({ browser, request }) => {
    const { tenantA } = readSeedInfo();
    const context = await browser.newContext({ storageState: ADMIN_STATE_FILE });
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const page = await context.newPage();
    const label = `Browser API key ${Date.now()}`;

    await page.goto("/settings");
    await page.getByTestId("tab-admin").click();
    await page.getByTestId("admin-section-security").click();
    await expect(page.getByTestId("button-create-api-key")).toBeVisible();

    await page.getByTestId("button-create-api-key").click();
    await page.getByTestId("input-api-key-label").fill(label);
    await page.getByTestId("checkbox-scope-read-metrics").click();
    await page.getByTestId("button-confirm-create-api-key").click();

    await expect(page.getByTestId("input-stepup-password")).toBeVisible();
    await page.getByTestId("input-stepup-password").fill(TEST_PASSWORD);
    await page.getByTestId("button-stepup-confirm").click();

    const keyText = page.getByTestId("text-new-api-key");
    await expect(keyText).toBeVisible();
    const plaintextKey = (await keyText.textContent())?.trim();
    expect(plaintextKey).toMatch(/^esgk_/);
    await page.getByTestId("button-copy-api-key").click();
    await expect.poll(async () => page.evaluate(() => navigator.clipboard.readText())).toBe(plaintextKey);

    const acceptedBeforeRevoke = await request.get("/api/internal/agent/health", {
      headers: { "X-Agent-API-Key": plaintextKey! },
    });
    expect(acceptedBeforeRevoke.status()).toBe(403);

    await page.getByRole("button", { name: "Done" }).click();
    await expect(page.getByTestId("text-new-api-key")).toHaveCount(0);

    const keysResponse = await request.get("/api/company/api-keys", {
      headers: { Authorization: `Bearer ${tenantA.adminToken}` },
    });
    expect(keysResponse.status()).toBe(200);
    const keys = await keysResponse.json() as Array<{ id: string; label: string; key?: string }>;
    const created = keys.find((key) => key.label === label);
    expect(created?.id).toBeTruthy();
    expect(created).not.toHaveProperty("key");

    await expect(page.getByTestId(`row-api-key-${created!.id}`)).toBeVisible();
    await page.getByTestId(`button-revoke-key-${created!.id}`).click();
    await expect(page.getByTestId(`row-api-key-${created!.id}`).getByText("Revoked")).toBeVisible();

    const rejectedAfterRevoke = await request.get("/api/internal/agent/health", {
      headers: { "X-Agent-API-Key": plaintextKey! },
    });
    expect(rejectedAfterRevoke.status()).toBe(401);

    await context.close();
  });
});
