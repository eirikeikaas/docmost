import api from "@/lib/api-client";
import type {
  IListSpaceDecisionsParams,
  ISpaceDecisionItem,
} from "./decision-catalog.types";

/**
 * Fetches indexed decisions for a space.
 *
 * @param params - Space id plus optional status filter and limit
 * @returns Decision rows for the catalog block
 */
export async function listSpaceDecisions(
  params: IListSpaceDecisionsParams,
): Promise<ISpaceDecisionItem[]> {
  const req = await api.post<ISpaceDecisionItem[]>("/spaces/decisions", params);
  return req.data;
}
