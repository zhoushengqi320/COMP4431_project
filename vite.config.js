import { defineConfig, loadEnv } from 'vite';
import { startCourseRefresh } from './server/course-knowledge.mjs';
import { handleAdvisorRequest, handleTranscribeRequest } from './server/qwen-advisor.mjs';

function advisorPlugin(env) {
  const mount = server => {
    server.middlewares.use(async (req, res, next) => {
      const path = req.url?.split('?')[0];
      if (req.method === 'POST' && path === '/api/advisor') {
        await handleAdvisorRequest(req, res, env);
        return;
      }
      if (req.method === 'POST' && path === '/api/transcribe') {
        await handleTranscribeRequest(req, res, env);
        return;
      }
      next();
    });
  };
  return {
    name: 'qwen-advisor',
    configureServer: mount,
    configurePreviewServer: mount
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  startCourseRefresh(env);
  return {
    plugins: [advisorPlugin(env)]
  };
});
