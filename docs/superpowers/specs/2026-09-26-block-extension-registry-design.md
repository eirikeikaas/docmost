# First-party block extension registry

## Context

Docmost page “blocks” are TipTap/ProseMirror nodes. Today they are registered by hand in three places:

- Client editor: `apps/client/src/features/editor/extensions/extensions.ts` (`mainExtensions`)
- Collab / HTML / text: `apps/server/src/collaboration/collaboration.util.ts` (`tiptapExtensions`)
- Slash menu: `apps/client/src/features/editor/components/slash-menu/menu-items.ts` (`CommandGroups`)

There is no runtime plugin or marketplace system. This design adds an **internal, first-party** registry so new blocks register once and merge into those surfaces.

## Goals

- First-party / in-repo authors only (Docmost team and EE)
- v1 surfaces: TipTap schema node, optional React NodeView, slash-menu item(s)
- New blocks only — do not migrate existing callout/embed/drawio/etc. in this work
- Keep `@docmost/editor-ext` React-free for schema nodes (server-safe)

## Non-goals

- Third-party marketplace, dynamic install, or sandboxing
- Toolbar / bubble-menu / markdown contribution APIs
- Migrating existing hardcoded blocks
- Shipping a production demo block in the scaffolding PR

## Approach

**`defineBlock`-style modules + explicit `registerBlock` / `registerSchemaBlock`.**

Schema TipTap nodes live in `@docmost/editor-ext` and register via `registerSchemaBlock`. Client modules register a descriptor (node + optional `configureClient` + slash items) via `registerBlock`. Existing hardcoded lists stay; merge hooks append registry output.

### Descriptor (client)

```ts
type BlockExtension = {
  name: string;
  node: AnyExtension;
  configureClient?: (node: AnyExtension) => AnyExtension;
  slash?: {
    group: string;
    items: SlashMenuItemType[];
  };
};
```

### Package layout

| Concern | Location |
|--------|----------|
| Schema registry | `packages/editor-ext/src/lib/blocks/` |
| Client registry + block modules | `apps/client/src/features/editor/blocks/` |
| One-time merge hooks | `extensions.ts`, `menu-items.ts`, `collaboration.util.ts` |

### Registration flow

1. Define TipTap `Node` in `packages/editor-ext` and call `registerSchemaBlock(node)` (entry modules imported when `getSchemaExtensions()` runs).
2. Client block module: wire `configureClient` (React view), slash item(s), `registerBlock(descriptor)`.
3. Side-effect import the client module from `blocks/index.ts` so registration always runs.

### Merge points

- Client: `...getClientExtensions()` appended to `mainExtensions` (template/collab inherit via spread).
- Server: `...getSchemaExtensions()` appended to `tiptapExtensions`.
- Slash: registry items merged into groups before query filtering so search still applies.

### Defaults

- Duplicate block `name`: throw at register time.
- Slash items reuse existing `SlashMenuItemType` (`disable`, `requiresBases` supported).
- Unknown third-party blocks are out of scope (no marketplace).

## Testing

- Unit-test client registry with an in-test TipTap stub node (no production demo block).
- Cover schema register / duplicate name / `configureClient` / slash grouping via the same tests (client imports schema registry).

## Adding the next real block (checklist)

1. Schema node under `packages/editor-ext` + `registerSchemaBlock` (ensure entry import).
2. Client module under `apps/client/.../blocks/<name>/` with view, slash, `registerBlock`.
3. Import that module from `blocks/index.ts`.
4. No further edits to the three hardcoded lists beyond the existing merge hooks.
