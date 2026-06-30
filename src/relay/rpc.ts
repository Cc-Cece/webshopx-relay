export type RpcResponse = {
  type: "rpc.response";
  id: string;
  ok: boolean;
  status: number;
  payload?: unknown;
  error?: {
    code: string;
    message: string;
  };
};

export type RpcRequest = {
  type: "rpc.request";
  id: string;
  method: string;
  http: {
    method: string;
    path: string;
    query: Record<string, string>;
  };
  auth: {
    token: string | null;
  };
  payload: unknown;
  idempotencyKey: string | null;
  timeoutMs: number;
};

export function newRequestId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return "req_" + [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
