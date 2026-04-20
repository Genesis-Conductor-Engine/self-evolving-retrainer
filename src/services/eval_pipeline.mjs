import { weightedAverage } from '../lib/math.mjs';
import { cosineSimilarity, entityPresenceScore, lengthBandScore } from '../lib/text.mjs';

export async function evaluateSummary({ section, summaryText, llm }) {
  const entityScore = entityPresenceScore(summaryText, section.expected_entities ?? []);
  const lengthScore = lengthBandScore(summaryText, section.target_min_words, section.target_max_words);
  const similarityScore = cosineSimilarity(summaryText, section.reference_summary ?? section.input_text);

  let judgeScore = similarityScore;
  let judgeRationale = 'heuristic_fallback';
  let judgeEnvelope = null;
  if (llm?.judge) {
    judgeEnvelope = await llm.judge({
      sectionText: section.input_text,
      summaryText,
      referenceSummary: section.reference_summary,
      expectedEntities: section.expected_entities ?? [],
    });
    judgeScore = judgeEnvelope.score;
    judgeRationale = judgeEnvelope.rationale;
  }

  const syntheticScore = weightedAverage([
    { value: entityScore, weight: 0.30 },
    { value: lengthScore, weight: 0.20 },
    { value: similarityScore, weight: 0.25 },
    { value: judgeScore, weight: 0.25 },
  ]);

  return {
    syntheticScore,
    subscores: {
      entity: entityScore,
      length: lengthScore,
      similarity: similarityScore,
      judge: judgeScore,
    },
    judgeEnvelope,
    judgeRationale,
  };
}
