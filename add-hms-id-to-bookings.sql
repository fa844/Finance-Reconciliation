-- Add HMS ID column to bookings table (numeric, from Excel column E on upload).
-- Run this in the Supabase SQL Editor.

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS hms_id BIGINT;

COMMENT ON COLUMN bookings.hms_id IS 'HMS ID from Excel upload (column E); read-only in UI.';
