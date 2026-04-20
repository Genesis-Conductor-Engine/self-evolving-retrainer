import { emitAlert } from './alerts.mjs';

export async function provisionAndCheck(runtime, now = Date.now()) {
  const errors = [];
  if (!runtime.store) errors.push('store_unavailable');
  if (!runtime.llm) errors.push('openai_port_unavailable');
  if (!runtime.config.promotionSigningSecret) errors.push('promotion_signing_secret_missing');

  if (runtime.config.enableOpenAiEvalChecks && runtime.config.openAiEvalId) {
    try {
      await runtime.llm.validateEval(runtime.config.openAiEvalId);
    } catch (error) {
      errors.push(`openai_eval_validation_failed:${error.message}`);
    }
  }

  if (errors.length) {
    await emitAlert(runtime, {
      severity: 'P0',
      kind: 'provision_failed',
      message: `Provision gate failed: ${errors.join(', ')}`,
      metadata: { errors },
    }, now);
    return { ok: false, errors };
  }

  await runtime.store.resolveAlertsByKind('provision_failed', now);
  return { ok: true, errors: [] };
}
