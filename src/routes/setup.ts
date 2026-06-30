import type { Env } from "../env";
import { defaultServerId, sanitizeServerId, workerOrigin } from "../env";

export async function setup(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const serverId = sanitizeServerId(url.searchParams.get("server_id") || defaultServerId(env));
  const status = await statusFor(env, serverId);
  const origin = workerOrigin(request);
  return new Response(renderSetup(origin, serverId, status), {
    headers: { "content-type": "text/html; charset=utf-8" }
  });
}

async function statusFor(env: Env, serverId: string): Promise<Record<string, unknown>> {
  const id = env.SERVER_ROOMS.idFromName(serverId);
  const room = env.SERVER_ROOMS.get(id);
  return (await room.fetch("https://room.internal/status").then((res) => res.json())) as Record<string, unknown>;
}

function renderSetup(origin: string, serverId: string, status: Record<string, unknown>): string {
  const initialized = Boolean(status.initialized);
  const connected = Boolean(status.connected);
  const wsUrl = origin.replace(/^http:/, "ws:").replace(/^https:/, "wss:") + `/connector/ws?server_id=${encodeURIComponent(serverId)}`;
  const statusText = connected ? "Connected" : initialized ? "Waiting for plugin" : "Not initialized";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>WebShopX Relay Setup</title>
  <style>
    :root { color-scheme: light dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { margin: 0; background: #f7f7f8; color: #171717; }
    main { max-width: 980px; margin: 0 auto; padding: 32px 20px 56px; }
    h1 { font-size: 28px; margin: 0 0 8px; letter-spacing: 0; }
    h2 { font-size: 17px; margin: 28px 0 10px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }
    .card, pre { border: 1px solid #dedee3; background: #fff; border-radius: 8px; padding: 14px; }
    .label { color: #666; font-size: 12px; }
    .value { font-weight: 650; margin-top: 4px; overflow-wrap: anywhere; }
    button, a.button { appearance: none; border: 1px solid #1f6feb; background: #1f6feb; color: white; border-radius: 6px; padding: 9px 12px; font-weight: 650; cursor: pointer; text-decoration: none; display: inline-flex; align-items: center; gap: 8px; margin: 6px 8px 6px 0; }
    button.secondary, a.secondary { background: #fff; color: #1f2937; border-color: #c9ccd4; }
    pre { overflow: auto; min-height: 160px; white-space: pre-wrap; }
    code { overflow-wrap: anywhere; }
    .ok { color: #0b7a33; }
    .warn { color: #9a5a00; }
    @media (prefers-color-scheme: dark) {
      body { background: #111214; color: #ededed; }
      .card, pre, button.secondary, a.secondary { background: #191b1f; border-color: #30343a; color: #ededed; }
      .label { color: #a8acb3; }
    }
  </style>
</head>
<body>
<main>
  <h1>WebShopX Relay Setup</h1>
  <p class="${connected ? "ok" : "warn"}">${escapeHtml(statusText)}</p>
  <div class="grid">
    ${info("Worker URL", origin)}
    ${info("Shop URL", origin + "/")}
    ${info("Admin URL", origin + "/admin.html")}
    ${info("WebSocket URL", wsUrl)}
    ${info("Server ID", serverId)}
    ${info("Plugin", connected ? "online" : "offline")}
    ${info("Last heartbeat", String(status.lastHeartbeatAt || "none"))}
    ${info("Protocol", String(status.protocolVersion || 1))}
  </div>
  <h2>Plugin config</h2>
  <pre id="config">${initialized ? "Token is only shown when generated. Regenerate a token if you need a fresh config snippet." : "Click Generate config to initialize this relay."}</pre>
  <button id="init">Generate config</button>
  <button class="secondary" id="rotate">Regenerate token</button>
  <button class="secondary" id="copy">Copy config</button>
  <button class="secondary" id="test">Test API</button>
  <a class="button secondary" href="/">Open shop</a>
  <a class="button secondary" href="/admin.html">Open admin</a>
  <h2>Diagnostics</h2>
  <pre id="diag">${escapeHtml(JSON.stringify(status, null, 2))}</pre>
</main>
<script>
const serverId = ${JSON.stringify(serverId)};
async function post(path) {
  const res = await fetch(path + "?server_id=" + encodeURIComponent(serverId), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ serverId })
  });
  const data = await res.json();
  document.getElementById("diag").textContent = JSON.stringify(data, null, 2);
  if (data.config) document.getElementById("config").textContent = data.config;
}
document.getElementById("init").onclick = () => post("/api/setup/init");
document.getElementById("rotate").onclick = () => post("/api/setup/rotate-token");
document.getElementById("copy").onclick = () => navigator.clipboard.writeText(document.getElementById("config").textContent);
document.getElementById("test").onclick = () => post("/api/relay/test");
</script>
</body>
</html>`;
}

function info(label: string, value: string): string {
  return `<div class="card"><div class="label">${escapeHtml(label)}</div><div class="value"><code>${escapeHtml(value)}</code></div></div>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char] || char));
}
