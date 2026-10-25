import { mergeAttributes, Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";

export type DecisionStatus = "undecided" | "decided";

export interface DecisionOptions {
  HTMLAttributes: Record<string, any>;
  view: any;
}

export interface DecisionAttributes {
  status: DecisionStatus;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    decision: {
      insertDecision: (attributes?: Partial<DecisionAttributes>) => ReturnType;
      updateDecisionStatus: (status: DecisionStatus) => ReturnType;
    };
  }
}

/**
 * Returns a valid decision status, defaulting to undecided.
 *
 * @param status - Candidate status value
 * @returns Normalized decision status
 */
export function getValidDecisionStatus(
  status: string | null | undefined,
): DecisionStatus {
  return status === "decided" ? "decided" : "undecided";
}

export const Decision = Node.create<DecisionOptions>({
  name: "decision",

  addOptions() {
    return {
      HTMLAttributes: {},
      view: null,
    };
  },

  content: "paragraph+",
  group: "block",
  defining: true,
  isolating: true,

  addAttributes() {
    return {
      status: {
        default: "undecided",
        parseHTML: (element) =>
          getValidDecisionStatus(element.getAttribute("data-decision-status")),
        renderHTML: (attributes) => ({
          "data-decision-status": getValidDecisionStatus(attributes.status),
        }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: `div[data-type="${this.name}"]`,
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(
        { "data-type": this.name },
        this.options.HTMLAttributes,
        HTMLAttributes,
      ),
      0,
    ];
  },

  addCommands() {
    return {
      insertDecision:
        (attributes) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: {
              status: getValidDecisionStatus(attributes?.status),
            },
            content: [
              {
                type: "paragraph",
              },
            ],
          });
        },

      updateDecisionStatus:
        (status) =>
        ({ commands }) =>
          commands.updateAttributes(this.name, {
            status: getValidDecisionStatus(status),
          }),
    };
  },

  addNodeView() {
    if (!this.options.view) {
      return null;
    }

    this.editor.isInitialized = true;
    return ReactNodeViewRenderer(this.options.view);
  },
});
