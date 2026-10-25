import { mergeAttributes, Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";

export type DecisionCatalogStatusFilter = "all" | "undecided" | "decided";

export interface DecisionCatalogOptions {
  HTMLAttributes: Record<string, any>;
  view: any;
}

export interface DecisionCatalogAttributes {
  statusFilter: DecisionCatalogStatusFilter;
  limit: number;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    decisionCatalog: {
      insertDecisionCatalog: (
        attributes?: Partial<DecisionCatalogAttributes>,
      ) => ReturnType;
    };
  }
}

/**
 * Returns a valid catalog status filter, defaulting to all.
 *
 * @param filter - Candidate filter value
 * @returns Normalized status filter
 */
export function getValidDecisionCatalogStatusFilter(
  filter: string | null | undefined,
): DecisionCatalogStatusFilter {
  if (filter === "undecided" || filter === "decided") {
    return filter;
  }
  return "all";
}

/**
 * Returns a positive integer limit for the catalog, defaulting to 50.
 *
 * @param limit - Candidate limit value
 * @returns Clamped positive limit
 */
export function getValidDecisionCatalogLimit(
  limit: number | string | null | undefined,
): number {
  const parsed = typeof limit === "string" ? Number.parseInt(limit, 10) : limit;
  if (typeof parsed !== "number" || !Number.isFinite(parsed) || parsed < 1) {
    return 50;
  }
  return Math.min(Math.floor(parsed), 200);
}

export const DecisionCatalog = Node.create<DecisionCatalogOptions>({
  name: "decisionCatalog",

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
      statusFilter: {
        default: "all",
        parseHTML: (element) =>
          getValidDecisionCatalogStatusFilter(
            element.getAttribute("data-status-filter"),
          ),
        renderHTML: (attributes) => ({
          "data-status-filter": getValidDecisionCatalogStatusFilter(
            attributes.statusFilter,
          ),
        }),
      },
      limit: {
        default: 50,
        parseHTML: (element) =>
          getValidDecisionCatalogLimit(element.getAttribute("data-limit")),
        renderHTML: (attributes) => ({
          "data-limit": String(getValidDecisionCatalogLimit(attributes.limit)),
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
    ];
  },

  addCommands() {
    return {
      insertDecisionCatalog:
        (attributes) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: {
              statusFilter: getValidDecisionCatalogStatusFilter(
                attributes?.statusFilter,
              ),
              limit: getValidDecisionCatalogLimit(attributes?.limit),
            },
          });
        },
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
