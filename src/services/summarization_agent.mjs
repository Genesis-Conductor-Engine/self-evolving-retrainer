export async function generateSummary({ promptText, section, llm, model }) {
  if (!llm?.summarize) {
    throw new Error('No summarization port configured');
  }
  const envelope = await llm.summarize({
    prompt: promptText,
    sectionText: section.input_text,
    model,
  });
  return {
    summaryText: envelope.text.trim(),
    envelope,
  };
}
