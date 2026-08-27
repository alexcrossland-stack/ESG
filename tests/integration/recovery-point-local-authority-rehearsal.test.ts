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

const databaseUrl = new URL(sourceUrl);
databaseUrl.pathname = `/${databaseName}`;
const quoteIdentifier = (value: string) => `"${value.replaceAll('"', '""')}"`;
const recoveryOwner = "simplyesg_recovery_owner";
const applicationRole = decodeURIComponent(parsed.username);
const { Client } = pg;

function runPostgresAdmin(command: "createdb" | "dropdb" | "psql", args: string[]): string {
  const binary = `/usr/bin/${command}`;
  const socketDirectory = "/var/run/postgresql";
  if (!existsSync(binary) || !existsSync(path.join(socketDirectory, `.s.PGSQL.${parsed.port || "5432"}`))) {
    throw new Error(`Privileged PostgreSQL test dependency is unavailable: ${command}`);
  }
  const result = spawnSync(
    "/usr/sbin/runuser",
    [
      "--user",
      "postgres",
      "--",
      binary,
      `--host=${socketDirectory}`,
      `--port=${parsed.port || "5432"}`,
      "--username=postgres",
      ...args,
    ],
    { encoding: "utf8", stdio: "pipe" },
  );
  if (result.error || result.status !== 0) {
    throw new Error(`${command} failed: ${result.error?.message || result.stderr}`);
  }
  return String(result.stdout || "");
}

function recreateDatabase(): void {
  runPostgresAdmin("dropdb", ["--force", "--if-exists", "--maintenance-db=postgres", databaseName]);
  runPostgresAdmin("createdb", ["--maintenance-db=postgres", "--template=template0", `--owner=${recoveryOwner}`, databaseName]);
  runPostgresAdmin("psql", [
    `--dbname=${databaseName}`,
    "--no-psqlrc",
    "--set=ON_ERROR_STOP=on",
    "--command",
    `REVOKE ALL ON DATABASE ${quoteIdentifier(databaseName)} FROM PUBLIC; GRANT CONNECT ON DATABASE ${quoteIdentifier(databaseName)} TO ${quoteIdentifier(applicationRole)}; REVOKE CREATE ON DATABASE ${quoteIdentifier(databaseName)} FROM ${quoteIdentifier(applicationRole)}; SET ROLE ${quoteIdentifier(recoveryOwner)}; CREATE TABLE public.privileged_recovery_probe (id integer PRIMARY KEY, value text NOT NULL); INSERT INTO public.privileged_recovery_probe (id, value) VALUES (1, 'before-upgrade'); RESET ROLE; GRANT USAGE ON SCHEMA public TO ${quoteIdentifier(applicationRole)}; GRANT SELECT, UPDATE ON TABLE public.privileged_recovery_probe TO ${quoteIdentifier(applicationRole)}`,
  ]);
}

function dropDatabase(): void {
  runPostgresAdmin("dropdb", ["--force", "--if-exists", "--maintenance-db=postgres", databaseName]);
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
  recreateDatabase();
  const database = new Client({ connectionString: databaseUrl.toString() });
  await database.connect();
  try {
    const identity = await database.query(
      "SELECT pg_get_userbyid(datdba) AS owner, current_user AS application_role, has_database_privilege(current_user, current_database(), 'CREATE') AS can_create_database_objects FROM pg_database WHERE datname = current_database()",
    );
    assert.deepEqual(identity.rows, [{
      owner: recoveryOwner,
      application_role: applicationRole,
      can_create_database_objects: false,
    }]);
    const probe = await database.query("SELECT id, value FROM privileged_recovery_probe ORDER BY id");
    assert.deepEqual(probe.rows, [{ id: 1, value: "before-upgrade" }]);
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
  } finally {
    await mutated.end();
  }
  runPostgresAdmin("psql", [
    `--dbname=${databaseName}`,
    "--no-psqlrc",
    "--set=ON_ERROR_STOP=on",
    "--command",
    `SET ROLE ${quoteIdentifier(recoveryOwner)}; CREATE TABLE public.privileged_post_backup_residue_must_not_survive (id integer PRIMARY KEY); RESET ROLE`,
  ]);
  writeFileSync(evidenceFile, "mutated privileged evidence");

  restoreRecoveryPoint(envFile, backupDir);
  assert.equal(JSON.parse(readFileSync(path.join(backupDir, "restore-state.json"), "utf8")).state, "completed");

  const restored = new Client({ connectionString: databaseUrl.toString() });
  await restored.connect();
  try {
    const rows = await restored.query("SELECT id, value FROM privileged_recovery_probe ORDER BY id");
    assert.deepEqual(rows.rows, [{ id: 1, value: "before-upgrade" }]);
    const residue = await restored.query("SELECT to_regclass('privileged_post_backup_residue_must_not_survive') AS relation");
    assert.equal(residue.rows[0]?.relation, null);
    const restoredIdentity = await restored.query(
      "SELECT pg_get_userbyid(datdba) AS owner, current_user AS application_role, has_database_privilege(current_user, current_database(), 'CONNECT') AS can_connect, has_database_privilege(current_user, current_database(), 'CREATE') AS can_create_database_objects, has_table_privilege(current_user, 'public.privileged_recovery_probe', 'SELECT') AS can_read_probe, datacl IS NOT NULL AS has_explicit_database_acl, COALESCE((SELECT bool_or(privilege_type = 'CONNECT') FROM aclexplode(COALESCE(datacl, acldefault('d', datdba))) WHERE grantee = 0), false) AS public_can_connect FROM pg_database WHERE datname = current_database()",
    );
    assert.deepEqual(restoredIdentity.rows, [{
      owner: recoveryOwner,
      application_role: applicationRole,
      can_connect: true,
      can_create_database_objects: false,
      can_read_probe: true,
      has_explicit_database_acl: true,
      public_can_connect: false,
    }]);
  } finally {
    await restored.end();
  }
  assert.equal(readFileSync(evidenceFile, "utf8"), originalEvidence);
  console.log("privileged PostgreSQL recovery rehearsal passed");
} finally {
  try {
    dropDatabase();
  } catch {
    // Preserve the primary test failure when cleanup also fails.
  }
  if (existsSync(preflightDir)) cleanupPreflightDirectory(preflightDir);
  if (existsSync(backupDir)) {
    if (realpathSync(backupDir) !== backupDir) throw new Error("Refusing to remove a symlinked privileged backup");
    rmSync(backupDir, { recursive: true, force: true });
  }
  rmSync(root, { recursive: true, force: true });
}
