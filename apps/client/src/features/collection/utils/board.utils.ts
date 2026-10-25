import {
  IItem,
  IItemProperty,
  PropertyValue,
} from "@/features/collection/types/collection.types";

export const NO_VALUE_COLUMN = "__none__";

export type BoardColumn = {
  /** Option id of the group property, or NO_VALUE_COLUMN. */
  id: string;
  name: string | null;
  color?: string;
  items: IItem[];
};

/**
 * Groups items into kanban columns by a select property. One column per
 * option (in option order) plus a trailing "no value" column. Items keep the
 * order they have in `items` (the server's position order).
 */
export function groupItemsByOption(
  items: IItem[],
  property: IItemProperty,
): BoardColumn[] {
  const options = property.config.options ?? [];
  const columns: BoardColumn[] = options.map((option) => ({
    id: option.id,
    name: option.name,
    color: option.color,
    items: [],
  }));
  const byId = new Map(columns.map((c) => [c.id, c]));
  const none: BoardColumn = {
    id: NO_VALUE_COLUMN,
    name: null,
    items: [],
  };

  for (const item of items) {
    const value = item.props[property.id];
    const column = typeof value === "string" ? byId.get(value) : undefined;
    (column ?? none).items.push(item);
  }
  return [...columns, none];
}

export type DropNeighbours = {
  afterItemId?: string;
  beforeItemId?: string;
};

/**
 * Neighbours for dropping `movingId` at `index` in a column's item list. The
 * moving item is ignored, so dropping a card on its own column works whether
 * it moves up or down.
 */
export function dropNeighbours(
  columnItems: IItem[],
  index: number,
  movingId: string,
): DropNeighbours {
  const others = columnItems.filter((i) => i.id !== movingId);
  const at = Math.max(0, Math.min(index, others.length));
  const result: DropNeighbours = {};
  if (at > 0) result.afterItemId = others[at - 1].id;
  if (at < others.length) result.beforeItemId = others[at].id;
  return result;
}

/** Value to send for a column: null clears the value for the "no value" column. */
export function columnValue(columnId: string): PropertyValue {
  return columnId === NO_VALUE_COLUMN ? null : columnId;
}

/**
 * Optimistic local move: reorders `items` next to the given neighbours and
 * applies the props patch. With no neighbours the item goes to the end.
 */
export function applyMove(
  items: IItem[],
  itemId: string,
  neighbours: DropNeighbours,
  propsPatch?: Record<string, PropertyValue>,
): IItem[] {
  const moving = items.find((i) => i.id === itemId);
  if (!moving) return items;

  const next: IItem = {
    ...moving,
    props: { ...moving.props, ...(propsPatch ?? {}) },
  };
  for (const [key, value] of Object.entries(propsPatch ?? {})) {
    if (value === null) delete next.props[key];
  }

  const rest = items.filter((i) => i.id !== itemId);
  let index = rest.length;
  if (neighbours.afterItemId) {
    const after = rest.findIndex((i) => i.id === neighbours.afterItemId);
    if (after !== -1) index = after + 1;
  } else if (neighbours.beforeItemId) {
    const before = rest.findIndex((i) => i.id === neighbours.beforeItemId);
    if (before !== -1) index = before;
  }
  return [...rest.slice(0, index), next, ...rest.slice(index)];
}

/** Local props patch for a cell edit (null removes the value). */
export function applyProps(
  item: IItem,
  patch: Record<string, PropertyValue>,
): IItem {
  const props = { ...item.props, ...patch };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete props[key];
  }
  return { ...item, props };
}
