function readNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readBool(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (value == null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

export function loadConfig(env = {}) {
  return {
    appName: env.APP_NAME ?? 'self-evolving-retrainer',
    defaultModel: env.DEFAULT_MODEL ?? 'gpt-5.4-mini',
    judgeModel: env.JUDGE_MODEL ?? 'gpt-5.4-nano',
    openAiApiKey: env.OPENAI_API_KEY,
    openAiProjectId: env.OPENAI_PROJECT_ID,
    openAiEvalId: env.OPENAI_EVAL_ID,
    enableOpenAiEvalChecks: readBool(env.ENABLE_OPENAI_EVAL_CHECKS, false),
    slackWebhookUrl: env.SLACK_WEBHOOK_URL,
    promotionSigningSecret: env.PROMOTION_SIGNING_SECRET,
    gcpBridgeUrl: env.GCP_BRIDGE_URL,
    thirdwebSecretKey: env.THIRDWEB_SECRET_KEY,
    adminApiKey: env.ADMIN_API_KEY,
    budgets: {
      hourlyUsd: readNumber(env.HOURLY_USD_BUDGET, 5),
      dailyUsd: readNumber(env.DAILY_USD_BUDGET, 50),
    },
    ralph: {
      maxIterationsPerSlice: readNumber(env.RALPH_MAX_ITERATIONS_PER_SLICE, 4),
      tokenBudgetPerSlice: readNumber(env.RALPH_ITER_BUDGET_TOKENS, 8000),
      secondsBudgetPerSlice: readNumber(env.RALPH_ITER_BUDGET_SECONDS, 45),
      epsilon: readNumber(env.RALPH_EPSILON, 0.002),
      promotionMinDelta: readNumber(env.PROMOTION_MIN_DELTA, 0.015),
      checkpointTtlSeconds: readNumber(env.RALPH_CHECKPOINT_TTL_SECONDS, 86400),
      maxCandidateTtlHours: readNumber(env.PROMOTION_TTL_HOURS, 2),
    },
    watchdog: {
      failureThreshold: readNumber(env.WATCHDOG_FAILURE_THRESHOLD, 3),
      watchCycles: readNumber(env.WATCHDOG_CYCLES, 3),
      scoreFloor: readNumber(env.WATCHDOG_SCORE_FLOOR, 0.72),
    },
    blended: {
      syntheticWeight: readNumber(env.SYNTHETIC_WEIGHT, 0.6),
      onchainWeight: readNumber(env.ONCHAIN_WEIGHT, 0.25),
      thermoWeight: readNumber(env.ETA_THERMO_WEIGHT, 0.15),
      costPenalty: readNumber(env.COST_PENALTY, 0.1),
      shadowOnchainWeights: readBool(env.SHADOW_ONCHAIN_WEIGHTS, true),
    },
    queues: {
      ralphSlice: 'self-evolving-retrainer-ralph-slices',
      promotionEval: 'self-evolving-retrainer-promotion-eval',
    },
  };
}
