export function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(data), { ...init, headers });
}

export function errorJson(status: number, code: string, message: string): Response {
  return json({ error: code, message }, { status });
}

export function methodNotAllowed(): Response {
  return errorJson(405, "method_not_allowed", "Method not allowed");
}
