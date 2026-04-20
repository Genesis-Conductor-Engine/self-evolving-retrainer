export function nowMs() {
  return Date.now();
}

export function hourBucket(epochMs = nowMs()) {
  return Math.floor(epochMs / 3600000);
}
