-- Balance before reference date in SGD (formula TBD). Run in Supabase SQL Editor.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS balance_before_reference_date_in_sgd DECIMAL(10, 2);
