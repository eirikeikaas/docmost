import { type Kysely, sql } from 'kysely';

// The existing idx_auth_accounts_provider_user_id index (on provider_user_id,
// auth_provider_id) is NOT unique, so nothing today stops the same external
// IdP identity from being linked to two different local users. This closes
// that gap.
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_accounts_provider_unique
    ON auth_accounts (auth_provider_id, provider_user_id)
    WHERE deleted_at IS NULL
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .dropIndex('idx_auth_accounts_provider_unique')
    .ifExists()
    .execute();
}
