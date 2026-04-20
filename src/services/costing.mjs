import { makeId } from '../lib/ids.mjs';
import { clamp } from '../lib/math.mjs';

const MODEL_PRICE_PER_TOKEN = {
  'gpt-5.4': { input: 2.5 / 1_000_000, output: 15 / 1_000_000 },
  'gpt-5.4-mini': { input: 0.75 / 1_000_000, output: 4.5 / 1_000_000 },
  'gpt-5.4-nano': { input: 0.2 / 1_000_000, output: 1.25 / 1_000_000 },
  'gpt-5-mini': { input: 0.25 / 1_000_000, output: 2 / 1_000_000 },
};

export function estimateUsd(model, usage = {}) {
  const pricing = MODEL_PRICE_PER_TOKEN[model] ?? MODEL_PRICE_PER_TOKEN['gpt-5.4-mini'];
  const input = Number(usage.input_tokens ?? 0) * pricing.input;
  const output = Number(usage.output_tokens ?? 0) * pricing.output;
  return input + output;
}

export function normalizeCost(usdEstimate, maxUsdPerIter = 0.05) {
  if (maxUsdPerIter <= 0) return 0;
  return clamp(usdEstimate / maxUsdPerIter, 0, 1);
}

export async function persistUsage(store, kind, model, usageEnvelope, createdAt) {
  if (!usageEnvelope?.usage) return null;
  const row = {
    entry_id: makeId('cost'),
    kind,
    model,
    input_tokens: Number(usageEnvelope.usage.input_tokens ?? 0),
    output_tokens: Number(usageEnvelope.usage.output_tokens ?? 0),
    usd_estimate: estimateUsd(model, usageEnvelope.usage),
    latency_ms: Number(usageEnvelope.latency_ms ?? 0),
    request_id: usageEnvelope.request_id ?? null,
    client_request_id: usageEnvelope.client_request_id ?? null,
    created_at: createdAt,
  };
  await store.recordCost(row);
  return row;
}
