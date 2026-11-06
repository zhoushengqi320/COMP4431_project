-- Run in your Supabase project's SQL Editor.
-- Read-only: returns table structure and access policies, never user rows or secrets.
-- Copy the single schema_details result and share it to map your existing tables.
WITH columns_info AS (
SELECT
  c.table_schema,
  c.table_name,
  c.column_name,
  c.data_type,
  c.udt_name,
  c.is_nullable,
  c.column_default,
  t.relrowsecurity AS row_level_security_enabled
FROM information_schema.columns AS c
JOIN pg_namespace AS n ON n.nspname = c.table_schema
JOIN pg_class AS t ON t.relnamespace = n.oid AND t.relname = c.table_name
WHERE c.table_schema = 'public'
  AND t.relkind IN ('r', 'p')
ORDER BY c.table_name, c.ordinal_position
), policies_info AS (

SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname
), constraints_info AS (

SELECT
  t.relname AS table_name,
  c.conname AS constraint_name,
  pg_get_constraintdef(c.oid) AS definition
FROM pg_constraint AS c
JOIN pg_class AS t ON t.oid = c.conrelid
JOIN pg_namespace AS n ON n.oid = t.relnamespace
WHERE n.nspname = 'public'
ORDER BY t.relname, c.conname
)
SELECT jsonb_build_object(
  'columns', COALESCE((SELECT jsonb_agg(to_jsonb(c)) FROM columns_info AS c), '[]'::jsonb),
  'policies', COALESCE((SELECT jsonb_agg(to_jsonb(p)) FROM policies_info AS p), '[]'::jsonb),
  'constraints', COALESCE((SELECT jsonb_agg(to_jsonb(c)) FROM constraints_info AS c), '[]'::jsonb)
) AS schema_details;
