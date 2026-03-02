-- Variance Check: formula column (Net amount by ZUZU - Net (of channel commission) amount (Extranet)).
-- Same null logic as Reconciled amount Check: only set when both inputs are non-null.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS variance_check DECIMAL(10, 2);
