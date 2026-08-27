"use strict";

const { spawnSync } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { readFileSync } = fs;
const { parseRuntimeEnv } = require("./runtime-env.cjs");

const ONE_GIB = 1024 * 1024 * 1024;
const LOCAL_DATABASE_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
const LOCAL_RECOVERY_AUTHORITY = "local-postgres-os";
const APPLICATION_RECOVERY_AUTHORITY = "application-role";
const POSTGRES_RUNUSER = "/usr/sbin/runuser";
const POSTGRES_ADMIN_BINARIES = Object.freeze({
  createdb: "/usr/bin/createdb",
  dropdb: "/usr/bin/dropdb",
  pg_restore: "/usr/bin/pg_restore",
  psql: "/usr/bin/psql",
});
const POSTGRES_SOCKET_DIRECTORIES = ["/var/run/postgresql", "/run/postgresql"];

function fail(message) {
  throw new Error(message);
}

function run(command, args, options = {}) {
  let inputFd;
  let result;
  try {
    const stdio = options.capture
      ? ["pipe", "pipe", "pipe"]
      : ["inherit", "inherit", "inherit"];
    if (options.stdinFile) {
      inputFd = fs.openSync(options.stdinFile, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
      if (!fs.fstatSync(inputFd).isFile()) fail(`Command input is not a regular file: ${options.stdinFile}`);
      // The root process opens the protected dump and passes only its file
      // descriptor to pg_restore after runuser drops to the postgres account.
      // This keeps the recovery point root-owned and mode 0600.
      stdio[0] = inputFd;
    }
    result = spawnSync(command, args, {
      encoding: "utf8",
      stdio,
      env: options.env || process.env,
      maxBuffer: 64 * 1024 * 1024,
    });
  } finally {
    if (inputFd !== undefined) fs.closeSync(inputFd);
  }
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
  let url;
  try {
    url = new URL(databaseUrl);
  } catch {
    fail("DATABASE_URL must be a valid PostgreSQL URL");
  }
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

function databaseDescriptor(databaseUrl) {
  let url;
  try {
    url = new URL(databaseUrl);
  } catch {
    fail("DATABASE_URL must be a valid PostgreSQL URL");
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol)) fail("DATABASE_URL must be PostgreSQL");
  const port = url.port || "5432";
  const numericPort = Number(port);
  if (!/^\d+$/.test(port) || numericPort < 1 || numericPort > 65535) {
    fail("DATABASE_URL contains an invalid PostgreSQL port");
  }
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  const username = decodeURIComponent(url.username);
  if (!database || !username) fail("DATABASE_URL must include a database and username");
  return { database, host: url.hostname.toLowerCase(), port, username };
}

function isLoopbackDatabaseHost(host) {
  return LOCAL_DATABASE_HOSTS.has(String(host).toLowerCase());
}

function isLoopbackDatabaseAddress(address) {
  const normalized = String(address || "").toLowerCase().replace(/\/(?:32|128)$/, "");
  if (normalized === "::1") return true;
  if (/^127(?:\.\d{1,3}){3}$/.test(normalized)) {
    return normalized.split(".").slice(1).every((part) => Number(part) >= 0 && Number(part) <= 255);
  }
  const mapped = normalized.match(/^::ffff:(127(?:\.\d{1,3}){3})$/);
  return mapped ? isLoopbackDatabaseAddress(mapped[1]) : false;
}

function recoveryAuthority() {
  const authority = process.env.RECOVERY_AUTHORITY || APPLICATION_RECOVERY_AUTHORITY;
  if (![APPLICATION_RECOVERY_AUTHORITY, LOCAL_RECOVERY_AUTHORITY].includes(authority)) {
    fail(`Unsupported recovery authority: ${authority}`);
  }
  return authority;
}

function currentRoleCanCreateDatabase(databaseUrl) {
  const maintenance = databaseConnection(databaseUrl, "postgres");
  const result = run(
    "psql",
    [
      "--no-psqlrc",
      "--tuples-only",
      "--no-align",
      "--command",
      "SELECT rolcreatedb FROM pg_roles WHERE rolname = current_user",
    ],
    { capture: true, env: maintenance.env },
  ).trim();
  if (result !== "t" && result !== "f") fail("Could not determine database-role CREATEDB capability");
  return result === "t";
}

function localPostgresAdmin(databaseUrl, command, args, options = {}) {
  const descriptor = databaseDescriptor(databaseUrl);
  if (!isLoopbackDatabaseHost(descriptor.host)) {
    fail("DATABASE_URL is not loopback; refusing local PostgreSQL recovery authority");
  }
  if (typeof process.getuid !== "function" || process.getuid() !== 0) {
    fail("Local PostgreSQL recovery authority must run as root");
  }
  if (!fs.existsSync(POSTGRES_RUNUSER)) fail("Fixed-path runuser utility is unavailable");
  const binary = POSTGRES_ADMIN_BINARIES[command];
  if (!binary || !fs.existsSync(binary)) fail(`Fixed-path PostgreSQL admin command is unavailable: ${command}`);
  const socketDirectory = POSTGRES_SOCKET_DIRECTORIES.find((candidate) =>
    fs.existsSync(path.join(candidate, `.s.PGSQL.${descriptor.port}`))
  );
  if (!socketDirectory) {
    fail(`No local PostgreSQL socket exists for port ${descriptor.port}`);
  }
  const parentEnv = { ...process.env };
  for (const name of ["DATABASE_URL", "PGDATABASE", "PGHOST", "PGOPTIONS", "PGPASSWORD", "PGPORT", "PGSERVICE", "PGSSLMODE", "PGUSER"]) {
    delete parentEnv[name];
  }
  return run(
    POSTGRES_RUNUSER,
    [
      "--user",
      "postgres",
      "--",
      "/usr/bin/env",
      "-i",
      "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
      "HOME=/var/lib/postgresql",
      `PGHOST=${socketDirectory}`,
      `PGPORT=${descriptor.port}`,
      "PGUSER=postgres",
      "PGDATABASE=postgres",
      "PGCONNECT_TIMEOUT=10",
      "PGSSLMODE=disable",
      binary,
      ...args,
    ],
    { capture: options.capture, env: parentEnv, stdinFile: options.stdinFile },
  );
}

function databaseIdentity(databaseUrl, localAdmin = false, databaseOverride) {
  const descriptor = databaseDescriptor(databaseUrl);
  const query = [
    "SELECT json_build_object(",
    "  'systemIdentifier', (pg_control_system()).system_identifier::text,",
    "  'databaseOid', database_row.oid::text,",
    "  'databaseName', current_database(),",
    "  'databaseOwner', pg_get_userbyid(database_row.datdba),",
    "  'currentUser', current_user,",
    "  'serverAddress', inet_server_addr()::text,",
    "  'serverPort', COALESCE(inet_server_port(), current_setting('port')::integer),",
    "  'connectionLimit', database_row.datconnlimit",
    ") FROM pg_database database_row WHERE database_row.datname = current_database()",
  ].join(" ");
  const database = databaseOverride || descriptor.database;
  const args = ["--no-psqlrc", "--tuples-only", "--no-align", "--dbname", database, "--command", query];
  const output = localAdmin
    ? localPostgresAdmin(databaseUrl, "psql", args, { capture: true }).trim()
    : run("psql", args, { capture: true, env: databaseConnection(databaseUrl, database).env }).trim();
  let identity;
  try {
    identity = JSON.parse(output);
  } catch {
    fail("Could not parse PostgreSQL recovery identity");
  }
  for (const key of ["systemIdentifier", "databaseOid", "databaseName", "databaseOwner", "currentUser"]) {
    if (!identity[key] || typeof identity[key] !== "string") fail(`PostgreSQL recovery identity is missing ${key}`);
  }
  if (!Number.isInteger(identity.serverPort) || !Number.isInteger(identity.connectionLimit)) {
    fail("PostgreSQL recovery identity has invalid port or connection limit");
  }
  if (!localAdmin) {
    if (!isLoopbackDatabaseHost(descriptor.host) || !isLoopbackDatabaseAddress(identity.serverAddress)) {
      fail("DATABASE_URL did not connect to an actual loopback PostgreSQL address");
    }
    if (identity.serverPort !== Number(descriptor.port) || identity.currentUser !== descriptor.username) {
      fail("DATABASE_URL identity does not match its connected PostgreSQL role or port");
    }
  }
  return identity;
}

function assertLocalPostgresAdminTargetsSource(databaseUrl) {
  const applicationIdentity = databaseIdentity(databaseUrl);
  const localAdminIdentity = databaseIdentity(databaseUrl, true);
  const stableKeys = ["systemIdentifier", "databaseOid", "databaseName", "databaseOwner", "serverPort", "connectionLimit"];
  if (stableKeys.some((key) => applicationIdentity[key] !== localAdminIdentity[key])) {
    fail("Local PostgreSQL admin socket does not identify the DATABASE_URL cluster; refusing recovery rehearsal");
  }
  if (localAdminIdentity.currentUser !== "postgres" || localAdminIdentity.serverAddress !== null) {
    fail("Local PostgreSQL recovery authority is not the postgres role over a Unix socket");
  }
  return applicationIdentity;
}

function assertRecoveryIdentity(databaseUrl, metadata) {
  const authority = recoveryAuthority();
  if (metadata.recoveryAuthority !== authority || !metadata.databaseIdentity) {
    fail("Recovery metadata authority or database identity is missing or changed");
  }
  const currentIdentity = authority === LOCAL_RECOVERY_AUTHORITY
    ? assertLocalPostgresAdminTargetsSource(databaseUrl)
    : databaseIdentity(databaseUrl);
  for (const key of ["systemIdentifier", "databaseOid", "databaseName", "databaseOwner", "currentUser", "serverAddress", "serverPort", "connectionLimit"]) {
    if (currentIdentity[key] !== metadata.databaseIdentity[key]) {
      fail(`Recovery database identity changed at ${key}`);
    }
  }
  return currentIdentity;
}

function recoveryTargetState(databaseUrl, authority, database) {
  const query = [
    "SELECT json_build_object(",
    "  'systemIdentifier', (pg_control_system()).system_identifier::text,",
    `  'databaseName', ${quoteLiteral(database)},`,
    "  'databaseExists', database_row.oid IS NOT NULL,",
    "  'databaseOid', database_row.oid::text,",
    "  'databaseOwner', pg_get_userbyid(database_row.datdba),",
    "  'currentUser', current_user,",
    "  'serverAddress', inet_server_addr()::text,",
    "  'serverPort', COALESCE(inet_server_port(), current_setting('port')::integer),",
    "  'connectionLimit', database_row.datconnlimit",
    ") FROM (SELECT 1) marker LEFT JOIN pg_database database_row",
    `  ON database_row.datname = ${quoteLiteral(database)}`,
  ].join(" ");
  const args = ["--no-psqlrc", "--tuples-only", "--no-align", "--dbname", "postgres", "--command", query];
  const output = authority === LOCAL_RECOVERY_AUTHORITY
    ? localPostgresAdmin(databaseUrl, "psql", args, { capture: true })
    : run("psql", args, { capture: true, env: databaseConnection(databaseUrl, "postgres").env });
  let state;
  try {
    state = JSON.parse(output.trim());
  } catch {
    fail("Could not parse PostgreSQL recovery target state");
  }
  if (!state.systemIdentifier || !Number.isInteger(state.serverPort) || typeof state.databaseExists !== "boolean") {
    fail("PostgreSQL recovery target state is incomplete");
  }
  const descriptor = databaseDescriptor(databaseUrl);
  if (state.serverPort !== Number(descriptor.port)) fail("Recovery target PostgreSQL port changed");
  if (authority === LOCAL_RECOVERY_AUTHORITY) {
    if (state.currentUser !== "postgres" || state.serverAddress !== null) {
      fail("Recovery resume authority is not postgres over the verified local socket");
    }
  } else if (state.currentUser !== descriptor.username || !isLoopbackDatabaseAddress(state.serverAddress)) {
    fail("Application recovery resume authority or server address changed");
  }
  return state;
}

function restoreMarkerPath(backupDir) {
  return path.join(backupDir, "restore-state.json");
}

function syncDirectory(directory) {
  const descriptor = fs.openSync(directory, fs.constants.O_RDONLY);
  try {
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
}

function writeRestoreMarker(backupDir, metadata) {
  const markerFile = restoreMarkerPath(backupDir);
  if (fs.existsSync(markerFile)) fail("Recovery restore marker already exists");
  const marker = {
    version: 1,
    state: "in_progress",
    backupPath: fs.realpathSync(backupDir),
    manifestSha256: sha256(path.join(backupDir, "SHA256SUMS")),
    recoveryAuthority: metadata.recoveryAuthority,
    systemIdentifier: metadata.databaseIdentity.systemIdentifier,
    databaseName: metadata.databaseIdentity.databaseName,
    originalDatabaseOid: metadata.databaseIdentity.databaseOid,
    databaseOwner: metadata.databaseIdentity.databaseOwner,
    serverPort: metadata.databaseIdentity.serverPort,
    startedAt: new Date().toISOString(),
  };
  const temporary = `${markerFile}.${process.pid}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(marker, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  const descriptor = fs.openSync(temporary, "r");
  try {
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
  fs.renameSync(temporary, markerFile);
  fs.chmodSync(markerFile, 0o600);
  syncDirectory(backupDir);
  return marker;
}

function readRestoreMarker(backupDir, metadata, authority) {
  const markerFile = restoreMarkerPath(backupDir);
  const stat = fs.lstatSync(markerFile);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0) {
    fail("Recovery restore marker is not a private regular file");
  }
  if (authority === LOCAL_RECOVERY_AUTHORITY && stat.uid !== 0) {
    fail("Production recovery restore marker is not root-owned");
  }
  let marker;
  try {
    marker = JSON.parse(fs.readFileSync(markerFile, "utf8"));
  } catch {
    fail("Recovery restore marker is invalid");
  }
  const expected = {
    backupPath: fs.realpathSync(backupDir),
    manifestSha256: sha256(path.join(backupDir, "SHA256SUMS")),
    recoveryAuthority: authority,
    systemIdentifier: metadata.databaseIdentity.systemIdentifier,
    databaseName: metadata.databaseIdentity.databaseName,
    originalDatabaseOid: metadata.databaseIdentity.databaseOid,
    databaseOwner: metadata.databaseIdentity.databaseOwner,
    serverPort: metadata.databaseIdentity.serverPort,
  };
  if (
    marker.version !== 1
    || !["in_progress", "completed"].includes(marker.state)
    || Object.entries(expected).some(([key, value]) => marker[key] !== value)
  ) {
    fail("Recovery restore marker does not match this checked recovery point");
  }
  return marker;
}

function markRestoreCompleted(backupDir, metadata, authority) {
  const markerFile = restoreMarkerPath(backupDir);
  const marker = readRestoreMarker(backupDir, metadata, authority);
  const completed = {
    ...marker,
    state: "completed",
    completedAt: new Date().toISOString(),
  };
  const temporary = `${markerFile}.${process.pid}.${crypto.randomUUID()}.completed.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(completed, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  const descriptor = fs.openSync(temporary, "r");
  try {
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
  fs.renameSync(temporary, markerFile);
  fs.chmodSync(markerFile, 0o600);
  syncDirectory(backupDir);
}

function resolveRestoreIdentity(databaseUrl, backupDir, metadata, authority) {
  const markerFile = restoreMarkerPath(backupDir);
  if (!fs.existsSync(markerFile)) {
    const identity = assertRecoveryIdentity(databaseUrl, metadata);
    writeRestoreMarker(backupDir, metadata);
    return identity;
  }

  readRestoreMarker(backupDir, metadata, authority);
  const identity = metadata.databaseIdentity;
  const state = recoveryTargetState(databaseUrl, authority, identity.databaseName);
  if (state.systemIdentifier !== identity.systemIdentifier) {
    fail("Recovery resume PostgreSQL system identifier changed");
  }
  if (state.databaseExists) {
    const allowedOwners = new Set([identity.databaseOwner]);
    if (authority === LOCAL_RECOVERY_AUTHORITY) allowedOwners.add("postgres");
    if (!allowedOwners.has(state.databaseOwner)) fail("Recovery resume database owner changed unexpectedly");
  }
  return identity;
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
  const authority = recoveryAuthority();
  const identity = authority === LOCAL_RECOVERY_AUTHORITY
    ? assertLocalPostgresAdminTargetsSource(runtime.DATABASE_URL)
    : databaseIdentity(runtime.DATABASE_URL);

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
    ["--create", "--format=custom", `--file=${databaseDump}`],
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
    databaseIdentity: identity,
    recoveryAuthority: authority,
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
  if (authority === LOCAL_RECOVERY_AUTHORITY) {
    const kind = path.resolve(backupDir).startsWith("/root/esg-deploy-preflight/") ? "preflight" : "backup";
    assertPrivilegedRecoveryDirectory(backupDir, kind);
  }
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

function assertPrivilegedRecoveryDirectory(backupDir, kind) {
  const resolved = path.resolve(backupDir);
  const allowed = kind === "preflight"
    ? /^\/root\/esg-deploy-preflight\/[0-9]+-[0-9]+\/restore-rehearsal$/
    : /^\/root\/esg-deploy-backups\/[0-9]+-[0-9]+-[0-9a-f]{12}$/;
  if (!allowed.test(resolved)) fail(`Privileged ${kind} recovery directory is outside its fixed root`);
  if (fs.realpathSync(resolved) !== resolved) fail(`Privileged ${kind} recovery directory cannot be a symlink`);
  const directoryStat = fs.statSync(resolved);
  if (!directoryStat.isDirectory() || directoryStat.uid !== 0 || (directoryStat.mode & 0o022) !== 0) {
    fail(`Privileged ${kind} recovery directory must be root-owned and private`);
  }
  for (const name of ["SHA256SUMS", "database.dump", "evidence-manifest.json", "evidence.tar.gz", "production.env", "release.json"]) {
    const file = path.join(resolved, name);
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.uid !== 0 || (stat.mode & 0o077) !== 0) {
      fail(`Privileged recovery file is not root-owned and private: ${name}`);
    }
  }
}

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function quoteLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function validateRestoredDatabase(databaseUrl, database) {
  const target = databaseConnection(databaseUrl, database);
  const output = run(
    "psql",
    [
      "--no-psqlrc",
      "--tuples-only",
      "--no-align",
      "--command",
      "SELECT json_build_object('probe', 1, 'tableCount', count(*)) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relkind IN ('r', 'p') AND n.nspname NOT IN ('pg_catalog', 'information_schema')",
    ],
    { capture: true, env: target.env },
  ).trim();
  let result;
  try {
    result = JSON.parse(output);
  } catch {
    fail("Restored database validation result is invalid");
  }
  if (result.probe !== 1 || !Number.isInteger(result.tableCount) || result.tableCount < 1) {
    fail("Restored database validation query failed");
  }
}

function setLocalDatabaseConnectionLimit(databaseUrl, database, limit) {
  if (!Number.isInteger(limit) || limit < -1) fail("Database connection limit is invalid");
  localPostgresAdmin(
    databaseUrl,
    "psql",
    [
      "--no-psqlrc",
      "--dbname",
      "postgres",
      "--command",
      `ALTER DATABASE ${quoteIdentifier(database)} CONNECTION LIMIT ${limit}`,
    ],
  );
}

function setDatabaseConnectionLimit(databaseUrl, database, limit, authority) {
  if (authority === LOCAL_RECOVERY_AUTHORITY) {
    setLocalDatabaseConnectionLimit(databaseUrl, database, limit);
    return;
  }
  const maintenance = databaseConnection(databaseUrl, "postgres");
  run(
    "psql",
    [
      "--no-psqlrc",
      "--dbname",
      "postgres",
      "--command",
      `ALTER DATABASE ${quoteIdentifier(database)} CONNECTION LIMIT ${limit}`,
    ],
    { env: maintenance.env },
  );
}

function terminateDatabaseSessions(databaseUrl, database, authority) {
  const args = [
    "--no-psqlrc",
    "--tuples-only",
    "--no-align",
    "--dbname",
    "postgres",
    "--command",
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = ${quoteLiteral(database)} AND pid <> pg_backend_pid()`,
  ];
  if (authority === LOCAL_RECOVERY_AUTHORITY) {
    localPostgresAdmin(databaseUrl, "psql", args, { capture: true });
  } else {
    run("psql", args, { capture: true, env: databaseConnection(databaseUrl, "postgres").env });
  }
  const remainingArgs = [
    "--no-psqlrc",
    "--tuples-only",
    "--no-align",
    "--dbname",
    "postgres",
    "--command",
    `SELECT count(*) FROM pg_stat_activity WHERE datname = ${quoteLiteral(database)} AND pid <> pg_backend_pid()`,
  ];
  const remainingOutput = authority === LOCAL_RECOVERY_AUTHORITY
    ? localPostgresAdmin(databaseUrl, "psql", remainingArgs, { capture: true })
    : run("psql", remainingArgs, { capture: true, env: databaseConnection(databaseUrl, "postgres").env });
  if (Number(remainingOutput.trim()) !== 0) fail("Could not terminate all database sessions before recovery");
}

function restoreOriginalDatabase(databaseUrl, database, backupDir, authority) {
  const dump = path.join(backupDir, "database.dump");
  const initialState = recoveryTargetState(databaseUrl, authority, database);
  if (initialState.databaseExists) {
    setDatabaseConnectionLimit(databaseUrl, database, 0, authority);
    terminateDatabaseSessions(databaseUrl, database, authority);
  }
  try {
    const args = [
      "--clean",
      "--if-exists",
      "--create",
      "--exit-on-error",
      "--dbname",
      "postgres",
    ];
    if (authority === LOCAL_RECOVERY_AUTHORITY) {
      localPostgresAdmin(
        databaseUrl,
        "pg_restore",
        args,
        { stdinFile: dump },
      );
    } else {
      run("pg_restore", args, { env: databaseConnection(databaseUrl, "postgres").env, stdinFile: dump });
    }
  } finally {
    // A failed restore must leave the recreated database closed to the app.
    try {
      const finalState = recoveryTargetState(databaseUrl, authority, database);
      if (finalState.databaseExists) setDatabaseConnectionLimit(databaseUrl, database, 0, authority);
    } catch {
      // The database may not have been recreated yet. The application remains stopped.
    }
  }
}

function recreateRehearsalDatabase(databaseUrl, database, owner, backupDir, authority, connectionLimit) {
  const maintenance = databaseConnection(databaseUrl, "postgres");
  const dump = path.join(backupDir, "database.dump");
  if (authority === LOCAL_RECOVERY_AUTHORITY) {
    localPostgresAdmin(databaseUrl, "dropdb", ["--force", "--if-exists", "--maintenance-db", "postgres", database]);
    localPostgresAdmin(databaseUrl, "createdb", ["--maintenance-db", "postgres", "--template", "template0", "--owner", owner, database]);
    localPostgresAdmin(
      databaseUrl,
      "pg_restore",
      ["--exit-on-error", "--single-transaction", "--dbname", database],
      { stdinFile: dump },
    );
    setLocalDatabaseConnectionLimit(databaseUrl, database, connectionLimit);
    return;
  }
  run("dropdb", ["--force", "--if-exists", database], { env: maintenance.env });
  run("createdb", ["--template", "template0", "--owner", owner, database], { env: maintenance.env });
  run(
    "pg_restore",
    ["--exit-on-error", "--single-transaction", "--dbname", database],
    { env: databaseConnection(databaseUrl, database).env, stdinFile: dump },
  );
  setDatabaseConnectionLimit(databaseUrl, database, connectionLimit, authority);
}

function createRestoreSentinel(databaseUrl, database) {
  run(
    "psql",
    [
      "--no-psqlrc",
      "--dbname",
      database,
      "--command",
      "CREATE SCHEMA recovery_post_backup_sentinel; CREATE TABLE recovery_post_backup_sentinel.must_not_survive (id integer PRIMARY KEY)",
    ],
    { env: databaseConnection(databaseUrl, database).env },
  );
}

function assertRestoreSentinelAbsent(databaseUrl, database) {
  const result = run(
    "psql",
    [
      "--no-psqlrc",
      "--tuples-only",
      "--no-align",
      "--dbname",
      database,
      "--command",
      "SELECT to_regclass('recovery_post_backup_sentinel.must_not_survive') IS NULL",
    ],
    { capture: true, env: databaseConnection(databaseUrl, database).env },
  ).trim();
  if (result !== "t") fail("Post-backup database objects survived recovery");
}

function rehearseDatabaseRestore(envFile, backupDir, suffix) {
  const authority = recoveryAuthority();
  if (authority === LOCAL_RECOVERY_AUTHORITY) assertPrivilegedRecoveryDirectory(backupDir, "preflight");
  verifyChecksums(backupDir);
  const runtime = parseRuntimeEnv(readFileSync(envFile, "utf8"));
  if (!runtime.DATABASE_URL) fail("Candidate DATABASE_URL is missing");
  const metadata = JSON.parse(fs.readFileSync(path.join(backupDir, "release.json"), "utf8"));
  assertRecoveryIdentity(runtime.DATABASE_URL, metadata);
  const safeSuffix = String(suffix).replace(/[^A-Za-z0-9_]/g, "_").slice(0, 32);
  const rehearsalDatabase = `esg_restore_${safeSuffix}`.slice(0, 63);
  if (!safeSuffix) fail("Restore rehearsal suffix is invalid");
  if (authority === LOCAL_RECOVERY_AUTHORITY && !/^[0-9]+_[0-9]+$/.test(safeSuffix)) {
    fail("Privileged restore rehearsal suffix must be the numeric deployment run instance");
  }
  const maintenance = databaseConnection(runtime.DATABASE_URL, "postgres");
  const descriptor = databaseDescriptor(runtime.DATABASE_URL);
  const roleCanCreateDatabase = authority === APPLICATION_RECOVERY_AUTHORITY
    ? currentRoleCanCreateDatabase(runtime.DATABASE_URL)
    : false;
  if (authority === APPLICATION_RECOVERY_AUTHORITY && !roleCanCreateDatabase) {
    fail("Application-role recovery rehearsal requires CREATEDB; production must use verified local PostgreSQL authority");
  }
  let created = false;
  try {
    if (authority === LOCAL_RECOVERY_AUTHORITY) {
      localPostgresAdmin(
        runtime.DATABASE_URL,
        "createdb",
        ["--maintenance-db", "postgres", "--template", "template0", "--owner", metadata.databaseIdentity.databaseOwner, rehearsalDatabase],
      );
    } else {
      run("createdb", ["--template", "template0", "--owner", descriptor.username, rehearsalDatabase], { env: maintenance.env });
    }
    created = true;
    const dump = path.join(backupDir, "database.dump");
    const initialRestoreArgs = ["--exit-on-error", "--dbname", rehearsalDatabase];
    if (authority === LOCAL_RECOVERY_AUTHORITY) {
      localPostgresAdmin(runtime.DATABASE_URL, "pg_restore", initialRestoreArgs, { stdinFile: dump });
      setLocalDatabaseConnectionLimit(runtime.DATABASE_URL, rehearsalDatabase, metadata.databaseIdentity.connectionLimit);
    } else {
      run("pg_restore", initialRestoreArgs, {
        env: databaseConnection(runtime.DATABASE_URL, rehearsalDatabase).env,
        stdinFile: dump,
      });
    }
    validateRestoredDatabase(runtime.DATABASE_URL, rehearsalDatabase);
    createRestoreSentinel(runtime.DATABASE_URL, rehearsalDatabase);
    recreateRehearsalDatabase(
      runtime.DATABASE_URL,
      rehearsalDatabase,
      metadata.databaseIdentity.databaseOwner,
      backupDir,
      authority,
      metadata.databaseIdentity.connectionLimit,
    );
    validateRestoredDatabase(runtime.DATABASE_URL, rehearsalDatabase);
    assertRestoreSentinelAbsent(runtime.DATABASE_URL, rehearsalDatabase);
  } finally {
    if (created && authority === LOCAL_RECOVERY_AUTHORITY) {
      localPostgresAdmin(runtime.DATABASE_URL, "dropdb", ["--force", "--if-exists", "--maintenance-db", "postgres", rehearsalDatabase]);
    } else if (created) {
      run("dropdb", ["--force", "--if-exists", rehearsalDatabase], { env: maintenance.env });
    }
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
  const originalExists = fs.existsSync(evidencePath);
  if (originalExists) {
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
    if (originalExists) fs.renameSync(evidencePath, failedRoot);
    try {
      fs.renameSync(extracted, evidencePath);
    } catch (error) {
      if (originalExists) fs.renameSync(failedRoot, evidencePath);
      throw error;
    }
  } finally {
    fs.rmSync(restoreRoot, { recursive: true, force: true });
  }
}

function restoreRecoveryPoint(envFile, backupDir) {
  const runtime = parseRuntimeEnv(readFileSync(envFile, "utf8"));
  if (!runtime.DATABASE_URL) fail("Candidate DATABASE_URL is missing");
  const authority = recoveryAuthority();
  if (authority === LOCAL_RECOVERY_AUTHORITY) assertPrivilegedRecoveryDirectory(backupDir, "backup");
  verifyChecksums(backupDir);
  const metadata = JSON.parse(fs.readFileSync(path.join(backupDir, "release.json"), "utf8"));
  const identity = resolveRestoreIdentity(runtime.DATABASE_URL, backupDir, metadata, authority);
  restoreOriginalDatabase(runtime.DATABASE_URL, identity.databaseName, backupDir, authority);
  try {
    setDatabaseConnectionLimit(runtime.DATABASE_URL, identity.databaseName, identity.connectionLimit, authority);
    validateRestoredDatabase(runtime.DATABASE_URL, identity.databaseName);
    assertRestoreSentinelAbsent(runtime.DATABASE_URL, identity.databaseName);
    setDatabaseConnectionLimit(runtime.DATABASE_URL, identity.databaseName, 0, authority);
    restoreEvidence(backupDir, metadata);
    setDatabaseConnectionLimit(runtime.DATABASE_URL, identity.databaseName, identity.connectionLimit, authority);
    markRestoreCompleted(backupDir, metadata, authority);
  } catch (error) {
    try {
      setDatabaseConnectionLimit(runtime.DATABASE_URL, identity.databaseName, 0, authority);
    } catch {
      // Keep the application stopped if the database could not be gated.
    }
    throw error;
  }
}

function cleanupPreflightDirectory(directory) {
  const resolved = path.resolve(directory || "");
  if (!/^\/root\/esg-deploy-preflight\/[0-9]+-[0-9]+\/restore-rehearsal$/.test(resolved)) {
    fail("Refusing to remove an invalid preflight directory");
  }
  if (!fs.existsSync(resolved)) return;
  if (fs.realpathSync(resolved) !== resolved) fail("Refusing to remove a symlinked preflight directory");
  fs.rmSync(resolved, { recursive: true, force: true });
  const parent = path.dirname(resolved);
  if (fs.readdirSync(parent).length === 0) fs.rmdirSync(parent);
}

function cleanupStalePreflightDirectories(root, currentRunInstance) {
  if (path.resolve(root || "") !== "/root/esg-deploy-preflight") {
    fail("Refusing to scan an invalid preflight root");
  }
  if (!/^[0-9]+-[0-9]+$/.test(String(currentRunInstance))) {
    fail("Current deployment run instance is invalid");
  }
  if (!fs.existsSync(root)) return;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.name === currentRunInstance || !/^[0-9]+-[0-9]+$/.test(entry.name)) continue;
    const runDirectory = path.join(root, entry.name);
    const stat = fs.lstatSync(runDirectory);
    if (!entry.isDirectory() || stat.isSymbolicLink() || stat.uid !== 0 || (stat.mode & 0o022) !== 0) {
      fail(`Refusing to clean unsafe stale preflight entry: ${entry.name}`);
    }
    const rehearsalDirectory = path.join(runDirectory, "restore-rehearsal");
    if (fs.existsSync(rehearsalDirectory)) cleanupPreflightDirectory(rehearsalDirectory);
  }
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
    cleanupPreflightDirectory(directory);
    console.log("Disposable restore rehearsal artifacts removed");
    return;
  }
  if (command === "cleanup-stale-preflight") {
    const [root, currentRunInstance] = args;
    cleanupStalePreflightDirectories(root, currentRunInstance);
    console.log("Stale disposable restore rehearsal artifacts removed");
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
  cleanupPreflightDirectory,
  cleanupStalePreflightDirectories,
  createRecoveryPoint,
  databaseConnection,
  databaseDescriptor,
  databaseIdentity,
  isLoopbackDatabaseAddress,
  isLoopbackDatabaseHost,
  rehearseDatabaseRestore,
  rehearseEvidenceRestore,
  restoreRecoveryPoint,
  verifyChecksums,
  walkEvidence,
};
