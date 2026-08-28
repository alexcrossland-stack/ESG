import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { Client } from "pg";
import {
  METRIC_DEFINITION_CATALOGUE_LOCK_KEY,
  normalizeMetricDefinitionName,
  validateActiveMetricDefinitionCatalogue,
} from "../../server/admin-metric-definition-validation";
import { apiRequest, loginAndGetToken } from "../fixtures/seed.js";

const TEST_PASSWORD = "Test1234!";

type AdvisoryLockIdentity = {
  classid: string;
  objid: string;
  objsubid: number;
};

async function waitForAdvisoryWaiters(
  observer: Client,
  identity: AdvisoryLockIdentity,
  expected: number,
): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const result = await observer.query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM pg_locks
       WHERE locktype = 'advisory'
         AND classid::text = $1
         AND objid::text = $2
         AND objsubid = $3
         AND granted = false`,
      [identity.classid, identity.objid, identity.objsubid],
    );
    if (Number(result.rows[0]?.count ?? 0) >= expected) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for ${expected} metric-catalogue writers`);
}

async function run(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  assert.ok(databaseUrl, "DATABASE_URL is required");

  const suffix = `${process.pid}${Date.now()}`;
  const email = `metric-catalogue-concurrency-${suffix}@test-esg.example`;
  const username = `metriccatalogue${suffix}`;
  const sourceCode = `CONC_SOURCE_${suffix}`;
  const leftCode = `CONC_LEFT_${suffix}`;
  const rightCode = `CONC_RIGHT_${suffix}`;
  const duplicateNameCode = `CONC_DUP_NAME_${suffix}`;
  const aliasNameCode = `CONC_ALIAS_NAME_${suffix}`;
  const observer = new Client({ connectionString: databaseUrl });
  const blocker = new Client({ connectionString: databaseUrl });
  let advisoryLockHeld = false;
  let superAdminUserId: string | null = null;
  let seedTargetId: string | null = null;
  let seedTargetOriginalName: string | null = null;
  let mutationPromises: Array<Promise<{ status: number; body: string }>> = [];

  await observer.connect();
  await blocker.connect();
  try {
    const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);
    const insertedUser = await observer.query<{ id: string }>(
      `INSERT INTO users (
         username, email, password, role, company_id,
         terms_accepted_at, privacy_accepted_at,
         terms_version_accepted, privacy_version_accepted
       ) VALUES ($1, $2, $3, 'super_admin', NULL, NOW(), NOW(), '1.0', '1.0')
       RETURNING id`,
      [username, email, passwordHash],
    );
    superAdminUserId = insertedUser.rows[0]?.id ?? null;
    assert.ok(superAdminUserId);
    const token = await loginAndGetToken(email, TEST_PASSWORD);

    const definitions = await observer.query<{ id: string; code: string }>(
      `INSERT INTO metric_definitions (
         code, name, pillar, category, data_type,
         is_core, is_active, is_derived, formula_json
       ) VALUES
         ($1, 'Concurrency source', 'environmental', 'testing', 'numeric', false, true, false, NULL),
         ($2, 'Concurrency left', 'environmental', 'testing', 'numeric', false, true, true,
          jsonb_build_object('type', 'sum', 'inputs', jsonb_build_array($1::text))),
         ($3, 'Concurrency right', 'environmental', 'testing', 'numeric', false, true, true,
          jsonb_build_object('type', 'sum', 'inputs', jsonb_build_array($1::text)))
       RETURNING id, code`,
      [sourceCode, leftCode, rightCode],
    );
    const idByCode = new Map(definitions.rows.map((definition) => [definition.code, definition.id]));
    assert.ok(idByCode.get(leftCode));
    assert.ok(idByCode.get(rightCode));

    const duplicateCreate = await apiRequest("POST", "/api/admin/metric-definitions", {
      code: duplicateNameCode,
      name: "  CONCURRENCY   SOURCE  ",
      pillar: "environmental",
      category: "testing",
    }, token);
    assert.equal(duplicateCreate.status, 409, duplicateCreate.body);
    assert.equal(JSON.parse(duplicateCreate.body).code, "DUPLICATE_METRIC_DEFINITION_NAME");

    const duplicateUpdate = await apiRequest(
      "PATCH",
      `/api/admin/metric-definitions/${idByCode.get(leftCode)}`,
      { name: "Concurrency Source" },
      token,
    );
    assert.equal(duplicateUpdate.status, 409, duplicateUpdate.body);
    assert.equal(JSON.parse(duplicateUpdate.body).code, "DUPLICATE_METRIC_DEFINITION_NAME");

    const aliasTarget = await observer.query<{ id: string; code: string; name: string }>(
      `SELECT id, code, name
       FROM metric_definitions
       WHERE lower(trim(name)) IN ('natural gas consumption', 'gas / fuel consumption')
       LIMIT 1`,
    );
    assert.ok(aliasTarget.rows[0], "the reconciled SME catalogue must include the gas/fuel metric");
    seedTargetId = aliasTarget.rows[0].id;
    seedTargetOriginalName = aliasTarget.rows[0].name;

    const seededRename = await apiRequest(
      "PATCH",
      `/api/admin/metric-definitions/${seedTargetId}`,
      { name: `Displaced seed name ${suffix}` },
      token,
    );
    assert.equal(seededRename.status, 409, seededRename.body);
    assert.equal(JSON.parse(seededRename.body).code, "SEEDED_METRIC_DEFINITION_NAME_IMMUTABLE");

    // Simulate a catalogue left by a release that pre-dated name immutability.
    // The reserved seed name must remain unavailable even while its owner is
    // temporarily absent, and runtime reconciliation must restore the owner.
    await observer.query(
      "UPDATE metric_definitions SET name = $1 WHERE id = $2",
      [`Displaced seed name ${suffix}`, seedTargetId],
    );
    const aliasConflictName = seedTargetOriginalName.trim().toLowerCase() === "natural gas consumption"
      ? "Gas / Fuel Consumption"
      : "Natural Gas Consumption";
    const aliasDuplicateCreate = await apiRequest("POST", "/api/admin/metric-definitions", {
      code: aliasNameCode,
      name: aliasConflictName,
      pillar: "environmental",
      category: "testing",
    }, token);
    assert.equal(aliasDuplicateCreate.status, 409, aliasDuplicateCreate.body);
    assert.equal(JSON.parse(aliasDuplicateCreate.body).code, "DUPLICATE_METRIC_DEFINITION_NAME");

    await blocker.query(
      "SELECT pg_advisory_lock(hashtextextended($1, 0))",
      [METRIC_DEFINITION_CATALOGUE_LOCK_KEY],
    );
    advisoryLockHeld = true;
    const identityResult = await blocker.query<AdvisoryLockIdentity>(
      `SELECT classid::text AS classid, objid::text AS objid, objsubid
       FROM pg_locks
       WHERE pid = pg_backend_pid()
         AND locktype = 'advisory'
         AND granted = true
       LIMIT 1`,
    );
    const identity = identityResult.rows[0];
    assert.ok(identity, "the test must hold the catalogue advisory lock");

    let settledMutations = 0;
    mutationPromises = [
      apiRequest("PATCH", `/api/admin/metric-definitions/${idByCode.get(leftCode)}`, {
        formulaJson: { type: "sum", inputs: [rightCode] },
      }, token),
      apiRequest("PATCH", `/api/admin/metric-definitions/${idByCode.get(rightCode)}`, {
        formulaJson: { type: "sum", inputs: [leftCode] },
      }, token),
    ].map((promise) => promise.finally(() => { settledMutations++; }));

    await waitForAdvisoryWaiters(observer, identity, 2);
    assert.equal(
      settledMutations,
      0,
      "both admin mutations must wait on the shared catalogue lock before reading or writing",
    );

    await blocker.query(
      "SELECT pg_advisory_unlock(hashtextextended($1, 0)) AS unlocked",
      [METRIC_DEFINITION_CATALOGUE_LOCK_KEY],
    );
    advisoryLockHeld = false;

    const responses = await Promise.all(mutationPromises);
    const responseStatuses = responses.map((response) => response.status).sort((left, right) => left - right);
    assert.deepEqual(
      responseStatuses,
      [200, 400],
      `exactly one opposing formula mutation must be rejected: ${responses.map((response) => response.body).join(" | ")}`,
    );
    const rejected = responses.find((response) => response.status === 400);
    assert.equal(JSON.parse(rejected!.body).code, "INVALID_METRIC_DEFINITION_CATALOGUE");

    const finalDefinitions = await observer.query<{
      code: string;
      dataType: "numeric";
      isActive: boolean;
      isDerived: boolean;
      formulaJson: Record<string, unknown> | null;
    }>(
      `SELECT
         code,
         data_type AS "dataType",
         is_active AS "isActive",
         is_derived AS "isDerived",
         formula_json AS "formulaJson"
       FROM metric_definitions
       WHERE code = ANY($1::text[])`,
      [[sourceCode, leftCode, rightCode]],
    );
    assert.deepEqual(
      validateActiveMetricDefinitionCatalogue(finalDefinitions.rows),
      [],
      "concurrent admin writes must leave a valid active formula catalogue",
    );

    await blocker.query(
      "SELECT pg_advisory_lock(hashtextextended($1, 0))",
      [METRIC_DEFINITION_CATALOGUE_LOCK_KEY],
    );
    advisoryLockHeld = true;

    let settledSeedAndAdminWriters = 0;
    mutationPromises = [
      apiRequest("POST", "/api/metric-definitions/seed", {}, token),
      apiRequest("PATCH", `/api/admin/metric-definitions/${idByCode.get(sourceCode)}`, {
        description: "Updated while runtime seeding is queued",
      }, token),
    ].map((promise) => promise.finally(() => { settledSeedAndAdminWriters++; }));

    await waitForAdvisoryWaiters(observer, identity, 2);
    assert.equal(
      settledSeedAndAdminWriters,
      0,
      "runtime seeding and admin mutation must both wait on the same global catalogue lock",
    );

    await blocker.query(
      "SELECT pg_advisory_unlock(hashtextextended($1, 0)) AS unlocked",
      [METRIC_DEFINITION_CATALOGUE_LOCK_KEY],
    );
    advisoryLockHeld = false;

    const seedAndAdminResponses = await Promise.all(mutationPromises);
    assert.deepEqual(
      seedAndAdminResponses.map((response) => response.status),
      [200, 200],
      `runtime seed and admin mutation must serialize successfully: ${seedAndAdminResponses.map((response) => response.body).join(" | ")}`,
    );
    const runtimeSeedResult = JSON.parse(seedAndAdminResponses[0].body);
    assert.equal(typeof runtimeSeedResult.seeded, "number");

    const restoredSeedTarget = await observer.query<{ name: string }>(
      "SELECT name FROM metric_definitions WHERE id = $1",
      [seedTargetId],
    );
    assert.equal(restoredSeedTarget.rows[0]?.name, seedTargetOriginalName);
    const reconciledNames = await observer.query<{ code: string; name: string }>(
      "SELECT code, name FROM metric_definitions",
    );
    const normalizedNames = reconciledNames.rows.map((definition) => normalizeMetricDefinitionName(definition.name));
    assert.equal(
      new Set(normalizedNames).size,
      normalizedNames.length,
      "runtime reconciliation must leave no normalized or alias-equivalent duplicate metric names",
    );

    const updatedSource = await observer.query<{ description: string | null }>(
      "SELECT description FROM metric_definitions WHERE code = $1",
      [sourceCode],
    );
    assert.equal(
      updatedSource.rows[0]?.description,
      "Updated while runtime seeding is queued",
      "the serialized admin mutation must be committed after the shared-lock race",
    );

    console.log("admin metric-definition concurrency regression passed");
  } finally {
    if (advisoryLockHeld) {
      await blocker.query(
        "SELECT pg_advisory_unlock(hashtextextended($1, 0))",
        [METRIC_DEFINITION_CATALOGUE_LOCK_KEY],
      ).catch(() => {});
    }
    if (mutationPromises.length > 0) await Promise.allSettled(mutationPromises);
    if (seedTargetId && seedTargetOriginalName) {
      await observer.query(
        "UPDATE metric_definitions SET name = $1 WHERE id = $2",
        [seedTargetOriginalName, seedTargetId],
      ).catch(() => {});
    }
    await observer.query(
      "DELETE FROM metric_definitions WHERE code = ANY($1::text[])",
      [[sourceCode, leftCode, rightCode, duplicateNameCode, aliasNameCode]],
    ).catch(() => {});
    if (superAdminUserId) {
      await observer.query(
        "DELETE FROM super_admin_actions WHERE admin_user_id = $1",
        [superAdminUserId],
      ).catch(() => {});
    }
    await observer.query("DELETE FROM users WHERE email = $1", [email]).catch(() => {});
    await blocker.end();
    await observer.end();
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
