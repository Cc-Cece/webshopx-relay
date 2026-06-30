import type { Env } from "./env";
import { api } from "./routes/api";
import { connector } from "./routes/connector";
import { health } from "./routes/health";
import { setup } from "./routes/setup";
import { errorJson } from "./relay/errors";
export { ServerRoom } from "./durable-objects/ServerRoom";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (request.method === "OPTIONS") {
        return withCors(new Response(null, { status: 204 }));
      }
      if (url.pathname === "/health") {
        return withCors(health(request, env));
      }
      if (url.pathname === "/setup") {
        return setup(request, env);
      }
      if (url.pathname === "/connector/ws") {
        return connector(request, env);
      }
      if (url.pathname.startsWith("/api/")) {
        return withCors(await api(request, env));
      }
      return env.ASSETS.fetch(request);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected relay error";
      if (message === "request_too_large") {
        return withCors(errorJson(413, "request_too_large", "Request body is too large"));
      }
      console.error("Relay request failed", error);
      return withCors(errorJson(500, "internal_error", "Relay internal error"));
    }
  }
};

function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("access-control-allow-origin", "*");
  headers.set("access-control-allow-methods", "GET,POST,OPTIONS");
  headers.set("access-control-allow-headers", "content-type, authorization, idempotency-key");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
