-- Run this SQL in your Supabase SQL Editor so the country (and other multi-select) filter
-- dropdowns show all distinct values from the table, not just the first 10,000 rows.
-- This fixes missing options like India or Australia when the table has many rows.

CREATE OR REPLACE FUNCTION get_distinct_column_values(p_table_name text, p_column_name text)
RETURNS SETOF text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY EXECUTE format(
    'SELECT DISTINCT trim((%I)::text) FROM %I WHERE (%I) IS NOT NULL AND trim((%I)::text) <> ''''',
    p_column_name, p_table_name, p_column_name, p_column_name
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_distinct_column_values(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION get_distinct_column_values(text, text) TO anon;
