import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { readFile, realpath, stat } from 'node:fs/promises';
import { dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createAuthService } from './auth.mjs';
import { handleAdvisorRequest } from './deepseek-advisor.mjs';
import { createAdvisorAccess } from './advisor-access.mjs';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8'
};

function respond(req, res, status, body, contentType = 'text/plain; charset=utf-8') {
  const content = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': contentType,
    'Content-Length': Buffer.byteLength(content),
    'Cache-Control': 'no-store'
  });
  res.end(req.method === 'HEAD' ? undefined : content);
}

function json(req, res, status, body) {
  respond(req, res, status, body, 'application/json; charset=utf-8');
}

function inside(root, candidate) {
  const path = relative(root, candidate);
  return path === '' || (!isAbsolute(path) && path !== '..' && !path.startsWith(`..${sep}`));
}

async function findFile(root, pathname) {
  const candidate = resolve(root, `.${pathname}`);
  if (!inside(root, candidate)) return null;
  try {
    const path = await realpath(candidate);
    if (!inside(root, path) || !(await stat(path)).isFile()) return null;
    return path;
  } catch (error) {
    if (['ENOENT', 'ENOTDIR', 'EACCES', 'ELOOP'].includes(error.code)) return null;
    throw error;
  }
}

/** Create a server without listening; injected auth services remain owned by the caller. */
export function createAppServer({
  distDir = resolve(projectRoot, 'dist'),
  env = process.env,
  auth,
  advisorHandler = handleAdvisorRequest,
  advisorAccessOptions = {},
  logger = console
} = {}) {
  const ownsAuth = !auth;
  const authService = auth || createAuthService({
    databasePath: env.AUTH_DATABASE_PATH || resolve(projectRoot, 'data/polypath.sqlite'),
    secureCookies: env.AUTH_SECURE_COOKIES === 'true',
    allowedOrigin: env.AUTH_ORIGIN || undefined
  });
  const advisorAccess = createAdvisorAccess({ ...advisorAccessOptions, auth: authService, env, advisorHandler });

  async function handle(req, res) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');

    let pathname;
    try {
      pathname = decodeURIComponent((req.url || '/').split('?')[0]);
    } catch {
      return respond(req, res, 400, 'Bad request.');
    }
    if (!pathname.startsWith('/') || pathname.includes('\0') || pathname.includes('\\')) {
      return respond(req, res, 400, 'Bad request.');
    }
    // Inspect the original decoded path before URL parsing can normalize traversal.
    if (pathname.split('/').some(part => part.startsWith('.'))) {
      return respond(req, res, 404, 'Not found.');
    }

    if (pathname === '/api' || pathname.startsWith('/api/')) {
      res.setHeader('Cache-Control', 'no-store');
      if (await authService.handle(req, res)) return;
      if (await advisorAccess(req, res)) return;
      return json(req, res, 404, { error: 'API route not found.' });
    }

    if (!['GET', 'HEAD'].includes(req.method)) {
      res.setHeader('Allow', 'GET, HEAD');
      return respond(req, res, 405, 'Method not allowed.');
    }
    let root;
    try {
      root = await realpath(distDir);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      return respond(req, res, 503, 'Application assets are missing. Run npm run build first.');
    }
    let file = await findFile(root, pathname === '/' ? '/index.html' : pathname);
    const mayServeApp = !extname(pathname) && !pathname.startsWith('/assets/');
    if (!file && mayServeApp) file = await findFile(root, '/index.html');
    if (!file) return respond(req, res, 404, 'Not found.');

    const content = await readFile(file);
    const immutable = pathname.startsWith('/assets/') && /[-.][\w-]{8,}\.[\w.]+$/.test(pathname);
    res.writeHead(200, {
      'Content-Type': contentTypes[extname(file)] || 'application/octet-stream',
      'Content-Length': content.length,
      'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache'
    });
    res.end(req.method === 'HEAD' ? undefined : content);
  }

  const server = createServer((req, res) => {
    handle(req, res).catch(error => {
      logger.error?.('Request failed:', error);
      if (res.headersSent) return res.destroy();
      if ((req.url || '').startsWith('/api')) json(req, res, 500, { error: 'Internal server error.' });
      else respond(req, res, 500, 'Internal server error.');
    });
  });
  server.requestTimeout = 30_000;
  server.headersTimeout = 15_000;
  if (ownsAuth) server.once('close', () => authService.close());
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const envFile = resolve(projectRoot, '.env');
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  const host = process.env.HOST || '127.0.0.1';
  const port = Number(process.env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }
  const server = createAppServer();
  server.on('error', error => {
    console.error(`Could not start PolyPath: ${error.message}`);
    process.exitCode = 1;
    server.close();
  });
  server.listen(port, host, () => console.log(`PolyPath is ready at http://${host}:${port}`));
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => {
      server.close(() => process.exit(0));
      server.closeIdleConnections();
      setTimeout(() => process.exit(1), 10_000).unref();
    });
  }
}
