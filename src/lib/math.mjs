export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function weightedAverage(entries) {
  const filtered = entries.filter((entry) => Number.isFinite(entry.value) && entry.weight > 0);
  if (!filtered.length) return 0;
  const totalWeight = filtered.reduce((sum, entry) => sum + entry.weight, 0);
  if (!totalWeight) return 0;
  return filtered.reduce((sum, entry) => sum + entry.value * entry.weight, 0) / totalWeight;
}

export function round(value, digits = 6) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
