import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  CURRENT_EMISSION_FACTOR_DEFAULT_MIGRATIONS,
  FRAMEWORK_REQUIREMENT_RESPONSE_MIGRATIONS,
  REQUIRED_FRAMEWORK_REQUIREMENT_RESPONSE_COLUMNS,
  REQUIRED_FRAMEWORK_REQUIREMENT_RESPONSE_INDEXES,
  invalidSuperAdminActionIdentifierColumns,
  missingFrameworkRequirementResponseColumns,
  missingFrameworkRequirementResponseIndexes,
  runStartupMigrationStatements,
} from "../../server/startup-schema-migrations";

assert.deepEqual(
  invalidSuperAdminActionIdentifierColumns([
    { column_name: "admin_user_id", data_type: "character varying" },
    { column_name: "target_company_id", data_type: "character varying" },
    { column_name: "target_user_id", data_type: "character varying" },
  ]),
  [],
);
assert.deepEqual(
  invalidSuperAdminActionIdentifierColumns([
    { column_name: "admin_user_id", data_type: "integer" },
    { column_name: "target_company_id", data_type: "character varying" },
  ]),
  ["admin_user_id", "target_user_id"],
);

const allColumns = REQUIRED_FRAMEWORK_REQUIREMENT_RESPONSE_COLUMNS.map((column_name) => ({ column_name }));
assert.deepEqual(missingFrameworkRequirementResponseColumns(allColumns), []);
assert.deepEqual(
  missingFrameworkRequirementResponseColumns(allColumns.filter((row) => row.column_name !== "workflow_status")),
  ["workflow_status"],
);
const allIndexes = REQUIRED_FRAMEWORK_REQUIREMENT_RESPONSE_INDEXES.map((indexname) => ({ indexname }));
assert.deepEqual(missingFrameworkRequirementResponseIndexes(allIndexes), []);
assert.deepEqual(
  missingFrameworkRequirementResponseIndexes(
    allIndexes.filter((row) => row.indexname !== "idx_frr_company_requirement_period_site_unique"),
  ),
  ["idx_frr_company_requirement_period_site_unique"],
);

const frameworkSql = FRAMEWORK_REQUIREMENT_RESPONSE_MIGRATIONS.join("\n");
assert.match(frameworkSql, /CREATE TYPE framework_response_source_type/);
assert.match(frameworkSql, /ALTER TYPE framework_response_source_type ADD VALUE IF NOT EXISTS 'risk'/);
assert.match(frameworkSql, /CREATE TABLE IF NOT EXISTS framework_requirement_responses/);
assert.match(frameworkSql, /workflow_status workflow_status NOT NULL DEFAULT 'draft'/);
assert.match(frameworkSql, /idx_frr_company_requirement_period_org_unique/);
assert.match(frameworkSql, /idx_frr_company_requirement_period_site_unique/);

const executed: string[] = [];
await runStartupMigrationStatements(async (statement) => {
  executed.push(statement);
}, FRAMEWORK_REQUIREMENT_RESPONSE_MIGRATIONS);
assert.deepEqual(executed, [...FRAMEWORK_REQUIREMENT_RESPONSE_MIGRATIONS]);

const expectedFailure = new Error("database rejected migration");
await assert.rejects(
  runStartupMigrationStatements(async (_statement) => {
    throw expectedFailure;
  }, FRAMEWORK_REQUIREMENT_RESPONSE_MIGRATIONS),
  expectedFailure,
);

const carbonSql = CURRENT_EMISSION_FACTOR_DEFAULT_MIGRATIONS.join("\n");
assert.match(carbonSql, /company_settings[\s\S]*emission_factor_set SET DEFAULT 'UK_GOVERNMENT_2026'/);
assert.match(carbonSql, /emission_factors[\s\S]*factor_year SET DEFAULT 2026/);
assert.match(carbonSql, /carbon_calculations[\s\S]*factor_year SET DEFAULT 2026/);

const migrationFile = await readFile(
  new URL("../../scripts/migrations/2026-08-27-reconcile-2026-emission-factor-defaults.sql", import.meta.url),
  "utf8",
);
assert.match(migrationFile, /company_settings[\s\S]*emission_factor_set SET DEFAULT 'UK_GOVERNMENT_2026'/);
assert.match(migrationFile, /emission_factors[\s\S]*factor_year SET DEFAULT 2026/);
assert.match(migrationFile, /carbon_calculations[\s\S]*factor_year SET DEFAULT 2026/);
assert.doesNotMatch(migrationFile, /UPDATE\s+company_settings/i);

console.log("startup schema migration contract tests passed");
