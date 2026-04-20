import { loadConfig } from '../src/config.mjs';
import { createMemoryStore } from '../src/repositories/memory_store.mjs';
import { handleQueueBatch } from '../src/services/scheduler.mjs';

function nowSummary(text) {
  if (text.includes('Acme Labs')) {
    return 'Acme Labs raised $12M in Series A led by Apex Ventures, CEO Nina Patel said.';
  }
  if (text.includes('Orbital Foods')) {
    return 'Orbital Foods signed a $4M supply agreement with Kappa Mart, CFO Elena Ruiz said.';
  }
  if (text.includes('Vector Harbor')) {
    return 'Vector Harbor launched its Atlas platform in Chicago with CTO Marcus Lee and partner Helio Bank.';
  }
  return 'Unknown company update.';
}

function weakSummary(text) {
  if (text.includes('Acme Labs')) return 'Acme Labs raised funding.';
  if (text.includes('Orbital Foods')) return 'Orbital Foods signed a deal.';
  if (text.includes('Vector Harbor')) return 'Vector Harbor launched a platform.';
  return 'General business update.';
}

export function demoSections(now = Date.now()) {
  return [
    {
      section_id: 'live_acme',
      section_family: 'markets',
      input_text: 'Acme Labs raised $12M in Series A led by Apex Ventures, said CEO Nina Patel during the New York announcement.',
      reference_summary: 'Acme Labs raised $12M in Series A led by Apex Ventures, CEO Nina Patel said.',
      expected_entities: ['Acme Labs', '$12M', 'Apex Ventures', 'Nina Patel'],
      target_min_words: 11,
      target_max_words: 15,
      priority: 1,
      enabled: 1,
      phase: 'LIVE',
      updated_at: now,
    },
    {
      section_id: 'heldout_orbital',
      section_family: 'markets',
      input_text: 'Orbital Foods signed retailer Kappa Mart in a $4M supply agreement, CFO Elena Ruiz said from Austin.',
      reference_summary: 'Orbital Foods signed a $4M supply agreement with Kappa Mart, CFO Elena Ruiz said.',
      expected_entities: ['Orbital Foods', 'Kappa Mart', '$4M', 'Elena Ruiz'],
      target_min_words: 11,
      target_max_words: 15,
      priority: 2,
      enabled: 1,
      phase: 'HELDOUT',
      updated_at: now,
    },
    {
      section_id: 'heldout_vector',
      section_family: 'markets',
      input_text: 'Vector Harbor launched its Atlas platform in Chicago with CTO Marcus Lee and banking partner Helio Bank.',
      reference_summary: 'Vector Harbor launched its Atlas platform in Chicago with CTO Marcus Lee and partner Helio Bank.',
      expected_entities: ['Vector Harbor', 'Atlas', 'Chicago', 'Marcus Lee', 'Helio Bank'],
      target_min_words: 11,
      target_max_words: 17,
      priority: 3,
      enabled: 1,
      phase: 'HELDOUT',
      updated_at: now,
    },
  ];
}

export function initialPrompt(now = Date.now()) {
  return {
    version_id: 'ver_initial',
    parent_version_id: null,
    section_family: 'markets',
    prompt_text: 'Write a concise factual summary.',
    model: 'gpt-5.4-mini',
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
}

export function createFakeLlm() {
  return {
    async summarize({ prompt, sectionText }) {
      const strong = /preserve exact entity strings/i.test(prompt) && /word range/i.test(prompt);
      const text = strong ? nowSummary(sectionText) : weakSummary(sectionText);
      return {
        text,
        usage: {
          input_tokens: strong ? 220 : 140,
          output_tokens: strong ? 26 : 8,
        },
        request_id: `req_${strong ? 'strong' : 'weak'}`,
        client_request_id: crypto.randomUUID(),
        latency_ms: strong ? 60 : 20,
      };
    },

    async mutatePrompt({ activePrompt }) {
      if (/preserve exact entity strings/i.test(activePrompt) && /word range/i.test(activePrompt)) {
        return {
          mutation_summary: 'no_gain_patch',
          candidate_prompt: `${activePrompt}\n- Prefer crisp sentence endings.`,
          usage: { input_tokens: 60, output_tokens: 16 },
          request_id: 'req_mutate_no_gain',
          client_request_id: crypto.randomUUID(),
          latency_ms: 12,
        };
      }
      return {
        mutation_summary: 'entity_and_length_patch',
        candidate_prompt: `${activePrompt}\n- Preserve exact entity strings, organizations, people, and numeric values.\n- Stay within the configured word range.`,
        usage: { input_tokens: 80, output_tokens: 26 },
        request_id: 'req_mutate_gain',
        client_request_id: crypto.randomUUID(),
        latency_ms: 15,
      };
    },

    async judge({ summaryText, expectedEntities = [] }) {
      const strong = expectedEntities.every((entity) => summaryText.includes(entity));
      return {
        score: strong ? 0.96 : 0.45,
        rationale: strong ? 'entity_complete' : 'entity_loss',
        usage: { input_tokens: 100, output_tokens: 20 },
        request_id: `req_judge_${strong ? 'strong' : 'weak'}`,
        client_request_id: crypto.randomUUID(),
        latency_ms: 10,
      };
    },

    async validateEval(evalId) {
      return { id: evalId, object: 'eval' };
    },
  };
}

export function createFakeOnchain() {
  return {
    async probe({ summary }) {
      const strong = /Apex Ventures|Kappa Mart|Helio Bank/.test(summary);
      return {
        s_onchain: strong ? 0.82 : 0.41,
        eta_thermo: strong ? 0.77 : 0.38,
        source: 'fake',
      };
    },
  };
}

export function createTestRuntime({ now = Date.now(), shadowOnchainWeights = true } = {}) {
  const config = loadConfig({
    DEFAULT_MODEL: 'gpt-5.4-mini',
    JUDGE_MODEL: 'gpt-5.4-nano',
    PROMOTION_SIGNING_SECRET: 'test-secret',
    SHADOW_ONCHAIN_WEIGHTS: shadowOnchainWeights ? 'true' : 'false',
    ENABLE_OPENAI_EVAL_CHECKS: 'false',
    HOURLY_USD_BUDGET: '5',
    DAILY_USD_BUDGET: '50',
    RALPH_MAX_ITERATIONS_PER_SLICE: '4',
    RALPH_ITER_BUDGET_TOKENS: '8000',
    RALPH_EPSILON: '0.002',
    PROMOTION_MIN_DELTA: '0.015',
    WATCHDOG_FAILURE_THRESHOLD: '3',
    WATCHDOG_CYCLES: '3',
    WATCHDOG_SCORE_FLOOR: '0.72',
  });

  const store = createMemoryStore({
    sections: demoSections(now),
    prompts: [initialPrompt(now)],
  });

  const queues = {
    ralph: [],
    promotion: [],
  };

  return {
    config,
    store,
    llm: createFakeLlm(),
    onchain: createFakeOnchain(),
    queues,
    async enqueueRalphSlices(messages = []) {
      queues.ralph.push(...messages);
    },
    async enqueuePromotionCandidate(candidateId) {
      queues.promotion.push({ candidate_id: candidateId });
    },
  };
}

export async function drainQueues(runtime) {
  while (runtime.queues.ralph.length || runtime.queues.promotion.length) {
    if (runtime.queues.ralph.length) {
      const batch = {
        queue: runtime.config.queues.ralphSlice,
        messages: runtime.queues.ralph.splice(0).map((body) => ({ body, ack() {}, retry() {} })),
      };
      await handleQueueBatch(runtime, batch);
    }
    if (runtime.queues.promotion.length) {
      const batch = {
        queue: runtime.config.queues.promotionEval,
        messages: runtime.queues.promotion.splice(0).map((body) => ({ body, ack() {}, retry() {} })),
      };
      await handleQueueBatch(runtime, batch);
    }
  }
}
