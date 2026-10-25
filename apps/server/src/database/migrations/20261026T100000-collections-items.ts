import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('pages')
    .addColumn('is_collection', 'boolean', (col) =>
      col.notNull().defaultTo(false),
    )
    .execute();

  // A collection is hosted by exactly one page (tree, permissions, favorites).
  await db.schema
    .createTable('collections')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_uuid_v7()`),
    )
    .addColumn('page_id', 'uuid', (col) =>
      col.references('pages.id').onDelete('cascade').notNull().unique(),
    )
    .addColumn('space_id', 'uuid', (col) =>
      col.references('spaces.id').onDelete('cascade').notNull(),
    )
    .addColumn('workspace_id', 'uuid', (col) =>
      col.references('workspaces.id').onDelete('cascade').notNull(),
    )
    .addColumn('schema_version', 'integer', (col) => col.notNull().defaultTo(1))
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createTable('item_properties')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_uuid_v7()`),
    )
    .addColumn('collection_id', 'uuid', (col) =>
      col.references('collections.id').onDelete('cascade').notNull(),
    )
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('type', 'text', (col) => col.notNull())
    .addColumn('config', 'jsonb', (col) =>
      col.notNull().defaultTo(sql`'{}'::jsonb`),
    )
    // fractional-index keys are mixed-case base62: they only sort correctly
    // bytewise, so pin the column to the "C" collation.
    .addColumn('position', sql`text collate "C"`, (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createIndex('item_properties_collection_id_idx')
    .on('item_properties')
    .column('collection_id')
    .execute();

  await db.schema
    .createTable('items')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_uuid_v7()`),
    )
    .addColumn('collection_id', 'uuid', (col) =>
      col.references('collections.id').onDelete('cascade').notNull(),
    )
    .addColumn('space_id', 'uuid', (col) =>
      col.references('spaces.id').onDelete('cascade').notNull(),
    )
    .addColumn('workspace_id', 'uuid', (col) =>
      col.references('workspaces.id').onDelete('cascade').notNull(),
    )
    // Optional rich body: a normal page the item can be opened as.
    .addColumn('page_id', 'uuid', (col) =>
      col.references('pages.id').onDelete('set null'),
    )
    .addColumn('title', 'text', (col) => col.notNull().defaultTo(''))
    // { [item_properties.id]: value }
    .addColumn('props', 'jsonb', (col) =>
      col.notNull().defaultTo(sql`'{}'::jsonb`),
    )
    // fractional-index keys are mixed-case base62: they only sort correctly
    // bytewise, so pin the column to the "C" collation.
    .addColumn('position', sql`text collate "C"`, (col) => col.notNull())
    .addColumn('created_by_id', 'uuid', (col) =>
      col.references('users.id').onDelete('set null'),
    )
    .addColumn('last_updated_by_id', 'uuid', (col) =>
      col.references('users.id').onDelete('set null'),
    )
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('deleted_at', 'timestamptz')
    .execute();

  await db.schema
    .createIndex('items_collection_id_position_idx')
    .on('items')
    .columns(['collection_id', 'position', 'id'])
    .execute();

  await db.schema
    .createIndex('items_space_id_idx')
    .on('items')
    .column('space_id')
    .execute();

  await db.schema
    .createIndex('items_page_id_idx')
    .on('items')
    .column('page_id')
    .where('page_id', 'is not', null)
    .execute();

  await sql`CREATE INDEX items_props_gin_idx ON items USING GIN (props jsonb_path_ops)`.execute(
    db,
  );

  await db.schema
    .createTable('item_views')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_uuid_v7()`),
    )
    .addColumn('collection_id', 'uuid', (col) =>
      col.references('collections.id').onDelete('cascade').notNull(),
    )
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('type', 'text', (col) => col.notNull())
    .addColumn('config', 'jsonb', (col) =>
      col.notNull().defaultTo(sql`'{}'::jsonb`),
    )
    // fractional-index keys are mixed-case base62: they only sort correctly
    // bytewise, so pin the column to the "C" collation.
    .addColumn('position', sql`text collate "C"`, (col) => col.notNull())
    .addColumn('created_by_id', 'uuid', (col) =>
      col.references('users.id').onDelete('set null'),
    )
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createIndex('item_views_collection_id_idx')
    .on('item_views')
    .column('collection_id')
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('item_views').execute();
  await db.schema.dropTable('items').execute();
  await db.schema.dropTable('item_properties').execute();
  await db.schema.dropTable('collections').execute();
  await db.schema.alterTable('pages').dropColumn('is_collection').execute();
}
