function heuristicMutation(activePrompt, feedbackHistory = []) {
  const additions = [];
  const text = feedbackHistory.map((item) => JSON.stringify(item)).join(' ').toLowerCase();
  if (text.includes('entity') && !activePrompt.toLowerCase().includes('preserve exact entity')) {
    additions.push('Preserve exact entity strings, organizations, people, and numeric values.');
  }
  if (text.includes('length') && !activePrompt.toLowerCase().includes('word range')) {
    additions.push('Stay within the configured word range.');
  }
  if (!additions.length) {
    additions.push('Prefer concise, factual output over stylistic variation.');
  }
  return {
    mutation_summary: 'heuristic_patch',
    candidate_prompt: `${activePrompt.trim()}\n- ${additions.join('\n- ')}`,
  };
}

export async function proposeMutation({ activePrompt, feedbackHistory, sectionFamily, llm }) {
  if (llm?.mutatePrompt) {
    return llm.mutatePrompt({ activePrompt, feedbackHistory, sectionFamily });
  }
  return heuristicMutation(activePrompt, feedbackHistory);
}

export function getComponentsToUpdate(candidatePrompt) {
  const lines = String(candidatePrompt).split('\n').filter(Boolean);
  return lines.map((line, index) => ({ id: `line_${index + 1}`, text: line }));
}

export function makeReflectiveDataset(history = []) {
  return history
    .filter((item) => Number(item.delta ?? 0) < 0)
    .map((item) => ({
      prompt: item.prompt,
      critique: item.feedback,
      score: item.score,
    }));
}
