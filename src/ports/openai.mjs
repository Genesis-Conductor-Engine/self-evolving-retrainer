import { fetchJson } from '../lib/http.mjs';
import { makeId } from '../lib/ids.mjs';

function headers(config, clientRequestId) {
  const output = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${config.openAiApiKey}`,
    'X-Client-Request-Id': clientRequestId,
  };
  if (config.openAiProjectId) output['OpenAI-Project'] = config.openAiProjectId;
  return output;
}

function extractOutputText(data) {
  if (typeof data?.output_text === 'string' && data.output_text.length) return data.output_text;
  const chunks = [];
  for (const item of data?.output ?? []) {
    for (const content of item?.content ?? []) {
      if (content?.type === 'output_text' && typeof content.text === 'string') {
        chunks.push(content.text);
      }
    }
  }
  return chunks.join('\n').trim();
}

function usageFromResponse(data) {
  return {
    input_tokens: Number(data?.usage?.input_tokens ?? 0),
    output_tokens: Number(data?.usage?.output_tokens ?? 0),
  };
}

function parseJsonObject(text, fallback) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

export function createOpenAiPort(config) {
  if (!config.openAiApiKey) {
    throw new Error('OPENAI_API_KEY is required for the production OpenAI port');
  }

  async function responsesCreate(payload) {
    const clientRequestId = makeId('req');
    const started = Date.now();
    const { response, data } = await fetchJson('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: headers(config, clientRequestId),
      body: JSON.stringify(payload),
    });
    return {
      data,
      text: extractOutputText(data),
      usage: usageFromResponse(data),
      request_id: response.headers.get('x-request-id') ?? null,
      client_request_id: clientRequestId,
      latency_ms: Date.now() - started,
      rate_limits: {
        remaining_requests: response.headers.get('x-ratelimit-remaining-requests'),
        remaining_tokens: response.headers.get('x-ratelimit-remaining-tokens'),
      },
    };
  }

  return {
    async summarize({ prompt, sectionText, model }) {
      return responsesCreate({
        model: model ?? config.defaultModel,
        input: [
          {
            role: 'developer',
            content: `You are a precise section summarizer. Follow the prompt exactly.\n\n${prompt}`,
          },
          {
            role: 'user',
            content: `Section text:\n${sectionText}\n\nReturn only the summary.`,
          },
        ],
        text: { format: { type: 'text' } },
      });
    },

    async mutatePrompt({ activePrompt, feedbackHistory, sectionFamily, model }) {
      const response = await responsesCreate({
        model: model ?? config.defaultModel,
        input: [
          {
            role: 'developer',
            content: 'You improve system prompts for deterministic summarization agents. Return strict JSON: {"mutation_summary": string, "candidate_prompt": string}.',
          },
          {
            role: 'user',
            content: JSON.stringify({
              section_family: sectionFamily,
              active_prompt: activePrompt,
              feedback_history: feedbackHistory,
              constraints: [
                'Preserve meaning and output contract.',
                'Prefer minimal edits that improve entity retention, format adherence, and compression quality.',
                'Do not include markdown fences.',
              ],
            }),
          },
        ],
        text: { format: { type: 'text' } },
      });
      const parsed = parseJsonObject(response.text, null);
      if (!parsed?.candidate_prompt) {
        throw new Error(`OpenAI mutation response was not valid JSON: ${response.text}`);
      }
      return {
        ...response,
        mutation_summary: parsed.mutation_summary ?? 'model_proposed_mutation',
        candidate_prompt: parsed.candidate_prompt,
      };
    },

    async judge({ sectionText, summaryText, referenceSummary, expectedEntities, model }) {
      const response = await responsesCreate({
        model: model ?? config.judgeModel,
        input: [
          {
            role: 'developer',
            content: 'You judge section summaries. Return strict JSON: {"score": number, "rationale": string}. Score must be between 0 and 1.',
          },
          {
            role: 'user',
            content: JSON.stringify({
              section_text: sectionText,
              summary_text: summaryText,
              reference_summary: referenceSummary ?? null,
              expected_entities: expectedEntities ?? [],
              rubric: {
                fidelity: 0.5,
                concision: 0.25,
                entity_preservation: 0.25,
              },
            }),
          },
        ],
        text: { format: { type: 'text' } },
      });
      const parsed = parseJsonObject(response.text, { score: 0.5, rationale: response.text.slice(0, 500) });
      return {
        ...response,
        score: Math.max(0, Math.min(1, Number(parsed.score ?? 0.5))),
        rationale: String(parsed.rationale ?? ''),
      };
    },

    async validateEval(evalId) {
      const clientRequestId = makeId('eval');
      const { data } = await fetchJson(`https://api.openai.com/v1/evals/${evalId}`, {
        method: 'GET',
        headers: headers(config, clientRequestId),
      });
      return data;
    },
  };
}
