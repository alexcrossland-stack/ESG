-- Company-scoped workflow records for narrative, policy, target and risk
-- framework requirements. Safe to run repeatedly.

DO $$
BEGIN
  CREATE TYPE framework_response_source_type AS ENUM ('policy', 'target', 'risk');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TYPE framework_response_source_type ADD VALUE IF NOT EXISTS 'policy';
ALTER TYPE framework_response_source_type ADD VALUE IF NOT EXISTS 'target';
ALTER TYPE framework_response_source_type ADD VALUE IF NOT EXISTS 'risk';

CREATE TABLE IF NOT EXISTS framework_requirement_responses (
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
);

CREATE INDEX IF NOT EXISTS idx_frr_company
  ON framework_requirement_responses (company_id);

CREATE INDEX IF NOT EXISTS idx_frr_requirement
  ON framework_requirement_responses (framework_requirement_id);

CREATE INDEX IF NOT EXISTS idx_frr_linked_entity
  ON framework_requirement_responses (company_id, linked_entity_type, linked_entity_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_frr_company_requirement_period_org_unique
  ON framework_requirement_responses (company_id, framework_requirement_id, period)
  WHERE site_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_frr_company_requirement_period_site_unique
  ON framework_requirement_responses (company_id, framework_requirement_id, period, site_id)
  WHERE site_id IS NOT NULL;
