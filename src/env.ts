export interface Env {
  ASSETS: Fetcher;
  SERVER_ROOMS: DurableObjectNamespace;
  PUBLIC_APP_NAME?: string;
  DEFAULT_SERVER_ID?: string;
  PUBLIC_CACHE_SECONDS?: string;
  RPC_TIMEOUT_MS?: string;
}

export function defaultServerId(env: Env): string {
  return sanitizeServerId(env.DEFAULT_SERVER_ID || "main");
}

export function sanitizeServerId(raw: string | null | undefined): string {
  const value = String(raw || "").trim();
  if (!value) {
    return "main";
  }
  return value.replace(/[^A-Za-z0-9_.:-]/g, "_").slice(0, 64) || "main";
}

export function workerOrigin(request: Request): string {
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}
