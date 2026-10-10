import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { listSpaceDecisions } from "./decision-catalog-service";
import type {
  IListSpaceDecisionsParams,
  ISpaceDecisionItem,
} from "./decision-catalog.types";

/**
 * Loads space decisions for the decision catalog block.
 *
 * @param params - Query parameters; disabled when spaceId is missing
 * @returns React Query result for decision rows
 */
export function useSpaceDecisionsQuery(
  params: IListSpaceDecisionsParams | null,
): UseQueryResult<ISpaceDecisionItem[], Error> {
  return useQuery({
    queryKey: ["space-decisions", params],
    queryFn: () => listSpaceDecisions(params!),
    enabled: Boolean(params?.spaceId),
  });
}
