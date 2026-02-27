-- Add a column to store the exchange rate: units of this currency per 1 SGD (e.g. 1 SGD = 1.16 AUD → store 1.16).
-- Run this once in the Supabase SQL Editor.

ALTER TABLE public.currency
  ADD COLUMN IF NOT EXISTS rate_to_sgd numeric;

-- Allow authenticated users to update rate_to_sgd (so the Settings page can persist fetched rates)
DROP POLICY IF EXISTS "Allow authenticated to update currency rates" ON public.currency;
CREATE POLICY "Allow authenticated to update currency rates"
  ON public.currency FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);
