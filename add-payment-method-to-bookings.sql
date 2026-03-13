-- Add Payment Method column to bookings table (text, editable green column).
-- Filled automatically during file upload via Channels + Properties lookup; editable afterwards.

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_method TEXT;

COMMENT ON COLUMN bookings.payment_method IS 'Payment method (BT, VCC, Inactive, Inactive OTA, Unknown). Auto-filled on upload from Channels + Properties lookup; editable afterwards.';
