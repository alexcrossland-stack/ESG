import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import pg from "pg";

const require = createRequire(import.meta.url);
const {
  cleanupPreflightDirectory,
  createRecoveryPoint,
  rehearseDatabaseRestore,
  rehearseEvidenceRestore,
  restoreRecoveryPoint,
} = require("../../scripts/deployment/recovery-point.cjs");

if (typeof process.getuid !== "function" || process.getuid() !== 0) {
  throw new Error("Privileged recovery rehearsal must run as root");
}
if (process.env.RECOVERY_AUTHORITY !== "local-postgres-os") {
  throw new Error("Privileged recovery rehearsal requires RECOVERY_AUTHORITY=local-postgres-os");
}

const sourceUrl = process.env.RECOVERY_REHEARSAL_DATABASE_URL;
const runId = process.env.RECOVERY_REHEARSAL_RUN_ID;
const runAttempt = process.env.RECOVERY_REHEARSAL_RUN_ATTEMPT;
if (!sourceUrl || !runId || !runAttempt) throw new Error("Privileged recovery rehearsal environment is incomplete");
if (!/^\d+$/.test(runId) || !/^\d+$/.test(runAttempt)) throw new Error("Privileged recovery run identity is invalid");

const parsed = new URL(sourceUrl);
if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(parsed.hostname)) {
  throw new Error("Privileged recovery rehearsal refuses a non-loopback PostgreSQL host");
}
const databaseName = `simplyesg_privileged_${runId.slice(-12)}_${runAttempt}`.slice(0, 63);
if (!/^[a-zA-Z0-9_]+$/.test(databaseName)) throw new Error("Unsafe privileged rehearsal database name");

const maintenanceUrl = new URL(sourceUrl);
maintenanceUrl.pathname = "/postgres";
const databaseUrl = new URL(sourceUrl);
databaseUrl.pathname = `/${databaseName}`;
const quoteIdentifier = (value: string) => `"${value.replaceAll('"', '""')}"`;
const { Client } = pg;

async function recreateDatabase(): Promise<void> {
  const client = new Client({ connectionString: maintenanceUrl.toString() });
  await client.connect();
  try {
    await client.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)} WITH (FORCE)`);
    await client.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`);
  } finally {
    await client.end();
  }
}

async function dropDatabase(): Promise<void> {
  const client = new Client({ connectionString: maintenanceUrl.toString() });
  await client.connect();
  try {
    await client.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)} WITH (FORCE)`);
  } finally {
    await client.end();
  }
}

function assertProtectedDumpCannotBeOpenedByPostgres(dump: string): void {
  const stat = statSync(dump);
  assert.equal(stat.uid, 0);
  assert.equal(stat.mode & 0o777, 0o600);
  const denied = spawnSync(
    "/usr/sbin/runuser",
    ["--user", "postgres", "--", "/usr/bin/head", "--bytes=1", dump],
    { encoding: "utf8", stdio: "pipe" },
  );
  assert.equal(denied.error, undefined);
  assert.equal(denied.status, 1, "postgres unexpectedly gained pathname access to the protected dump");
  assert.match(String(denied.stderr), /Permission denied/i);
}

const runInstance = `${runId}-${runAttempt}`;
const root = mkdtempSync("/root/simplyesg-local-authority-");
const envFile = path.join(root, "candidate.env");
const previousEnvFile = path.join(root, "previous.env");
const evidencePath = path.join(root, "persistent", "evidence");
const evidenceFile = path.join(evidencePath, "company", "record", "proof.txt");
const preflightDir = `/root/esg-deploy-preflight/${runInstance}/restore-rehearsal`;
const backupDir = `/root/esg-deploy-backups/${runInstance}-c0ffee123456`;
const originalEvidence = "privileged recovery evidence";

try {
  await recreateDatabase();
  const database = new Client({ connectionString: databaseUrl.toString() });
  await database.connect();
  try {
    await database.query("CREATE TABLE privileged_recovery_probe (id integer PRIMARY KEY, value text NOT NULL)");
    await database.query("INSERT INTO privileged_recovery_probe (id, value) VALUES (1, 'before-upgrade')");
  } finally {
    await database.end();
  }

  const runtime = `DATABASE_URL=${JSON.stringify(databaseUrl.toString())}\n`;
  writeFileSync(envFile, runtime, { mode: 0o600 });
  writeFileSync(previousEnvFile, runtime, { mode: 0o600 });
  mkdirSync(path.dirname(evidenceFile), { recursive: true });
  writeFileSync(evidenceFile, originalEvidence);

  createRecoveryPoint({
    envFile,
    previousEnvFile,
    backupDir: preflightDir,
    evidencePath,
    previousSha: "a".repeat(40),
    targetSha: "b".repeat(40),
    previousCwd: "/root/ESG",
    previousScript: "/root/ESG/dist/index.cjs",
  });
  assertProtectedDumpCannotBeOpenedByPostgres(path.join(preflightDir, "database.dump"));
  rehearseDatabaseRestore(envFile, preflightDir, `${runId}_${runAttempt}`);
  rehearseEvidenceRestore(preflightDir);
  cleanupPreflightDirectory(preflightDir);

  createRecoveryPoint({
    envFile,
    previousEnvFile,
    backupDir,
    evidencePath,
    previousSha: "b".repeat(40),
    targetSha: "c".repeat(40),
    previousCwd: "/root/ESG",
    previousScript: "/root/ESG/dist/index.cjs",
  });
  assertProtectedDumpCannotBeOpenedByPostgres(path.join(backupDir, "database.dump"));

  const mutated = new Client({ connectionString: databaseUrl.toString() });
  await mutated.connect();
  try {
    await mutated.query("UPDATE privileged_recovery_probe SET value = 'after-upgrade' WHERE id = 1");
    await mutated.query("CREATE SCHEMA privileged_post_backup_residue");
    await mutated.query("CREATE TABLE privileged_post_backup_residue.must_not_survive (id integer PRIMARY KEY)");
  } finally {
    await mutated.end();
  }
  writeFileSync(evidenceFile, "mutated privileged evidence");

  restoreRecoveryPoint(envFile, backupDir);
  assert.equal(JSON.parse(readFileSync(path.join(backupDir, "restore-state.json"), "utf8")).state, "completed");

  const restored = new Client({ connectionString: databaseUrl.toString() });
  await restored.connect();
  try {
    const rows = await restored.query("SELECT id, value FROM privileged_recovery_probe ORDER BY id");
    assert.deepEqual(rows.rows, [{ id: 1, value: "before-upgrade" }]);
    const residue = await restored.query("SELECT to_regclass('privileged_post_backup_residue.must_not_survive') AS relation");
    assert.equal(residue.rows[0]?.relation, null);
  } finally {
    await restored.end();
  }
  assert.equal(readFileSync(evidenceFile, "utf8"), originalEvidence);
  console.log("privileged PostgreSQL recovery rehearsal passed");
} finally {
  await dropDatabase().catch(() => undefined);
  if (existsSync(preflightDir)) cleanupPreflightDirectory(preflightDir);
  if (existsSync(backupDir)) {
    if (realpathSync(backupDir) !== backupDir) throw new Error("Refusing to remove a symlinked privileged backup");
    rmSync(backupDir, { recursive: true, force: true });
  }
  rmSync(root, { recursive: true, force: true });
}
