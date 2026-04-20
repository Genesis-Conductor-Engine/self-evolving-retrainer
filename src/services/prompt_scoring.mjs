import { makeId, promptHash } from '../lib/ids.mjs';
import { generateSummary } from './summarization_agent.mjs';
import { evaluateSummary } from './eval_pipeline.mjs';
import { computeBlendedScore } from './blended_objective.mjs';
import { normalizeCost, persistUsage } from './costing.mjs';

export async function scorePromptForSection({
  runtime,
  section,
  promptText,
  versionId = null,
  candidateId = null,
  mode,
  cycleIndex,
  now,
  model,
}) {
  const summaryResult = await generateSummary({
    promptText,
    section,
    llm: runtime.llm,
    model,
  });
  const summaryCost = await persistUsage(runtime.store, 'summary_generation', model, summaryResult.envelope, now);

  const evaluation = await evaluateSummary({
    section,
    summaryText: summaryResult.summaryText,
    llm: runtime.llm,
  });
  const judgeCost = await persistUsage(runtime.store, 'llm_judge', runtime.config.judgeModel, evaluation.judgeEnvelope, now);

  const onchain = runtime.onchain?.probe
    ? await runtime.onchain.probe({ section, summary: summaryResult.summaryText })
    : { s_onchain: null, eta_thermo: null, source: 'disabled' };

  const usdEstimate = (summaryCost?.usd_estimate ?? 0) + (judgeCost?.usd_estimate ?? 0);
  const costNorm = normalizeCost(usdEstimate);
  const blended = computeBlendedScore({
    syntheticScore: evaluation.syntheticScore,
    onchainScore: onchain.s_onchain,
    etaThermo: onchain.eta_thermo,
    costNorm,
    config: runtime.config,
  });

  await runtime.store.recordSectionRun({
    run_id: makeId('run'),
    section_id: section.section_id,
    section_family: section.section_family,
    version_id: versionId,
    candidate_id: candidateId,
    mode,
    cycle_index: cycleIndex,
    prompt_hash: await promptHash(promptText),
    summary_text: summaryResult.summaryText,
    synthetic_score: evaluation.syntheticScore,
    omega_score: blended.omega,
    s_onchain: onchain.s_onchain,
    eta_thermo: onchain.eta_thermo,
    c_norm: costNorm,
    created_at: now,
  });

  const weakAreas = Object.entries(evaluation.subscores)
    .filter(([, value]) => Number(value) < 0.8)
    .map(([name]) => name);

  return {
    section_id: section.section_id,
    section_family: section.section_family,
    summaryText: summaryResult.summaryText,
    syntheticScore: evaluation.syntheticScore,
    omega: blended.omega,
    subscores: evaluation.subscores,
    judgeRationale: evaluation.judgeRationale,
    weakAreas,
    onchain,
    costNorm,
    usdEstimate,
    usageTotals: {
      input_tokens: Number(summaryResult.envelope?.usage?.input_tokens ?? 0) + Number(evaluation.judgeEnvelope?.usage?.input_tokens ?? 0),
      output_tokens: Number(summaryResult.envelope?.usage?.output_tokens ?? 0) + Number(evaluation.judgeEnvelope?.usage?.output_tokens ?? 0),
    },
  };
}
