import { mergeAttributes, Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";

export interface RecentPagesOptions {
  HTMLAttributes: Record<string, any>;
  view: any;
}

export interface RecentPagesAttributes {
  limit?: number;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    recentPages: {
      insertRecentPages: (attributes?: RecentPagesAttributes) => ReturnType;
    };
  }
}

export const RecentPages = Node.create<RecentPagesOptions>({
  name: "recentPages",

  addOptions() {
    return {
      HTMLAttributes: {},
      view: null,
    };
  },

  group: "block",
  atom: true,
  draggable: true,
  isolating: true,

  addAttributes() {
    return {
      limit: {
        default: 5,
        parseHTML: (element) => Number(element.getAttribute("data-limit")) || 5,
        renderHTML: (attributes) => ({ "data-limit": attributes.limit }),
      },
    };
  },

  parseHTML() {
    return [{ tag: `div[data-type="${this.name}"]` }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(
        { "data-type": this.name },
        this.options.HTMLAttributes,
        HTMLAttributes,
      ),
    ];
  },

  addCommands() {
    return {
      insertRecentPages:
        (attributes) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: attributes }),
    };
  },

  addNodeView() {
    this.editor.isInitialized = true;

    return ReactNodeViewRenderer(this.options.view);
  },
});
