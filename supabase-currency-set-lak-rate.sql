-- Set Laos (LAK) exchange rate: units of LAK per 1 SGD.
-- Run this in the Supabase SQL Editor if the currency table has LAK with NULL rate_to_sgd.
-- Approximate rate (adjust as needed); you can also set or change it on the Settings page.

UPDATE public.currency
SET rate_to_sgd = 16980
WHERE LOWER(TRIM(country)) = 'laos'
  AND currency_code = 'LAK';
