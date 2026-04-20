import { runSliceSweep } from '../src/services/scheduler.mjs';
import { createTestRuntime, drainQueues } from '../tests/helpers.mjs';

const runtime = createTestRuntime();
const before = await runtime.store.getActivePrompt('markets');
const queued = await runSliceSweep(runtime, Date.now());
await drainQueues(runtime);
const after = await runtime.store.getActivePrompt('markets');
const counts = await runtime.store.getHealthCounts();

console.log(JSON.stringify({
  before: { version_id: before.version_id, prompt_text: before.prompt_text },
  queued,
  after: { version_id: after.version_id, prompt_text: after.prompt_text },
  counts,
}, null, 2));
