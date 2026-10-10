# Block Extension Registry Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Ship an internal block registry so the next first-party custom block registers once and appears in the client editor, collab schema, and slash menu—without migrating existing blocks.

**Architecture:** TipTap schema nodes stay React-free in `@docmost/editor-ext` behind a schema registry. Client block modules register a descriptor (node + optional `configureClient` + slash items). Existing hardcoded lists remain; merge hooks append registry output.

**Tech Stack:** TipTap 3, React NodeViews, existing slash-menu types, Vitest.

## Global Constraints

- First-party only; no marketplace / dynamic load / sandbox
- Surfaces: schema node + optional React view + slash menu
- New blocks only; do not migrate callout/embed/etc.
- Duplicate names throw at register time
- No production demo block in scaffolding (tests use stubs)

---

## Task 1: Schema registry

- [ ] Add `packages/editor-ext/src/lib/blocks/registry.ts` with `registerSchemaBlock`, `getSchemaExtensions`
- [ ] Add `entries.ts` imported by `getSchemaExtensions` for future side-effect registrations
- [ ] Export from `packages/editor-ext/src/index.ts`

## Task 2: Client registry + tests

- [ ] Add `types.ts`, `registry.ts`, `index.ts` under `apps/client/src/features/editor/blocks/`
- [ ] Add `registry.test.ts` covering register, duplicate name, configureClient, slash groups

## Task 3: Wire merges

- [ ] Append `getClientExtensions()` in `extensions.ts`
- [ ] Merge slash items in `menu-items.ts` before query filter
- [ ] Append `getSchemaExtensions()` in `collaboration.util.ts`

## Task 4: Verify

- [ ] Run client Vitest for registry + document tests
- [ ] Commit, push, open PR
