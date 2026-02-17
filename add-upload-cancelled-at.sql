-- Soft-delete support: keep deleted uploads in history, show as cancelled
-- Run in Supabase SQL Editor

ALTER TABLE upload_history
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN upload_history.cancelled_at IS 'When the upload was cancelled (soft-deleted). NULL = active.';

-- Allow authenticated users to update (for setting cancelled_at)
CREATE POLICY "Allow authenticated users to update" ON upload_history
FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
