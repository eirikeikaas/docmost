import { IconListCheck } from "@tabler/icons-react";
import { DecisionCatalog } from "@docmost/editor-ext";
import { registerBlock } from "@/features/editor/blocks/registry";
import DecisionCatalogView from "./decision-catalog-view";

registerBlock({
  name: "decisionCatalog",
  node: DecisionCatalog,
  configureClient: (node) =>
    node.configure({
      view: DecisionCatalogView,
    }),
  slash: {
    group: "basic",
    items: [
      {
        title: "Decision catalog",
        description: "List decisions from pages in this space.",
        searchTerms: [
          "decision",
          "catalog",
          "report",
          "decisions",
          "rollup",
        ],
        icon: IconListCheck,
        command: ({ editor, range }) => {
          editor
            .chain()
            .focus()
            .deleteRange(range)
            .insertDecisionCatalog()
            .run();
        },
      },
    ],
  },
});
