import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('spaces')
    .addColumn('project_id', 'text')
    .execute();

  // One space per Marathon project within a workspace.
  await sql`
    CREATE UNIQUE INDEX spaces_workspace_id_project_id_unique
    ON spaces (workspace_id, project_id)
    WHERE project_id IS NOT NULL AND deleted_at IS NULL
  `.execute(db);

  await db.schema
    .createTable('space_links')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_uuid_v7()`),
    )
    .addColumn('space_id', 'uuid', (col) =>
      col.references('spaces.id').onDelete('cascade').notNull(),
    )
    .addColumn('workspace_id', 'uuid', (col) =>
      col.references('workspaces.id').onDelete('cascade').notNull(),
    )
    .addColumn('provider', 'text', (col) => col.notNull())
    .addColumn('url', 'text')
    .addColumn('external_id', 'text')
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addUniqueConstraint('space_links_space_id_provider_unique', [
      'space_id',
      'provider',
    ])
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('space_links').execute();
  await sql`DROP INDEX IF EXISTS spaces_workspace_id_project_id_unique`.execute(
    db,
  );
  await db.schema.alterTable('spaces').dropColumn('project_id').execute();
}
