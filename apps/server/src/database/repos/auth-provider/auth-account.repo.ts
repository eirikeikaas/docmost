import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB, KyselyTransaction } from '@docmost/db/types/kysely.types';
import { dbOrTx } from '@docmost/db/utils';
import {
  AuthAccount,
  InsertableAuthAccount,
} from '@docmost/db/types/entity.types';

@Injectable()
export class AuthAccountRepo {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  async findByProviderAndProviderUserId(
    authProviderId: string,
    providerUserId: string,
    workspaceId: string,
    trx?: KyselyTransaction,
  ): Promise<AuthAccount | undefined> {
    const db = dbOrTx(this.db, trx);
    return db
      .selectFrom('authAccounts')
      .selectAll()
      .where('authProviderId', '=', authProviderId)
      .where('providerUserId', '=', providerUserId)
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();
  }

  async findByUserId(
    userId: string,
    workspaceId: string,
    trx?: KyselyTransaction,
  ): Promise<AuthAccount[]> {
    const db = dbOrTx(this.db, trx);
    return db
      .selectFrom('authAccounts')
      .selectAll()
      .where('userId', '=', userId)
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .execute();
  }

  // Races with itself under concurrent first-logins for the same external
  // identity: the DB's partial unique index on (auth_provider_id,
  // provider_user_id) is the real backstop, not the caller's own
  // check-then-insert. On a 23505 conflict, re-resolve to the row the other
  // request just inserted rather than erroring out.
  async insertAuthAccount(
    insertable: InsertableAuthAccount,
    trx?: KyselyTransaction,
  ): Promise<AuthAccount> {
    const db = dbOrTx(this.db, trx);
    try {
      return await db
        .insertInto('authAccounts')
        .values(insertable)
        .returningAll()
        .executeTakeFirst();
    } catch (err: any) {
      if (err?.code === '23505') {
        const existing = await this.findByProviderAndProviderUserId(
          insertable.authProviderId,
          insertable.providerUserId,
          insertable.workspaceId,
          trx,
        );
        if (existing) return existing;
      }
      throw err;
    }
  }
}
