# `@blitzlist/api`

The Blitzlist API Worker — Hono on Cloudflare Workers. Hosts:

- `/api/*` — REST for the web UI
- `/mcp` — Streamable HTTP MCP endpoint (BL-005)
- `/oauth/*` — OAuth 2.1 + DCR authorization server (BL-010)
- `/webhooks/*` — GitHub + Vercel webhook receivers (BL-018, BL-028)

## Development

```bash
# from the repo root:
pnpm install
pnpm --filter @blitzlist/api dev
```

`wrangler dev` runs the Worker locally on `:8787` using miniflare. No real
Cloudflare resources needed for local development.

## Provisioning real Cloudflare resources

For preview/prod deployment, the D1 database, KV namespace, R2 bucket, and
(when ready) Durable Object bindings need real IDs. Either:

- Run the manual setup commands (`wrangler d1 create blitzlist-dev`, etc.)
  and paste the IDs into `wrangler.toml`, OR
- Use the one-click "Deploy to Cloudflare" template (ships in BL-017).

## Deploying

```bash
pnpm --filter @blitzlist/api deploy
```

Deploys to the worker name set in `wrangler.toml`. For preview environments,
use `--env preview`.

## What's in here

- `src/` — TypeScript source for the Worker
- `wrangler.toml` — bindings, compatibility flags, observability settings
- `migrations/` — D1 migration SQL files (added in BL-004)
