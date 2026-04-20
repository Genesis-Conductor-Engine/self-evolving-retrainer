import { clamp } from '../lib/math.mjs';

export function computeBlendedScore({ syntheticScore, onchainScore, etaThermo, costNorm, config }) {
  const rawWeights = {
    synthetic: config.blended.syntheticWeight,
    onchain: config.blended.onchainWeight,
    thermo: config.blended.thermoWeight,
    costPenalty: config.blended.costPenalty,
  };
  const weights = {
    synthetic: rawWeights.synthetic,
    onchain: config.blended.shadowOnchainWeights ? 0 : rawWeights.onchain,
    thermo: config.blended.shadowOnchainWeights ? 0 : rawWeights.thermo,
    costPenalty: rawWeights.costPenalty,
  };

  const omega = clamp(
    weights.synthetic * (syntheticScore ?? 0) +
      weights.onchain * (onchainScore ?? 0) +
      weights.thermo * (etaThermo ?? 0) -
      weights.costPenalty * (costNorm ?? 0),
    0,
    1,
  );

  return {
    omega,
    components: {
      synthetic: syntheticScore ?? 0,
      onchain: onchainScore ?? null,
      eta_thermo: etaThermo ?? null,
      cost_norm: costNorm ?? 0,
    },
    weights,
    rawWeights,
  };
}
