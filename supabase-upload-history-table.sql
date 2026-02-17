-- Run this SQL in your Supabase SQL Editor to create the upload history table

CREATE TABLE upload_history (
  id BIGSERIAL PRIMARY KEY,
  file_name TEXT NOT NULL,
  sheet_name TEXT NOT NULL,
  rows_uploaded INTEGER NOT NULL,
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  uploaded_by TEXT NOT NULL,
  arrival_date_min DATE,
  arrival_date_max DATE,
  booking_ids BIGINT[] NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE upload_history ENABLE ROW LEVEL SECURITY;

-- Create policies to allow authenticated users full access
CREATE POLICY "Allow authenticated users to read" ON upload_history
FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated users to insert" ON upload_history
FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Allow authenticated users to delete" ON upload_history
FOR DELETE TO authenticated USING (true);

-- Create index for faster queries
CREATE INDEX idx_upload_history_uploaded_at ON upload_history(uploaded_at DESC);
CREATE INDEX idx_upload_history_uploaded_by ON upload_history(uploaded_by);
