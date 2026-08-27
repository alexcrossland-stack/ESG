import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import pg from "pg";

const require = createRequire(import.meta.url);
const {
  createRecoveryPoint,
  rehearseDatabaseRestore,
  rehearseEvidenceRestore,
  restoreRecoveryPoint,
} = require("../../scripts/deployment/recovery-point.cjs");

const sourceUrl = process.env.RECOVERY_REHEARSAL_DATABASE_URL || process.env.DATABASE_URL;
if (!sourceUrl) throw new Error("RECOVERY_REHEARSAL_DATABASE_URL or DATABASE_URL is required");
const parsed = new URL(sourceUrl);
if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(parsed.hostname)) {
  throw new Error("Recovery rehearsal refuses a non-loopback PostgreSQL host");
}
const sourceDatabase = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
if (!/^[a-zA-Z0-9_]+$/.test(sourceDatabase)) throw new Error("Unsafe source database name");
const rehearsalDatabase = `${sourceDatabase}_recovery_contract`.slice(0, 63);
const quoteIdentifier = (value: string) => `"${value.replaceAll('"', '""')}"`;

const maintenanceUrl = new URL(sourceUrl);
maintenanceUrl.pathname = "/postgres";
const targetUrl = new URL(sourceUrl);
targetUrl.pathname = `/${rehearsalDatabase}`;
const { Client } = pg;

async function recreateTargetDatabase(): Promise<void> {
  const maintenance = new Client({ connectionString: maintenanceUrl.toString() });
  await maintenance.connect();
  try {
    await maintenance.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(rehearsalDatabase)} WITH (FORCE)`);
    await maintenance.query(`CREATE DATABASE ${quoteIdentifier(rehearsalDatabase)}`);
  } finally {
    await maintenance.end();
  }
}

async function dropTargetDatabase(): Promise<void> {
  const maintenance = new Client({ connectionString: maintenanceUrl.toString() });
  await maintenance.connect();
  try {
    await maintenance.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(rehearsalDatabase)} WITH (FORCE)`);
  } finally {
    await maintenance.end();
  }
}

const root = mkdtempSync(path.join(tmpdir(), "simplyesg-full-recovery-"));
const envFile = path.join(root, "candidate.env");
const previousEnvFile = path.join(root, "previous.env");
const evidencePath = path.join(root, "persistent", "evidence");
const backupDir = path.join(root, "backup");
const evidenceFile = path.join(evidencePath, "company-a", "record-a", "invoice.txt");
const originalEvidence = "evidence bytes at the coordinated recovery point";

try {
  await recreateTargetDatabase();
  const client = new Client({ connectionString: targetUrl.toString() });
  await client.connect();
  try {
    await client.query("CREATE TABLE recovery_probe (id integer PRIMARY KEY, value text NOT NULL)");
    await client.query("INSERT INTO recovery_probe (id, value) VALUES (1, 'before-upgrade')");
  } finally {
    await client.end();
  }

  const runtimeText = `DATABASE_URL=${JSON.stringify(targetUrl.toString())}\n`;
  writeFileSync(envFile, runtimeText, { mode: 0o600 });
  writeFileSync(previousEnvFile, runtimeText, { mode: 0o600 });
  mkdirSync(path.dirname(evidenceFile), { recursive: true });
  writeFileSync(evidenceFile, originalEvidence);

  createRecoveryPoint({
    envFile,
    previousEnvFile,
    backupDir,
    evidencePath,
    previousSha: "a".repeat(40),
    targetSha: "b".repeat(40),
    previousCwd: "/root/ESG",
    previousScript: "/root/ESG/dist/index.cjs",
  });
  rehearseDatabaseRestore(envFile, backupDir, `contract_${process.pid}`);
  rehearseEvidenceRestore(backupDir);

  const mutated = new Client({ connectionString: targetUrl.toString() });
  await mutated.connect();
  try {
    await mutated.query("UPDATE recovery_probe SET value = 'after-upgrade' WHERE id = 1");
    await mutated.query("INSERT INTO recovery_probe (id, value) VALUES (2, 'new-write')");
  } finally {
    await mutated.end();
  }
  writeFileSync(evidenceFile, "mutated evidence bytes");
  writeFileSync(path.join(evidencePath, "post-backup.txt"), "must not survive restore");

  restoreRecoveryPoint(envFile, backupDir);

  const restored = new Client({ connectionString: targetUrl.toString() });
  await restored.connect();
  try {
    const rows = await restored.query("SELECT id, value FROM recovery_probe ORDER BY id");
    assert.deepEqual(rows.rows, [{ id: 1, value: "before-upgrade" }]);
  } finally {
    await restored.end();
  }
  assert.equal(readFileSync(evidenceFile, "utf8"), originalEvidence);
  assert.equal(existsSync(path.join(evidencePath, "post-backup.txt")), false);
  console.log("full database and evidence recovery rehearsal passed");
} finally {
  await dropTargetDatabase().catch(() => undefined);
  rmSync(root, { recursive: true, force: true });
}
