-- Run this in the Supabase SQL Editor to add "reverted/cancelled" tracking to edit_history.
-- After running, undone edits will show who reverted and when; the Undo button is hidden for them.

ALTER TABLE edit_history
  ADD COLUMN IF NOT EXISTS undone_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS undone_by TEXT;

COMMENT ON COLUMN edit_history.undone_at IS 'When this edit was reverted (undo).';
COMMENT ON COLUMN edit_history.undone_by IS 'Email of user who reverted this edit.';

-- Allow authenticated users to update edit_history (so we can set undone_at/undone_by on undo)
CREATE POLICY "Allow authenticated users to update edit_history"
  ON edit_history FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
