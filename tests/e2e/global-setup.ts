import { FullConfig } from "@playwright/test";
import { seedTestTenants } from "../fixtures/seed.js";
import fs from "fs";
import path from "path";

const SEED_INFO_FILE = "tests/e2e/.auth/seed-info.json";

async function globalSetup(_config: FullConfig) {
  const authDir = path.dirname(SEED_INFO_FILE);
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }

  console.log("[global-setup] Seeding test tenants…");
  const tenants = await seedTestTenants();
  console.log(`[global-setup] Tenant A companyId: ${tenants.tenantA.companyId}`);
  console.log(`[global-setup] Tenant B companyId: ${tenants.tenantB.companyId}`);

  fs.writeFileSync(SEED_INFO_FILE, JSON.stringify(tenants, null, 2));
  console.log(`[global-setup] Seed info written to ${SEED_INFO_FILE}`);
}

export default globalSetup;
