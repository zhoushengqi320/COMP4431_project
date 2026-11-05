import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchCoursesFromSupabase } from '../server/course-knowledge.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries(
  readFileSync(join(root, '.env'), 'utf8')
    .split('\n')
    .filter(line => line && !line.startsWith('#') && line.includes('='))
    .map(line => {
      const index = line.indexOf('=');
      return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
    })
);

const courses = await fetchCoursesFromSupabase(env);
const payload = {
  source: 'supabase.public.courses',
  fetched_at: new Date().toISOString(),
  count: courses.length,
  courses
};
mkdirSync(join(root, 'data'), { recursive: true });
writeFileSync(join(root, 'data/courses.json'), JSON.stringify(payload));
console.log(`Wrote ${courses.length} courses to data/courses.json`);
