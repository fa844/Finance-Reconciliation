-- Keep only these currencies in the currency table:
-- Indonesia, Thailand, Malaysia, Philippines, Australia, New Zealand, India, Singapore, Laos
-- Run this in the Supabase SQL Editor

DELETE FROM currency
WHERE LOWER(TRIM(country)) NOT IN (
  'indonesia',
  'thailand',
  'malaysia',
  'philippines',
  'australia',
  'new zealand',
  'india',
  'singapore',
  'laos'
);
