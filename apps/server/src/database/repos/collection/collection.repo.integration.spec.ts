import { CamelCasePlugin, Kysely, sql } from 'kysely';
import { PostgresJSDialect } from 'kysely-postgres-js';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const postgres = require('postgres');
import { CollectionRepo } from './collection.repo';
import { ItemRepo } from './item.repo';
import {
  compileFilter,
  compileSort,
} from '../../../core/collection/query/item-query.compiler';

/**
 * Runs against a real Postgres that already has all migrations applied:
 *   TEST_DATABASE_URL=postgresql://... npx jest collection.repo.integration
 * Skipped when the variable is not set.
 */
const url = process.env.TEST_DATABASE_URL;
const describeDb = url ? describe : describe.skip;

describeDb('CollectionRepo / ItemRepo (postgres)', () => {
  let db: Kysely<any>;
  let collections: CollectionRepo;
  let items: ItemRepo;
  let collectionId: string;
  let statusId: string;
  let tagsId: string;
  let pointsId: string;
  let workspaceId: string;
  let spaceId: string;

  const insertItem = (
    title: string,
    position: string,
    props: Record<string, unknown> = {},
  ) =>
    items.insert({
      collectionId,
      spaceId,
      workspaceId,
      title,
      position,
      props: props as any,
    });

  beforeAll(async () => {
    db = new Kysely<any>({
      dialect: new PostgresJSDialect({ postgres: postgres(url!) }),
      plugins: [new CamelCasePlugin()],
    });
    collections = new CollectionRepo(db as any);
    items = new ItemRepo(db as any);

    const suffix = Date.now().toString(36);
    const workspace = await db
      .insertInto('workspaces')
      .values({ name: `ws-${suffix}` })
      .returning('id')
      .executeTakeFirstOrThrow();
    workspaceId = workspace.id;
    const space = await db
      .insertInto('spaces')
      .values({ slug: `s${suffix}`, workspaceId })
      .returning('id')
      .executeTakeFirstOrThrow();
    spaceId = space.id;
    const page = await db
      .insertInto('pages')
      .values({
        slugId: `p${suffix}`,
        spaceId,
        workspaceId,
        isCollection: true,
      })
      .returning('id')
      .executeTakeFirstOrThrow();

    const collection = await collections.insertCollection({
      pageId: page.id,
      spaceId,
      workspaceId,
    });
    collectionId = collection.id;

    const status = await collections.insertProperty({
      collectionId,
      name: 'Status',
      type: 'select',
      position: 'a0',
    });
    statusId = status.id;
    tagsId = (
      await collections.insertProperty({
        collectionId,
        name: 'Tags',
        type: 'multi_select',
        position: 'a1',
      })
    ).id;
    pointsId = (
      await collections.insertProperty({
        collectionId,
        name: 'Points',
        type: 'number',
        position: 'a2',
      })
    ).id;
  });

  afterAll(async () => {
    // cascades to collections, properties, items, views
    await db.deleteFrom('workspaces').where('id', '=', workspaceId).execute();
    await db.destroy();
  });

  it('orders by position bytewise (mixed-case fractional keys)', async () => {
    await insertItem('lower-a1', 'a1');
    await insertItem('upper-Zz', 'Zz');
    await insertItem('lower-a0', 'a0');
    await insertItem('upper-B0', 'B0');

    const { items: rows } = await items.list({
      collectionId,
      filters: [],
      sorts: [],
      limit: 50,
    });
    expect(rows.map((r) => r.title)).toEqual([
      'upper-B0',
      'upper-Zz',
      'lower-a0',
      'lower-a1',
    ]);
  });

  it('pages with a keyset cursor without gaps or duplicates', async () => {
    const seen: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await items.list({
        collectionId,
        filters: [],
        sorts: [],
        limit: 3,
        cursor,
      });
      seen.push(...page.items.map((i) => i.title));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    expect(seen).toEqual(['upper-B0', 'upper-Zz', 'lower-a0', 'lower-a1']);
  });

  it('merges and unsets props atomically and strips a deleted property', async () => {
    const item = await insertItem('card', 'b0', { [statusId]: 'x' });
    const updated = await items.update(item.id, {
      set: { [pointsId]: 5 },
      unset: [statusId],
      title: 'card!',
      lastUpdatedById: null as any,
    });
    expect(updated!.title).toBe('card!');
    expect(updated!.props).toEqual({ [pointsId]: 5 });

    await collections.deleteProperty(collectionId, pointsId);
    const reread = await items.findById(item.id);
    expect(reread!.props).toEqual({});
    // restore the property for later tests
    pointsId = (
      await collections.insertProperty({
        collectionId,
        name: 'Points',
        type: 'number',
        position: 'a2',
      })
    ).id;
  });

  it('filters, sorts (nulls last) and pages with offsets', async () => {
    await db.deleteFrom('items').where('collectionId', '=', collectionId).execute();
    await insertItem('a', 'a0', { [statusId]: 'todo', [pointsId]: 3, [tagsId]: ['x'] });
    await insertItem('b', 'a1', { [statusId]: 'done', [pointsId]: 8, [tagsId]: ['x', 'y'] });
    await insertItem('c', 'a2', { [statusId]: 'todo', [tagsId]: ['y'] });
    await insertItem('d', 'a3', { [statusId]: 'todo', [pointsId]: 5 });

    const properties = await collections.listProperties(collectionId);

    const todo = await items.list({
      collectionId,
      filters: [
        compileFilter(properties, { propertyId: statusId, op: 'is', value: 'todo' }),
      ],
      sorts: [compileSort(properties, { propertyId: pointsId, direction: 'desc' })],
      limit: 50,
    });
    expect(todo.items.map((i) => i.title)).toEqual(['d', 'a', 'c']); // c has no points → last

    const tagged = await items.list({
      collectionId,
      filters: [
        compileFilter(properties, { propertyId: tagsId, op: 'contains', value: 'y' }),
      ],
      sorts: [],
      limit: 50,
    });
    expect(tagged.items.map((i) => i.title)).toEqual(['b', 'c']);

    const sorted = [
      compileSort(properties, { propertyId: pointsId, direction: 'asc' }),
    ];
    const first = await items.list({ collectionId, filters: [], sorts: sorted, limit: 2 });
    expect(first.items.map((i) => i.title)).toEqual(['a', 'd']);
    const second = await items.list({
      collectionId,
      filters: [],
      sorts: sorted,
      limit: 2,
      cursor: first.nextCursor!,
    });
    expect(second.items.map((i) => i.title)).toEqual(['b', 'c']);
    expect(second.nextCursor).toBeNull();
  });

  it('finds adjacent positions, ignoring an excluded item', async () => {
    const all = (
      await items.list({ collectionId, filters: [], sorts: [], limit: 50 })
    ).items;
    expect(await items.adjacentPosition(collectionId, 'a1', 'next')).toBe('a2');
    expect(await items.adjacentPosition(collectionId, 'a1', 'prev')).toBe('a0');
    const a2 = all.find((i) => i.position === 'a2')!;
    expect(
      await items.adjacentPosition(collectionId, 'a1', 'next', a2.id),
    ).toBe('a3');
    expect(await items.adjacentPosition(collectionId, 'a3', 'next')).toBeNull();
  });

  it('soft deletes and restores', async () => {
    const item = await insertItem('temp', 'z9');
    expect(await items.softDelete(item.id)).toBe(true);
    expect(await items.findById(item.id)).toBeUndefined();
    expect(
      (await items.list({ collectionId, filters: [], sorts: [], limit: 50 })).items.some(
        (i) => i.id === item.id,
      ),
    ).toBe(false);
    expect((await items.restore(item.id))!.deletedAt).toBeNull();
  });

  it('cascades when the host page is deleted', async () => {
    const collection = await collections.findById(collectionId);
    await db.deleteFrom('pages').where('id', '=', collection!.pageId).execute();
    const left = await sql<{ count: string }>`select count(*) from items where collection_id = ${collectionId}`.execute(
      db,
    );
    expect(Number(left.rows[0].count)).toBe(0);
  });
});
