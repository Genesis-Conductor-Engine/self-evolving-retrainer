import test from 'node:test';
import assert from 'node:assert/strict';

import { runSliceSweep } from '../src/services/scheduler.mjs';
import { createTestRuntime, drainQueues } from './helpers.mjs';

test('full queue-safe promotion cycle promotes a stronger prompt', async () => {
  const runtime = createTestRuntime();
  const before = await runtime.store.getActivePrompt('markets');
  assert.equal(before.version_id, 'ver_initial');

  const sliceSweep = await runSliceSweep(runtime, Date.now());
  assert.equal(sliceSweep.status, 'queued');
  await drainQueues(runtime);

  const after = await runtime.store.getActivePrompt('markets');
  assert.notEqual(after.version_id, before.version_id);
  assert.match(after.prompt_text, /Preserve exact entity strings/i);
  const versions = await runtime.store.listRecentPromptVersions('markets', 5);
  assert.equal(versions[0].active, 1);
});
