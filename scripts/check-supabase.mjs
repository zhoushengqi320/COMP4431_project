import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';
import { createSupabaseClient, SupabaseClientError } from '../server/supabase-client.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const env = loadEnv('development', root, '');

try {
  const client = createSupabaseClient({
    url: env.SUPABASE_URL,
    key: env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY,
  });
  const settings = await client.getAuthSettings();
  console.log(JSON.stringify({
    supabaseReachable: true,
    ...settings,
    activeApplicationDatabase: 'sqlite',
    existingTableMapping: 'not_enabled',
    note: 'Read-only connection check. No users or rows were created, read or migrated.',
  }, null, 2));
} catch (error) {
  console.error(error instanceof SupabaseClientError ? error.message : 'Supabase connection check failed. Verify the URL and publishable/anon key in .env.');
  process.exitCode = 1;
}
