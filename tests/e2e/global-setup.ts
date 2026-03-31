import { FullConfig } from "@playwright/test";
import { seedTestTenants } from "../fixtures/seed.js";
import fs from "fs";
import path from "path";

const AUTH_DIR = "tests/e2e/.auth";
export const ADMIN_STATE_FILE = `${AUTH_DIR}/admin.json`;
export const VIEWER_STATE_FILE = `${AUTH_DIR}/viewer.json`;
export const SEED_INFO_FILE = `${AUTH_DIR}/seed-info.json`;
const BASE_URL = process.env.BASE_URL || "http://localhost:5000";

function writeStorageState(filePath: string, token: string): void {
  const state = {
    cookies: [],
    origins: [
      {
        origin: BASE_URL,
        localStorage: [{ name: "auth_token", value: token }],
      },
    ],
  };
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2));
}

async function globalSetup(_config: FullConfig) {
  if (!fs.existsSync(AUTH_DIR)) {
    fs.mkdirSync(AUTH_DIR, { recursive: true });
  }

  console.log("[global-setup] Seeding test tenants…");
  const tenants = await seedTestTenants();
  console.log(`[global-setup] Tenant A companyId: ${tenants.tenantA.companyId}`);
  console.log(`[global-setup] Tenant B companyId: ${tenants.tenantB.companyId}`);

  // Write bearer-token storageState files for browser project
  writeStorageState(ADMIN_STATE_FILE, tenants.tenantA.adminToken);
  writeStorageState(VIEWER_STATE_FILE, tenants.tenantA.viewerToken);
  console.log(`[global-setup] Auth state files written to ${AUTH_DIR}/`);

  // Write full seed info for API specs that need companyId / metricId / topicId
  fs.writeFileSync(SEED_INFO_FILE, JSON.stringify(tenants, null, 2));
  console.log(`[global-setup] Seed info written to ${SEED_INFO_FILE}`);
}

export default globalSetup;
