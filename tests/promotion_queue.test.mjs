import test from 'node:test';
import assert from 'node:assert/strict';

import { runRalphSlice } from '../src/services/ralph_loop.mjs';
import { createTestRuntime } from './helpers.mjs';

test('Ralph loop enqueues a candidate without promoting inline', async () => {
  const runtime = createTestRuntime();
  const before = await runtime.store.getActivePrompt('markets');
  const result = await runRalphSlice(runtime, 'live_acme', Date.now());

  assert.equal(result.status, 'ok');
  assert.ok(result.checkpoint.enqueued_candidate_id);
  const candidate = await runtime.store.getCandidate(result.checkpoint.enqueued_candidate_id);
  assert.equal(candidate.state, 'PENDING');

  const after = await runtime.store.getActivePrompt('markets');
  assert.equal(after.version_id, before.version_id);
  assert.equal(runtime.queues.promotion.length, 1);
});
