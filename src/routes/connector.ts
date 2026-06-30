import type { Env } from "../env";
import { defaultServerId, sanitizeServerId } from "../env";

export function connector(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const serverId = sanitizeServerId(url.searchParams.get("server_id") || defaultServerId(env));
  const id = env.SERVER_ROOMS.idFromName(serverId);
  const room = env.SERVER_ROOMS.get(id);
  return room.fetch(request);
}
