-- Enable RLS on Channels table and allow authenticated users to read.
-- Without this policy, the Channels query returns 0 rows during upload.

ALTER TABLE "Channels" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated users to read Channels"
  ON "Channels" FOR SELECT TO authenticated USING (true);
