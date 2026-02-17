-- Storage bucket and RLS for saving/downloading uploaded Excel files.
-- Run this in the Supabase SQL Editor AFTER creating the bucket in Dashboard:
--   1. Go to Storage in the Supabase Dashboard
--   2. New bucket → Name: upload-files, Public: OFF (private)
--   3. Then run this SQL to allow authenticated users to upload and read.

-- Allow authenticated users to upload files to the upload-files bucket
CREATE POLICY "Allow authenticated uploads to upload-files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'upload-files');

-- Allow authenticated users to read (download) files from the upload-files bucket
CREATE POLICY "Allow authenticated read from upload-files"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'upload-files');
