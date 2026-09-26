import { IconCircleDashed } from "@tabler/icons-react";
import { Decision } from "@docmost/editor-ext";
import { registerBlock } from "@/features/editor/blocks/registry";
import DecisionView from "./decision-view";

registerBlock({
  name: "decision",
  node: Decision,
  configureClient: (node) =>
    node.configure({
      view: DecisionView,
    }),
  slash: {
    group: "basic",
    items: [
      {
        title: "Decision",
        description: "Record a decision that needs agreement.",
        searchTerms: [
          "decision",
          "decide",
          "decided",
          "consensus",
          "agreement",
        ],
        icon: IconCircleDashed,
        command: ({ editor, range }) => {
          editor.chain().focus().deleteRange(range).insertDecision().run();
        },
      },
    ],
  },
});
