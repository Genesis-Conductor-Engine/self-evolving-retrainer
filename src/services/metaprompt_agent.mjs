import { proposeMutation } from './gepa_adapter.mjs';

export async function draftCandidateMutation({ activePrompt, feedbackHistory, sectionFamily, llm }) {
  return proposeMutation({ activePrompt, feedbackHistory, sectionFamily, llm });
}
