import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const {
  databaseConnection,
  databaseDescriptor,
  cleanupPreflightDirectory,
  cleanupStalePreflightDirectories,
  isLoopbackDatabaseAddress,
  isLoopbackDatabaseHost,
  walkEvidence,
} = require("../../scripts/deployment/recovery-point.cjs");

const root = mkdtempSync(path.join(tmpdir(), "simplyesg-recovery-contract-"));
const evidence = path.join(root, "evidence");
mkdirSync(path.join(evidence, "company-a", "record-a"), { recursive: true });
writeFileSync(path.join(evidence, "company-a", "record-a", "invoice.pdf"), "trusted evidence bytes");

const manifest = walkEvidence(evidence);
assert.equal(manifest.files, 1);
assert.equal(manifest.bytes, Buffer.byteLength("trusted evidence bytes"));
assert.deepEqual(manifest.entries.map((entry: { path: string }) => entry.path), [
  "company-a/",
  "company-a/record-a/",
  "company-a/record-a/invoice.pdf",
]);

symlinkSync("/tmp", path.join(evidence, "unsupported-link"));
assert.throws(() => walkEvidence(evidence), /unsupported symlink/);

const connection = databaseConnection("postgresql://user:p%40ss@db.example.com:5433/esg?sslmode=require");
assert.equal(connection.database, "esg");
assert.equal(connection.env.PGHOST, "db.example.com");
assert.equal(connection.env.PGPORT, "5433");
assert.equal(connection.env.PGPASSWORD, "p@ss");
assert.equal(connection.env.PGSSLMODE, "require");

assert.deepEqual(databaseDescriptor("postgresql://app-role:secret@127.0.0.1:5432/simply_esg"), {
  database: "simply_esg",
  host: "127.0.0.1",
  port: "5432",
  username: "app-role",
});
assert.equal(isLoopbackDatabaseHost("127.0.0.1"), true);
assert.equal(isLoopbackDatabaseHost("localhost"), true);
assert.equal(isLoopbackDatabaseHost("::1"), true);
assert.equal(isLoopbackDatabaseHost("db.example.com"), false);
assert.equal(isLoopbackDatabaseAddress("127.0.0.1"), true);
assert.equal(isLoopbackDatabaseAddress("127.0.0.1/32"), true);
assert.equal(isLoopbackDatabaseAddress("127.250.1.9"), true);
assert.equal(isLoopbackDatabaseAddress("::1"), true);
assert.equal(isLoopbackDatabaseAddress("::1/128"), true);
assert.equal(isLoopbackDatabaseAddress("::ffff:127.0.0.1"), true);
assert.equal(isLoopbackDatabaseAddress("10.0.0.1"), false);
assert.equal(isLoopbackDatabaseAddress("127.999.0.1"), false);
assert.throws(
  () => databaseDescriptor("postgresql://app:secret@localhost:99999/esg"),
  /valid PostgreSQL URL|invalid PostgreSQL port/,
);
assert.throws(() => cleanupPreflightDirectory("/tmp/not-a-production-preflight"), /invalid preflight directory/);
assert.throws(() => cleanupStalePreflightDirectories("/tmp", "123-1"), /invalid preflight root/);
assert.throws(
  () => cleanupStalePreflightDirectories("/root/esg-deploy-preflight", "not-a-run"),
  /run instance is invalid/,
);

console.log("recovery point contract tests passed");
