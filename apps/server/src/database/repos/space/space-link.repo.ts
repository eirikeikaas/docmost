import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB, KyselyTransaction } from '@docmost/db/types/kysely.types';
import { dbOrTx } from '@docmost/db/utils';
import { SpaceLink } from '@docmost/db/types/entity.types';

@Injectable()
export class SpaceLinkRepo {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  async listBySpace(
    spaceId: string,
    workspaceId: string,
    trx?: KyselyTransaction,
  ): Promise<SpaceLink[]> {
    return dbOrTx(this.db, trx)
      .selectFrom('spaceLinks')
      .selectAll()
      .where('spaceId', '=', spaceId)
      .where('workspaceId', '=', workspaceId)
      .orderBy('provider', 'asc')
      .execute();
  }

  async upsert(
    link: {
      spaceId: string;
      workspaceId: string;
      provider: string;
      url: string | null;
      externalId: string | null;
    },
    trx?: KyselyTransaction,
  ): Promise<SpaceLink> {
    return dbOrTx(this.db, trx)
      .insertInto('spaceLinks')
      .values(link)
      .onConflict((oc) =>
        oc.columns(['spaceId', 'provider']).doUpdateSet({
          url: link.url,
          externalId: link.externalId,
          updatedAt: new Date(),
        }),
      )
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async remove(
    spaceId: string,
    workspaceId: string,
    provider: string,
    trx?: KyselyTransaction,
  ): Promise<void> {
    await dbOrTx(this.db, trx)
      .deleteFrom('spaceLinks')
      .where('spaceId', '=', spaceId)
      .where('workspaceId', '=', workspaceId)
      .where('provider', '=', provider)
      .execute();
  }
}
