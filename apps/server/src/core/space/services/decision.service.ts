import { Injectable } from '@nestjs/common';
import { DecisionRepo } from '@docmost/db/repos/decision/decision.repo';

@Injectable()
export class DecisionService {
  constructor(private readonly decisionRepo: DecisionRepo) {}

  /**
   * Lists indexed decisions for a space after authorization is handled upstream.
   *
   * @param spaceId - Space to query
   * @param workspaceId - Workspace scope
   * @param options - Optional status filter and limit
   * @returns Decision rows for the catalog API
   */
  async listSpaceDecisions(
    spaceId: string,
    workspaceId: string,
    options: { status?: string; limit?: number } = {},
  ) {
    return this.decisionRepo.listBySpace(spaceId, workspaceId, options);
  }
}
