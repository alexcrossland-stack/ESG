export type StartupMigrationExecutor = (statement: string) => Promise<unknown>;

export const FRAMEWORK_REQUIREMENT_RESPONSE_MIGRATIONS = [
  `DO $$
   BEGIN
     CREATE TYPE framework_response_source_type AS ENUM ('policy', 'target', 'risk');
   EXCEPTION
     WHEN duplicate_object THEN NULL;
   END $$`,
  `ALTER TYPE framework_response_source_type ADD VALUE IF NOT EXISTS 'policy'`,
  `ALTER TYPE framework_response_source_type ADD VALUE IF NOT EXISTS 'target'`,
  `ALTER TYPE framework_response_source_type ADD VALUE IF NOT EXISTS 'risk'`,
  `CREATE TABLE IF NOT EXISTS framework_requirement_responses (
     id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
     company_id varchar NOT NULL,
     framework_requirement_id varchar NOT NULL,
     period text NOT NULL,
     site_id varchar,
     response_text text,
     linked_entity_type framework_response_source_type,
     linked_entity_id varchar,
     workflow_status workflow_status NOT NULL DEFAULT 'draft',
     created_by_user_id varchar,
     updated_by_user_id varchar,
     submitted_by_user_id varchar,
     submitted_at timestamp,
     reviewed_by_user_id varchar,
     reviewed_at timestamp,
     review_comment text,
     created_at timestamp DEFAULT now(),
     updated_at timestamp DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS idx_frr_company
     ON framework_requirement_responses (company_id)`,
  `CREATE INDEX IF NOT EXISTS idx_frr_requirement
     ON framework_requirement_responses (framework_requirement_id)`,
  `CREATE INDEX IF NOT EXISTS idx_frr_linked_entity
     ON framework_requirement_responses (company_id, linked_entity_type, linked_entity_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_frr_company_requirement_period_org_unique
     ON framework_requirement_responses (company_id, framework_requirement_id, period)
     WHERE site_id IS NULL`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_frr_company_requirement_period_site_unique
     ON framework_requirement_responses (company_id, framework_requirement_id, period, site_id)
     WHERE site_id IS NOT NULL`,
] as const;

export const REQUIRED_FRAMEWORK_REQUIREMENT_RESPONSE_COLUMNS = [
  "id",
  "company_id",
  "framework_requirement_id",
  "period",
  "site_id",
  "response_text",
  "linked_entity_type",
  "linked_entity_id",
  "workflow_status",
  "created_by_user_id",
  "updated_by_user_id",
  "submitted_by_user_id",
  "submitted_at",
  "reviewed_by_user_id",
  "reviewed_at",
  "review_comment",
  "created_at",
  "updated_at",
] as const;

export const REQUIRED_FRAMEWORK_REQUIREMENT_RESPONSE_INDEXES = [
  "framework_requirement_responses_pkey",
  "idx_frr_company",
  "idx_frr_requirement",
  "idx_frr_linked_entity",
  "idx_frr_company_requirement_period_org_unique",
  "idx_frr_company_requirement_period_site_unique",
] as const;

export const CURRENT_EMISSION_FACTOR_DEFAULT_MIGRATIONS = [
  `ALTER TABLE company_settings
     ALTER COLUMN emission_factor_set SET DEFAULT 'UK_GOVERNMENT_2026'`,
  `ALTER TABLE emission_factors
     ALTER COLUMN factor_year SET DEFAULT 2026`,
  `ALTER TABLE carbon_calculations
     ALTER COLUMN factor_year SET DEFAULT 2026`,
] as const;

export const REQUIRED_SUPER_ADMIN_ACTION_IDENTIFIER_COLUMNS = [
  "admin_user_id",
  "target_company_id",
  "target_user_id",
] as const;

export function invalidSuperAdminActionIdentifierColumns(
  rows: Array<{ column_name?: unknown; data_type?: unknown }>,
): string[] {
  const actualTypes = new Map(
    rows
      .filter((row): row is { column_name: string; data_type: string } =>
        typeof row.column_name === "string" && typeof row.data_type === "string",
      )
      .map((row) => [row.column_name, row.data_type]),
  );
  return REQUIRED_SUPER_ADMIN_ACTION_IDENTIFIER_COLUMNS.filter(
    (column) => actualTypes.get(column) !== "character varying",
  );
}

export async function runStartupMigrationStatements(
  execute: StartupMigrationExecutor,
  statements: readonly string[],
): Promise<void> {
  for (const statement of statements) {
    await execute(statement);
  }
}

export function missingFrameworkRequirementResponseColumns(
  rows: Array<{ column_name?: unknown }>,
): string[] {
  const present = new Set(
    rows
      .map((row) => row.column_name)
      .filter((column): column is string => typeof column === "string"),
  );
  return REQUIRED_FRAMEWORK_REQUIREMENT_RESPONSE_COLUMNS.filter((column) => !present.has(column));
}

export function missingFrameworkRequirementResponseIndexes(
  rows: Array<{ indexname?: unknown }>,
): string[] {
  const present = new Set(
    rows
      .map((row) => row.indexname)
      .filter((indexName): indexName is string => typeof indexName === "string"),
  );
  return REQUIRED_FRAMEWORK_REQUIREMENT_RESPONSE_INDEXES.filter((indexName) => !present.has(indexName));
}
