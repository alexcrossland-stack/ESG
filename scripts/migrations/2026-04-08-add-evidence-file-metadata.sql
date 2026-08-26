ALTER TABLE evidence_files
  ADD COLUMN IF NOT EXISTS mime_type text;

ALTER TABLE evidence_files
  ADD COLUMN IF NOT EXISTS file_size integer;

ALTER TABLE evidence_files
  ADD COLUMN IF NOT EXISTS storage_path text;
