import type { Env } from "../env";
import { defaultServerId } from "../env";
import { json } from "../relay/errors";

export function health(request: Request, env: Env): Response {
  return json({
    status: "ok",
    app: env.PUBLIC_APP_NAME || "WebShopX",
    defaultServerId: defaultServerId(env),
    time: new Date().toISOString(),
    url: new URL(request.url).origin
  });
}
