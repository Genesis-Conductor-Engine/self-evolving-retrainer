import { clamp } from './math.mjs';

export function normalizeText(text = '') {
  return String(text).toLowerCase().replace(/\s+/g, ' ').trim();
}

export function tokenizeWords(text = '') {
  return String(text).match(/[A-Za-z0-9$][A-Za-z0-9$._-]*/g) ?? [];
}

export function countWords(text = '') {
  return tokenizeWords(text).length;
}

export function uniqueLower(values = []) {
  return [...new Set(values.map((value) => normalizeText(value)).filter(Boolean))];
}

export function entityPresenceScore(summaryText = '', expectedEntities = []) {
  const summary = normalizeText(summaryText);
  const entities = uniqueLower(expectedEntities);
  if (!entities.length) return 1;
  const present = entities.filter((entity) => summary.includes(entity)).length;
  return present / entities.length;
}

export function lengthBandScore(summaryText = '', minWords = 12, maxWords = 24) {
  const words = countWords(summaryText);
  if (words >= minWords && words <= maxWords) return 1;
  if (words < minWords) {
    const deficit = minWords - words;
    return clamp(1 - deficit / Math.max(minWords, 1), 0, 1);
  }
  const excess = words - maxWords;
  return clamp(1 - excess / Math.max(maxWords, 1), 0, 1);
}

function bagOfWords(text = '') {
  const tokens = tokenizeWords(normalizeText(text));
  const counts = new Map();
  for (const token of tokens) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return counts;
}

export function cosineSimilarity(left = '', right = '') {
  const a = bagOfWords(left);
  const b = bagOfWords(right);
  if (!a.size || !b.size) return 0;
  let dot = 0;
  let aNorm = 0;
  let bNorm = 0;
  for (const value of a.values()) aNorm += value * value;
  for (const value of b.values()) bNorm += value * value;
  for (const [token, value] of a.entries()) {
    dot += value * (b.get(token) ?? 0);
  }
  if (!aNorm || !bNorm) return 0;
  return dot / (Math.sqrt(aNorm) * Math.sqrt(bNorm));
}

export function safeJsonParse(value, fallback = null) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}
