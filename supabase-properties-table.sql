-- Run this SQL in your Supabase SQL Editor to create the properties table.
-- Matches sheet range B2:M1867 (12 columns B–M). After running, import your sheet data:
-- 1. In Supabase: Table Editor → properties → Insert → Import from CSV (or paste rows).
-- 2. Export your Google Sheet as CSV (File → Download → CSV), then map columns B–M to col_b–col_m.

CREATE TABLE properties (
  id BIGSERIAL PRIMARY KEY,
  col_b TEXT,
  col_c TEXT,
  col_d TEXT,
  col_e TEXT,
  col_f TEXT,
  col_g TEXT,
  col_h TEXT,
  col_i TEXT,
  col_j TEXT,
  col_k TEXT,
  col_l TEXT,
  col_m TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read
CREATE POLICY "Allow authenticated users to read properties"
  ON properties FOR SELECT TO authenticated USING (true);

-- Allow authenticated users to insert (e.g. for imports)
CREATE POLICY "Allow authenticated users to insert properties"
  ON properties FOR INSERT TO authenticated WITH CHECK (true);

-- Allow authenticated users to update
CREATE POLICY "Allow authenticated users to update properties"
  ON properties FOR UPDATE TO authenticated USING (true);

-- Allow authenticated users to delete
CREATE POLICY "Allow authenticated users to delete properties"
  ON properties FOR DELETE TO authenticated USING (true);

-- Optional: index for ordering by id
CREATE INDEX idx_properties_id ON properties(id);
