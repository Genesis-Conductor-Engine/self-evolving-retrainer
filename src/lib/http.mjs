export async function fetchJson(url, options = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort('timeout'), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    if (!response.ok) {
      const error = new Error(data?.error?.message ?? response.statusText ?? 'HTTP request failed');
      error.status = response.status;
      error.data = data;
      throw error;
    }
    return { response, data };
  } finally {
    clearTimeout(timeout);
  }
}
