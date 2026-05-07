ALTER TABLE evidence_files
  ADD COLUMN IF NOT EXISTS metric_id varchar;

ALTER TABLE evidence_files
  ADD COLUMN IF NOT EXISTS tags text[];

CREATE INDEX IF NOT EXISTS idx_evidence_files_metric_id
  ON evidence_files(metric_id);

UPDATE evidence_files ef
SET metric_id = mv.metric_id
FROM metric_values mv
WHERE ef.metric_id IS NULL
  AND ef.linked_module = 'metric_value'
  AND ef.linked_entity_id = mv.id;
