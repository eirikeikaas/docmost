import { BadRequestException } from '@nestjs/common';
import { RawBuilder, sql } from 'kysely';
import {
  FilterOperator,
  getPropertyType,
  PropertyType,
} from '../property-types/property-types';

export type ItemFilter = {
  propertyId: string;
  op: FilterOperator;
  value?: unknown;
};

export type ItemSort = {
  propertyId: string;
  direction: 'asc' | 'desc';
};

type PropertyRef = { id: string; type: string };

function invalid(message: string): never {
  throw new BadRequestException(message);
}

// props -> '<id>' (jsonb) / props ->> '<id>' (text); the id is a bound param.
function jsonb(propertyId: string) {
  return sql`props -> ${propertyId}::text`;
}

function text(propertyId: string) {
  return sql`props ->> ${propertyId}::text`;
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

function scalar(type: PropertyType, propertyId: string) {
  switch (type) {
    case 'number':
      return sql`(${text(propertyId)})::numeric`;
    case 'date':
      return sql`(props -> ${propertyId}::text ->> 'start')::timestamptz`;
    case 'checkbox':
      return sql`(${text(propertyId)})::boolean`;
    default:
      return text(propertyId);
  }
}

function operand(type: PropertyType, op: FilterOperator, value: unknown) {
  if (type === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      invalid(`Filter "${op}" needs a number`);
    }
    return value;
  }
  if (type === 'checkbox') {
    if (typeof value !== 'boolean') invalid(`Filter "${op}" needs a boolean`);
    return value;
  }
  if (typeof value !== 'string') invalid(`Filter "${op}" needs a string`);
  if (type === 'date' && Number.isNaN(Date.parse(value))) {
    invalid(`Filter "${op}" needs an ISO date`);
  }
  return value;
}

/** Compiles one filter to a boolean SQL expression over `items.props`. */
export function compileFilter(
  properties: PropertyRef[],
  filter: ItemFilter,
): RawBuilder<boolean> {
  const property = properties.find((p) => p.id === filter.propertyId);
  if (!property) invalid(`Unknown property: ${filter.propertyId}`);
  const definition = getPropertyType(property.type);
  const type = property.type as PropertyType;
  const { op, propertyId } = filter;

  if (!definition.operators.includes(op)) {
    invalid(`Operator "${op}" is not supported for ${type}`);
  }

  if (op === 'is_empty') return sql<boolean>`${jsonb(propertyId)} is null`;
  if (op === 'is_not_empty') {
    return sql<boolean>`${jsonb(propertyId)} is not null`;
  }

  if (type === 'multi_select') {
    const value = operand('select', op, filter.value);
    const contains = sql<boolean>`${jsonb(propertyId)} @> ${JSON.stringify([value])}::text::jsonb`;
    return op === 'contains' ? contains : sql<boolean>`not coalesce(${contains}, false)`;
  }

  if (op === 'contains' || op === 'not_contains') {
    const value = operand('text', op, filter.value);
    const like = sql<boolean>`${text(propertyId)} ilike ${'%' + escapeLike(value as string) + '%'}`;
    return op === 'contains' ? like : sql<boolean>`not coalesce(${like}, false)`;
  }

  const value = operand(type, op, filter.value);
  const column = scalar(type, propertyId);
  const bound = type === 'date' ? sql`${value}::timestamptz` : sql`${value}`;
  switch (op) {
    case 'is':
      return sql<boolean>`${column} = ${bound}`;
    case 'is_not':
      return sql<boolean>`${column} is distinct from ${bound}`;
    case 'gt':
      return sql<boolean>`${column} > ${bound}`;
    case 'gte':
      return sql<boolean>`${column} >= ${bound}`;
    case 'lt':
      return sql<boolean>`${column} < ${bound}`;
    case 'lte':
      return sql<boolean>`${column} <= ${bound}`;
  }
  return invalid(`Unsupported operator: ${op}`);
}

/** Order-by expression for a property sort (nulls always last). */
export function compileSort(
  properties: PropertyRef[],
  sort: ItemSort,
): RawBuilder<unknown> {
  const property = properties.find((p) => p.id === sort.propertyId);
  if (!property) invalid(`Unknown property: ${sort.propertyId}`);
  if (sort.direction !== 'asc' && sort.direction !== 'desc') {
    invalid('Invalid sort direction');
  }
  if (property.type === 'multi_select') {
    invalid('Cannot sort by a multi-select property');
  }
  const column = scalar(property.type as PropertyType, sort.propertyId);
  return sort.direction === 'asc'
    ? sql`${column} asc nulls last`
    : sql`${column} desc nulls last`;
}
