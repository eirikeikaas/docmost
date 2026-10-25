import type {
  DecisionCatalogStatusFilter,
  DecisionStatus,
} from "@docmost/editor-ext";

export type ISpaceDecisionItem = {
  decisionId: string;
  status: DecisionStatus;
  decisionText: string;
  pageId: string;
  pageTitle: string | null;
  pageSlugId: string;
  updatedAt: string;
};

export type IListSpaceDecisionsParams = {
  spaceId: string;
  status?: DecisionCatalogStatusFilter;
  limit?: number;
};
