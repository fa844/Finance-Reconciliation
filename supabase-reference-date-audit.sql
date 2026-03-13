-- Track who last changed the reference date, from which date to which, and when.
-- Run once in the Supabase SQL editor.

ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS reference_date_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS reference_date_updated_by uuid,
  ADD COLUMN IF NOT EXISTS reference_date_updated_by_email text,
  ADD COLUMN IF NOT EXISTS reference_date_previous date;

COMMENT ON COLUMN public.app_settings.reference_date_updated_at IS 'When reference_date was last changed';
COMMENT ON COLUMN public.app_settings.reference_date_updated_by IS 'User id who last changed reference_date';
COMMENT ON COLUMN public.app_settings.reference_date_updated_by_email IS 'Email of user who last changed reference_date (for display)';
COMMENT ON COLUMN public.app_settings.reference_date_previous IS 'Reference date value before the last change';

-- Trigger: when reference_date changes, set previous/updated_at/updated_by (email is set by the app).
CREATE OR REPLACE FUNCTION public.set_reference_date_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.reference_date IS DISTINCT FROM NEW.reference_date THEN
    NEW.reference_date_previous := OLD.reference_date;
    NEW.reference_date_updated_at := now();
    NEW.reference_date_updated_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_reference_date_audit ON public.app_settings;
CREATE TRIGGER trg_set_reference_date_audit
  BEFORE UPDATE OF reference_date ON public.app_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_reference_date_audit();
