/**
 * Side-effect barrel for first-party client block modules.
 *
 * Import each block's register module here so `registerBlock(...)` runs
 * before the editor and slash menu read the registry. Example:
 *
 *   import "./poll";
 *
 * Existing hardcoded blocks are not migrated through this barrel.
 */
export {
  registerBlock,
  getClientExtensions,
  getSlashItems,
  clearBlocksForTests,
} from "./registry";
export type {
  BlockExtension,
  BlockSlashContribution,
} from "./types";
