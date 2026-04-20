import test from 'node:test';
import assert from 'node:assert/strict';

import { loadConfig } from '../src/config.mjs';
import { computeBlendedScore } from '../src/services/blended_objective.mjs';

test('shadow-gated blended scoring ignores onchain and thermo weights', async () => {
  const config = loadConfig({
    SHADOW_ONCHAIN_WEIGHTS: 'true',
    SYNTHETIC_WEIGHT: '0.6',
    ONCHAIN_WEIGHT: '0.25',
    ETA_THERMO_WEIGHT: '0.15',
    COST_PENALTY: '0.1',
  });

  const blended = computeBlendedScore({
    syntheticScore: 0.8,
    onchainScore: 1,
    etaThermo: 1,
    costNorm: 0.2,
    config,
  });

  assert.equal(blended.weights.onchain, 0);
  assert.equal(blended.weights.thermo, 0);
  assert.equal(Number(blended.omega.toFixed(6)), Number((0.6 * 0.8 - 0.1 * 0.2).toFixed(6)));
});
