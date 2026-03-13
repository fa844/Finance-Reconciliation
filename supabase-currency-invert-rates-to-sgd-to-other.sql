-- One-time: convert existing rate_to_sgd from "other → SGD" to "1 SGD = X other".
-- If your table still has values like 0.86 for AUD (1 AUD = 0.86 SGD), this updates them to 1/0.86 ≈ 1.16 (1 SGD = 1.16 AUD).
-- Run once in the Supabase SQL Editor.

UPDATE public.currency
SET rate_to_sgd = 1 / NULLIF(rate_to_sgd, 0)
WHERE rate_to_sgd IS NOT NULL
  AND rate_to_sgd <> 0;
