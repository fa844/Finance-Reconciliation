-- Store the path of the uploaded Excel file in Supabase Storage so it can be downloaded from Upload History.
-- Run this in the Supabase SQL Editor.

ALTER TABLE upload_history
  ADD COLUMN IF NOT EXISTS file_storage_path TEXT;

COMMENT ON COLUMN upload_history.file_storage_path IS 'Path in Storage bucket upload-files, e.g. {upload_id}/{filename}.xlsx';
