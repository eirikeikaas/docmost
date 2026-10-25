import { type Kysely } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('pages')
    .addColumn('artifact_url', 'text')
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable('pages').dropColumn('artifact_url').execute();
}
