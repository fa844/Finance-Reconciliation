-- Add reconciliation columns to bookings table
-- These columns are for manual data entry to track payment and reconciliation information

-- Payment request tracking
ALTER TABLE bookings ADD COLUMN payment_request_date DATE;

-- Amount tracking
ALTER TABLE bookings ADD COLUMN total_amount_submitted DECIMAL(10, 2);
ALTER TABLE bookings ADD COLUMN total_amount_received DECIMAL(10, 2);
ALTER TABLE bookings ADD COLUMN amount_received DECIMAL(10, 2);

-- Payment and balance tracking
ALTER TABLE bookings ADD COLUMN payment_date DATE;
ALTER TABLE bookings ADD COLUMN balance DECIMAL(10, 2);

-- Reconciliation tracking
ALTER TABLE bookings ADD COLUMN reconciled_amount_check TEXT;
ALTER TABLE bookings ADD COLUMN transmission_queue_id TEXT;
ALTER TABLE bookings ADD COLUMN reference_number TEXT;

-- Additional fields
ALTER TABLE bookings ADD COLUMN net_of_demand_commission_amount_extranet DECIMAL(10, 2);
ALTER TABLE bookings ADD COLUMN remarks TEXT;

-- Create indexes for commonly filtered columns
CREATE INDEX idx_bookings_payment_request_date ON bookings(payment_request_date);
CREATE INDEX idx_bookings_payment_date ON bookings(payment_date);
CREATE INDEX idx_bookings_transmission_queue_id ON bookings(transmission_queue_id);
CREATE INDEX idx_bookings_reference_number ON bookings(reference_number);
