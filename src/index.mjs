import { handleRequest } from './services/http_routes.mjs';
import { createWorkerRuntime } from './services/runtime_factory.mjs';
import { handleQueueBatch, handleScheduled } from './services/scheduler.mjs';

export default {
  async fetch(request, env, ctx) {
    const runtime = createWorkerRuntime(env);
    return handleRequest(runtime, request, ctx);
  },

  async scheduled(controller, env, ctx) {
    const runtime = createWorkerRuntime(env);
    await handleScheduled(runtime, controller, ctx);
  },

  async queue(batch, env, ctx) {
    const runtime = createWorkerRuntime(env);
    await handleQueueBatch(runtime, batch, ctx);
  },
};
