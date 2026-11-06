import { resolve } from 'node:path';
import { defineConfig, loadEnv, normalizePath } from 'vite';
import { createAdvisorAccess } from './server/advisor-access.mjs';
import { createAuthService } from './server/auth.mjs';
import { startCatalogueRefresh } from './server/course-catalogue.mjs';
import { startCourseRefresh } from './server/course-knowledge.mjs';

export function advisorPlugin(env, { advisorAccessOptions = {} } = {}) {
  startCatalogueRefresh(env);
  startCourseRefresh(env);
  const mount = async (server, seedTestAccount = false) => {
    const auth = createAuthService({
      databasePath: env.AUTH_DATABASE_PATH || undefined,
      secureCookies: env.AUTH_SECURE_COOKIES === 'true',
      allowedOrigin: env.AUTH_ORIGIN || undefined
    });
    try {
      if (seedTestAccount) await auth.ensureTestAccount();
    } catch (error) {
      auth.close();
      throw error;
    }
    const advisorAccess = createAdvisorAccess({ ...advisorAccessOptions, auth, env });
    server.httpServer?.once('close', () => auth.close());
    server.middlewares.use(async (req, res, next) => {
      if (await auth.handle(req, res)) return;
      if (await advisorAccess(req, res)) return;
      return next();
    });
  };
  return {
    name: 'polypath-api',
    configureServer: server => mount(server, env.AUTH_SEED_TEST_ACCOUNT !== 'false'),
    configurePreviewServer: server => mount(server)
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const databasePath = normalizePath(resolve(env.AUTH_DATABASE_PATH || 'data/polypath.sqlite'));
  const databasePattern = databasePath.replace(/([*?\[\]{}()!+@])/g, '\\$1');
  return {
    plugins: [advisorPlugin(env)],
    server: {
      fs: {
        // Keep Vite's default sensitive-file exclusions, and deny account storage
        // through both project URLs and /@fs/, including SQLite sidecar files.
        deny: [
          '.env', '.env.*', '*.{crt,pem}', '**/.git/**',
          '**/data/**', '**/*.{sqlite,sqlite-wal,sqlite-shm,db,db-wal,db-shm}',
          databasePattern, `${databasePattern}-wal`, `${databasePattern}-shm`
        ]
      }
    }
  };
});
