import type { Env } from "../env";
import { defaultServerId, sanitizeServerId } from "../env";
import { bearerToken } from "../relay/auth";
import { cacheShort } from "../relay/cache";
import { errorJson, json, methodNotAllowed } from "../relay/errors";
import { isRateLimited } from "../relay/rateLimit";
import { newRequestId, type RpcRequest } from "../relay/rpc";

type Route = {
  method: string;
  path: string;
  rpc: string;
};

const ROUTES: Route[] = [
  { method: "GET", path: "/api/products", rpc: "products.list" },
  { method: "POST", path: "/api/auth/login", rpc: "auth.login" },
  { method: "GET", path: "/api/auth/me", rpc: "auth.me" },
  { method: "POST", path: "/api/auth/logout", rpc: "auth.logout" },
  { method: "POST", path: "/api/orders", rpc: "orders.place" },
  { method: "GET", path: "/api/orders/list", rpc: "orders.list" },
  { method: "POST", path: "/api/admin/auth/login", rpc: "admin.auth.login" },
  { method: "GET", path: "/api/admin/auth/me", rpc: "admin.auth.me" },
  { method: "GET", path: "/api/admin/relay/status", rpc: "admin.relay.status" },
  { method: "GET", path: "/api/admin/products/list", rpc: "admin.products.list" },
  { method: "GET", path: "/api/admin/orders/list", rpc: "admin.orders.list" }
];

export async function api(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === "/api/relay/status") {
    if (request.method !== "GET") {
      return methodNotAllowed();
    }
    return roomFetch(request, env, "/status");
  }
  if (url.pathname === "/api/relay/test") {
    if (request.method !== "POST") {
      return methodNotAllowed();
    }
    return dispatchRpc(request, env, "health.check");
  }
  if (url.pathname === "/api/setup/issue-token" || url.pathname === "/api/setup/init") {
    if (request.method !== "POST") {
      return methodNotAllowed();
    }
    return setupInit(request, env);
  }
  if (url.pathname === "/api/setup/rotate-token") {
    if (request.method !== "POST") {
      return methodNotAllowed();
    }
    return setupRotateToken(request, env);
  }

  const route = ROUTES.find((candidate) => candidate.method === request.method && candidate.path === url.pathname);
  if (!route) {
    return errorJson(404, "not_found", "API route is not available through relay");
  }

  if (isRateLimited(clientKey(request, url.pathname), 120, 60_000)) {
    return errorJson(429, "rate_limited", "Too many requests");
  }

  const cacheSeconds = Math.max(0, Number(env.PUBLIC_CACHE_SECONDS || "15"));
  if (route.rpc === "products.list" && !bearerToken(request)) {
    return cacheShort(url.toString(), cacheSeconds, () => dispatchRpc(request, env, route.rpc));
  }
  return dispatchRpc(request, env, route.rpc);
}

async function dispatchRpc(request: Request, env: Env, method: string): Promise<Response> {
  const url = new URL(request.url);
  const payload = await readPayload(request);
  const rpc: RpcRequest = {
    type: "rpc.request",
    id: newRequestId(),
    method,
    http: {
      method: request.method,
      path: url.pathname,
      query: Object.fromEntries(url.searchParams.entries())
    },
    auth: {
      token: bearerToken(request)
    },
    payload,
    idempotencyKey: request.headers.get("idempotency-key"),
    timeoutMs: Math.min(Math.max(Number(env.RPC_TIMEOUT_MS || "10000"), 1000), 120000)
  };
  return roomFetch(request, env, "/rpc", {
    method: "POST",
    body: JSON.stringify(rpc),
    headers: { "content-type": "application/json" }
  });
}

async function setupInit(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const body = (await readPayload(request)) as { serverId?: string };
  const serverId = sanitizeServerId(body.serverId || url.searchParams.get("server_id") || defaultServerId(env));
  const origin = url.origin;
  return roomFetchForServer(env, serverId, "/setup/init", {
    method: "POST",
    body: JSON.stringify({ serverId, origin }),
    headers: { "content-type": "application/json" }
  });
}

async function setupRotateToken(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const serverId = sanitizeServerId(url.searchParams.get("server_id") || defaultServerId(env));
  return roomFetchForServer(env, serverId, "/setup/rotate-token", {
    method: "POST",
    body: JSON.stringify({ origin: url.origin }),
    headers: { "content-type": "application/json" }
  });
}

function roomFetch(request: Request, env: Env, path: string, init?: RequestInit): Promise<Response> {
  const url = new URL(request.url);
  const serverId = sanitizeServerId(url.searchParams.get("server_id") || defaultServerId(env));
  return roomFetchForServer(env, serverId, path, init);
}

function roomFetchForServer(env: Env, serverId: string, path: string, init?: RequestInit): Promise<Response> {
  const id = env.SERVER_ROOMS.idFromName(serverId);
  const room = env.SERVER_ROOMS.get(id);
  return room.fetch(`https://room.internal${path}`, init);
}

async function readPayload(request: Request): Promise<unknown> {
  if (request.method === "GET" || request.method === "HEAD") {
    return {};
  }
  const text = await request.text();
  if (text.length > 64 * 1024) {
    throw new Error("request_too_large");
  }
  if (!text.trim()) {
    return {};
  }
  return JSON.parse(text);
}

function clientKey(request: Request, path: string): string {
  const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "unknown";
  return `${ip}:${path}`;
}
