-- Update all currency values based on country
-- This SQL provides examples for common countries
-- Note: The dashboard button handles this automatically using the full country-to-currency mapping

-- Malaysia -> MYR
UPDATE bookings SET currency = 'MYR' WHERE LOWER(country) = 'malaysia';

-- Singapore -> SGD
UPDATE bookings SET currency = 'SGD' WHERE LOWER(country) = 'singapore';

-- Indonesia -> IDR
UPDATE bookings SET currency = 'IDR' WHERE LOWER(country) = 'indonesia';

-- Thailand -> THB
UPDATE bookings SET currency = 'THB' WHERE LOWER(country) = 'thailand';

-- Vietnam -> VND
UPDATE bookings SET currency = 'VND' WHERE LOWER(country) = 'vietnam';

-- Philippines -> PHP
UPDATE bookings SET currency = 'PHP' WHERE LOWER(country) = 'philippines';

-- Japan -> JPY
UPDATE bookings SET currency = 'JPY' WHERE LOWER(country) = 'japan';

-- South Korea -> KRW
UPDATE bookings SET currency = 'KRW' WHERE LOWER(country) = 'south korea';

-- Hong Kong -> HKD
UPDATE bookings SET currency = 'HKD' WHERE LOWER(country) = 'hong kong';

-- Taiwan -> TWD
UPDATE bookings SET currency = 'TWD' WHERE LOWER(country) = 'taiwan';

-- China -> CNY
UPDATE bookings SET currency = 'CNY' WHERE LOWER(country) = 'china';

-- India -> INR
UPDATE bookings SET currency = 'INR' WHERE LOWER(country) = 'india';

-- Australia -> AUD
UPDATE bookings SET currency = 'AUD' WHERE LOWER(country) = 'australia';

-- New Zealand -> NZD
UPDATE bookings SET currency = 'NZD' WHERE LOWER(country) = 'new zealand';

-- United States -> USD
UPDATE bookings SET currency = 'USD' WHERE LOWER(country) = 'united states';

-- United Kingdom -> GBP
UPDATE bookings SET currency = 'GBP' WHERE LOWER(country) = 'united kingdom';

-- European countries -> EUR
UPDATE bookings SET currency = 'EUR' WHERE LOWER(country) IN ('europe', 'france', 'germany', 'spain', 'italy');

-- Check the results
SELECT 
  country,
  currency, 
  COUNT(*) as count
FROM bookings
GROUP BY country, currency
ORDER BY country, currency;
