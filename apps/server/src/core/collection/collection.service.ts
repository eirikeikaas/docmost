import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { generateJitteredKeyBetween } from 'fractional-indexing-jittered';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { executeTx } from '@docmost/db/utils';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { CollectionRepo } from '@docmost/db/repos/collection/collection.repo';
import { ItemRepo } from '@docmost/db/repos/collection/item.repo';
import {
  Collection,
  Item,
  ItemProperty,
  Page,
  User,
  Workspace,
} from '@docmost/db/types/entity.types';
import { PageService } from '../page/services/page.service';
import { PageAccessService } from '../page/page-access/page-access.service';
import {
  CreateCollectionDto,
  CreateItemDto,
  CreatePropertyDto,
  CreateViewDto,
  ListItemsDto,
  MoveItemDto,
  ReorderPropertyDto,
  UpdateItemDto,
  UpdatePropertyDto,
  UpdateViewDto,
} from './dto/collection.dto';
import {
  getPropertyType,
  normalizePropsPatch,
  PropertyConfig,
} from './property-types/property-types';
import { compileFilter, compileSort } from './query/item-query.compiler';
import {
  dropStaleRefs,
  normalizeViewConfig,
  validateFiltersAndSorts,
  ViewConfig,
} from './query/view-config';

const DEFAULT_LIMIT = 100;

type Access = 'view' | 'edit';

@Injectable()
export class CollectionService {
  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly collectionRepo: CollectionRepo,
    private readonly itemRepo: ItemRepo,
    private readonly pageRepo: PageRepo,
    private readonly pageService: PageService,
    private readonly pageAccessService: PageAccessService,
  ) {}

  // Access: a collection inherits its host page's permissions; items inherit
  // from the collection.

  async getCollectionForUser(
    collectionId: string,
    user: User,
    access: Access,
  ): Promise<{ collection: Collection; page: Page }> {
    const collection = await this.collectionRepo.findById(collectionId);
    if (!collection) throw new NotFoundException('Collection not found');
    const page = await this.pageRepo.findById(collection.pageId);
    if (!page || page.deletedAt) {
      throw new NotFoundException('Collection not found');
    }
    if (access === 'edit') {
      await this.pageAccessService.validateCanEdit(page, user);
    } else {
      await this.pageAccessService.validateCanView(page, user);
    }
    return { collection, page };
  }

  async getItemForUser(
    itemId: string,
    user: User,
    access: Access,
    opts?: { includeDeleted?: boolean },
  ): Promise<{ item: Item; collection: Collection }> {
    const item = await this.itemRepo.findById(itemId, opts);
    if (!item) throw new NotFoundException('Item not found');
    const { collection } = await this.getCollectionForUser(
      item.collectionId,
      user,
      access,
    );
    return { item, collection };
  }

  // Collections

  async create(user: User, workspace: Workspace, dto: CreateCollectionDto) {
    return executeTx(this.db, async (trx) => {
      const page = await this.pageService.create(
        user.id,
        workspace.id,
        {
          spaceId: dto.spaceId,
          parentPageId: dto.parentPageId,
          title: dto.title,
          icon: dto.icon,
        },
        trx,
        false,
        true,
      );

      const collection = await this.collectionRepo.insertCollection(
        {
          pageId: page.id,
          spaceId: page.spaceId,
          workspaceId: workspace.id,
        },
        trx,
      );

      const status = await this.collectionRepo.insertProperty(
        {
          collectionId: collection.id,
          name: 'Status',
          type: 'select',
          config: getPropertyType('select').normalizeConfig({
            options: [
              { name: 'Todo', color: 'gray' },
              { name: 'In progress', color: 'blue' },
              { name: 'Done', color: 'green' },
            ],
          }) as any,
          position: generateJitteredKeyBetween(null, null),
        },
        trx,
      );

      const tablePosition = generateJitteredKeyBetween(null, null);
      await this.collectionRepo.insertView(
        {
          collectionId: collection.id,
          name: 'Table',
          type: 'table',
          config: {},
          position: tablePosition,
          createdById: user.id,
        },
        trx,
      );
      await this.collectionRepo.insertView(
        {
          collectionId: collection.id,
          name: 'Board',
          type: 'kanban',
          config: { groupBy: status.id } as any,
          position: generateJitteredKeyBetween(tablePosition, null),
          createdById: user.id,
        },
        trx,
      );

      return { collection, page };
    });
  }

  async info(collectionId: string, user: User) {
    const { collection, page } = await this.getCollectionForUser(
      collectionId,
      user,
      'view',
    );
    return this.describe(collection, page, user);
  }

  async infoByPageId(pageId: string, user: User) {
    const page = await this.pageRepo.findById(pageId);
    if (!page || page.deletedAt) throw new NotFoundException();
    const collection = await this.collectionRepo.findByPageId(page.id);
    if (!collection) throw new NotFoundException('Collection not found');
    return this.info(collection.id, user);
  }

  private async describe(collection: Collection, page: Page, user: User) {
    const [properties, views, { canEdit }] = await Promise.all([
      this.collectionRepo.listProperties(collection.id),
      this.collectionRepo.listViews(collection.id),
      this.pageAccessService.validateCanViewWithPermissions(page, user),
    ]);
    return { ...collection, properties, views, canEdit };
  }

  // Properties

  async createProperty(user: User, dto: CreatePropertyDto) {
    await this.getCollectionForUser(dto.collectionId, user, 'edit');
    const config = getPropertyType(dto.type).normalizeConfig(dto.config);
    const last = await this.collectionRepo.lastPropertyPosition(
      dto.collectionId,
    );
    return this.collectionRepo.insertProperty({
      collectionId: dto.collectionId,
      name: dto.name.trim(),
      type: dto.type,
      config: config as any,
      position: generateJitteredKeyBetween(last, null),
    });
  }

  async updateProperty(user: User, dto: UpdatePropertyDto) {
    await this.getCollectionForUser(dto.collectionId, user, 'edit');
    const property = await this.requireProperty(
      dto.collectionId,
      dto.propertyId,
    );
    const config =
      dto.config !== undefined
        ? getPropertyType(property.type).normalizeConfig(dto.config)
        : undefined;
    const updated = await this.collectionRepo.updateProperty(
      dto.collectionId,
      dto.propertyId,
      {
        ...(dto.name !== undefined && { name: dto.name.trim() }),
        ...(config !== undefined && { config: config as any }),
      },
    );
    return updated;
  }

  async reorderProperty(user: User, dto: ReorderPropertyDto) {
    await this.getCollectionForUser(dto.collectionId, user, 'edit');
    await this.requireProperty(dto.collectionId, dto.propertyId);
    const all = (
      await this.collectionRepo.listProperties(dto.collectionId)
    ).filter((p) => p.id !== dto.propertyId);

    let before: string | null = null;
    let after: string | null = all[0]?.position ?? null;
    if (dto.afterPropertyId) {
      const index = all.findIndex((p) => p.id === dto.afterPropertyId);
      if (index === -1) throw new BadRequestException('Unknown neighbour');
      before = all[index].position;
      after = all[index + 1]?.position ?? null;
    }
    return this.collectionRepo.updateProperty(
      dto.collectionId,
      dto.propertyId,
      { position: generateJitteredKeyBetween(before, after) },
    );
  }

  async deleteProperty(user: User, collectionId: string, propertyId: string) {
    await this.getCollectionForUser(collectionId, user, 'edit');
    const deleted = await this.collectionRepo.deleteProperty(
      collectionId,
      propertyId,
    );
    if (!deleted) throw new NotFoundException('Property not found');
  }

  private async requireProperty(
    collectionId: string,
    propertyId: string,
  ): Promise<ItemProperty> {
    const property = await this.collectionRepo.findProperty(
      collectionId,
      propertyId,
    );
    if (!property) throw new NotFoundException('Property not found');
    return property;
  }

  // Views

  async createView(user: User, dto: CreateViewDto) {
    await this.getCollectionForUser(dto.collectionId, user, 'edit');
    const properties = await this.collectionRepo.listProperties(
      dto.collectionId,
    );
    const config = normalizeViewConfig(properties, dto.config);
    const views = await this.collectionRepo.listViews(dto.collectionId);
    return this.collectionRepo.insertView({
      collectionId: dto.collectionId,
      name: dto.name.trim(),
      type: dto.type,
      config: config as any,
      position: generateJitteredKeyBetween(
        views[views.length - 1]?.position ?? null,
        null,
      ),
      createdById: user.id,
    });
  }

  async updateView(user: User, dto: UpdateViewDto) {
    await this.getCollectionForUser(dto.collectionId, user, 'edit');
    const view = await this.collectionRepo.findView(
      dto.collectionId,
      dto.viewId,
    );
    if (!view) throw new NotFoundException('View not found');
    const config =
      dto.config !== undefined
        ? normalizeViewConfig(
            await this.collectionRepo.listProperties(dto.collectionId),
            dto.config,
          )
        : undefined;
    return this.collectionRepo.updateView(dto.collectionId, dto.viewId, {
      ...(dto.name !== undefined && { name: dto.name.trim() }),
      ...(config !== undefined && { config: config as any }),
    });
  }

  async deleteView(user: User, collectionId: string, viewId: string) {
    await this.getCollectionForUser(collectionId, user, 'edit');
    if ((await this.collectionRepo.countViews(collectionId)) <= 1) {
      throw new BadRequestException('A collection needs at least one view');
    }
    const deleted = await this.collectionRepo.deleteView(collectionId, viewId);
    if (!deleted) throw new NotFoundException('View not found');
  }

  // Items

  async listItems(user: User, dto: ListItemsDto) {
    await this.getCollectionForUser(dto.collectionId, user, 'view');
    const properties = await this.collectionRepo.listProperties(
      dto.collectionId,
    );

    let filters;
    let sorts;
    if (dto.filters !== undefined || dto.sorts !== undefined) {
      ({ filters, sorts } = validateFiltersAndSorts(
        properties,
        dto.filters,
        dto.sorts,
      ));
    } else if (dto.viewId) {
      const view = await this.collectionRepo.findView(
        dto.collectionId,
        dto.viewId,
      );
      if (!view) throw new NotFoundException('View not found');
      ({ filters, sorts } = dropStaleRefs(
        properties,
        view.config as ViewConfig,
      ));
    }

    return this.itemRepo.list({
      collectionId: dto.collectionId,
      filters: (filters ?? []).map((f) => compileFilter(properties, f)),
      sorts: (sorts ?? []).map((s) => compileSort(properties, s)),
      limit: dto.limit ?? DEFAULT_LIMIT,
      cursor: dto.cursor,
    });
  }

  async createItem(user: User, workspace: Workspace, dto: CreateItemDto) {
    const { collection } = await this.getCollectionForUser(
      dto.collectionId,
      user,
      'edit',
    );
    const properties = await this.collectionRepo.listProperties(collection.id);
    const props = normalizePropsPatch(properties, dto.props ?? {});
    const position = await this.resolvePosition(
      collection.id,
      dto.afterItemId,
      dto.beforeItemId,
    );
    return this.itemRepo.insert({
      collectionId: collection.id,
      spaceId: collection.spaceId,
      workspaceId: workspace.id,
      title: dto.title?.trim() ?? '',
      props: stripNulls(props) as any,
      position,
      createdById: user.id,
      lastUpdatedById: user.id,
    });
  }

  async updateItem(user: User, dto: UpdateItemDto) {
    const { item } = await this.getItemForUser(dto.itemId, user, 'edit');
    const { set, unset } = await this.propsPatch(item.collectionId, dto.props);
    return this.mustFind(
      await this.itemRepo.update(item.id, {
        title: dto.title?.trim(),
        set,
        unset,
        lastUpdatedById: user.id,
      }),
    );
  }

  async moveItem(user: User, dto: MoveItemDto) {
    const { item } = await this.getItemForUser(dto.itemId, user, 'edit');
    const position = await this.resolvePosition(
      item.collectionId,
      dto.afterItemId,
      dto.beforeItemId,
      item.id,
    );
    const { set, unset } = await this.propsPatch(item.collectionId, dto.props);
    return this.mustFind(
      await this.itemRepo.update(item.id, {
        position,
        set,
        unset,
        lastUpdatedById: user.id,
      }),
    );
  }

  async deleteItem(user: User, itemId: string) {
    const { item } = await this.getItemForUser(itemId, user, 'edit');
    await this.itemRepo.softDelete(item.id);
  }

  async restoreItem(user: User, itemId: string) {
    const { item } = await this.getItemForUser(itemId, user, 'edit', {
      includeDeleted: true,
    });
    return this.mustFind(await this.itemRepo.restore(item.id));
  }

  private mustFind<T>(row: T | undefined): T {
    if (!row) throw new NotFoundException('Item not found');
    return row;
  }

  private async propsPatch(
    collectionId: string,
    patch: Record<string, unknown> | undefined,
  ) {
    if (!patch) return { set: {}, unset: [] as string[] };
    const properties = await this.collectionRepo.listProperties(collectionId);
    const normalized = normalizePropsPatch(properties, patch);
    const set: Record<string, unknown> = {};
    const unset: string[] = [];
    for (const [id, value] of Object.entries(normalized)) {
      if (value === null) unset.push(id);
      else set[id] = value;
    }
    return { set, unset };
  }

  /**
   * Position strictly between the given neighbours. With one neighbour the
   * item on the other side is looked up; with none the item is appended.
   */
  private async resolvePosition(
    collectionId: string,
    afterItemId?: string,
    beforeItemId?: string,
    excludeItemId?: string,
  ): Promise<string> {
    const neighbour = async (id: string) => {
      const found = await this.itemRepo.findById(id);
      if (!found || found.collectionId !== collectionId) {
        throw new BadRequestException('Unknown neighbour item');
      }
      return found.position;
    };

    let lower: string | null = null;
    let upper: string | null = null;

    if (afterItemId) {
      lower = await neighbour(afterItemId);
      upper = beforeItemId
        ? await neighbour(beforeItemId)
        : await this.itemRepo.adjacentPosition(
            collectionId,
            lower,
            'next',
            excludeItemId,
          );
    } else if (beforeItemId) {
      upper = await neighbour(beforeItemId);
      lower = await this.itemRepo.adjacentPosition(
        collectionId,
        upper,
        'prev',
        excludeItemId,
      );
    } else {
      lower = await this.itemRepo.lastPosition(collectionId);
    }

    if (lower !== null && upper !== null && lower >= upper) {
      throw new BadRequestException('Neighbours are out of order');
    }
    return generateJitteredKeyBetween(lower, upper);
  }
}

function stripNulls(props: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(props).filter(([, value]) => value !== null),
  );
}
