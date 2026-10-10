import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB, KyselyTransaction } from '@docmost/db/types/kysely.types';
import { dbOrTx } from '@docmost/db/utils';
import {
  InsertableServiceToken,
  ServiceToken,
} from '@docmost/db/types/entity.types';

// A token joined with the user it authenticates as, for admin listings.
export type ServiceTokenWithUser = ServiceToken & {
  userName: string | null;
  userEmail: string;
  userRole: string | null;
  userDeactivatedAt: Date | null;
  userDeletedAt: Date | null;
};

@Injectable()
export class ServiceTokenRepo {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  async insert(
    insertable: InsertableServiceToken,
    trx?: KyselyTransaction,
  ): Promise<ServiceToken> {
    const db = dbOrTx(this.db, trx);
    return db
      .insertInto('serviceTokens')
      .values(insertable)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  // The row is created first (the JWT needs its id) and the fingerprint of the
  // signed token is filled in afterwards, in the same transaction.
  async setTokenPrefix(
    id: string,
    workspaceId: string,
    tokenPrefix: string,
    trx?: KyselyTransaction,
  ): Promise<ServiceToken> {
    const db = dbOrTx(this.db, trx);
    return db
      .updateTable('serviceTokens')
      .set({ tokenPrefix, updatedAt: new Date() })
      .where('id', '=', id)
      .where('workspaceId', '=', workspaceId)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async findById(
    id: string,
    workspaceId: string,
    trx?: KyselyTransaction,
  ): Promise<ServiceToken | undefined> {
    const db = dbOrTx(this.db, trx);
    return db
      .selectFrom('serviceTokens')
      .selectAll()
      .where('id', '=', id)
      .where('workspaceId', '=', workspaceId)
      .executeTakeFirst();
  }

  async findByIdWithUser(
    id: string,
    workspaceId: string,
  ): Promise<ServiceTokenWithUser | undefined> {
    return this.withUser(workspaceId)
      .where('serviceTokens.id', '=', id)
      .executeTakeFirst() as Promise<ServiceTokenWithUser | undefined>;
  }

  async listByWorkspace(workspaceId: string): Promise<ServiceTokenWithUser[]> {
    return this.withUser(workspaceId)
      .orderBy('serviceTokens.createdAt', 'desc')
      .execute() as Promise<ServiceTokenWithUser[]>;
  }

  // Sets revoked_at once. Returns undefined when there is no such token in the
  // workspace or it was already revoked (the first revocation time is kept).
  async revoke(
    id: string,
    workspaceId: string,
  ): Promise<ServiceToken | undefined> {
    const now = new Date();
    return this.db
      .updateTable('serviceTokens')
      .set({ revokedAt: now, updatedAt: now })
      .where('id', '=', id)
      .where('workspaceId', '=', workspaceId)
      .where('revokedAt', 'is', null)
      .returningAll()
      .executeTakeFirst();
  }

  // Throttled in SQL as well as by the caller, so several instances (or a burst
  // of requests that all read the same stale row) still write at most once per
  // interval.
  async touchLastUsed(
    id: string,
    now: Date,
    minIntervalMs: number,
  ): Promise<void> {
    const threshold = new Date(now.getTime() - minIntervalMs);
    await this.db
      .updateTable('serviceTokens')
      .set({ lastUsedAt: now })
      .where('id', '=', id)
      .where((eb) =>
        eb.or([eb('lastUsedAt', 'is', null), eb('lastUsedAt', '<', threshold)]),
      )
      .execute();
  }

  private withUser(workspaceId: string) {
    return this.db
      .selectFrom('serviceTokens')
      .innerJoin('users', 'users.id', 'serviceTokens.userId')
      .selectAll('serviceTokens')
      .select([
        'users.name as userName',
        'users.email as userEmail',
        'users.role as userRole',
        'users.deactivatedAt as userDeactivatedAt',
        'users.deletedAt as userDeletedAt',
      ])
      .where('serviceTokens.workspaceId', '=', workspaceId);
  }
}
