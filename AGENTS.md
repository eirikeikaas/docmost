# AGENTS.md

Instructions for AI coding agents working in this repository.

## Off-limits: Enterprise-licensed code

Docmost dual-licenses this repo. Root/core code is AGPLv3. The following
paths are under a separate, proprietary "Docmost Enterprise License" that
forbids copying, merging, publishing, distributing, sublicensing, or
selling without a paid Enterprise subscription (see each path's own
`LICENSE` file, and the root `README.md`'s "License" section):

- `apps/server/src/ee` — a private git submodule (`docmost/ee`). It is
  intentionally not checked out in most environments.
- `apps/client/src/ee` — physically present in this checkout, but still
  under the Enterprise License, not AGPL.
- `packages/ee`
- `packages/base-formula` — not listed in the README's split, but its own
  `LICENSE` file independently asserts the same Enterprise terms.

**These four paths are completely off-limits, full stop:**

- Never read, open, search inside, quote, summarize, or otherwise
  reference any file under these paths — even though `apps/client/src/ee`
  and `packages/base-formula` are physically present and technically
  readable, treat them exactly like the inaccessible private submodule.
- Never modify, move, or delete anything under these paths.
- Never suggest or run `git submodule update --init` (or any equivalent)
  for `apps/server/src/ee`.
- Never attempt to clone, fetch, or add the `docmost/ee` GitHub repository
  by any means (git, GitHub tooling, web requests).

**Searching and subagents:**

- Every recursive `grep`/`rg`/`find`/glob over `apps/` or `packages/` must
  exclude these paths (e.g. `--exclude-dir=ee`, `--glob '!**/ee/**'`, and
  skip `packages/base-formula`). If a result lists a file under them,
  discard it unread and do not follow up.
- Subagents (Explore, general-purpose, ...) do not reliably inherit this
  file. Copy the four off-limits paths and the exclude rule into every
  subagent prompt.
- If a task seems to require knowing how the Enterprise implementation
  works, stop and ask the user. Use the CE-side interface (feature enums,
  license/feature-check services, migrations) instead of looking inside.
- `.claude/hooks/block-ee.mjs` enforces the above for Claude Code. A block
  from it is not a bug to work around.

When a task calls for functionality that the real Docmost Enterprise
Edition also happens to offer (SSO, SCIM, MFA, audit logs, etc.), design
and implement it independently: work from the public protocol specs
(SAML, OIDC, SCIM 2.0/RFC 7644, ...) and from this repo's own CE/AGPL code
(database migrations, feature flags, existing services) — never by
reading, reverse-engineering, or mirroring the Enterprise-licensed
implementation. Route names, file layouts, and contracts should be your
own design, not a copy of Docmost's.

## Repository layout

Nx + pnpm monorepo. `apps/server` (NestJS + Fastify + Kysely/Postgres),
`apps/client` (React + Vite + Mantine), `packages/*` (shared libraries).
