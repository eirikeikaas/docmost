import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB, KyselyTransaction } from '@docmost/db/types/kysely.types';
import { dbOrTx } from '@docmost/db/utils';
import {
  InsertableScimToken,
  ScimToken,
  UpdatableScimToken,
} from '@docmost/db/types/entity.types';
import { ScimTokens } from '@docmost/db/types/db';

@Injectable()
export class ScimTokenRepo {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  public baseFields: Array<keyof ScimTokens> = [
    'id',
    'name',
    'tokenLastFour',
    'isEnabled',
    'lastUsedAt',
    'creatorId',
    'workspaceId',
    'createdAt',
    'updatedAt',
  ];

  async findById(
    id: string,
    workspaceId: string,
    opts?: { trx?: KyselyTransaction },
  ): Promise<ScimToken | undefined> {
    const db = dbOrTx(this.db, opts?.trx);
    return db
      .selectFrom('scimTokens')
      .select(this.baseFields)
      .where('id', '=', id)
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();
  }

  async findByTokenHash(
    tokenHash: string,
    workspaceId: string,
  ): Promise<ScimToken | undefined> {
    return this.db
      .selectFrom('scimTokens')
      .select(this.baseFields)
      .where('tokenHash', '=', tokenHash)
      .where('workspaceId', '=', workspaceId)
      .where('isEnabled', '=', true)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();
  }

  async findByWorkspaceId(workspaceId: string): Promise<ScimToken[]> {
    return this.db
      .selectFrom('scimTokens')
      .select(this.baseFields)
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .orderBy('createdAt', 'asc')
      .execute();
  }

  async insertToken(
    insertable: InsertableScimToken,
    trx?: KyselyTransaction,
  ): Promise<ScimToken> {
    const db = dbOrTx(this.db, trx);
    return db
      .insertInto('scimTokens')
      .values(insertable)
      .returning(this.baseFields)
      .executeTakeFirst();
  }

  async updateToken(
    id: string,
    workspaceId: string,
    updatable: UpdatableScimToken,
    trx?: KyselyTransaction,
  ): Promise<ScimToken> {
    const db = dbOrTx(this.db, trx);
    return db
      .updateTable('scimTokens')
      .set({ ...updatable, updatedAt: new Date() })
      .where('id', '=', id)
      .where('workspaceId', '=', workspaceId)
      .returning(this.baseFields)
      .executeTakeFirst();
  }

  async touchLastUsed(id: string): Promise<void> {
    await this.db
      .updateTable('scimTokens')
      .set({ lastUsedAt: new Date() })
      .where('id', '=', id)
      .execute();
  }

  async softDeleteById(id: string, workspaceId: string): Promise<void> {
    await this.db
      .updateTable('scimTokens')
      .set({ deletedAt: new Date(), isEnabled: false, updatedAt: new Date() })
      .where('id', '=', id)
      .where('workspaceId', '=', workspaceId)
      .execute();
  }
}
