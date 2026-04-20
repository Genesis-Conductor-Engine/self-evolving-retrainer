const encoder = new TextEncoder();

export async function sha256Hex(value) {
  const buffer = await crypto.subtle.digest('SHA-256', encoder.encode(String(value)));
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function makeId(prefix = 'id') {
  return `${prefix}_${crypto.randomUUID().replaceAll('-', '')}`;
}

export async function promptHash(promptText) {
  return sha256Hex(promptText);
}
