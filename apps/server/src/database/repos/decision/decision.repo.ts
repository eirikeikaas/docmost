import {
  InsertablePageDecision,
  PageDecision,
} from '@docmost/db/types/entity.types';
import { KyselyDB, KyselyTransaction } from '@docmost/db/types/kysely.types';
import { dbOrTx } from '@docmost/db/utils';
import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';

export type SpaceDecisionListItem = {
  decisionId: string;
  status: string;
  decisionText: string;
  pageId: string;
  pageTitle: string | null;
  pageSlugId: string;
  updatedAt: Date;
};

@Injectable()
export class DecisionRepo {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  /**
   * Replaces all indexed decisions for a page with the current extraction.
   *
   * Deletes stale rows, then upserts the remaining decision ids so catalog
   * queries stay aligned with TipTap content after each collab persist.
   *
   * @param pageId - Page whose decision index is being refreshed
   * @param spaceId - Space that owns the page
   * @param workspaceId - Workspace that owns the page
   * @param decisions - Extracted decisions from the latest document JSON
   * @param trx - Optional transaction to join
   * @returns void
   */
  async syncPageDecisions(
    pageId: string,
    spaceId: string,
    workspaceId: string,
    decisions: Array<{
      decisionId: string;
      status: string;
      decisionText: string;
    }>,
    trx?: KyselyTransaction,
  ): Promise<void> {
    const db = dbOrTx(this.db, trx);

    await db
      .deleteFrom('pageDecisions')
      .where('pageId', '=', pageId)
      .execute();

    if (decisions.length === 0) {
      return;
    }

    const rows: InsertablePageDecision[] = decisions.map((decision) => ({
      decisionId: decision.decisionId,
      pageId,
      spaceId,
      workspaceId,
      status: decision.status,
      decisionText: decision.decisionText,
    }));

    await db.insertInto('pageDecisions').values(rows).execute();
  }

  /**
   * Lists indexed decisions for a space, newest updates first.
   *
   * @param spaceId - Space to query
   * @param workspaceId - Workspace scope for safety
   * @param options - Optional status filter and row limit
   * @returns Decision rows joined with page title/slug
   */
  async listBySpace(
    spaceId: string,
    workspaceId: string,
    options: { status?: string; limit?: number } = {},
  ): Promise<SpaceDecisionListItem[]> {
    const limit =
      typeof options.limit === 'number' && options.limit > 0
        ? Math.min(options.limit, 200)
        : 50;

    let query = this.db
      .selectFrom('pageDecisions')
      .innerJoin('pages', 'pages.id', 'pageDecisions.pageId')
      .select([
        'pageDecisions.decisionId',
        'pageDecisions.status',
        'pageDecisions.decisionText',
        'pageDecisions.pageId',
        'pageDecisions.updatedAt',
        'pages.title as pageTitle',
        'pages.slugId as pageSlugId',
      ])
      .where('pageDecisions.spaceId', '=', spaceId)
      .where('pageDecisions.workspaceId', '=', workspaceId)
      .where('pages.deletedAt', 'is', null)
      .orderBy('pageDecisions.updatedAt', 'desc')
      .limit(limit);

    if (options.status && options.status !== 'all') {
      query = query.where('pageDecisions.status', '=', options.status);
    }

    return query.execute();
  }

  /**
   * Finds a decision row by primary key (tests / diagnostics).
   *
   * @param id - Internal page_decisions row id
   * @returns Decision row or undefined
   */
  async findById(id: string): Promise<PageDecision | undefined> {
    return this.db
      .selectFrom('pageDecisions')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
  }
}
