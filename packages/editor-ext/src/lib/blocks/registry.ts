import type { AnyExtension, Extension, Mark, Node } from "@tiptap/core";
import "./entries";

type SchemaBlockExtension = AnyExtension | Node | Mark | Extension;

const schemaBlocks = new Map<string, SchemaBlockExtension>();

/**
 * Registers a TipTap schema extension for first-party custom blocks.
 *
 * Schema nodes stay React-free in `@docmost/editor-ext` so the collab
 * server can load the same document model as the client. Call this from
 * a schema module (and ensure that module is imported via `entries.ts`)
 * so `getSchemaExtensions()` includes the node for HTML/Ydoc transforms.
 *
 * @param extension - TipTap node, mark, or extension to register
 * @returns void
 */
export function registerSchemaBlock(extension: SchemaBlockExtension): void {
  const name = extension.name;

  if (!name) {
    throw new Error("registerSchemaBlock: extension must have a name");
  }

  if (schemaBlocks.has(name)) {
    throw new Error(
      `registerSchemaBlock: duplicate schema block name "${name}"`,
    );
  }

  schemaBlocks.set(name, extension);
}

/**
 * Returns schema extensions registered for first-party custom blocks.
 *
 * Entry modules are loaded via the `./entries` side-effect import so
 * block schema registrations run before this map is read. Used by the
 * collab server when building `tiptapExtensions`.
 *
 * @returns Registered TipTap schema extensions in registration order
 */
export function getSchemaExtensions(): SchemaBlockExtension[] {
  return Array.from(schemaBlocks.values());
}

/**
 * Clears the schema block registry. Intended for unit tests only.
 *
 * @returns void
 */
export function clearSchemaBlocksForTests(): void {
  schemaBlocks.clear();
}
