import type { AnyExtension } from "@tiptap/core";
import type {
  BlockExtension,
  SlashMenuGroupedItemsType,
} from "@/features/editor/blocks/types";

const blocks = new Map<string, BlockExtension>();

/**
 * Registers a first-party client block (schema node, optional view, slash).
 *
 * Call from a block module that is imported by `blocks/index.ts` so the
 * registration always runs at editor boot. Schema nodes should also be
 * registered with `registerSchemaBlock` in `@docmost/editor-ext` so the
 * collab server shares the same document model.
 *
 * @param block - Client block descriptor to register
 * @returns void
 */
export function registerBlock(block: BlockExtension): void {
  if (!block?.name) {
    throw new Error("registerBlock: block must have a name");
  }

  if (blocks.has(block.name)) {
    throw new Error(`registerBlock: duplicate block name "${block.name}"`);
  }

  if (!block.node) {
    throw new Error(`registerBlock: block "${block.name}" must have a node`);
  }

  blocks.set(block.name, block);
}

/**
 * Returns TipTap extensions for registered client blocks.
 *
 * Applies `configureClient` when provided (e.g. attach a React NodeView);
 * otherwise returns the bare schema node.
 *
 * @returns Configured TipTap extensions in registration order
 */
export function getClientExtensions(): AnyExtension[] {
  return Array.from(blocks.values()).map((block) =>
    block.configureClient ? block.configureClient(block.node) : block.node,
  );
}

/**
 * Returns slash-menu contributions grouped by category key.
 *
 * Items are appended into existing slash groups (e.g. `basic`) by the
 * menu merger; unknown group keys create new groups.
 *
 * @returns Slash menu items keyed by group name
 */
export function getSlashItems(): SlashMenuGroupedItemsType {
  const grouped: SlashMenuGroupedItemsType = {};

  for (const block of blocks.values()) {
    if (!block.slash?.items?.length) {
      continue;
    }

    const group = block.slash.group || "basic";
    if (!grouped[group]) {
      grouped[group] = [];
    }
    grouped[group].push(...block.slash.items);
  }

  return grouped;
}

/**
 * Clears the client block registry. Intended for unit tests only.
 *
 * @returns void
 */
export function clearBlocksForTests(): void {
  blocks.clear();
}
