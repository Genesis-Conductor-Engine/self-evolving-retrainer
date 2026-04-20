import { loadConfig } from '../config.mjs';
import { createOpenAiPort } from '../ports/openai.mjs';
import { createOnchainGraderPort } from '../ports/onchain_grader.mjs';
import { createD1Store } from '../repositories/d1_store.mjs';

export function createWorkerRuntime(env) {
  const config = loadConfig(env);
  const store = createD1Store(env, config);
  const llm = config.openAiApiKey ? createOpenAiPort(config) : null;
  const onchain = createOnchainGraderPort(config);

  return {
    env,
    config,
    store,
    llm,
    onchain,
    async enqueueRalphSlices(messages = []) {
      if (!messages.length) return;
      if (env.RALPH_SLICE_QUEUE.sendBatch) {
        await env.RALPH_SLICE_QUEUE.sendBatch(messages.map((body) => ({ body })));
        return;
      }
      for (const body of messages) {
        await env.RALPH_SLICE_QUEUE.send(body);
      }
    },
    async enqueuePromotionCandidate(candidateId) {
      await env.PROMOTION_EVAL_QUEUE.send({ candidate_id: candidateId });
    },
  };
}
