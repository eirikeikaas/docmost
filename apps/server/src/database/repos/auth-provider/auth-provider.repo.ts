import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB, KyselyTransaction } from '@docmost/db/types/kysely.types';
import { dbOrTx } from '@docmost/db/utils';
import {
  AuthProvider,
  InsertableAuthProvider,
  UpdatableAuthProvider,
} from '@docmost/db/types/entity.types';
import { AuthProviders, Json } from '@docmost/db/types/db';
import { sql } from 'kysely';

// This table is shared with EE-owned SAML/LDAP/Google provider types (its
// `type` column is unconstrained free text, not a DB enum). Every query here
// is deliberately scoped to `type = 'oidc'` and never selects the ldap_*,
// saml_*, or oidcClientSecret columns unless explicitly requested — the
// ldap_bind_password column in particular is stored in plaintext.
const OIDC_PROVIDER_TYPE = 'oidc';

// settings is a jsonb column; casting through text keeps arrays and nested
// objects intact instead of relying on the driver's parameter inference.
function toJsonbSettings<T extends { settings?: unknown }>(row: T): T {
  if (row.settings === undefined || row.settings === null) return row;
  return {
    ...row,
    settings: sql<Json>`${JSON.stringify(row.settings)}::text::jsonb`,
  };
}

@Injectable()
export class AuthProviderRepo {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  public baseFields: Array<keyof AuthProviders> = [
    'id',
    'name',
    'type',
    'oidcIssuer',
    'oidcClientId',
    'allowSignup',
    'isEnabled',
    'settings',
    'creatorId',
    'workspaceId',
    'createdAt',
    'updatedAt',
  ];

  async findById(
    id: string,
    workspaceId: string,
    opts?: { includeSecret?: boolean; trx?: KyselyTransaction },
  ): Promise<AuthProvider | undefined> {
    const db = dbOrTx(this.db, opts?.trx);
    return db
      .selectFrom('authProviders')
      .select(this.baseFields)
      .$if(opts?.includeSecret, (qb) => qb.select('oidcClientSecret'))
      .where('id', '=', id)
      .where('type', '=', OIDC_PROVIDER_TYPE)
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();
  }

  async findEnabledOidcById(
    id: string,
    workspaceId: string,
    opts?: { includeSecret?: boolean; trx?: KyselyTransaction },
  ): Promise<AuthProvider | undefined> {
    const db = dbOrTx(this.db, opts?.trx);
    return db
      .selectFrom('authProviders')
      .select(this.baseFields)
      .$if(opts?.includeSecret, (qb) => qb.select('oidcClientSecret'))
      .where('id', '=', id)
      .where('type', '=', OIDC_PROVIDER_TYPE)
      .where('workspaceId', '=', workspaceId)
      .where('isEnabled', '=', true)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();
  }

  async findByWorkspaceId(
    workspaceId: string,
    opts?: { trx?: KyselyTransaction },
  ): Promise<AuthProvider[]> {
    const db = dbOrTx(this.db, opts?.trx);
    return db
      .selectFrom('authProviders')
      .select(this.baseFields)
      .where('type', '=', OIDC_PROVIDER_TYPE)
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .orderBy('createdAt', 'asc')
      .execute();
  }

  async insertOidcProvider(
    insertable: InsertableAuthProvider,
    trx?: KyselyTransaction,
  ): Promise<AuthProvider> {
    const db = dbOrTx(this.db, trx);
    return db
      .insertInto('authProviders')
      .values({ ...toJsonbSettings(insertable), type: OIDC_PROVIDER_TYPE })
      .returning(this.baseFields)
      .executeTakeFirst();
  }

  async updateOidcProvider(
    id: string,
    workspaceId: string,
    updatable: UpdatableAuthProvider,
    trx?: KyselyTransaction,
  ): Promise<AuthProvider> {
    const db = dbOrTx(this.db, trx);
    return db
      .updateTable('authProviders')
      .set({ ...toJsonbSettings(updatable), updatedAt: new Date() })
      .where('id', '=', id)
      .where('type', '=', OIDC_PROVIDER_TYPE)
      .where('workspaceId', '=', workspaceId)
      .returning(this.baseFields)
      .executeTakeFirst();
  }

  async softDeleteById(
    id: string,
    workspaceId: string,
    trx?: KyselyTransaction,
  ): Promise<void> {
    const db = dbOrTx(this.db, trx);
    await db
      .updateTable('authProviders')
      .set({ deletedAt: new Date(), isEnabled: false, updatedAt: new Date() })
      .where('id', '=', id)
      .where('type', '=', OIDC_PROVIDER_TYPE)
      .where('workspaceId', '=', workspaceId)
      .execute();
  }
}
