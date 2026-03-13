-- Fix: column "balance_before_reference_dates" was created as DATE but must be numeric (balance amount).
-- Run this once in Supabase SQL Editor. Then changing the reference date in Settings will work.
-- Existing values are cleared (set to NULL); after you save the reference date again, the trigger will recalculate them.

ALTER TABLE bookings
  ALTER COLUMN balance_before_reference_dates TYPE DECIMAL(10, 2) USING NULL;
