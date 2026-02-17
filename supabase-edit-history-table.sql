-- Run this SQL in your Supabase SQL Editor to create the edit history table.
-- This table stores manual edits on editable (green) columns only; Excel uploads are not logged here.

CREATE TABLE edit_history (
  id BIGSERIAL PRIMARY KEY,
  table_name TEXT NOT NULL,
  row_id BIGINT NOT NULL,
  column_name TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  edited_by TEXT NOT NULL,
  edited_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  row_display TEXT,
  undone_at TIMESTAMP WITH TIME ZONE,
  undone_by TEXT
);

COMMENT ON TABLE edit_history IS 'History of user edits on editable (green) reconciliation columns; excludes Excel uploads.';

-- Enable Row Level Security
ALTER TABLE edit_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated users to read edit_history"
  ON edit_history FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated users to insert edit_history"
  ON edit_history FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update edit_history"
  ON edit_history FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Indexes for the History of Edits page
CREATE INDEX idx_edit_history_edited_at ON edit_history(edited_at DESC);
CREATE INDEX idx_edit_history_edited_by ON edit_history(edited_by);
CREATE INDEX idx_edit_history_table_row ON edit_history(table_name, row_id);
CREATE INDEX idx_edit_history_column_name ON edit_history(column_name);
