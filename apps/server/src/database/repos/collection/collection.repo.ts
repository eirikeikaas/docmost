import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { sql } from 'kysely';
import { KyselyDB, KyselyTransaction } from '@docmost/db/types/kysely.types';
import { dbOrTx } from '@docmost/db/utils';
import {
  Collection,
  InsertableCollection,
  InsertableItemProperty,
  InsertableItemView,
  ItemProperty,
  ItemView,
  UpdatableItemProperty,
  UpdatableItemView,
} from '@docmost/db/types/entity.types';

/** Collections plus their column definitions (properties) and views. */
@Injectable()
export class CollectionRepo {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  async insertCollection(
    data: InsertableCollection,
    trx?: KyselyTransaction,
  ): Promise<Collection> {
    return dbOrTx(this.db, trx)
      .insertInto('collections')
      .values(data)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async findById(id: string): Promise<Collection | undefined> {
    return this.db
      .selectFrom('collections')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
  }

  async findByPageId(pageId: string): Promise<Collection | undefined> {
    return this.db
      .selectFrom('collections')
      .selectAll()
      .where('pageId', '=', pageId)
      .executeTakeFirst();
  }

  // Properties

  async listProperties(
    collectionId: string,
    trx?: KyselyTransaction,
  ): Promise<ItemProperty[]> {
    return dbOrTx(this.db, trx)
      .selectFrom('itemProperties')
      .selectAll()
      .where('collectionId', '=', collectionId)
      .orderBy('position', 'asc')
      .orderBy('id', 'asc')
      .execute();
  }

  async findProperty(
    collectionId: string,
    propertyId: string,
  ): Promise<ItemProperty | undefined> {
    return this.db
      .selectFrom('itemProperties')
      .selectAll()
      .where('collectionId', '=', collectionId)
      .where('id', '=', propertyId)
      .executeTakeFirst();
  }

  async insertProperty(
    data: InsertableItemProperty,
    trx?: KyselyTransaction,
  ): Promise<ItemProperty> {
    return dbOrTx(this.db, trx)
      .insertInto('itemProperties')
      .values(data)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async updateProperty(
    collectionId: string,
    propertyId: string,
    data: UpdatableItemProperty,
  ): Promise<ItemProperty | undefined> {
    return this.db
      .updateTable('itemProperties')
      .set({ ...data, updatedAt: new Date() })
      .where('collectionId', '=', collectionId)
      .where('id', '=', propertyId)
      .returningAll()
      .executeTakeFirst();
  }

  /** Deletes the property and strips its key from every item in the collection. */
  async deleteProperty(
    collectionId: string,
    propertyId: string,
  ): Promise<boolean> {
    return this.db.transaction().execute(async (trx) => {
      const deleted = await trx
        .deleteFrom('itemProperties')
        .where('collectionId', '=', collectionId)
        .where('id', '=', propertyId)
        .executeTakeFirst();
      if (!deleted.numDeletedRows) return false;
      await trx
        .updateTable('items')
        .set({ props: sql`props - ${propertyId}::text` })
        .where('collectionId', '=', collectionId)
        .execute();
      return true;
    });
  }

  async lastPropertyPosition(
    collectionId: string,
    trx?: KyselyTransaction,
  ): Promise<string | null> {
    const row = await dbOrTx(this.db, trx)
      .selectFrom('itemProperties')
      .select('position')
      .where('collectionId', '=', collectionId)
      .orderBy('position', 'desc')
      .limit(1)
      .executeTakeFirst();
    return row?.position ?? null;
  }

  // Views

  async listViews(collectionId: string): Promise<ItemView[]> {
    return this.db
      .selectFrom('itemViews')
      .selectAll()
      .where('collectionId', '=', collectionId)
      .orderBy('position', 'asc')
      .orderBy('id', 'asc')
      .execute();
  }

  async findView(
    collectionId: string,
    viewId: string,
  ): Promise<ItemView | undefined> {
    return this.db
      .selectFrom('itemViews')
      .selectAll()
      .where('collectionId', '=', collectionId)
      .where('id', '=', viewId)
      .executeTakeFirst();
  }

  async insertView(
    data: InsertableItemView,
    trx?: KyselyTransaction,
  ): Promise<ItemView> {
    return dbOrTx(this.db, trx)
      .insertInto('itemViews')
      .values(data)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async updateView(
    collectionId: string,
    viewId: string,
    data: UpdatableItemView,
  ): Promise<ItemView | undefined> {
    return this.db
      .updateTable('itemViews')
      .set({ ...data, updatedAt: new Date() })
      .where('collectionId', '=', collectionId)
      .where('id', '=', viewId)
      .returningAll()
      .executeTakeFirst();
  }

  async deleteView(collectionId: string, viewId: string): Promise<boolean> {
    const result = await this.db
      .deleteFrom('itemViews')
      .where('collectionId', '=', collectionId)
      .where('id', '=', viewId)
      .executeTakeFirst();
    return !!result.numDeletedRows;
  }

  async countViews(collectionId: string): Promise<number> {
    const row = await this.db
      .selectFrom('itemViews')
      .select((eb) => eb.fn.countAll<string>().as('count'))
      .where('collectionId', '=', collectionId)
      .executeTakeFirstOrThrow();
    return Number(row.count);
  }
}
