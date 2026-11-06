import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';
import { createSupabaseClient, SupabaseClientError } from '../server/supabase-client.mjs';
import { probeCatalogue } from '../server/course-catalogue.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const env = loadEnv('development', root, '');

try {
  const client = createSupabaseClient({
    url: env.SUPABASE_URL,
    key: env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY,
  });
  const settings = await client.getAuthSettings();
  const catalogue = await probeCatalogue(env);
  console.log(JSON.stringify({
    supabaseReachable: true,
    ...settings,
    activeApplicationDatabase: 'sqlite',
    existingTableMapping: catalogue.ok ? 'courses_readonly' : 'not_enabled',
    catalogueCourses: catalogue.count,
    note: 'Read-only connection check. public.courses may be loaded into the advisor; accounts, profiles and chats stay in SQLite. No rows were created or migrated.',
  }, null, 2));
} catch (error) {
  console.error(error instanceof SupabaseClientError ? error.message : 'Supabase connection check failed. Verify the URL and publishable/anon key in .env.');
  process.exitCode = 1;
}
