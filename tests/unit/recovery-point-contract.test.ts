import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const { databaseConnection, walkEvidence } = require("../../scripts/deployment/recovery-point.cjs");

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

console.log("recovery point contract tests passed");
