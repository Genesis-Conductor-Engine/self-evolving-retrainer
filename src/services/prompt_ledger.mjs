import { makeId } from '../lib/ids.mjs';
import { signPayload } from '../lib/signing.mjs';

export async function ensureBootstrapPrompt(runtime, { sectionFamily, promptText, model, now }) {
  const existing = await runtime.store.getActivePrompt(sectionFamily);
  if (existing) return existing;
  const row = {
    version_id: makeId('ver'),
    parent_version_id: null,
    section_family: sectionFamily,
    prompt_text: promptText,
    model,
    aggregate_score: 0,
    promotion_reason: 'bootstrap',
    promoted_from_candidate_id: null,
    promoter_signature: 'bootstrap',
    created_at: now,
    active: 1,
    rolled_back_from: null,
    promoted_cycle: 0,
    watch_until_cycle: 0,
  };
  await runtime.store.insertInitialPrompt(row);
  return row;
}

export async function promoteCandidateVersion(runtime, { candidate, aggregateOmega, aggregateSynthetic, improvement, now, cycleIndex }) {
  const versionId = makeId('ver');
  const payload = JSON.stringify({
    version_id: versionId,
    candidate_id: candidate.candidate_id,
    parent_version_id: candidate.parent_version_id,
    section_family: candidate.section_family,
    aggregate_omega: aggregateOmega,
    aggregate_synthetic: aggregateSynthetic,
    promoted_at: now,
    cycle_index: cycleIndex,
  });
  const promoterSignature = await signPayload(runtime.config.promotionSigningSecret, payload);
  const versionRow = {
    version_id: versionId,
    parent_version_id: candidate.parent_version_id,
    section_family: candidate.section_family,
    prompt_text: candidate.prompt_text,
    model: candidate.model,
    aggregate_score: aggregateOmega,
    promotion_reason: `candidate_delta=${improvement.toFixed(6)}`,
    promoted_from_candidate_id: candidate.candidate_id,
    promoter_signature: promoterSignature,
    created_at: now,
    active: 1,
    rolled_back_from: null,
    promoted_cycle: cycleIndex,
    watch_until_cycle: cycleIndex + runtime.config.watchdog.watchCycles,
  };
  await runtime.store.promoteVersion(versionRow);
  await runtime.store.finalizeCandidate(candidate.candidate_id, {
    state: 'PROMOTED',
    score_post: aggregateSynthetic,
    omega_post: aggregateOmega,
    promoter_signature: promoterSignature,
    attestation_ref: versionId,
    lease_owner: null,
    lease_expires_at: null,
  });
  return versionRow;
}
