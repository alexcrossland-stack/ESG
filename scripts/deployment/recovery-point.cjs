"use strict";

const { spawnSync } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { readFileSync } = fs;
const { parseRuntimeEnv } = require("./runtime-env.cjs");

const ONE_GIB = 1024 * 1024 * 1024;

function fail(message) {
  throw new Error(message);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
    env: options.env || process.env,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    const detail = [result.error?.message, result.stderr].filter(Boolean).join("; ").trim();
    fail(`${command} failed${detail ? `: ${detail}` : ""}`);
  }
  return String(result.stdout || "");
}

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function walkEvidence(root) {
  const entries = [];
  let files = 0;
  let bytes = 0;
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(root, absolute);
      const stat = fs.lstatSync(absolute);
      if (stat.isSymbolicLink()) fail(`Evidence storage contains an unsupported symlink: ${relative}`);
      if (stat.isDirectory()) {
        entries.push({ path: `${relative}/`, type: "directory", bytes: 0 });
        visit(absolute);
      } else if (stat.isFile()) {
        files += 1;
        bytes += stat.size;
        entries.push({ path: relative, type: "file", bytes: stat.size });
      } else {
        fail(`Evidence storage contains an unsupported entry: ${relative}`);
      }
    }
  };
  visit(root);
  entries.sort((left, right) => left.path.localeCompare(right.path));
  return { files, bytes, entries };
}

function databaseConnection(databaseUrl, databaseOverride) {
  const url = new URL(databaseUrl);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) fail("DATABASE_URL must be PostgreSQL");
  const database = databaseOverride || decodeURIComponent(url.pathname.replace(/^\//, ""));
  const env = {
    ...process.env,
    PGHOST: url.hostname,
    PGPORT: url.port || "5432",
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: database,
    PGCONNECT_TIMEOUT: "10",
  };
  const sslMode = url.searchParams.get("sslmode");
  if (sslMode) env.PGSSLMODE = sslMode;
  return { database, env };
}

function assertDatabasePreflight(envFile) {
  const runtime = parseRuntimeEnv(readFileSync(envFile, "utf8"));
  if (!runtime.DATABASE_URL) fail("Candidate DATABASE_URL is missing");
  const connection = databaseConnection(runtime.DATABASE_URL);
  const duplicateCount = Number(run(
    "psql",
    [
      "--no-psqlrc",
      "--tuples-only",
      "--no-align",
      "--command",
      "SELECT count(*) FROM (SELECT country, factor_year, name FROM emission_factors GROUP BY country, factor_year, name HAVING count(*) > 1) duplicate_factor_keys",
    ],
    { capture: true, env: { ...connection.env, PGOPTIONS: "-c statement_timeout=30000 -c lock_timeout=5000" } },
  ).trim());
  if (!Number.isFinite(duplicateCount)) fail("Could not validate emission-factor natural keys");
  if (duplicateCount > 0) {
    fail(`Production has ${duplicateCount} duplicate emission-factor natural key(s); reconcile them before deployment`);
  }
}

function databaseSize(databaseUrl) {
  const { env } = databaseConnection(databaseUrl);
  const output = run(
    "psql",
    ["--no-psqlrc", "--tuples-only", "--no-align", "--command", "SELECT pg_database_size(current_database())"],
    { capture: true, env },
  ).trim();
  const size = Number(output);
  if (!Number.isFinite(size) || size < 0) fail("Could not determine production database size");
  return size;
}

function availableBytes(target) {
  const output = run("df", ["-Pk", target], { capture: true }).trim().split(/\r?\n/).at(-1) || "";
  const fields = output.trim().split(/\s+/);
  const availableKiB = Number(fields[3]);
  if (!Number.isFinite(availableKiB)) fail("Could not determine deployment disk headroom");
  return availableKiB * 1024;
}

function assertHeadroom(target, dbBytes, evidenceBytes) {
  const available = availableBytes(target);
  const required = (dbBytes * 2) + (evidenceBytes * 2) + ONE_GIB;
  if (available < required) {
    fail(`Insufficient disk headroom: ${available} bytes available, ${required} bytes required`);
  }
}

function directoryBytes(directory, excludedRelativePath) {
  const args = ["-sk"];
  if (excludedRelativePath) args.push(`--exclude=${excludedRelativePath}`);
  args.push(directory);
  const output = run("du", args, { capture: true }).trim();
  const kib = Number(output.split(/\s+/)[0]);
  if (!Number.isFinite(kib) || kib < 0) fail(`Could not determine directory size for ${directory}`);
  return kib * 1024;
}

function assertEvidenceRestoreHeadroom(realEvidencePath, evidenceBytes) {
  const available = availableBytes(path.dirname(realEvidencePath));
  const required = evidenceBytes + ONE_GIB;
  if (available < required) {
    fail(`Insufficient evidence-volume restore headroom: ${available} bytes available, ${required} bytes required`);
  }
}

function assertDeploymentCapacity(envFile, evidencePath, releaseRoot, currentRelease) {
  const runtime = parseRuntimeEnv(readFileSync(envFile, "utf8"));
  if (!runtime.DATABASE_URL) fail("Candidate DATABASE_URL is missing");
  const realEvidencePath = fs.realpathSync(evidencePath);
  const evidence = walkEvidence(realEvidencePath);
  const dbBytes = databaseSize(runtime.DATABASE_URL);
  const currentReleaseBytes = directoryBytes(currentRelease, "uploads/evidence");
  const sameFilesystem = fs.statSync(realEvidencePath).dev === fs.statSync(releaseRoot).dev;
  const rootRequired = currentReleaseBytes + (dbBytes * 2) + (sameFilesystem ? evidence.bytes * 2 : 0) + ONE_GIB;
  const rootAvailable = availableBytes(releaseRoot);
  if (rootAvailable < rootRequired) {
    fail(`Insufficient pre-build release/backup headroom: ${rootAvailable} bytes available, ${rootRequired} bytes required`);
  }
  assertEvidenceRestoreHeadroom(realEvidencePath, evidence.bytes);
}

function createRecoveryPoint({
  envFile,
  previousEnvFile,
  backupDir,
  evidencePath,
  previousSha,
  targetSha,
  previousCwd,
  previousScript,
}) {
  if (!/^[0-9a-f]{40}$/.test(previousSha) || !/^[0-9a-f]{40}$/.test(targetSha)) {
    fail("Recovery metadata requires full Git commit SHAs");
  }
  const runtime = parseRuntimeEnv(readFileSync(envFile, "utf8"));
  if (!runtime.DATABASE_URL) fail("Candidate DATABASE_URL is missing");
  if (!fs.existsSync(previousEnvFile)) fail("Previous production .env is missing");

  fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
  fs.chmodSync(backupDir, 0o700);
  const realEvidencePath = fs.realpathSync(evidencePath);
  if (!fs.statSync(realEvidencePath).isDirectory()) fail("Evidence storage is not a directory");
  const evidence = walkEvidence(realEvidencePath);
  const dbBytes = databaseSize(runtime.DATABASE_URL);
  assertHeadroom(backupDir, dbBytes, evidence.bytes);
  assertEvidenceRestoreHeadroom(realEvidencePath, evidence.bytes);

  const databaseDump = path.join(backupDir, "database.dump");
  const database = databaseConnection(runtime.DATABASE_URL);
  run(
    "pg_dump",
    ["--format=custom", "--no-owner", "--no-privileges", `--file=${databaseDump}`],
    { env: database.env },
  );
  if (!fs.existsSync(databaseDump) || fs.statSync(databaseDump).size === 0) fail("Database dump is empty");
  const restoreList = run("pg_restore", ["--list", databaseDump], { capture: true });
  if (!restoreList.trim()) fail("Database dump has an empty restore catalogue");

  const evidenceArchive = path.join(backupDir, "evidence.tar.gz");
  const archiveRoot = path.basename(realEvidencePath);
  run("tar", ["-C", path.dirname(realEvidencePath), "-czf", evidenceArchive, archiveRoot]);
  const archiveList = run("tar", ["-tzf", evidenceArchive], { capture: true });
  if (!archiveList.split(/\r?\n/).some((entry) => entry === `${archiveRoot}/` || entry.startsWith(`${archiveRoot}/`))) {
    fail("Evidence archive does not contain the expected storage root");
  }

  fs.copyFileSync(previousEnvFile, path.join(backupDir, "production.env"));
  fs.writeFileSync(
    path.join(backupDir, "evidence-manifest.json"),
    `${JSON.stringify(evidence, null, 2)}\n`,
    { mode: 0o600 },
  );
  const metadata = {
    previousSha,
    targetSha,
    createdAt: new Date().toISOString(),
    previousCwd,
    previousScript,
    evidencePath: realEvidencePath,
    evidenceArchiveRoot: archiveRoot,
    databaseBytes: dbBytes,
  };
  fs.writeFileSync(path.join(backupDir, "release.json"), `${JSON.stringify(metadata, null, 2)}\n`, { mode: 0o600 });

  const protectedFiles = [
    "database.dump",
    "evidence.tar.gz",
    "evidence-manifest.json",
    "production.env",
    "release.json",
  ];
  const checksums = protectedFiles.map((name) => `${sha256(path.join(backupDir, name))}  ${name}`).join("\n");
  fs.writeFileSync(path.join(backupDir, "SHA256SUMS"), `${checksums}\n`, { mode: 0o600 });
  for (const name of [...protectedFiles, "SHA256SUMS"]) fs.chmodSync(path.join(backupDir, name), 0o600);
  return metadata;
}

function verifyChecksums(backupDir) {
  const lines = fs.readFileSync(path.join(backupDir, "SHA256SUMS"), "utf8").trim().split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^([0-9a-f]{64})  ([A-Za-z0-9._-]+)$/);
    if (!match) fail("Recovery checksum manifest is invalid");
    const [, expected, name] = match;
    if (sha256(path.join(backupDir, name)) !== expected) fail(`Recovery checksum failed for ${name}`);
  }
}

function rehearseDatabaseRestore(envFile, backupDir, suffix) {
  verifyChecksums(backupDir);
  const runtime = parseRuntimeEnv(readFileSync(envFile, "utf8"));
  const safeSuffix = String(suffix).replace(/[^A-Za-z0-9_]/g, "_").slice(0, 32);
  const rehearsalDatabase = `esg_restore_${safeSuffix}`.slice(0, 63);
  if (!safeSuffix) fail("Restore rehearsal suffix is invalid");
  const maintenance = databaseConnection(runtime.DATABASE_URL, "postgres");
  const target = databaseConnection(runtime.DATABASE_URL, rehearsalDatabase);
  let created = false;
  try {
    run("createdb", [rehearsalDatabase], { env: maintenance.env });
    created = true;
    run(
      "pg_restore",
      ["--exit-on-error", "--no-owner", "--no-privileges", "--dbname", rehearsalDatabase, path.join(backupDir, "database.dump")],
      { env: target.env },
    );
    const result = run("psql", ["--no-psqlrc", "--tuples-only", "--no-align", "--command", "SELECT 1"], { capture: true, env: target.env }).trim();
    if (result !== "1") fail("Restored database validation query failed");
  } finally {
    if (created) run("dropdb", ["--if-exists", rehearsalDatabase], { env: maintenance.env });
  }
}

function rehearseEvidenceRestore(backupDir) {
  verifyChecksums(backupDir);
  const metadata = JSON.parse(fs.readFileSync(path.join(backupDir, "release.json"), "utf8"));
  const expected = JSON.parse(fs.readFileSync(path.join(backupDir, "evidence-manifest.json"), "utf8"));
  const restoreRoot = fs.mkdtempSync(path.join(os.tmpdir(), "simplyesg-evidence-rehearsal-"));
  try {
    run("tar", ["-C", restoreRoot, "-xzf", path.join(backupDir, "evidence.tar.gz")]);
    const extracted = path.join(restoreRoot, metadata.evidenceArchiveRoot);
    const actual = walkEvidence(extracted);
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      fail("Evidence restore rehearsal manifest does not match the recovery point");
    }
  } finally {
    fs.rmSync(restoreRoot, { recursive: true, force: true });
  }
}

function restoreEvidence(backupDir, metadata) {
  const evidencePath = metadata.evidencePath;
  const parent = path.dirname(evidencePath);
  const expected = JSON.parse(fs.readFileSync(path.join(backupDir, "evidence-manifest.json"), "utf8"));
  if (fs.existsSync(evidencePath)) {
    const current = walkEvidence(evidencePath);
    if (JSON.stringify(current) === JSON.stringify(expected)) {
      console.log("Evidence storage still matches the coordinated recovery point; no replacement required");
      return;
    }
  }
  const restoreRoot = fs.mkdtempSync(path.join(parent, ".evidence-restore-"));
  const failedRoot = `${evidencePath}.failed-${Date.now()}`;
  try {
    run("tar", ["-C", restoreRoot, "-xzf", path.join(backupDir, "evidence.tar.gz")]);
    const extracted = path.join(restoreRoot, metadata.evidenceArchiveRoot);
    const actual = walkEvidence(extracted);
    if (JSON.stringify(actual) !== JSON.stringify(expected)) fail("Restored evidence manifest does not match the recovery point");
    fs.renameSync(evidencePath, failedRoot);
    try {
      fs.renameSync(extracted, evidencePath);
    } catch (error) {
      fs.renameSync(failedRoot, evidencePath);
      throw error;
    }
  } finally {
    fs.rmSync(restoreRoot, { recursive: true, force: true });
  }
}

function restoreRecoveryPoint(envFile, backupDir) {
  verifyChecksums(backupDir);
  const runtime = parseRuntimeEnv(readFileSync(envFile, "utf8"));
  const metadata = JSON.parse(fs.readFileSync(path.join(backupDir, "release.json"), "utf8"));
  const connection = databaseConnection(runtime.DATABASE_URL);
  run(
    "psql",
    [
      "--no-psqlrc",
      "--command",
      "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid()",
    ],
    { env: connection.env },
  );
  run(
    "pg_restore",
    [
      "--clean",
      "--if-exists",
      "--exit-on-error",
      "--single-transaction",
      "--no-owner",
      "--no-privileges",
      "--dbname",
      connection.database,
      path.join(backupDir, "database.dump"),
    ],
    { env: connection.env },
  );
  restoreEvidence(backupDir, metadata);
}

function runCli(argv) {
  const [command, ...args] = argv;
  if (command === "create") {
    const [envFile, previousEnvFile, backupDir, evidencePath, previousSha, targetSha, previousCwd, previousScript] = args;
    if (!previousScript) fail("Recovery create arguments are incomplete");
    createRecoveryPoint({ envFile, previousEnvFile, backupDir, evidencePath, previousSha, targetSha, previousCwd, previousScript });
    console.log(`Recovery point created and verified: ${backupDir}`);
    return;
  }
  if (command === "capacity") {
    const [envFile, evidencePath, releaseRoot, currentRelease] = args;
    if (!currentRelease) fail("Capacity preflight arguments are incomplete");
    assertDeploymentCapacity(envFile, evidencePath, releaseRoot, currentRelease);
    console.log("Pre-build release, backup and evidence-restore capacity checks passed");
    return;
  }
  if (command === "preflight") {
    const [envFile] = args;
    if (!envFile) fail("Database preflight requires a runtime environment file");
    assertDatabasePreflight(envFile);
    console.log("Production database preflight passed");
    return;
  }
  if (command === "rehearse") {
    const [envFile, backupDir, suffix] = args;
    if (!suffix) fail("Recovery rehearsal arguments are incomplete");
    rehearseDatabaseRestore(envFile, backupDir, suffix);
    rehearseEvidenceRestore(backupDir);
    console.log("Database and evidence restored successfully into disposable rehearsal targets");
    return;
  }
  if (command === "restore") {
    const [envFile, backupDir] = args;
    if (!backupDir) fail("Recovery restore arguments are incomplete");
    restoreRecoveryPoint(envFile, backupDir);
    console.log("Database and evidence recovery completed");
    return;
  }
  if (command === "cleanup-preflight") {
    const [directory] = args;
    const resolved = path.resolve(directory || "");
    if (!resolved.startsWith("/root/esg-deploy-preflight/") || resolved === "/root/esg-deploy-preflight") {
      fail("Refusing to remove an invalid preflight directory");
    }
    fs.rmSync(resolved, { recursive: true, force: true });
    console.log("Disposable restore rehearsal artifacts removed");
    return;
  }
  fail("Unknown recovery-point command");
}

if (require.main === module) {
  try {
    runCli(process.argv.slice(2));
  } catch (error) {
    console.error(`::error::${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

module.exports = {
  assertDatabasePreflight,
  assertDeploymentCapacity,
  createRecoveryPoint,
  databaseConnection,
  rehearseDatabaseRestore,
  rehearseEvidenceRestore,
  restoreRecoveryPoint,
  verifyChecksums,
  walkEvidence,
};
