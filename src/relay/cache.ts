type Entry = {
  expiresAt: number;
  status: number;
  headers: [string, string][];
  body: string;
};

const memoryCache = new Map<string, Entry>();

export async function cacheShort(
  key: string,
  seconds: number,
  producer: () => Promise<Response>
): Promise<Response> {
  if (seconds <= 0) {
    return producer();
  }
  const now = Date.now();
  const cached = memoryCache.get(key);
  if (cached && cached.expiresAt > now) {
    return new Response(cached.body, { status: cached.status, headers: cached.headers });
  }
  const response = await producer();
  if (response.ok) {
    const clone = response.clone();
    const body = await clone.text();
    memoryCache.set(key, {
      expiresAt: now + seconds * 1000,
      status: clone.status,
      headers: [...clone.headers.entries()],
      body
    });
  }
  return response;
}
