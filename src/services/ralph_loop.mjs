import { makeId, sha256Hex } from '../lib/ids.mjs';
import { hourBucket } from '../lib/time.mjs';
import { draftCandidateMutation } from './metaprompt_agent.mjs';
import { scorePromptForSection } from './prompt_scoring.mjs';
import { updateParetoFront } from './pareto_front.mjs';

function buildFeedback(scoreResult, mutationSummary = null) {
  return {
    delta: 0,
    score: scoreResult.omega,
    feedback: scoreResult.weakAreas.join(', ') || 'none',
    mutation_summary: mutationSummary,
  };
}

export async function runRalphSlice(runtime, sectionId, now = Date.now()) {
  const currentCycle = hourBucket(now);
  const section = await runtime.store.getSection(sectionId);
  if (!section || !section.enabled) {
    return { status: 'skipped', reason: 'section_missing_or_disabled' };
  }

  const active = await runtime.store.getActivePrompt(section.section_family);
  if (!active) {
    return { status: 'skipped', reason: 'no_active_prompt' };
  }

  let checkpoint = await runtime.store.getCheckpoint(sectionId);
  if (!checkpoint || checkpoint.active_version_id !== active.version_id) {
    const baselineScore = await scorePromptForSection({
      runtime,
      section,
      promptText: active.prompt_text,
      versionId: active.version_id,
      mode: 'LIVE',
      cycleIndex: currentCycle,
      now,
      model: active.model,
    });
    checkpoint = {
      section_id: sectionId,
      active_version_id: active.version_id,
      baseline: {
        promptText: active.prompt_text,
        omega: baselineScore.omega,
        syntheticScore: baselineScore.syntheticScore,
      },
      best: {
        promptText: active.prompt_text,
        omega: baselineScore.omega,
        syntheticScore: baselineScore.syntheticScore,
        last_mutation_summary: null,
      },
      feedbackHistory: [buildFeedback(baselineScore)],
      stagnation: 0,
      iterations_consumed: 0,
      token_budget_used: 0,
      enqueued_candidate_id: null,
    };
  }

  const maxIterations = runtime.config.ralph.maxIterationsPerSlice;
  const tokenBudget = runtime.config.ralph.tokenBudgetPerSlice;
  const epsilon = runtime.config.ralph.epsilon;

  let iterations = 0;
  while (
    iterations < maxIterations &&
    checkpoint.stagnation < 3 &&
    checkpoint.token_budget_used < tokenBudget
  ) {
    const mutation = await draftCandidateMutation({
      activePrompt: checkpoint.best.promptText,
      feedbackHistory: checkpoint.feedbackHistory.slice(-5),
      sectionFamily: section.section_family,
      llm: runtime.llm,
    });

    if (!mutation.candidate_prompt || mutation.candidate_prompt.trim() === checkpoint.best.promptText.trim()) {
      checkpoint.stagnation += 1;
      iterations += 1;
      continue;
    }

    const iterId = makeId('iter');
    const scored = await scorePromptForSection({
      runtime,
      section,
      promptText: mutation.candidate_prompt,
      candidateId: iterId,
      mode: 'RALPH_EXPLORATION',
      cycleIndex: currentCycle,
      now,
      model: active.model,
    });

    const delta = scored.omega - checkpoint.best.omega;
    checkpoint.token_budget_used += scored.usageTotals.input_tokens + scored.usageTotals.output_tokens;
    checkpoint.iterations_consumed += 1;
    iterations += 1;

    await runtime.store.recordRalphIteration({
      iter_id: iterId,
      section_id: section.section_id,
      section_family: section.section_family,
      parent_version_id: active.version_id,
      parent_prompt: checkpoint.best.promptText,
      candidate_prompt: mutation.candidate_prompt,
      mutation_summary: mutation.mutation_summary ?? 'mutation',
      omega_score: scored.omega,
      s_synthetic: scored.syntheticScore,
      s_onchain: scored.onchain.s_onchain,
      eta_thermo: scored.onchain.eta_thermo,
      c_norm: scored.costNorm,
      delta_to_best: delta,
      stagnation_flag: delta < epsilon ? 1 : 0,
      created_at: now,
    });

    await updateParetoFront(runtime.store, {
      section_family: section.section_family,
      candidate_id: iterId,
      prompt_text: mutation.candidate_prompt,
      s_synthetic: scored.syntheticScore,
      s_onchain: scored.onchain.s_onchain ?? 0,
      eta_thermo: scored.onchain.eta_thermo ?? 0,
      c_norm: scored.costNorm,
    }, now);

    const feedbackRow = {
      prompt: mutation.candidate_prompt,
      delta,
      score: scored.omega,
      feedback: scored.weakAreas.join(', ') || 'none',
      mutation_summary: mutation.mutation_summary ?? 'mutation',
    };
    checkpoint.feedbackHistory.push(feedbackRow);

    if (delta >= epsilon) {
      checkpoint.best = {
        promptText: mutation.candidate_prompt,
        omega: scored.omega,
        syntheticScore: scored.syntheticScore,
        last_mutation_summary: mutation.mutation_summary ?? 'mutation',
      };
      checkpoint.stagnation = 0;
    } else {
      checkpoint.stagnation += 1;
    }
  }

  if (
    checkpoint.stagnation >= 3 &&
    !checkpoint.enqueued_candidate_id &&
    checkpoint.best.promptText.trim() !== active.prompt_text.trim() &&
    checkpoint.best.omega >= checkpoint.baseline.omega + runtime.config.ralph.promotionMinDelta
  ) {
    const candidateId = makeId('cand');
    const proposerHash = await sha256Hex(JSON.stringify({
      prompt_text: checkpoint.best.promptText,
      model: active.model,
      feedback_history: checkpoint.feedbackHistory.slice(-5),
    }));
    await runtime.store.enqueueCandidate({
      candidate_id: candidateId,
      proposer_hash: proposerHash,
      parent_version_id: active.version_id,
      section_family: section.section_family,
      prompt_text: checkpoint.best.promptText,
      model: active.model,
      source_feedback: checkpoint.feedbackHistory.slice(-10),
      state: 'PENDING',
      score_prior: checkpoint.baseline.syntheticScore,
      score_post: null,
      omega_prior: checkpoint.baseline.omega,
      omega_post: null,
      created_at: now,
      expires_at: now + runtime.config.ralph.maxCandidateTtlHours * 3600 * 1000,
      lease_owner: null,
      lease_expires_at: null,
      promoter_signature: null,
      attestation_ref: null,
      openai_eval_run_id: null,
    });
    await runtime.enqueuePromotionCandidate(candidateId);
    checkpoint.enqueued_candidate_id = candidateId;
  }

  await runtime.store.putCheckpoint(sectionId, checkpoint);
  return {
    status: 'ok',
    section_id: sectionId,
    checkpoint,
  };
}
