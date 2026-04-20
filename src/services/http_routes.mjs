import { evaluateCandidate } from './candidate_evaluator.mjs';
import { getBudgetStatus } from './quota_monitor.mjs';
import { runHourlyCommit, runSliceSweep } from './scheduler.mjs';

function json(data, init = {}) {
  return Response.json(data, init);
}

function assertAdmin(runtime, request) {
  if (!runtime.config.adminApiKey) return true;
  return request.headers.get('x-admin-key') === runtime.config.adminApiKey;
}

export async function handleRequest(runtime, request) {
  const url = new URL(request.url);

  if (url.pathname === '/health' && request.method === 'GET') {
    const [counts, alerts, budget] = await Promise.all([
      runtime.store.getHealthCounts(),
      runtime.store.listActiveAlerts(10),
      getBudgetStatus(runtime, Date.now()),
    ]);
    return json({ ok: true, counts, alerts, budget });
  }

  if (!assertAdmin(runtime, request)) {
    return json({ error: 'forbidden' }, { status: 403 });
  }

  if (url.pathname === '/admin/sweep' && request.method === 'POST') {
    return json(await runHourlyCommit(runtime, Date.now()));
  }

  if (url.pathname === '/admin/slices' && request.method === 'POST') {
    return json(await runSliceSweep(runtime, Date.now()));
  }

  const evaluateMatch = url.pathname.match(/^\/admin\/evaluate\/([^/]+)$/);
  if (evaluateMatch && request.method === 'POST') {
    return json(await evaluateCandidate(runtime, evaluateMatch[1], Date.now()));
  }

  return json({ error: 'not_found' }, { status: 404 });
}
