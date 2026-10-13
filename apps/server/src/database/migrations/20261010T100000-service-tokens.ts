import { Kysely, sql } from 'kysely';

// Long-lived bearer credentials for a service-account user (see
// core/service-token). The token itself is a signed JWT and is never stored:
// the row is what makes it revocable, and token_prefix is only a short,
// non-secret fingerprint that lets an admin tell tokens apart in a list.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('service_tokens')
    .ifNotExists()
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_uuid_v7()`),
    )
    .addColumn('workspace_id', 'uuid', (col) =>
      col.notNull().references('workspaces.id').onDelete('cascade'),
    )
    // The service-account user the token authenticates as.
    .addColumn('user_id', 'uuid', (col) =>
      col.notNull().references('users.id').onDelete('cascade'),
    )
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('token_prefix', 'text', (col) => col.notNull())
    .addColumn('creator_id', 'uuid', (col) =>
      col.references('users.id').onDelete('set null'),
    )
    .addColumn('expires_at', 'timestamptz')
    .addColumn('last_used_at', 'timestamptz')
    .addColumn('revoked_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createIndex('idx_service_tokens_workspace_id')
    .ifNotExists()
    .on('service_tokens')
    .column('workspace_id')
    .execute();

  await db.schema
    .createIndex('idx_service_tokens_user_id')
    .ifNotExists()
    .on('service_tokens')
    .column('user_id')
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('service_tokens').ifExists().execute();
}
