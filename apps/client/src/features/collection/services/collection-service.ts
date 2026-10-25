import api from "@/lib/api-client";
import {
  ICollection,
  ICreatedCollection,
  IItem,
  IItemList,
  IItemProperty,
  IItemView,
  PropertyConfig,
  PropertyType,
  ViewConfig,
  ViewType,
} from "@/features/collection/types/collection.types";

const MAX_ITEMS = 5000;
const PAGE_SIZE = 500;

export async function createCollection(data: {
  spaceId: string;
  parentPageId?: string;
  title?: string;
}): Promise<ICreatedCollection> {
  const req = await api.post<ICreatedCollection>("/collections/create", data);
  return req.data;
}

export async function getCollectionByPageId(
  pageId: string,
): Promise<ICollection> {
  const req = await api.post<ICollection>("/collections/info", { pageId });
  return req.data;
}

export async function createProperty(data: {
  collectionId: string;
  name: string;
  type: PropertyType;
  config?: PropertyConfig;
}): Promise<IItemProperty> {
  const req = await api.post<IItemProperty>("/collections/properties/create", data);
  return req.data;
}

export async function updateProperty(data: {
  collectionId: string;
  propertyId: string;
  name?: string;
  config?: PropertyConfig;
}): Promise<IItemProperty> {
  const req = await api.post<IItemProperty>("/collections/properties/update", data);
  return req.data;
}

export async function deleteProperty(data: {
  collectionId: string;
  propertyId: string;
}): Promise<void> {
  await api.post("/collections/properties/delete", data);
}

export async function createView(data: {
  collectionId: string;
  name: string;
  type: ViewType;
  config?: ViewConfig;
}): Promise<IItemView> {
  const req = await api.post<IItemView>("/collections/views/create", data);
  return req.data;
}

export async function updateView(data: {
  collectionId: string;
  viewId: string;
  name?: string;
  config?: ViewConfig;
}): Promise<IItemView> {
  const req = await api.post<IItemView>("/collections/views/update", data);
  return req.data;
}

export async function deleteView(data: {
  collectionId: string;
  viewId: string;
}): Promise<void> {
  await api.post("/collections/views/delete", data);
}

/** Loads every item of a view, following cursors (capped at MAX_ITEMS). */
export async function listAllItems(params: {
  collectionId: string;
  viewId?: string;
}): Promise<IItem[]> {
  const items: IItem[] = [];
  let cursor: string | undefined;
  do {
    const req = await api.post<IItemList>("/items/list", {
      ...params,
      limit: PAGE_SIZE,
      cursor,
    });
    items.push(...req.data.items);
    cursor = req.data.nextCursor ?? undefined;
  } while (cursor && items.length < MAX_ITEMS);
  return items;
}

export async function createItem(data: {
  collectionId: string;
  title?: string;
  props?: Record<string, unknown>;
  afterItemId?: string;
  beforeItemId?: string;
}): Promise<IItem> {
  const req = await api.post<IItem>("/items/create", data);
  return req.data;
}

export async function updateItem(data: {
  itemId: string;
  title?: string;
  props?: Record<string, unknown>;
}): Promise<IItem> {
  const req = await api.post<IItem>("/items/update", data);
  return req.data;
}

export async function moveItem(data: {
  itemId: string;
  afterItemId?: string;
  beforeItemId?: string;
  props?: Record<string, unknown>;
}): Promise<IItem> {
  const req = await api.post<IItem>("/items/move", data);
  return req.data;
}

export async function deleteItem(itemId: string): Promise<void> {
  await api.post("/items/delete", { itemId });
}
