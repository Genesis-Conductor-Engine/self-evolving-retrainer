import { evaluateCandidate } from './candidate_evaluator.mjs';
import { provisionAndCheck } from './provision_gate.mjs';
import { getBudgetStatus, enforceBudgetAlerts } from './quota_monitor.mjs';
import { runRalphSlice } from './ralph_loop.mjs';
import { runRegressionWatchdog } from './regression_watchdog.mjs';

export async function runSliceSweep(runtime, now = Date.now()) {
  const gate = await provisionAndCheck(runtime, now);
  if (!gate.ok) return { status: 'blocked', gate };
  const budget = await getBudgetStatus(runtime, now);
  if (budget.suspendRalph) {
    return { status: 'suspended', budget };
  }
  const sections = await runtime.store.getEnabledSections({ phase: 'LIVE', limit: 20 });
  const messages = sections.map((section) => ({ section_id: section.section_id, scheduled_at: now }));
  await runtime.enqueueRalphSlices(messages);
  return {
    status: 'queued',
    queued: messages.length,
    budget,
  };
}

export async function runHourlyCommit(runtime, now = Date.now()) {
  const gate = await provisionAndCheck(runtime, now);
  if (!gate.ok) return { status: 'blocked', gate };
  const expired = await runtime.store.expireStaleCandidates(now);
  const budget = await enforceBudgetAlerts(runtime, now);
  const watchdog = await runRegressionWatchdog(runtime, now);
  const sliceSweep = await runSliceSweep(runtime, now);
  return {
    status: 'ok',
    expired_candidates: expired,
    budget,
    watchdog,
    sliceSweep,
  };
}

export async function runTelemetrySweep(runtime, now = Date.now()) {
  const gate = await provisionAndCheck(runtime, now);
  if (!gate.ok) return { status: 'blocked', gate };
  const budget = await enforceBudgetAlerts(runtime, now);
  return { status: 'ok', budget };
}

export async function handleScheduled(runtime, controller) {
  const now = Date.now();
  switch (controller.cron) {
    case '0 * * * *':
      await runHourlyCommit(runtime, now);
      return;
    case '*/30 * * * *':
      await runTelemetrySweep(runtime, now);
      return;
    case '*/5 * * * *':
    default:
      await runSliceSweep(runtime, now);
  }
}

async function processQueueMessage(runtime, queueName, body, now) {
  if (queueName === runtime.config.queues.ralphSlice) {
    return runRalphSlice(runtime, body.section_id, now);
  }
  if (queueName === runtime.config.queues.promotionEval) {
    return evaluateCandidate(runtime, body.candidate_id, now);
  }
  throw new Error(`Unknown queue: ${queueName}`);
}

export async function handleQueueBatch(runtime, batch) {
  const now = Date.now();
  for (const message of batch.messages) {
    try {
      await processQueueMessage(runtime, batch.queue, message.body, now);
      if (message.ack) message.ack();
    } catch (error) {
      if (message.retry) {
        message.retry();
        continue;
      }
      throw error;
    }
  }
}
