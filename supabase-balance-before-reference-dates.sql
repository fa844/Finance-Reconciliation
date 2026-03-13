-- Balance before reference date: formula-derived numeric column (net - amount_received only when payment_date <= reference_date).
-- Run in Supabase SQL Editor only when needed:
--   New database / column missing: run the ADD COLUMN below.
--   Column already exists but was created as DATE: run only the ALTER to change type to numeric.
--   Column already exists as DECIMAL: you don't need to run anything.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS balance_before_reference_dates DECIMAL(10, 2);
-- If the column was previously added as DATE, run this instead (or in addition):
-- ALTER TABLE bookings ALTER COLUMN balance_before_reference_dates TYPE DECIMAL(10,2);
