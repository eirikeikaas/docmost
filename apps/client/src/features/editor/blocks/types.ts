import type { AnyExtension } from "@tiptap/core";
import type {
  SlashMenuGroupedItemsType,
  SlashMenuItemType,
} from "@/features/editor/components/slash-menu/types";

export type BlockSlashContribution = {
  group: string;
  items: SlashMenuItemType[];
};

export type BlockExtension = {
  name: string;
  node: AnyExtension;
  configureClient?: (node: AnyExtension) => AnyExtension;
  slash?: BlockSlashContribution;
};

export type { SlashMenuGroupedItemsType, SlashMenuItemType };
