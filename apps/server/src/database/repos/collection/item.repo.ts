import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { RawBuilder, sql } from 'kysely';
import { KyselyDB, KyselyTransaction } from '@docmost/db/types/kysely.types';
import { dbOrTx } from '@docmost/db/utils';
import { InsertableItem, Item } from '@docmost/db/types/entity.types';

export type ItemListParams = {
  collectionId: string;
  filters: RawBuilder<boolean>[];
  sorts: RawBuilder<unknown>[];
  limit: number;
  /** Opaque; produced by a previous call. */
  cursor?: string;
};

export type ItemListResult = { items: Item[]; nextCursor: string | null };

type Cursor = { p: string; i: string } | { o: number };

function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

function decodeCursor(cursor: string): Cursor | null {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString());
    if (typeof parsed?.o === 'number' && parsed.o >= 0) return { o: parsed.o };
    if (typeof parsed?.p === 'string' && typeof parsed?.i === 'string') {
      return { p: parsed.p, i: parsed.i };
    }
  } catch {
    // fall through
  }
  return null;
}

@Injectable()
export class ItemRepo {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  async insert(
    data: InsertableItem,
    trx?: KyselyTransaction,
  ): Promise<Item> {
    return dbOrTx(this.db, trx)
      .insertInto('items')
      .values(data)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async findById(
    itemId: string,
    opts?: { includeDeleted?: boolean },
  ): Promise<Item | undefined> {
    let query = this.db.selectFrom('items').selectAll().where('id', '=', itemId);
    if (!opts?.includeDeleted) query = query.where('deletedAt', 'is', null);
    return query.executeTakeFirst();
  }

  async lastPosition(
    collectionId: string,
    trx?: KyselyTransaction,
  ): Promise<string | null> {
    const row = await dbOrTx(this.db, trx)
      .selectFrom('items')
      .select('position')
      .where('collectionId', '=', collectionId)
      .orderBy('position', 'desc')
      .limit(1)
      .executeTakeFirst();
    return row?.position ?? null;
  }

  /** Live item row locked FOR UPDATE; serialises concurrent open-as-page calls. */
  async findByIdForUpdate(
    itemId: string,
    trx: KyselyTransaction,
  ): Promise<Item | undefined> {
    return trx
      .selectFrom('items')
      .selectAll()
      .where('id', '=', itemId)
      .where('deletedAt', 'is', null)
      .forUpdate()
      .executeTakeFirst();
  }

  /** Position of the live item right before/after `position`, if any. */
  async adjacentPosition(
    collectionId: string,
    position: string,
    direction: 'next' | 'prev',
    excludeItemId?: string,
    trx?: KyselyTransaction,
  ): Promise<string | null> {
    let query = dbOrTx(this.db, trx)
      .selectFrom('items')
      .select('position')
      .where('collectionId', '=', collectionId)
      .where('deletedAt', 'is', null)
      .where('position', direction === 'next' ? '>' : '<', position)
      .orderBy('position', direction === 'next' ? 'asc' : 'desc')
      .limit(1);
    if (excludeItemId) query = query.where('id', '!=', excludeItemId);
    return (await query.executeTakeFirst())?.position ?? null;
  }

  /**
   * Merges `set` into props and removes `unset` keys in one statement, so
   * concurrent edits of different cells don't overwrite each other.
   */
  async update(
    itemId: string,
    patch: {
      title?: string;
      position?: string;
      pageId?: string | null;
      set?: Record<string, unknown>;
      unset?: string[];
      lastUpdatedById: string;
    },
    trx?: KyselyTransaction,
  ): Promise<Item | undefined> {
    const set = patch.set ?? {};
    const unset = patch.unset ?? [];
    let query = dbOrTx(this.db, trx)
      .updateTable('items')
      .set({
        ...(patch.title !== undefined && { title: patch.title }),
        ...(patch.position !== undefined && { position: patch.position }),
        ...(patch.pageId !== undefined && { pageId: patch.pageId }),
        lastUpdatedById: patch.lastUpdatedById,
        updatedAt: new Date(),
      })
      .where('id', '=', itemId)
      .where('deletedAt', 'is', null);
    if (Object.keys(set).length || unset.length) {
      query = query.set({
        props: sql`(props - ${unset}::text[]) || ${JSON.stringify(set)}::text::jsonb`,
      });
    }
    return query.returningAll().executeTakeFirst();
  }

  async softDelete(itemId: string): Promise<boolean> {
    const result = await this.db
      .updateTable('items')
      .set({ deletedAt: new Date() })
      .where('id', '=', itemId)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();
    return !!result.numUpdatedRows;
  }

  async restore(itemId: string): Promise<Item | undefined> {
    return this.db
      .updateTable('items')
      .set({ deletedAt: null })
      .where('id', '=', itemId)
      .where('deletedAt', 'is not', null)
      .returningAll()
      .executeTakeFirst();
  }

  /**
   * Lists live items. Without property sorts the order is (position, id) and
   * paging is keyset-based, so it stays stable while cards are being moved.
   * With property sorts, paging falls back to offsets.
   */
  async list(params: ItemListParams): Promise<ItemListResult> {
    const sorted = params.sorts.length > 0;
    const cursor = params.cursor ? decodeCursor(params.cursor) : null;
    if (params.cursor && !cursor) {
      throw new BadRequestException('Invalid cursor');
    }

    let query = this.db
      .selectFrom('items')
      .selectAll()
      .where('collectionId', '=', params.collectionId)
      .where('deletedAt', 'is', null);

    for (const filter of params.filters) query = query.where(filter);

    for (const sort of params.sorts) query = query.orderBy(sort);
    query = query.orderBy('position', 'asc').orderBy('id', 'asc');

    if (cursor && 'o' in cursor) {
      query = query.offset(cursor.o);
    } else if (cursor && 'p' in cursor && !sorted) {
      query = query.where(
        sql<boolean>`(position, id) > (${cursor.p}, ${cursor.i}::uuid)`,
      );
    }

    const rows = await query.limit(params.limit + 1).execute();
    const items = rows.slice(0, params.limit);
    let nextCursor: string | null = null;
    if (rows.length > params.limit) {
      const last = items[items.length - 1];
      const offset = (cursor && 'o' in cursor ? cursor.o : 0) + items.length;
      nextCursor = encodeCursor(
        sorted ? { o: offset } : { p: last.position, i: last.id },
      );
    }
    return { items, nextCursor };
  }
}
