const BASE = '/api';

async function fetchJSON<T>(
  url: string,
  params?: Record<string, string>,
  headers?: Record<string, string>,
  method?: string,
  body?: any
): Promise<T> {
  const qs = params && Object.keys(params).length ? '?' + new URLSearchParams(params).toString() : '';
  const res = await fetch(BASE + url + qs, {
    method: method || 'GET',
    headers: { 'Content-Type': 'application/json', ...(headers || {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export { fetchJSON };
