-- Run this SQL in your Supabase SQL Editor to enable table detection
-- This creates a function that returns all table names in the public schema

CREATE OR REPLACE FUNCTION get_table_names()
RETURNS TABLE(table_name text) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT tablename::text
  FROM pg_catalog.pg_tables
  WHERE schemaname = 'public'
  ORDER BY tablename;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_table_names() TO authenticated;
