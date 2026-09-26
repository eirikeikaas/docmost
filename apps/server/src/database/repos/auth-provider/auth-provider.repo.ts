import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB, KyselyTransaction } from '@docmost/db/types/kysely.types';
import { dbOrTx } from '@docmost/db/utils';
import {
  AuthProvider,
  InsertableAuthProvider,
  UpdatableAuthProvider,
} from '@docmost/db/types/entity.types';
import { AuthProviders } from '@docmost/db/types/db';

export type SsoProviderType = 'oidc' | 'saml';

// This table is shared with an EE-owned LDAP provider type (its `type`
// column is unconstrained free text, not a DB enum, so every query here is
// deliberately scoped to a known type). It also carries ldap_*/settings
// columns this repo never selects - ldap_bind_password in particular is
// stored in plaintext.
@Injectable()
export class AuthProviderRepo {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  public baseFields: Array<keyof AuthProviders> = [
    'id',
    'name',
    'type',
    'oidcIssuer',
    'oidcClientId',
    'samlUrl',
    'samlCertificate',
    'allowSignup',
    'isEnabled',
    'creatorId',
    'workspaceId',
    'createdAt',
    'updatedAt',
  ];

  async findById(
    id: string,
    workspaceId: string,
    type: SsoProviderType,
    opts?: { includeSecret?: boolean; trx?: KyselyTransaction },
  ): Promise<AuthProvider | undefined> {
    const db = dbOrTx(this.db, opts?.trx);
    return db
      .selectFrom('authProviders')
      .select(this.baseFields)
      .$if(opts?.includeSecret, (qb) => qb.select('oidcClientSecret'))
      .where('id', '=', id)
      .where('type', '=', type)
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();
  }

  async findEnabledById(
    id: string,
    workspaceId: string,
    type: SsoProviderType,
    opts?: { includeSecret?: boolean; trx?: KyselyTransaction },
  ): Promise<AuthProvider | undefined> {
    const db = dbOrTx(this.db, opts?.trx);
    return db
      .selectFrom('authProviders')
      .select(this.baseFields)
      .$if(opts?.includeSecret, (qb) => qb.select('oidcClientSecret'))
      .where('id', '=', id)
      .where('type', '=', type)
      .where('workspaceId', '=', workspaceId)
      .where('isEnabled', '=', true)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();
  }

  async findByWorkspaceId(
    workspaceId: string,
    type: SsoProviderType,
    opts?: { trx?: KyselyTransaction },
  ): Promise<AuthProvider[]> {
    const db = dbOrTx(this.db, opts?.trx);
    return db
      .selectFrom('authProviders')
      .select(this.baseFields)
      .where('type', '=', type)
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .orderBy('createdAt', 'asc')
      .execute();
  }

  async insertProvider(
    type: SsoProviderType,
    insertable: InsertableAuthProvider,
    trx?: KyselyTransaction,
  ): Promise<AuthProvider> {
    const db = dbOrTx(this.db, trx);
    return db
      .insertInto('authProviders')
      .values({ ...insertable, type })
      .returning(this.baseFields)
      .executeTakeFirst();
  }

  async updateProvider(
    id: string,
    workspaceId: string,
    type: SsoProviderType,
    updatable: UpdatableAuthProvider,
    trx?: KyselyTransaction,
  ): Promise<AuthProvider> {
    const db = dbOrTx(this.db, trx);
    return db
      .updateTable('authProviders')
      .set({ ...updatable, updatedAt: new Date() })
      .where('id', '=', id)
      .where('type', '=', type)
      .where('workspaceId', '=', workspaceId)
      .returning(this.baseFields)
      .executeTakeFirst();
  }

  async softDeleteById(
    id: string,
    workspaceId: string,
    type: SsoProviderType,
    trx?: KyselyTransaction,
  ): Promise<void> {
    const db = dbOrTx(this.db, trx);
    await db
      .updateTable('authProviders')
      .set({ deletedAt: new Date(), isEnabled: false, updatedAt: new Date() })
      .where('id', '=', id)
      .where('type', '=', type)
      .where('workspaceId', '=', workspaceId)
      .execute();
  }
}
