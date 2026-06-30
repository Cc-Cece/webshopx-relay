import type { Env } from "../env";
import { errorJson, json } from "../relay/errors";
import type { RpcRequest, RpcResponse } from "../relay/rpc";
import { generateConnectorToken, safeEqual, sha256Hex } from "../relay/token";

type PendingRpc = {
  resolve: (value: RpcResponse) => void;
  timer: ReturnType<typeof setTimeout>;
  createdAt: number;
};

type SetupState = {
  serverId: string;
  connectorTokenHash: string;
  createdAt: string;
  protocolVersion: number;
};

export class ServerRoom implements DurableObject {
  private socket: WebSocket | null = null;
  private serverId: string | null = null;
  private connectedAt: number | null = null;
  private lastHeartbeatAt: number | null = null;
  private lastHello: Record<string, unknown> | null = null;
  private lastError: string | null = null;
  private readonly pending = new Map<string, PendingRpc>();

  constructor(private readonly state: DurableObjectState, private readonly env: Env) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/connector/ws") {
      return this.handleConnector(request);
    }
    if (url.pathname === "/rpc") {
      if (request.method !== "POST") {
        return errorJson(405, "method_not_allowed", "Method not allowed");
      }
      const payload = (await request.json()) as RpcRequest;
      return this.handleRpc(payload);
    }
    if (url.pathname === "/status") {
      return json(await this.status());
    }
    if (url.pathname === "/setup/init") {
      if (request.method !== "POST") {
        return errorJson(405, "method_not_allowed", "Method not allowed");
      }
      const body = (await request.json().catch(() => ({}))) as { serverId?: string; origin?: string };
      return json(await this.initialize(body.serverId || "main", body.origin || ""));
    }
    if (url.pathname === "/setup/rotate-token") {
      if (request.method !== "POST") {
        return errorJson(405, "method_not_allowed", "Method not allowed");
      }
      const body = (await request.json().catch(() => ({}))) as { origin?: string };
      const state = await this.readSetupState();
      return json(await this.initialize(state?.serverId || "main", body.origin || ""));
    }
    return errorJson(404, "not_found", "Route not found");
  }

  private async handleConnector(request: Request): Promise<Response> {
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
      return errorJson(426, "upgrade_required", "Expected WebSocket upgrade");
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    server.accept();
    server.addEventListener("message", (event) => {
      void this.handleSocketMessage(server, event.data);
    });
    server.addEventListener("close", () => this.clearSocket(server, "closed"));
    server.addEventListener("error", () => this.clearSocket(server, "websocket_error"));
    return new Response(null, { status: 101, webSocket: client });
  }

  private async handleSocketMessage(socket: WebSocket, data: unknown): Promise<void> {
    if (typeof data !== "string") {
      return;
    }
    let message: Record<string, unknown>;
    try {
      message = JSON.parse(data) as Record<string, unknown>;
    } catch {
      this.lastError = "invalid_json";
      return;
    }
    const type = String(message.type || "");
    if (type === "hello") {
      await this.handleHello(socket, message);
      return;
    }
    if (type === "pong" || type === "ping") {
      this.lastHeartbeatAt = Date.now();
      if (type === "ping") {
        socket.send(JSON.stringify({ type: "pong", time: new Date().toISOString() }));
      }
      return;
    }
    if (type === "rpc.response") {
      this.handleRpcResponse(message as RpcResponse);
    }
  }

  private async handleHello(socket: WebSocket, message: Record<string, unknown>): Promise<void> {
    const setup = await this.readSetupState();
    const token = String(message.token || "");
    const serverId = String(message.serverId || setup?.serverId || "main");
    if (!setup) {
      this.lastError = "setup_required";
      socket.send(JSON.stringify({ type: "hello.ack", ok: false, error: "setup_required" }));
      socket.close(1008, "setup_required");
      return;
    }
    const tokenHash = await sha256Hex(token);
    if (serverId !== setup.serverId || !safeEqual(tokenHash, setup.connectorTokenHash)) {
      this.lastError = "connector_auth_failed";
      socket.send(JSON.stringify({ type: "hello.ack", ok: false, error: "connector_auth_failed" }));
      socket.close(1008, "connector_auth_failed");
      return;
    }
    if (this.socket && this.socket !== socket) {
      this.socket.close(1000, "replaced");
    }
    this.socket = socket;
    this.serverId = serverId;
    this.connectedAt = Date.now();
    this.lastHeartbeatAt = this.connectedAt;
    this.lastHello = {
      time: new Date().toISOString(),
      serverId,
      protocolVersion: message.protocolVersion,
      pluginVersion: message.pluginVersion,
      minecraftVersion: message.minecraftVersion,
      capabilities: message.capabilities
    };
    this.lastError = null;
    socket.send(JSON.stringify({ type: "hello.ack", ok: true, serverTime: new Date().toISOString() }));
  }

  private async handleRpc(request: RpcRequest): Promise<Response> {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return json(
        { ok: false, status: 503, error: { code: "server_offline", message: "WebShopX plugin is offline" } },
        { status: 503 }
      );
    }
    const timeoutMs = Math.min(Math.max(Number(request.timeoutMs || 8000), 1000), 120000);
    const response = await new Promise<RpcResponse>((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(request.id);
        resolve({
          type: "rpc.response",
          id: request.id,
          ok: false,
          status: 504,
          error: { code: "server_timeout", message: "WebShopX plugin did not respond in time" }
        });
      }, timeoutMs);
      this.pending.set(request.id, { resolve, timer, createdAt: Date.now() });
      this.socket?.send(JSON.stringify(request));
    });
    return json(response.ok ? response.payload || {} : response.error || {}, {
      status: response.status || (response.ok ? 200 : 500)
    });
  }

  private handleRpcResponse(response: RpcResponse): void {
    const pending = this.pending.get(response.id);
    if (!pending) {
      return;
    }
    clearTimeout(pending.timer);
    this.pending.delete(response.id);
    pending.resolve(response);
  }

  private clearSocket(socket: WebSocket, reason: string): void {
    if (this.socket !== socket) {
      return;
    }
    this.socket = null;
    this.connectedAt = null;
    this.lastError = reason;
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      this.pending.delete(id);
      pending.resolve({
        type: "rpc.response",
        id,
        ok: false,
        status: 503,
        error: { code: "server_offline", message: "WebShopX plugin disconnected" }
      });
    }
  }

  private async initialize(serverId: string, origin: string): Promise<Record<string, unknown>> {
    const token = generateConnectorToken();
    const setup: SetupState = {
      serverId,
      connectorTokenHash: await sha256Hex(token),
      createdAt: new Date().toISOString(),
      protocolVersion: 1
    };
    await this.state.storage.put("setup", setup);
    this.serverId = serverId;
    this.lastError = null;
    return {
      ok: true,
      serverId,
      connectorToken: token,
      config: pluginConfig(origin, serverId, token),
      status: await this.status()
    };
  }

  private async status(): Promise<Record<string, unknown>> {
    const setup = await this.readSetupState();
    return {
      ok: true,
      initialized: Boolean(setup),
      durableObject: true,
      serverId: setup?.serverId || this.serverId || "main",
      connected: Boolean(this.socket && this.socket.readyState === WebSocket.OPEN),
      connectedAt: this.connectedAt ? new Date(this.connectedAt).toISOString() : null,
      lastHeartbeatAt: this.lastHeartbeatAt ? new Date(this.lastHeartbeatAt).toISOString() : null,
      lastError: this.lastError,
      lastHello: this.lastHello,
      pendingRpc: this.pending.size,
      protocolVersion: setup?.protocolVersion || 1,
      tokenConfigured: Boolean(setup?.connectorTokenHash)
    };
  }

  private async readSetupState(): Promise<SetupState | null> {
    return (await this.state.storage.get<SetupState>("setup")) || null;
  }
}

function pluginConfig(origin: string, serverId: string, token: string): string {
  const endpoint = origin || "https://webshopx-relay.example.workers.dev";
  return `deployment:
  mode: cloudflare-relay

cloudflare-relay:
  enabled: true
  endpoint: "${endpoint}"
  server-id: "${serverId}"
  connector-token: "${token}"
  websocket-path: "/connector/ws"
  heartbeat-seconds: 30
  reconnect-min-seconds: 3
  reconnect-max-seconds: 60
  rpc-timeout-seconds: 10
`;
}
