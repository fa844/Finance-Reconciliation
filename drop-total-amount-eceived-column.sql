-- Remove the typo column "total_amount_eceived" from bookings
-- Keep "total_amount_received" (correct spelling)

ALTER TABLE bookings DROP COLUMN IF EXISTS total_amount_eceived;
