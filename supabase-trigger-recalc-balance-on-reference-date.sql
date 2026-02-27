-- Recalculate "Balance before reference date" and "Balance before reference date in SGD"
-- for all bookings whenever app_settings.reference_date is updated (Option 2: database trigger).
--
-- Formula (same as app):
--   balance_before_reference_dates = net_amount_by_zuzu - (amount_received if payment_date <= reference_date, else 0)
--   balance_before_reference_date_in_sgd = balance_before_reference_dates / rate_to_sgd (SGD = 1)
--
-- Steps:
-- 1. In Supabase Dashboard → SQL Editor, paste this entire file and run it.
-- 2. (Optional) To backfill existing rows with the current reference date, run:
--      SELECT recalc_balance_before_reference_date_once();

-- Internal: do the recalculation for a given reference date (used by trigger and by one-time runner)
CREATE OR REPLACE FUNCTION recalc_balance_before_reference_date_internal(p_ref_date date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_ref_date IS NULL THEN
    UPDATE bookings
    SET balance_before_reference_dates = NULL,
        balance_before_reference_date_in_sgd = NULL;
    RETURN;
  END IF;

  UPDATE bookings b
  SET
    balance_before_reference_dates = calc.balance_brd,
    balance_before_reference_date_in_sgd = calc.balance_brd_sgd
  FROM (
    SELECT
      b2.id,
      CASE
        WHEN b2.net_amount_by_zuzu IS NULL THEN NULL
        ELSE ROUND(
          (b2.net_amount_by_zuzu - CASE
            WHEN b2.payment_date IS NOT NULL AND (b2.payment_date::date <= p_ref_date)
            THEN COALESCE(b2.amount_received, 0)
            ELSE 0
          END)::numeric,
          2
        )
      END AS balance_brd,
      CASE
        WHEN b2.net_amount_by_zuzu IS NULL THEN NULL
        WHEN rate_used IS NULL OR rate_used = 0 THEN NULL
        ELSE ROUND(
          (b2.net_amount_by_zuzu - CASE
            WHEN b2.payment_date IS NOT NULL AND (b2.payment_date::date <= p_ref_date)
            THEN COALESCE(b2.amount_received, 0)
            ELSE 0
          END)::numeric / NULLIF(rate_used, 0),
          2
        )
      END AS balance_brd_sgd
    FROM bookings b2
    LEFT JOIN currency c ON UPPER(TRIM(COALESCE(b2.currency, ''))) = UPPER(TRIM(c.currency_code))
    CROSS JOIN LATERAL (
      SELECT CASE
        WHEN UPPER(TRIM(COALESCE(b2.currency, ''))) IN ('', 'SGD') THEN 1
        ELSE c.rate_to_sgd
      END AS rate_used
    ) r
  ) calc
  WHERE b.id = calc.id;
END;
$$;

-- Trigger function: run internal recalc with NEW.reference_date, then return NEW
CREATE OR REPLACE FUNCTION recalc_balance_before_reference_date()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM recalc_balance_before_reference_date_internal(NEW.reference_date);
  RETURN NEW;
END;
$$;

-- One-time runner: recalc using current reference_date from app_settings (for backfilling existing data)
CREATE OR REPLACE FUNCTION recalc_balance_before_reference_date_once()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ref_date date;
BEGIN
  SELECT reference_date INTO ref_date FROM app_settings WHERE id = 1 LIMIT 1;
  PERFORM recalc_balance_before_reference_date_internal(ref_date);
END;
$$;

-- Trigger: run recalculation only when reference_date actually changes
DROP TRIGGER IF EXISTS trg_recalc_balance_after_reference_date_change ON app_settings;

CREATE TRIGGER trg_recalc_balance_after_reference_date_change
  AFTER UPDATE OF reference_date ON app_settings
  FOR EACH ROW
  WHEN (OLD.reference_date IS DISTINCT FROM NEW.reference_date)
  EXECUTE FUNCTION recalc_balance_before_reference_date();

-- Optional: run once so existing rows match the current reference date (run in SQL Editor if needed):
--   SELECT recalc_balance_before_reference_date_once();
