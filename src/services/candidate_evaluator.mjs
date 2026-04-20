import { average } from '../lib/math.mjs';
import { hourBucket } from '../lib/time.mjs';
import { promoteCandidateVersion } from './prompt_ledger.mjs';
import { scorePromptForSection } from './prompt_scoring.mjs';

function aggregate(results) {
  return {
    synthetic: average(results.map((item) => item.syntheticScore)),
    omega: average(results.map((item) => item.omega)),
    feedback: results.map((item) => ({
      section_id: item.section_id,
      weak_areas: item.weakAreas,
      judge_rationale: item.judgeRationale,
    })),
  };
}

export async function evaluateCandidate(runtime, candidateId, now = Date.now()) {
  const currentCycle = hourBucket(now);
  const leaseOwner = `lease_${crypto.randomUUID()}`;
  const candidate = await runtime.store.claimCandidate(candidateId, leaseOwner, now, 15 * 60 * 1000);
  if (!candidate) {
    return { status: 'skipped', reason: 'candidate_not_claimed' };
  }

  const active = await runtime.store.getActivePrompt(candidate.section_family);
  if (!active) {
    await runtime.store.finalizeCandidate(candidate.candidate_id, {
      state: 'REJECTED',
      attestation_ref: 'no_active_prompt',
      lease_owner: null,
      lease_expires_at: null,
    });
    return { status: 'rejected', reason: 'no_active_prompt' };
  }

  const heldoutSections = await runtime.store.getHeldoutSections(candidate.section_family, 25);
  if (!heldoutSections.length) {
    await runtime.store.finalizeCandidate(candidate.candidate_id, {
      state: 'REJECTED',
      attestation_ref: 'no_heldout_sections',
      lease_owner: null,
      lease_expires_at: null,
    });
    return { status: 'rejected', reason: 'no_heldout_sections' };
  }

  const activeResults = [];
  const candidateResults = [];
  for (const section of heldoutSections) {
    activeResults.push(await scorePromptForSection({
      runtime,
      section,
      promptText: active.prompt_text,
      versionId: active.version_id,
      mode: 'ACTIVE_BASELINE',
      cycleIndex: currentCycle,
      now,
      model: active.model,
    }));
    candidateResults.push(await scorePromptForSection({
      runtime,
      section,
      promptText: candidate.prompt_text,
      candidateId: candidate.candidate_id,
      mode: 'CANDIDATE_BASELINE',
      cycleIndex: currentCycle,
      now,
      model: candidate.model,
    }));
  }

  const baseline = aggregate(activeResults);
  const evaluated = aggregate(candidateResults);
  const improvement = evaluated.omega - baseline.omega;
  const enoughGain = improvement >= runtime.config.ralph.promotionMinDelta;
  const nonRegression = evaluated.synthetic >= baseline.synthetic;

  if (enoughGain && nonRegression) {
    const version = await promoteCandidateVersion(runtime, {
      candidate,
      aggregateOmega: evaluated.omega,
      aggregateSynthetic: evaluated.synthetic,
      improvement,
      now,
      cycleIndex: currentCycle,
    });
    return {
      status: 'promoted',
      version,
      improvement,
      baseline,
      evaluated,
    };
  }

  await runtime.store.finalizeCandidate(candidate.candidate_id, {
    state: 'REJECTED',
    score_post: evaluated.synthetic,
    omega_post: evaluated.omega,
    attestation_ref: `candidate_delta=${improvement.toFixed(6)}`,
    lease_owner: null,
    lease_expires_at: null,
  });
  return {
    status: 'rejected',
    improvement,
    baseline,
    evaluated,
  };
}
