import { BadRequestException } from '@nestjs/common';
import { compileFilter, compileSort, ItemFilter, ItemSort } from './item-query.compiler';

export type ViewConfig = {
  filters?: ItemFilter[];
  sorts?: ItemSort[];
  /** Kanban: the select property whose options become columns. */
  groupBy?: string;
  /** Table: visible property ids (omitted = all). */
  visibleProperties?: string[];
  /** Kanban: property ids shown on the cards. */
  cardProperties?: string[];
  columnWidths?: Record<string, number>;
};

type PropertyRef = { id: string; type: string };

const MAX_FILTERS = 50;
const MAX_SORTS = 5;

function invalid(message: string): never {
  throw new BadRequestException(message);
}

function idList(
  properties: PropertyRef[],
  value: unknown,
  field: string,
): string[] {
  if (!Array.isArray(value) || value.length > properties.length) {
    invalid(`Invalid ${field}`);
  }
  const known = new Set(properties.map((p) => p.id));
  if (value.some((id) => typeof id !== 'string' || !known.has(id))) {
    invalid(`Unknown property in ${field}`);
  }
  return [...new Set(value as string[])];
}

/** Validates filters/sorts by compiling them; throws on anything invalid. */
export function validateFiltersAndSorts(
  properties: PropertyRef[],
  filters: unknown,
  sorts: unknown,
): { filters: ItemFilter[]; sorts: ItemSort[] } {
  if (!Array.isArray(filters ?? [])) invalid('Invalid filters');
  if (!Array.isArray(sorts ?? [])) invalid('Invalid sorts');
  const f = (filters ?? []) as ItemFilter[];
  const s = (sorts ?? []) as ItemSort[];
  if (f.length > MAX_FILTERS) invalid('Too many filters');
  if (s.length > MAX_SORTS) invalid('Too many sorts');
  for (const filter of f) compileFilter(properties, filter);
  for (const sort of s) compileSort(properties, sort);
  return {
    filters: f.map(({ propertyId, op, value }) => ({
      propertyId,
      op,
      ...(value !== undefined && { value }),
    })),
    sorts: s.map(({ propertyId, direction }) => ({ propertyId, direction })),
  };
}

/**
 * Whitelists and validates a view config. Unknown keys are dropped so the
 * stored JSON can't grow arbitrary payloads.
 */
export function normalizeViewConfig(
  properties: PropertyRef[],
  config: Record<string, unknown> | undefined,
): ViewConfig {
  const raw = config ?? {};
  const result: ViewConfig = {};

  if (raw.filters !== undefined || raw.sorts !== undefined) {
    const { filters, sorts } = validateFiltersAndSorts(
      properties,
      raw.filters,
      raw.sorts,
    );
    if (raw.filters !== undefined) result.filters = filters;
    if (raw.sorts !== undefined) result.sorts = sorts;
  }

  if (raw.groupBy !== undefined && raw.groupBy !== null) {
    const property = properties.find((p) => p.id === raw.groupBy);
    if (!property || property.type !== 'select') {
      invalid('groupBy must be a select property');
    }
    result.groupBy = property.id;
  }

  if (raw.visibleProperties !== undefined) {
    result.visibleProperties = idList(
      properties,
      raw.visibleProperties,
      'visibleProperties',
    );
  }
  if (raw.cardProperties !== undefined) {
    result.cardProperties = idList(
      properties,
      raw.cardProperties,
      'cardProperties',
    );
  }

  if (raw.columnWidths !== undefined) {
    const widths = raw.columnWidths as Record<string, unknown>;
    if (typeof widths !== 'object' || widths === null || Array.isArray(widths)) {
      invalid('Invalid columnWidths');
    }
    const known = new Set(properties.map((p) => p.id));
    result.columnWidths = {};
    for (const [id, width] of Object.entries(widths)) {
      if (
        !known.has(id) ||
        typeof width !== 'number' ||
        !Number.isFinite(width) ||
        width < 40 ||
        width > 1000
      ) {
        invalid('Invalid columnWidths');
      }
      result.columnWidths[id] = Math.round(width);
    }
  }

  return result;
}

/**
 * Drops filters/sorts that point at deleted properties, so an old view keeps
 * working after a column is removed.
 */
export function dropStaleRefs(
  properties: PropertyRef[],
  config: ViewConfig,
): { filters: ItemFilter[]; sorts: ItemSort[] } {
  const known = new Set(properties.map((p) => p.id));
  return {
    filters: (config.filters ?? []).filter((f) => known.has(f.propertyId)),
    sorts: (config.sorts ?? []).filter((s) => known.has(s.propertyId)),
  };
}
