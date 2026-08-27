-- Keep upgraded databases aligned with the 2026 defaults in shared/schema.ts.
-- Re-running these ALTER DEFAULT statements is safe and does not rewrite
-- explicit historical company factor-set selections or calculation rows.

ALTER TABLE company_settings
  ALTER COLUMN emission_factor_set SET DEFAULT 'UK_GOVERNMENT_2026';

ALTER TABLE emission_factors
  ALTER COLUMN factor_year SET DEFAULT 2026;

ALTER TABLE carbon_calculations
  ALTER COLUMN factor_year SET DEFAULT 2026;
