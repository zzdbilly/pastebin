// --- Worker 入口 (index.js) ---
import handleRequest from './router.js';

export default {
  async fetch(request, env, ctx) {
    // Make the KV binding available globally (module workers pass bindings via `env`
    // instead of injecting KG global like service-worker syntax, so expose it here).
    // KV binding name stays `KV`, matching all KV.get/put/delete call sites verbatim.
    globalThis.KV = env.KV;

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400',
        },
      });
    }
    return handleRequest(request);
  },
};
