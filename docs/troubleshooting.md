# Troubleshooting

Open `/setup` first. It reports whether the Worker, Durable Object, and plugin connection are healthy.

Common checks:

- Plugin offline: verify `deployment.mode: cloudflare-relay`, endpoint, server id, and token.
- Token error: regenerate the token in `/setup` and paste the new snippet into `config.yml`.
- Wrong endpoint: use the exact workers.dev or custom domain shown on `/setup`.
- Network blocked: the Minecraft server must reach outbound `443` for `https://` and `wss://`.
- Durable Object missing: run `wrangler deploy` again and confirm the migration succeeded.
- Old frontend assets: clear browser cache or redeploy Static Assets.

The Worker only relays allowlisted RPC methods. It does not execute Minecraft commands or SQL.
