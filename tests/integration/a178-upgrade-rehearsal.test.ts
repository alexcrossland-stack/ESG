import assert from "node:assert/strict";
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import net from "node:net";
import pg from "pg";
import {
  assertCurrentEmissionFactorCatalogue,
  UK_2026_EMISSION_FACTORS,
} from "../../server/seed-emission-factors";
import {
  assertFrameworkCatalogue,
  FRAMEWORK_SEEDS,
  METRIC_MAPPINGS,
  REQUIREMENT_SEEDS,
} from "../../server/seed-frameworks";
import {
  assertMetricDefinitionFormulaCatalogue,
  assertMetricDefinitionCatalogue,
  REQUIRED_METRIC_DEFINITION_CODES,
  REQUIRED_SME_METRIC_NAMES,
} from "../../server/seed-metric-definitions";

const LEGACY_RELEASE_SHA = "a178ae2006be15edbf6e09eef46b0a4afa6a8f1b";
const LEGACY_MAPPING_COUNT = 72;
const DATABASE_URL = process.env.DATABASE_URL;
const resetConfirmation = process.env.UPGRADE_REHEARSAL_DB_NAME;
const cwd = process.cwd();

if (!DATABASE_URL) {
  throw new Error("DATABASE_URL is required for the disposable a178 upgrade rehearsal");
}

const parsedDatabaseUrl = new URL(DATABASE_URL);
const databaseName = decodeURIComponent(parsedDatabaseUrl.pathname.replace(/^\//, ""));
const loopbackHosts = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
if (!loopbackHosts.has(parsedDatabaseUrl.hostname)) {
  throw new Error(
    `Refusing to reset non-loopback PostgreSQL host ${parsedDatabaseUrl.hostname}; use a disposable local database`,
  );
}
if (!databaseName || resetConfirmation !== databaseName) {
  throw new Error(
    `Refusing to reset database ${databaseName || "<unknown>"}; set UPGRADE_REHEARSAL_DB_NAME to the exact disposable database name`,
  );
}

const { Client } = pg;

type BootResult = {
  output: string;
  status: number;
};

type CatalogueSnapshot = {
  actionRow: Record<string, unknown>;
  emissionFactors: Array<Record<string, unknown>>;
  protectedFormulaRows: Array<Record<string, unknown>>;
  valueCollisionRows: Array<Record<string, unknown>>;
  frameworkCount: number;
  requirementCount: number;
  mappingCount: number;
  metricDefinitionCount: number;
};

function run(command: string, args: string[], label: string): void {
  const result = spawnSync(command, args, {
    cwd,
    env: process.env,
    encoding: "utf8",
    stdio: "pipe",
  });
  if (result.status !== 0) {
    throw new Error(
      `${label} failed with status ${String(result.status)}\n${result.stdout || ""}\n${result.stderr || ""}`,
    );
  }
  const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
  if (output) console.log(output);
}

async function getFreePort(): Promise<number> {
  return await new Promise<number>((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      assert.ok(address && typeof address === "object");
      const { port } = address;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function stopChild(child: ChildProcessWithoutNullStreams): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise<void>((resolve) => child.once("exit", () => resolve())),
    delay(3_000).then(() => undefined),
  ]);
  if (child.exitCode === null && child.signalCode === null) {
    child.kill("SIGKILL");
    await new Promise<void>((resolve) => child.once("exit", () => resolve()));
  }
}

async function bootApplication(runNumber: number): Promise<BootResult> {
  const port = await getFreePort();
  const child = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
    cwd,
    env: {
      ...process.env,
      NODE_ENV: "development",
      REGRESSION_TEST: "1",
      PORT: String(port),
      BASE_URL: `http://127.0.0.1:${port}`,
      SESSION_SECRET: "a178-upgrade-rehearsal-session-secret-2026",
      MFA_ENCRYPTION_KEY: "a178-upgrade-rehearsal-mfa-key-2026",
      RELEASE_SHA: `a178-upgrade-rehearsal-${runNumber}`,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let output = "";
  const capture = (chunk: Buffer | string) => {
    output += chunk.toString();
    if (output.length > 2_000_000) output = output.slice(-2_000_000);
  };
  child.stdout.on("data", capture);
  child.stderr.on("data", capture);

  const deadline = Date.now() + 60_000;
  try {
    while (Date.now() < deadline) {
      if (child.exitCode !== null || child.signalCode !== null) {
        throw new Error(`startup ${runNumber} exited before readiness\n${output.slice(-20_000)}`);
      }
      try {
        const response = await fetch(`http://127.0.0.1:${port}/api/auth/me`, {
          signal: AbortSignal.timeout(1_000),
        });
        if (response.status === 401) {
          assert.doesNotMatch(output, /\[Startup\] FATAL:/);
          assert.match(output, new RegExp(`serving on port ${port}`));
          return { output, status: response.status };
        }
      } catch (error) {
        if ((error as Error).name !== "AbortError" && (error as Error).name !== "TimeoutError") {
          // Connection failures are expected until the listener starts.
        }
      }
      await delay(250);
    }
    throw new Error(`startup ${runNumber} timed out\n${output.slice(-20_000)}`);
  } finally {
    await stopChild(child);
  }
}

async function resetAndCreateCurrentSchema(): Promise<void> {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    await client.query("DROP SCHEMA public CASCADE");
    await client.query("CREATE SCHEMA public");
  } finally {
    await client.end();
  }
  run(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "db:push"], "current schema creation");
}

async function installA178Fixture(): Promise<void> {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    await client.query(`
      DROP TABLE IF EXISTS framework_requirement_responses;
      DROP TYPE IF EXISTS framework_response_source_type;
      DROP TABLE IF EXISTS super_admin_actions;
      CREATE TABLE super_admin_actions (
        id serial PRIMARY KEY,
        admin_user_id integer,
        action text NOT NULL,
        target_company_id integer,
        target_user_id integer,
        metadata jsonb,
        created_at timestamp DEFAULT now() NOT NULL
      );
      ALTER TABLE company_settings
        ALTER COLUMN emission_factor_set SET DEFAULT 'UK_DEFRA_2024';
      ALTER TABLE emission_factors
        ALTER COLUMN factor_year SET DEFAULT 2024;
      ALTER TABLE carbon_calculations
        ALTER COLUMN factor_year SET DEFAULT 2024;
      DROP INDEX IF EXISTS idx_emission_factors_country_year_name_unique;
      DELETE FROM metric_framework_mappings
      WHERE id NOT IN (
        SELECT id
        FROM metric_framework_mappings
        ORDER BY metric_definition_id, framework_requirement_id
        LIMIT ${LEGACY_MAPPING_COUNT - 1}
      );
      DROP INDEX IF EXISTS idx_mfm_unique;
      DROP INDEX IF EXISTS idx_mfm_metric_def;
      DROP INDEX IF EXISTS idx_mfm_req;
      TRUNCATE TABLE emission_factors;
    `);
    await client.query(
      `INSERT INTO super_admin_actions
        (admin_user_id, action, target_company_id, target_user_id, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::timestamp)`,
      [101, "legacy_a178_audit_action", 202, 303, JSON.stringify({ retained: true, source: LEGACY_RELEASE_SHA }), "2025-05-12 10:15:00"],
    );
    await client.query(
      `INSERT INTO emission_factors
        (id, name, category, country, unit, factor, source_label, factor_year, version, methodology)
       VALUES
        ('legacy-stale-grid', 'Grid Electricity', 'legacy', 'UK', 'legacy-unit', 999, 'Legacy source', 2026, 1, 'Legacy stale row'),
       ('legacy-2024-grid', 'Grid Electricity', 'electricity', 'UK', 'kgCO2e/kWh', 0.207074, 'UK Government 2024', 2024, 1, 'Legacy 2024 row')`,
    );
    await client.query(`
      INSERT INTO metric_definitions (
        id, code, name, pillar, category, description, data_type, unit,
        input_frequency, is_core, is_active, is_derived, formula_json,
        framework_tags, scoring_weight, sort_order, evidence_required, rollup_method
      )
      SELECT
        'a178-legacy-electricity', 'ENV_ELEC_KWH', name, pillar, category, description, data_type, unit,
        input_frequency, is_core, is_active, is_derived, formula_json,
        framework_tags, scoring_weight, sort_order, evidence_required, rollup_method
      FROM metric_definitions WHERE code = 'E001';

      INSERT INTO metric_definitions (
        id, code, name, pillar, category, description, data_type, unit,
        input_frequency, is_core, is_active, is_derived, formula_json,
        framework_tags, scoring_weight, sort_order, evidence_required, rollup_method
      )
      SELECT
        'a178-formula-co-source', 'ENV_ELEC_COREF', name, pillar, category, description, data_type, unit,
        input_frequency, is_core, is_active, is_derived, formula_json,
        framework_tags, scoring_weight, sort_order, evidence_required, rollup_method
      FROM metric_definitions WHERE code = 'E001';

      INSERT INTO metric_definitions (
        id, code, name, pillar, category, description, data_type, unit,
        input_frequency, is_core, is_active, is_derived, formula_json,
        framework_tags, scoring_weight, sort_order, evidence_required, rollup_method
      )
      SELECT
        'a178-value-collision-source', 'ENV_GAS_COLLISION', name, pillar, category, description, data_type, unit,
        input_frequency, false, is_active, false, NULL,
        framework_tags, scoring_weight, sort_order, evidence_required, rollup_method
      FROM metric_definitions WHERE code = 'E002';

      INSERT INTO metric_definitions (
        id, code, name, pillar, category, description, data_type, unit,
        input_frequency, is_core, is_active, is_derived, formula_json,
        framework_tags, scoring_weight, sort_order, evidence_required, rollup_method
      )
      SELECT
        'a178-reverse-self-target', 'ENV_VEHICLE_DERIVED_LEGACY', name, pillar, category, description, data_type, unit,
        input_frequency, false, true, true,
        '{"type":"sum","sources":["E003"]}'::jsonb,
        framework_tags, scoring_weight, sort_order, evidence_required, rollup_method
      FROM metric_definitions WHERE code = 'E003';

      INSERT INTO metric_definitions (
        id, code, name, pillar, category, description, data_type, unit,
        input_frequency, is_core, is_active, is_derived, formula_json,
        framework_tags, scoring_weight, sort_order, evidence_required, rollup_method
      )
      SELECT
        'a178-legacy-scope2', 'ENV_SCOPE2_TCO2E', name, pillar, category, description, data_type, unit,
        input_frequency, is_core, is_active, is_derived,
        '{"type":"custom","customFn":"scope2_emissions","inputs":["ENV_ELEC_KWH"]}'::jsonb,
        framework_tags, scoring_weight, sort_order, evidence_required, rollup_method
      FROM metric_definitions WHERE code = 'E005';

      INSERT INTO metric_definitions (
        id, code, name, pillar, category, description, data_type, unit,
        input_frequency, is_core, is_active, is_derived, formula_json,
        framework_tags, scoring_weight, sort_order, evidence_required, rollup_method
      ) VALUES (
        'a178-formula-owner', 'LEGACY_FORMULA_OWNER', 'Legacy Formula Preservation',
        'environmental', 'testing', 'Preserves formula references while duplicate definitions merge.',
        'numeric', 'test', 'annual', false, true, true,
        '{"type":"expression","sources":["ENV_ELEC_KWH","ENV_SCOPE2_TCO2E"],"expression":"ENV_ELEC_KWH + ENV_SCOPE2_TCO2E","description":"Legacy wording ENV_ELEC_KWH must remain unchanged"}'::jsonb,
        '{}', 1, 9999, false, 'sum'
      );

      INSERT INTO metric_definitions (
        id, code, name, pillar, category, description, data_type, unit,
        input_frequency, is_core, is_active, is_derived, formula_json,
        framework_tags, scoring_weight, sort_order, evidence_required, rollup_method
      ) VALUES (
        'a178-co-reference-owner', 'LEGACY_COREFERENCE_OWNER', 'Legacy Co-reference Preservation',
        'environmental', 'testing', 'Preserves two intentionally distinct formula inputs.',
        'numeric', 'test', 'annual', false, true, true,
        '{"type":"expression","sources":["E001","ENV_ELEC_COREF"],"expression":"E001 + ENV_ELEC_COREF"}'::jsonb,
        '{}', 1, 10000, false, 'sum'
      );

      INSERT INTO metric_definitions (
        id, code, name, pillar, category, description, data_type, unit,
        input_frequency, is_core, is_active, is_derived, formula_json,
        framework_tags, scoring_weight, sort_order, evidence_required, rollup_method
      ) VALUES (
        'a178-value-collision-owner', 'LEGACY_VALUE_COLLISION_OWNER', 'Legacy Value Collision Preservation',
        'environmental', 'testing', 'Keeps a formula-linked historical value identity intact.',
        'numeric', 'test', 'annual', false, true, true,
        '{"type":"sum","sources":["ENV_GAS_COLLISION"]}'::jsonb,
        '{}', 1, 10001, false, 'sum'
      );

      INSERT INTO metric_definitions (
        id, code, name, pillar, category, description, data_type, unit,
        input_frequency, is_core, is_active, is_derived, formula_json,
        framework_tags, scoring_weight, sort_order, evidence_required, rollup_method
      ) VALUES
      (
        'a178-self-target-owner', 'AAA_SELF_TARGET_OWNER', 'Self-target Formula Metric',
        'environmental', 'testing', 'Owns the stable formula identity.',
        'numeric', 'test', 'annual', true, true, true,
        '{"type":"sum","sources":["ZZZ_SELF_TARGET_SOURCE"]}'::jsonb,
        '{}', 1, 10002, false, 'sum'
      ),
      (
        'a178-self-target-source', 'ZZZ_SELF_TARGET_SOURCE', 'Self-target Formula Metric',
        'environmental', 'testing', 'Must remain a distinct source after reconciliation.',
        'numeric', 'test', 'annual', false, true, false, NULL,
        '{}', 1, 10003, false, 'sum'
      );

      INSERT INTO metrics (id, company_id, name, category, enabled)
      VALUES ('a178-legacy-company-metric', 'a178-legacy-company', 'Legacy electricity value', 'environmental', true);
      INSERT INTO metric_values (
        id, metric_id, period, value, metric_definition_id,
        reporting_period_start, reporting_period_end, value_numeric
      ) VALUES (
        'a178-legacy-metric-value', 'a178-legacy-company-metric', '2025', 101,
        'a178-legacy-electricity', '2025-01-01', '2025-12-31', 101
      );
      INSERT INTO metric_definition_values (
        id, business_id, metric_definition_id, reporting_period_start,
        reporting_period_end, value_numeric, source_type, status
      ) VALUES (
        'a178-legacy-definition-value', 'a178-legacy-company', 'a178-legacy-electricity',
        '2025-01-01', '2025-12-31', 101, 'manual', 'approved'
      );
      INSERT INTO metric_evidence (id, metric_value_id, file_name)
      VALUES ('a178-legacy-definition-evidence', 'a178-legacy-definition-value', 'legacy-definition-evidence.pdf');

      INSERT INTO metric_definition_values (
        id, business_id, metric_definition_id, reporting_period_start,
        reporting_period_end, value_numeric, source_type, status
      ) VALUES
      (
        'a178-canonical-collision-value', 'a178-legacy-company',
        (SELECT id FROM metric_definitions WHERE code = 'E002'),
        '2025-01-01', '2025-12-31', 111, 'manual', 'approved'
      ),
      (
        'a178-legacy-collision-value', 'a178-legacy-company',
        'a178-value-collision-source',
        '2025-01-01', '2025-12-31', 222, 'manual', 'approved'
      );
      INSERT INTO metric_calculation_runs (
        id, business_id, metric_definition_id, reporting_period_start,
        reporting_period_end, status
      ) VALUES (
        'a178-legacy-calculation-run', 'a178-legacy-company', 'a178-legacy-scope2',
        '2025-01-01', '2025-12-31', 'completed'
      );
      INSERT INTO esg_targets (
        id, company_id, title, pillar, linked_metric_definition_id, status
      ) VALUES (
        'a178-legacy-target', 'a178-legacy-company', 'Legacy definition target',
        'environmental', 'a178-legacy-scope2', 'in_progress'
      );

      INSERT INTO metric_framework_mappings (
        id, metric_definition_id, framework_requirement_id, mapping_strength, notes
      )
      SELECT
        'a178-legacy-framework-mapping', 'a178-legacy-electricity', id,
        'supporting', 'legacy duplicate mapping'
      FROM framework_requirements
      WHERE code = 'GRI-302-1';
    `);
    const mappingFixture = await client.query<{ mapping_count: string; duplicate_count: string }>(`
      SELECT COUNT(*)::text AS mapping_count,
             (
               SELECT COUNT(*)::text
               FROM (
                 SELECT metric_definition_id, framework_requirement_id
                 FROM metric_framework_mappings
                 GROUP BY metric_definition_id, framework_requirement_id
                 HAVING COUNT(*) > 1
               ) duplicates
             ) AS duplicate_count
      FROM metric_framework_mappings
    `);
    assert.deepEqual(mappingFixture.rows, [{
      mapping_count: String(LEGACY_MAPPING_COUNT),
      duplicate_count: "0",
    }]);
    const fixtureIndexes = await client.query<{ indexname: string }>(`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'metric_framework_mappings'
      ORDER BY indexname
    `);
    assert.deepEqual(fixtureIndexes.rows.map((row) => row.indexname), ["metric_framework_mappings_pkey"]);
  } finally {
    await client.end();
  }
}

async function validateUpgradedDatabase(): Promise<CatalogueSnapshot> {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    const identifierColumns = await client.query<{ column_name: string; data_type: string }>(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'super_admin_actions'
        AND column_name IN ('admin_user_id', 'target_company_id', 'target_user_id')
      ORDER BY column_name
    `);
    assert.equal(identifierColumns.rowCount, 3);
    assert.ok(identifierColumns.rows.every((row) => row.data_type === "character varying"));

    const actionResult = await client.query(`
      SELECT id,
             admin_user_id,
             action,
             target_company_id,
             target_user_id,
             metadata,
             ip_address,
             user_agent,
             to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS') AS created_at
      FROM super_admin_actions
      WHERE action = 'legacy_a178_audit_action'
    `);
    assert.equal(actionResult.rowCount, 1);
    assert.deepEqual(actionResult.rows[0], {
      id: 1,
      admin_user_id: "101",
      action: "legacy_a178_audit_action",
      target_company_id: "202",
      target_user_id: "303",
      metadata: { retained: true, source: LEGACY_RELEASE_SHA },
      ip_address: null,
      user_agent: null,
      created_at: "2025-05-12T10:15:00",
    });

    const defaultResult = await client.query<{ table_name: string; column_name: string; column_default: string }>(`
      SELECT table_name, column_name, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND (table_name, column_name) IN (
          ('company_settings', 'emission_factor_set'),
          ('emission_factors', 'factor_year'),
          ('carbon_calculations', 'factor_year')
        )
      ORDER BY table_name, column_name
    `);
    assert.equal(defaultResult.rowCount, 3);
    const defaults = new Map(defaultResult.rows.map((row) => [`${row.table_name}.${row.column_name}`, row.column_default]));
    assert.match(defaults.get("company_settings.emission_factor_set") ?? "", /UK_GOVERNMENT_2026/);
    assert.match(defaults.get("emission_factors.factor_year") ?? "", /2026/);
    assert.match(defaults.get("carbon_calculations.factor_year") ?? "", /2026/);

    const emissionResult = await client.query(`
      SELECT id,
             name,
             category,
             country,
             unit,
             factor::text AS factor,
             source_label AS "sourceLabel",
             factor_year AS "factorYear",
             version,
             fuel_type AS "fuelType",
             methodology
      FROM emission_factors
      WHERE country = 'UK' AND factor_year = 2026
      ORDER BY name
    `);
    assert.equal(emissionResult.rowCount, UK_2026_EMISSION_FACTORS.length);
    assert.doesNotThrow(() => assertCurrentEmissionFactorCatalogue(emissionResult.rows));
    assert.equal(
      emissionResult.rows.find((row) => row.name === "Grid Electricity")?.id,
      "legacy-stale-grid",
      "on-conflict reconciliation must preserve the existing legacy row identity",
    );
    const legacyFactor = await client.query(`
      SELECT id, factor_year FROM emission_factors WHERE id = 'legacy-2024-grid'
    `);
    assert.deepEqual(legacyFactor.rows, [{ id: "legacy-2024-grid", factor_year: 2024 }]);

    const uniqueIndex = await client.query<{ indexdef: string }>(`
      SELECT indexdef FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname = 'idx_emission_factors_country_year_name_unique'
    `);
    assert.equal(uniqueIndex.rowCount, 1);
    assert.match(uniqueIndex.rows[0].indexdef, /UNIQUE INDEX/);
    assert.match(uniqueIndex.rows[0].indexdef, /\(country, factor_year, name\)/);
    await assert.rejects(
      client.query(`
        INSERT INTO emission_factors (name, category, country, unit, factor, factor_year)
        VALUES ('Grid Electricity', 'duplicate-test', 'UK', 'test', 1, 2026)
      `),
      (error: unknown) => (error as { code?: string }).code === "23505",
      "the canonical emission-factor natural key must reject duplicates",
    );

    const responseColumns = await client.query<{ column_name: string }>(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'framework_requirement_responses'
    `);
    assert.equal(responseColumns.rowCount, 18);
    const responseIndexes = await client.query<{ indexname: string }>(`
      SELECT indexname FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'framework_requirement_responses'
    `);
    assert.equal(responseIndexes.rowCount, 6);

    const lockColumns = await client.query<{ column_name: string }>(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'data_entry_period_locks'
      ORDER BY column_name
    `);
    assert.deepEqual(
      lockColumns.rows.map((row) => row.column_name),
      ["company_id", "id", "locked_at", "locked_by", "period"],
    );
    const lockIndexes = await client.query<{ indexname: string; indexdef: string }>(`
      SELECT indexname, indexdef FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'data_entry_period_locks'
      ORDER BY indexname
    `);
    assert.deepEqual(
      lockIndexes.rows.map((row) => row.indexname),
      [
        "data_entry_period_locks_pkey",
        "idx_data_entry_period_locks_company_period",
        "idx_data_entry_period_locks_company_period_unique",
      ],
    );
    assert.match(
      lockIndexes.rows.find((row) => row.indexname === "idx_data_entry_period_locks_company_period_unique")?.indexdef ?? "",
      /UNIQUE INDEX/,
    );

    const [frameworkResult, requirementResult, metricResult, mappingResult, formulaCatalogueResult] = await Promise.all([
      client.query<{ id: string; code: string }>("SELECT id, code FROM frameworks ORDER BY code"),
      client.query<{ id: string; frameworkId: string; code: string }>(
        `SELECT id, framework_id AS "frameworkId", code FROM framework_requirements ORDER BY code`,
      ),
      client.query<{ id: string; code: string; name: string }>(
        "SELECT id, code, name FROM metric_definitions ORDER BY code",
      ),
      client.query<{
        metricDefinitionId: string;
        frameworkRequirementId: string;
        mappingStrength: string;
        notes: string | null;
      }>(`
        SELECT metric_definition_id AS "metricDefinitionId",
               framework_requirement_id AS "frameworkRequirementId",
               mapping_strength AS "mappingStrength",
               notes
        FROM metric_framework_mappings
        ORDER BY metric_definition_id, framework_requirement_id
      `),
      client.query<{
        code: string;
        dataType: "numeric" | "text" | "boolean" | "json";
        isActive: boolean;
        isDerived: boolean;
        formulaJson: unknown;
      }>(`
        SELECT code,
               data_type AS "dataType",
               is_active AS "isActive",
               is_derived AS "isDerived",
               formula_json AS "formulaJson"
        FROM metric_definitions
        ORDER BY code
      `),
    ]);
    assert.equal(frameworkResult.rowCount, FRAMEWORK_SEEDS.length);
    assert.equal(requirementResult.rowCount, REQUIREMENT_SEEDS.length);
    assert.equal(mappingResult.rowCount, METRIC_MAPPINGS.length);
    assert.ok(metricResult.rowCount >= REQUIRED_METRIC_DEFINITION_CODES.length);
    assert.ok(metricResult.rowCount >= REQUIRED_SME_METRIC_NAMES.length);
    assert.doesNotThrow(() => assertMetricDefinitionCatalogue(metricResult.rows));
    assert.doesNotThrow(() => assertMetricDefinitionFormulaCatalogue(formulaCatalogueResult.rows));
    assert.doesNotThrow(() => assertFrameworkCatalogue({
      frameworks: frameworkResult.rows,
      requirements: requirementResult.rows,
      metricDefinitions: metricResult.rows,
      mappings: mappingResult.rows,
    }));
    assert.equal(
      metricResult.rows.filter((metric) => ["ENV_ELEC_KWH", "ENV_SCOPE2_TCO2E"].includes(metric.code)).length,
      0,
      "legacy duplicate definitions must be merged into canonical seed-owned rows",
    );
    const [legacyValueReferences, formulaOwner, protectedFormulaRows, valueCollisionRows] = await Promise.all([
      client.query<{
        metricValueCode: string;
        definitionValueCode: string;
        calculationRunCode: string;
        targetCode: string;
        evidenceMetricValueId: string;
      }>(`
        SELECT
          (SELECT definition.code FROM metric_values value
             JOIN metric_definitions definition ON definition.id = value.metric_definition_id
            WHERE value.id = 'a178-legacy-metric-value') AS "metricValueCode",
          (SELECT definition.code FROM metric_definition_values value
             JOIN metric_definitions definition ON definition.id = value.metric_definition_id
            WHERE value.id = 'a178-legacy-definition-value') AS "definitionValueCode",
          (SELECT definition.code FROM metric_calculation_runs run
             JOIN metric_definitions definition ON definition.id = run.metric_definition_id
            WHERE run.id = 'a178-legacy-calculation-run') AS "calculationRunCode",
          (SELECT definition.code FROM esg_targets target
             JOIN metric_definitions definition ON definition.id = target.linked_metric_definition_id
            WHERE target.id = 'a178-legacy-target') AS "targetCode",
          (SELECT metric_value_id FROM metric_evidence
            WHERE id = 'a178-legacy-definition-evidence') AS "evidenceMetricValueId"
      `),
      client.query<{ formula_json: { sources: string[]; expression: string; description: string } }>(
        "SELECT formula_json FROM metric_definitions WHERE code = 'LEGACY_FORMULA_OWNER'",
      ),
      client.query<{ code: string; name: string; isActive: boolean; formulaJson: unknown }>(`
        SELECT code,
               name,
               is_active AS "isActive",
               formula_json AS "formulaJson"
        FROM metric_definitions
        WHERE code IN (
          'AAA_SELF_TARGET_OWNER',
          'ENV_ELEC_COREF',
          'ENV_GAS_COLLISION',
          'ENV_VEHICLE_DERIVED_LEGACY',
          'LEGACY_COREFERENCE_OWNER',
          'LEGACY_VALUE_COLLISION_OWNER',
          'ZZZ_SELF_TARGET_SOURCE'
        )
        ORDER BY code
      `),
      client.query<{ id: string; code: string; value: string }>(`
        SELECT value.id,
               definition.code,
               value.value_numeric::text AS value
        FROM metric_definition_values AS value
        JOIN metric_definitions AS definition ON definition.id = value.metric_definition_id
        WHERE value.id IN ('a178-canonical-collision-value', 'a178-legacy-collision-value')
        ORDER BY value.id
      `),
    ]);
    assert.deepEqual(legacyValueReferences.rows, [{
      metricValueCode: "E001",
      definitionValueCode: "E001",
      calculationRunCode: "E005",
      targetCode: "E005",
      evidenceMetricValueId: "a178-legacy-definition-value",
    }]);
    assert.deepEqual(formulaOwner.rows[0]?.formula_json, {
      type: "expression",
      sources: ["E001", "E005"],
      expression: "E001 + E005",
      description: "Legacy wording ENV_ELEC_KWH must remain unchanged",
    });
    assert.deepEqual(protectedFormulaRows.rows, [
      {
        code: "AAA_SELF_TARGET_OWNER",
        name: "Self-target Formula Metric",
        isActive: true,
        formulaJson: { type: "sum", sources: ["ZZZ_SELF_TARGET_SOURCE"] },
      },
      {
        code: "ENV_ELEC_COREF",
        name: "Electricity Consumption (Legacy formula source ENV_ELEC_COREF)",
        isActive: true,
        formulaJson: null,
      },
      {
        code: "ENV_GAS_COLLISION",
        name: "Natural Gas Consumption (Legacy formula source ENV_GAS_COLLISION)",
        isActive: true,
        formulaJson: null,
      },
      {
        code: "ENV_VEHICLE_DERIVED_LEGACY",
        name: "Vehicle Fuel Consumption (Legacy formula source ENV_VEHICLE_DERIVED_LEGACY)",
        isActive: true,
        formulaJson: { type: "sum", sources: ["E003"] },
      },
      {
        code: "LEGACY_COREFERENCE_OWNER",
        name: "Legacy Co-reference Preservation",
        isActive: true,
        formulaJson: {
          type: "expression",
          sources: ["E001", "ENV_ELEC_COREF"],
          expression: "E001 + ENV_ELEC_COREF",
        },
      },
      {
        code: "LEGACY_VALUE_COLLISION_OWNER",
        name: "Legacy Value Collision Preservation",
        isActive: true,
        formulaJson: { type: "sum", sources: ["ENV_GAS_COLLISION"] },
      },
      {
        code: "ZZZ_SELF_TARGET_SOURCE",
        name: "Self-target Formula Metric (Legacy formula source ZZZ_SELF_TARGET_SOURCE)",
        isActive: true,
        formulaJson: null,
      },
    ]);
    assert.deepEqual(valueCollisionRows.rows, [
      { id: "a178-canonical-collision-value", code: "E002", value: "111.000000" },
      { id: "a178-legacy-collision-value", code: "ENV_GAS_COLLISION", value: "222.000000" },
    ]);
    const mappingIndexes = await client.query<{ indexname: string; indexdef: string }>(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'metric_framework_mappings'
      ORDER BY indexname
    `);
    assert.deepEqual(
      mappingIndexes.rows.map((row) => row.indexname),
      ["idx_mfm_metric_def", "idx_mfm_req", "idx_mfm_unique", "metric_framework_mappings_pkey"],
    );
    const mappingConflictIndex = mappingIndexes.rows.find((row) => row.indexname === "idx_mfm_unique")?.indexdef ?? "";
    assert.match(mappingConflictIndex, /UNIQUE INDEX/);
    assert.match(mappingConflictIndex, /\(metric_definition_id, framework_requirement_id\)/);
    await assert.rejects(
      client.query(`
        INSERT INTO metric_framework_mappings
          (metric_definition_id, framework_requirement_id, mapping_strength, notes)
        SELECT metric_definition_id, framework_requirement_id, mapping_strength, notes
        FROM metric_framework_mappings
        ORDER BY metric_definition_id, framework_requirement_id
        LIMIT 1
      `),
      (error: unknown) => (error as { code?: string }).code === "23505",
      "the framework-mapping natural key must reject duplicates",
    );

    return {
      actionRow: actionResult.rows[0],
      emissionFactors: emissionResult.rows,
      protectedFormulaRows: protectedFormulaRows.rows,
      valueCollisionRows: valueCollisionRows.rows,
      frameworkCount: frameworkResult.rowCount ?? 0,
      requirementCount: requirementResult.rowCount ?? 0,
      mappingCount: mappingResult.rowCount ?? 0,
      metricDefinitionCount: metricResult.rowCount ?? 0,
    };
  } finally {
    await client.end();
  }
}

console.log(`Disposable PostgreSQL upgrade rehearsal: ${LEGACY_RELEASE_SHA} -> current candidate`);
console.log(`Target: ${parsedDatabaseUrl.hostname}:${parsedDatabaseUrl.port || "5432"}/${databaseName}`);

await resetAndCreateCurrentSchema();
const fixtureSeedBoot = await bootApplication(0);
assert.equal(fixtureSeedBoot.status, 401);
await installA178Fixture();

const firstBoot = await bootApplication(1);
assert.equal(firstBoot.status, 401);
assert.match(firstBoot.output, /Framework requirement response schema migration applied and validated/);
assert.match(firstBoot.output, /2026 emission factor defaults reconciled/);
assert.match(firstBoot.output, /canonical factors reconciled and validated/);
const firstSnapshot = await validateUpgradedDatabase();

const secondBoot = await bootApplication(2);
assert.equal(secondBoot.status, 401);
assert.doesNotMatch(secondBoot.output, /\[Startup\] FATAL:/);
const secondSnapshot = await validateUpgradedDatabase();

assert.deepEqual(secondSnapshot, firstSnapshot, "a second startup must not duplicate or mutate reconciled catalogue data");

console.log(
  `a178 upgrade rehearsal passed: preserved audit row; `
  + `${firstSnapshot.emissionFactors.length} current emission factors; `
  + `${firstSnapshot.metricDefinitionCount} metric definitions; `
  + `${firstSnapshot.frameworkCount} frameworks; `
  + `${firstSnapshot.requirementCount} requirements; `
  + `${firstSnapshot.mappingCount} mappings; two clean boots`,
);
