import { defineConfig, loadEnv } from 'vite';
import { handleAdvisorRequest } from './server/deepseek-advisor.mjs';

function advisorPlugin(env) {
  const mount = server => {
    server.middlewares.use(async (req, res, next) => {
      const path = req.url?.split('?')[0];
      if (path !== '/api/advisor' || req.method !== 'POST') return next();
      await handleAdvisorRequest(req, res, env);
    });
  };
  return {
    name: 'deepseek-advisor',
    configureServer: mount,
    configurePreviewServer: mount
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [advisorPlugin(env)]
  };
});
