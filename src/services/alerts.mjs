import { makeId } from '../lib/ids.mjs';

export async function emitAlert(runtime, { severity, kind, message, metadata = {} }, now = Date.now()) {
  const row = {
    alert_id: makeId('alert'),
    severity,
    kind,
    message,
    metadata_json: metadata,
    created_at: now,
    resolved_at: null,
  };
  await runtime.store.createAlert(row);
  if (runtime.config.slackWebhookUrl) {
    try {
      await fetch(runtime.config.slackWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `[${severity}] ${kind}: ${message}`,
          metadata,
        }),
      });
    } catch {
      // Non-fatal by design.
    }
  }
  return row;
}
