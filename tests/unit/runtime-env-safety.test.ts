import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const {
  assertStableDatabaseUrl,
  assertStableEncryptionKey,
  databaseIdentity,
  databaseTargetFingerprint,
  parseRuntimeEnv,
  serializeRuntimeEnv,
  validateRuntimeEnv,
} = require("../../scripts/deployment/runtime-env.cjs");

assert.equal(
  databaseTargetFingerprint("postgresql://first:secret@db.example.com:5432/simplyesg"),
  databaseTargetFingerprint("postgresql://second:different@db.example.com/simplyesg"),
  "database-target isolation must ignore credentials and identify the actual database resource",
);
assert.notEqual(
  databaseTargetFingerprint("postgresql://first:secret@db.example.com/simplyesg"),
  databaseTargetFingerprint("postgresql://first:secret@db.example.com/simplyesg_staging"),
);

const hostileValues = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://user:pa$$word@db.example.com:5432/simply_esg",
  SESSION_SECRET: "32-characters-with-$HOME-$(touch nope)-and-`id`-safe",
  MFA_ENCRYPTION_KEY: "quotes-'\"-slashes-\\-spaces and\nnewlines",
  APP_BASE_URL: "https://www.simplyesg.co.uk",
  CSRF_TRUSTED_ORIGINS: "https://www.simplyesg.co.uk",
  REPLIT_DOMAINS: "www.simplyesg.co.uk,simplyesg.co.uk",
  AI_INTEGRATIONS_OPENAI_API_KEY: "sk-$-`not-executed`-$(not-executed)",
  AI_INTEGRATIONS_OPENAI_BASE_URL: "https://api.openai.com/v1",
  AI_INTEGRATIONS_OPENAI_MODEL: "gpt-test value",
  RELEASE_SHA: "a".repeat(40),
};

const serialized = serializeRuntimeEnv(hostileValues);
const parsed = parseRuntimeEnv(serialized);
for (const [key, expected] of Object.entries(hostileValues)) {
  assert.equal(parsed[key], expected, `${key} did not survive a lossless dotenv round trip`);
}
assert.match(serialized, /must never be sourced by a shell/);
validateRuntimeEnv(parsed);

assert.equal(
  databaseIdentity("postgresql://user:first@DB.EXAMPLE.com/simply_esg?sslmode=require"),
  databaseIdentity("postgres://user:second@db.example.com:5432/simply_esg"),
  "password, protocol alias and connection options must not change database identity",
);
assert.throws(
  () => validateRuntimeEnv({ ...parsed, APP_BASE_URL: "http://www.simplyesg.co.uk" }),
  /HTTPS/,
);
assert.doesNotThrow(() => assertStableEncryptionKey("stable-key", "stable-key"));
assert.throws(
  () => assertStableEncryptionKey("old-key", "new-key"),
  /cannot rotate MFA_ENCRYPTION_KEY/,
);
assert.doesNotThrow(() => assertStableDatabaseUrl(
  "postgresql://app:stable@127.0.0.1/simplyesg",
  "postgresql://app:stable@127.0.0.1/simplyesg",
));
assert.throws(
  () => assertStableDatabaseUrl(
    "postgresql://app:old@127.0.0.1/simplyesg",
    "postgresql://app:new@127.0.0.1/simplyesg",
  ),
  /cannot rotate DATABASE_URL credentials/,
);

console.log("runtime environment safety tests passed");

const executionRoot = mkdtempSync(path.join(tmpdir(), "simplyesg-runtime-env-"));
const marker = path.join(executionRoot, "shell-expansion-must-not-run");
const envFile = path.join(executionRoot, "runtime.env");
const executionValue = `literal-$HOME-$$-\`backticks\`-$(touch ${marker})-quote-\"-slash-\\`;
writeFileSync(envFile, serializeRuntimeEnv({ ...hostileValues, SESSION_SECRET: executionValue }));
const cli = spawnSync(
  process.execPath,
  [
    path.resolve("scripts/deployment/runtime-env.cjs"),
    "exec",
    envFile,
    process.execPath,
    "-e",
    "if (process.env.SESSION_SECRET !== process.argv[1]) process.exit(42)",
    executionValue,
  ],
  { encoding: "utf8" },
);
assert.equal(cli.status, 0, cli.stderr || cli.stdout);
assert.equal(existsSync(marker), false, "dotenv content was unexpectedly evaluated by a shell");

const fingerprintCli = spawnSync(
  process.execPath,
  [path.resolve("scripts/deployment/runtime-env.cjs"), "database-target-fingerprint", envFile],
  { encoding: "utf8" },
);
assert.equal(fingerprintCli.status, 0, fingerprintCli.stderr || fingerprintCli.stdout);
assert.match(fingerprintCli.stdout.trim(), /^[0-9a-f]{64}$/);
assert.doesNotMatch(fingerprintCli.stdout, /postgres|password|db\.example/i);

console.log("runtime environment CLI round-trip tests passed");
