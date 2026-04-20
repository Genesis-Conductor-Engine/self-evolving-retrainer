import test from 'node:test';
import assert from 'node:assert/strict';

import { hourBucket } from '../src/lib/time.mjs';
import { promptHash } from '../src/lib/ids.mjs';
import { runSliceSweep } from '../src/services/scheduler.mjs';
import { runRegressionWatchdog } from '../src/services/regression_watchdog.mjs';
import { createTestRuntime, drainQueues } from './helpers.mjs';

test('regression watchdog rolls back after repeated live failures', async () => {
  const now = Date.now();
  const runtime = createTestRuntime({ now });
  const original = await runtime.store.getActivePrompt('markets');
  await runSliceSweep(runtime, now);
  await drainQueues(runtime);
  const promoted = await runtime.store.getActivePrompt('markets');
  assert.notEqual(promoted.version_id, original.version_id);

  for (let offset = 0; offset < 3; offset += 1) {
    const cycle = hourBucket(now + offset * 3600 * 1000);
    await runtime.store.recordSectionRun({
      run_id: `rollback_run_${offset}`,
      section_id: 'live_acme',
      section_family: 'markets',
      version_id: promoted.version_id,
      candidate_id: null,
      mode: 'LIVE',
      cycle_index: cycle,
      prompt_hash: await promptHash(promoted.prompt_text),
      summary_text: 'Acme Labs update.',
      synthetic_score: 0.2,
      omega_score: 0.2,
      s_onchain: 0.1,
      eta_thermo: 0.1,
      c_norm: 0.01,
      created_at: now + offset * 3600 * 1000,
    });
  }

  const actions = await runRegressionWatchdog(runtime, now + 2 * 3600 * 1000);
  assert.equal(actions.length, 1);
  const active = await runtime.store.getActivePrompt('markets');
  assert.equal(active.version_id, original.version_id);
});
