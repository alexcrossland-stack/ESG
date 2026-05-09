-- Site-scoped data entry and evidence/report query indexes.
-- These are additive and safe for existing nullable site_id data.

CREATE INDEX IF NOT EXISTS idx_metric_values_metric_site
  ON metric_values (metric_id, site_id);

CREATE INDEX IF NOT EXISTS idx_metric_values_metric_reporting_period_site
  ON metric_values (metric_id, reporting_period_id, site_id);

CREATE INDEX IF NOT EXISTS idx_raw_data_company_reporting_period_site
  ON raw_data_inputs (company_id, reporting_period_id, site_id);

CREATE INDEX IF NOT EXISTS idx_raw_data_company_period_site
  ON raw_data_inputs (company_id, period, site_id);

CREATE INDEX IF NOT EXISTS idx_evidence_files_company_site_period
  ON evidence_files (company_id, site_id, linked_period);

CREATE INDEX IF NOT EXISTS idx_evidence_files_linked_entity_site
  ON evidence_files (linked_module, linked_entity_id, site_id);

CREATE INDEX IF NOT EXISTS idx_report_runs_company_site_generated
  ON report_runs (company_id, site_id, generated_at);
