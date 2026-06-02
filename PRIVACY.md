# Blitzlist Privacy Policy

> Last updated: 2026-06-01
> Applies to: the hosted instance at `https://mcp.blitzlist.ai` and the Blitzlist source code (AGPL-3.0).
> For self-hosted instances: the operator who runs the instance is the data controller for their workspaces; this document describes data flows only.

## TL;DR

- **Hosted instance (`mcp.blitzlist.ai`)**: we store the items, documents, files, and comments you put into your workspace, plus OAuth tokens and an IP-keyed audit log. Data lives in Cloudflare's network (currently the WEUR region). We don't sell, share, or train AI models on it. You can export everything (BL-033, ships in v1.0) and self-host.
- **Self-hosted instances**: when you deploy Blitzlist on your own Cloudflare account, your data stays on your account. We have no access to it. Anthropic / your AI client receive only what you send through tool calls.

## What we collect — the hosted instance

When you use `https://mcp.blitzlist.ai`, the following is stored in our Cloudflare resources:

| Data | Where | Why |
|---|---|---|
| Items (titles, bodies, states, custom fields) | D1 database, WEUR region | Core product function |
| Comments | D1 database | Core product function |
| Activity log (who did what, when) | D1 database | Audit trail; renders in the web UI |
| OAuth client registrations (DCR) | OAUTH_KV namespace | OAuth flow for MCP clients |
| OAuth grants + access/refresh tokens (hashed) | OAUTH_KV namespace | OAuth flow; expires per token TTL |
| Authorization codes (transient) | OAUTH_KV namespace | OAuth flow; deleted after redemption |
| Workspace + user records | D1 database | Tenancy + authorship |
| Attachments (when BL-021 ships, v0.5) | R2 bucket | File-sharing feature |
| Request logs (IP, timestamp, status code) | Cloudflare Workers Logs | Operations + security |

We do **not** collect:
- Browsing history outside Blitzlist
- Device fingerprints
- Location data beyond approximate region from IP
- Email addresses (until BL-009 magic-link sign-in ships in v0.5; even then only on your explicit consent)

## What we do with it

- **Render it back to you** through MCP tools, the web UI (when v0.5 ships), and shareable links / OAuth-authenticated calls.
- **Power AI agents you've authorized.** When you connect Claude (Desktop, Code, or claude.ai) via OAuth, the AI client reads from and writes to your workspace using the tools you authorized. The AI provider (Anthropic) processes the data per their own policy; we don't control their processing.
- **Keep audit trails** so you can see what's changed.
- **Operational logs** for incident response.

We do **not**:
- Sell or share data with third parties.
- Use your data to train AI models.
- Run analytics that profile individual users beyond basic operational metrics.

## Who has access

For the hosted instance:
- **You** (and any teammates you invite or grant stakeholder access to). When stakeholder keys + magic-link ship in v0.5, access is per-identity.
- **Blitzlist operators** (initially: the project's maintainer) for incident response and operational reasons. Access is logged.
- **Cloudflare**, as the underlying infrastructure provider, has access to data at rest. See [Cloudflare's privacy policy](https://www.cloudflare.com/privacypolicy/).

For self-hosted instances, only the operator's Cloudflare account has access. Blitzlist maintainers cannot see your data.

## Retention

| Data | Retention |
|---|---|
| Items, comments, activity log | Indefinite — until you delete them or close the workspace |
| OAuth access tokens | Up to 1 hour (config: `accessTokenTTL`) |
| OAuth refresh tokens | Up to 30 days (config: `refreshTokenTTL`) |
| DCR client registrations | Up to 90 days (config: `clientRegistrationTTL`) |
| Authorization codes | Transient — deleted on exchange or after ~10 min |
| Request logs | 30 days (Cloudflare default) |

Deleted items and comments are soft-deleted for ~30 days and can be restored on request before being purged.

## Your rights

- **Export everything** — run `blz export <workspace>` (CLI ships with BL-033 in v1.0) to get a full archive of your workspace data in `blitzlist/` directory format. Self-hosters can drop this into their own instance for an instant migration.
- **Delete a workspace** — request via GitHub Discussions or email; we'll purge within 30 days.
- **Access logs** — request the audit log for your workspace.
- **Self-host** — at any time you can fork the (AGPL-3.0) repo, deploy on your own Cloudflare account, and import your export.

## Security

- All data encrypted in transit (TLS 1.3 via Cloudflare).
- OAuth tokens hashed at rest in KV.
- OAuth 2.1 + DCR + PKCE for client authentication.
- Workspace-scoped queries enforced at the application layer; no cross-tenant data leakage by construction.
- Self-host option for organizations that can't use SaaS.

Security issues: please contact privately rather than filing a public issue. See [CONTRIBUTING.md § Code of conduct](./CONTRIBUTING.md).

## Children

Blitzlist is not directed at users under 13. We do not knowingly collect data from children.

## International transfers

The hosted instance currently runs in Cloudflare's WEUR (Western Europe) region. Cloudflare may replicate data to nearby regions for performance; see their privacy policy for specifics.

## Changes to this policy

We'll update the "Last updated" date at the top whenever this changes substantively. For material changes, we'll also note them in DECISIONS.md.

## Contact

- GitHub Discussions on the Blitzlist repo
- Once we have a contact page on `blitzlist.ai` (v0.5+), use the email there
- Security issues: see above

---

**For self-hosters:** copy this file into your own deployment and customize. The data flows are determined by your Cloudflare account; the user-facing behavior of Blitzlist is governed by your operational decisions, not ours.
