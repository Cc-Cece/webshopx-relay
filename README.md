# WebShopX Cloudflare Relay

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/WebShopX/webshopx-cloudflare-relay)

Cloudflare Relay keeps the WebShopX plugin as the business backend. Workers provide the public HTTPS entry, static assets, setup page, and RPC relay. The Minecraft server only needs outbound access to `https://` / `wss://` on port `443`.

## Quick Start

1. Click **Deploy to Cloudflare**.
2. Open `/setup` after deployment.
3. Generate the plugin config.
4. Paste it into `plugins/WebShopX/config.yml`.
5. Restart or reload WebShopX.
6. Return to `/setup` and confirm the plugin is connected.

This relay does not replace the WebShopX plugin. The Minecraft server must run WebShopX and connect outbound to Cloudflare.

## Local Development

```bash
npm install
npm run dev
npm run typecheck
```

## Configuration Snippet

`/setup` generates a snippet like this:

```yaml
deployment:
  mode: cloudflare-relay

cloudflare-relay:
  enabled: true
  endpoint: "https://webshopx-relay.example.workers.dev"
  server-id: "main"
  connector-token: "wsxcr_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
  websocket-path: "/connector/ws"
  heartbeat-seconds: 30
  reconnect-min-seconds: 3
  reconnect-max-seconds: 60
  rpc-timeout-seconds: 10
```

## Relay Routes

- `GET /health`
- `GET /setup`
- `POST /api/setup/init`
- `POST /api/setup/rotate-token`
- `GET /connector/ws?server_id=main`
- `GET /api/relay/status`
- `POST /api/relay/test`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/logout`
- `GET /api/products`
- `POST /api/orders`
- `GET /api/orders/list`
- `POST /api/admin/auth/login`
- `GET /api/admin/auth/me`
- `GET /api/admin/relay/status`
- `GET /api/admin/products/list`
- `GET /api/admin/orders/list`

Cloudflare Free can be enough to start, but it is not unlimited. Avoid high-frequency admin polling and unnecessary dynamic requests.
