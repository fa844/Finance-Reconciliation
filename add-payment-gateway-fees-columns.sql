-- Add Payment Gateway Fees columns to bookings table
-- Run in Supabase SQL Editor (or via psql) after add-reconciliation-columns.sql

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_gateway_fees DECIMAL(10, 2);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS total_payment_gateway_fees DECIMAL(10, 2);
