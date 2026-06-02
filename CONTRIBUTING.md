# Contributing to Blitzlist

Thanks for considering a contribution. This guide covers the two paths in: **proposing requirements** (no code required) and **contributing code**.

If you've already read [README.md](./README.md), you've seen the broad strokes. This document adds the practical details.

---

## Two ways to contribute

### 1. Propose a requirement, document, or fix (no code required)

Anyone can propose a new requirement, document, or improvement without writing code. The bootstrap convention treats this repository's `blitzlist/items/` directory as the live backlog.

To propose something:

1. Fork the repo.
2. Add a Markdown file under `blitzlist/items/BL-XXX-your-slug.md` — use `XXX` as a placeholder ID; the sync engine assigns the real ID when your PR merges.
3. Follow the front-matter schema documented in [`blitzlist/README.md`](./blitzlist/README.md).
4. Open a PR. Maintainers review like any code change.

You do NOT need to sign the CLA for documentation-only or backlog-item-only contributions — that requirement is specifically for code contributions to source files.

### 2. Contribute code

Pick any item in [`blitzlist/items/`](./blitzlist/items/) labeled `state: draft` or `state: proposed` and open a PR implementing it. Each item's acceptance criteria are the test plan.

For larger work or architectural questions, open a [GitHub Discussion](https://github.com/ai-fy/Blitzlist/discussions) first.

---

## Development setup

```bash
git clone https://github.com/ai-fy/Blitzlist.git
cd blitzlist
corepack enable                    # if you don't already have pnpm
pnpm install                       # ~9 seconds on a clean clone
pnpm typecheck                     # verify TypeScript across workspace
pnpm build                         # turbo builds; api package bundles a Worker
pnpm --filter @blitzlist/api dev   # run the Worker locally on :8787
```

You need Node 22+ and pnpm 9+. The [`.nvmrc`](./.nvmrc) pins the Node version; `nvm use` picks it up automatically.

See [`apps/api/README.md`](./apps/api/README.md) for Worker-specific dev/deploy commands.

---

## Contributor License Agreement

### Why we have a CLA

Blitzlist is licensed under [AGPL-3.0](./LICENSE) so the code stays open and SaaS-clone risks stay manageable. Some enterprise customers can't use AGPL-3.0 software for compliance reasons; we offer a **commercial license** to them as an alternative.

For both to work, the project's maintainers need to retain the right to license the codebase commercially in addition to AGPL-3.0. Without a CLA, every contributor's code is locked permanently under AGPL-3.0, and we can't offer the commercial alternative — which removes a revenue stream that funds continued development of the OSS version.

The CLA also preserves our ability to evolve the license in the future if circumstances change (e.g., MongoDB's AGPL → SSPL move in 2018, or HashiCorp's MIT → BUSL move in 2023). Both happened because those companies had CLAs in place.

### What the CLA actually says

The full text lives at [`CLA.md`](./CLA.md) (TODO: add the canonical Apache CCLA template). In plain English:

- **You keep ownership of your contribution.** You can use your code anywhere, including in other projects under any license.
- **You grant Blitzlist** a perpetual, worldwide, royalty-free license to use, modify, sublicense, and relicense your contribution.
- **You confirm you have the right to grant this license** — i.e., the code is yours to contribute (not stolen from a previous employer, not infringing patents you know of).
- **You disclaim warranties** — the contribution is provided "as-is."

You sign the CLA once. It covers all your future contributions.

### How to sign

When you open your first PR, **[CLA Assistant](https://cla-assistant.io/)** will comment automatically with a sign-in link. Sign in with your GitHub account, click "I agree," done — about 30 seconds. Subsequent PRs don't require re-signing.

If you'd prefer not to sign the CLA, you can still:
- Open issues
- Propose backlog items (`blitzlist/items/*.md` files only)
- Open documentation-only PRs (`*.md` files outside `blitzlist/items/` are evaluated case-by-case)

Code PRs require the CLA.

---

## Code style

- **TypeScript strict mode**, including `noUncheckedIndexedAccess`. The base config is at [`tsconfig.base.json`](./tsconfig.base.json).
- **No ESLint config yet** — we'll add one in a v0.5 polish item (likely `@typescript-eslint` recommended-strict).
- **Indent with tabs**, line width 100. Prettier config arrives with ESLint.
- **Imports**: relative within a package, `@blitzlist/*` between packages, `node:` prefix for built-ins.
- **Avoid magic strings** — define constants in `packages/core` where possible.

---

## Commit messages

We follow [**Conventional Commits**](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short summary>

<optional body>

<optional footers>
```

Common types: `feat`, `fix`, `refactor`, `docs`, `chore`, `test`, `ci`.

Examples:

```
feat(api): add /healthz route
fix(db): correct cascade-delete on item_groups
docs(blitzlist): clarify sync conflict resolution rules
```

If your PR closes a backlog item, reference it: `feat(api): add list_items MCP tool (closes BL-006)`.

---

## Pull request checklist

Before opening a PR:

- [ ] `pnpm typecheck` passes
- [ ] `pnpm build` passes
- [ ] Tests pass (once we have them — for v0.1 items, manual verification is documented in the item's acceptance criteria)
- [ ] If you closed a backlog item, the item file's state is updated to `done` and acceptance-criteria checkboxes are ticked
- [ ] PR title follows Conventional Commits
- [ ] CLA Assistant has confirmed your signature (auto-checked on PR submission)

---

## Code of conduct

Be kind. Be specific. Disagree with ideas, not people. If something feels off, email the maintainer privately first — public callouts are a last resort, not a first reflex.

We'll add a formal CODE_OF_CONDUCT.md before going fully public (likely adopting the [Contributor Covenant](https://www.contributor-covenant.org/)).

---

## Questions?

- **Quick questions**: [GitHub Discussions](https://github.com/ai-fy/Blitzlist/discussions)
- **Bug reports / feature requests**: open a GitHub Issue (which we may convert into a `blitzlist/items/` entry)
- **Commercial licensing inquiries**: see [README.md § Commercial licensing](./README.md#commercial-licensing)
- **Security**: email the maintainer privately at the address on the maintainer's GitHub profile; **do not** post security issues publicly
