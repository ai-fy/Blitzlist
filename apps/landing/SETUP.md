# apps/landing — Cloudflare Pages setup

Static landing page for `blitzlist.ai` apex.
Project name on Cloudflare: **`blitzlist-landing`**.
Live preview URL: https://blitzlist-landing.pages.dev/

## Deploy

```bash
pnpm --filter @blitzlist/landing run deploy
```

Pushes the contents of `dist/` to the `blitzlist-landing` Pages project's `main`
branch. Each deploy gets a unique `<hash>.blitzlist-landing.pages.dev` preview
URL; the production URL stays at `blitzlist-landing.pages.dev` (and once custom
domains are wired, at `blitzlist.ai`).

## Custom domain wiring (one-time, dashboard)

DNS for the zone `blitzlist.ai` is already on Cloudflare (apex + www are
proxied), so this is purely a routing step inside the Pages project.

1. Cloudflare dashboard → **Workers & Pages** → `blitzlist-landing`
2. Tab: **Custom domains** → **Set up a custom domain**
3. Add **`blitzlist.ai`** (the apex). Cloudflare will use the existing proxied
   A/AAAA records for the zone; no DNS edit required.
4. Repeat: **Set up a custom domain** → **`www.blitzlist.ai`**. After the cert
   provisions, optionally configure a Bulk Redirect: `www.blitzlist.ai/*` →
   `https://blitzlist.ai/$1` (301).
5. Wait ~30-60s for Cloudflare-edge cert issuance. Verify:
   `curl -sI https://blitzlist.ai/` → expect HTTP 200 with the Pages
   `cf-ray`/security headers.

If Cloudflare warns about conflicting DNS records: the existing apex points to
Cloudflare's proxy already; the Pages binding just claims that route. No action
needed.

## File layout

```
apps/landing/
├── dist/
│   ├── index.html      # the page (hand-edited HTML/CSS)
│   ├── _headers        # Pages-native security headers
│   └── _redirects      # (none yet — add if needed)
├── package.json        # deploy script
└── SETUP.md            # this file
```

No build step. Edit `dist/index.html` directly and re-run `pnpm run deploy`.

## Why no framework

Per ARCHITECTURE.md §16, the eventual web app on Pages will be Next.js (BL-013).
Until that lands, a single hand-edited HTML page is faster to ship and trivial
to maintain. When the Next.js app on BL-013 takes over the apex, this directory
folds into it and gets removed.

## Future deferred steps

- **Plausible / Cloudflare Web Analytics** — add a one-line script when we
  start a public push (HN, X, dev rel). Not before then; pre-launch traffic
  isn't worth measuring.
- **OG image** — current `og:image` is missing. Generate a 1200×630 PNG with
  the headline + brand bolt when we have shareable links going out.
- **`/install` deep-link page** — once Anthropic ships `claude://add-mcp?…`
  deep links, redirect `blitzlist.ai/install` straight into the connector add
  flow.
