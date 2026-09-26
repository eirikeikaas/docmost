import type { AnyExtension, Extension, Mark, Node } from "@tiptap/core";

type SchemaBlockExtension = AnyExtension | Node | Mark | Extension;

const schemaBlocks = new Map<string, SchemaBlockExtension>();

/**
 * Registers a TipTap schema extension for first-party custom blocks.
 *
 * Schema nodes stay React-free for collab/server consumption where
 * possible. Call this from a schema module imported via `entries.ts`
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
 * Entry modules are loaded from `blocks/index.ts` so registrations run
 * before callers read this list. Used by the collab server when building
 * `tiptapExtensions`.
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
