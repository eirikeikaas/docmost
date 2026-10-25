import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

/**
 * Registry of item property types. Adding a type = one entry in
 * PROPERTY_TYPES (plus a cell renderer/editor on the client).
 *
 * Values live in `items.props` keyed by property id. `null` always means
 * "no value".
 */

export const PROPERTY_TYPE_NAMES = [
  'text',
  'number',
  'select',
  'multi_select',
  'date',
  'checkbox',
  'person',
  'url',
] as const;

export type PropertyType = (typeof PROPERTY_TYPE_NAMES)[number];

export type SelectOption = { id: string; name: string; color?: string };

export type PropertyConfig = {
  options?: SelectOption[];
  format?: 'number' | 'percent';
};

export type DateValue = { start: string; end?: string };

export type PropertyValue =
  | string
  | number
  | boolean
  | string[]
  | DateValue
  | null;

export type FilterOperator =
  | 'is'
  | 'is_not'
  | 'contains'
  | 'not_contains'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'is_empty'
  | 'is_not_empty';

export interface PropertyTypeDefinition {
  /** Normalizes/validates the config sent when creating or updating a property. */
  normalizeConfig(config: unknown): PropertyConfig;
  /** Validates a cell value against the property config; returns the stored shape. */
  normalizeValue(config: PropertyConfig, value: unknown): PropertyValue;
  operators: readonly FilterOperator[];
}

const MAX_TEXT = 10_000;
const MAX_URL = 2048;
const MAX_OPTIONS = 200;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function invalid(message: string): never {
  throw new BadRequestException(message);
}

function isEmpty(value: unknown): boolean {
  return value === null || value === undefined;
}

function noConfig(config: unknown): PropertyConfig {
  if (!isEmpty(config) && typeof config !== 'object') {
    invalid('Invalid property config');
  }
  return {};
}

function normalizeOptions(config: unknown): PropertyConfig {
  const raw = (config as PropertyConfig | null | undefined)?.options ?? [];
  if (!Array.isArray(raw) || raw.length > MAX_OPTIONS) {
    invalid('Invalid select options');
  }
  const seen = new Set<string>();
  const options = raw.map((option: any): SelectOption => {
    const name = typeof option?.name === 'string' ? option.name.trim() : '';
    if (!name || name.length > 100) invalid('Option name is required');
    const id =
      typeof option.id === 'string' && option.id ? option.id : randomUUID();
    if (seen.has(id)) invalid('Duplicate option id');
    seen.add(id);
    const normalized: SelectOption = { id, name };
    if (typeof option.color === 'string') normalized.color = option.color;
    return normalized;
  });
  return { options };
}

function optionIds(config: PropertyConfig): Set<string> {
  return new Set((config.options ?? []).map((o) => o.id));
}

function validateDate(value: unknown): string {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) {
    invalid('Invalid date');
  }
  if (Number.isNaN(Date.parse(value))) invalid('Invalid date');
  return value;
}

export const PROPERTY_TYPES: Record<PropertyType, PropertyTypeDefinition> = {
  text: {
    normalizeConfig: noConfig,
    normalizeValue: (_config, value) => {
      if (isEmpty(value)) return null;
      if (typeof value !== 'string' || value.length > MAX_TEXT) {
        invalid('Invalid text value');
      }
      return value;
    },
    operators: ['is', 'is_not', 'contains', 'not_contains', 'is_empty', 'is_not_empty'],
  },
  number: {
    normalizeConfig: (config) => {
      const format = (config as PropertyConfig | null | undefined)?.format;
      if (format !== undefined && format !== 'number' && format !== 'percent') {
        invalid('Invalid number format');
      }
      return format ? { format } : {};
    },
    normalizeValue: (_config, value) => {
      if (isEmpty(value)) return null;
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        invalid('Invalid number value');
      }
      return value;
    },
    operators: ['is', 'is_not', 'gt', 'gte', 'lt', 'lte', 'is_empty', 'is_not_empty'],
  },
  select: {
    normalizeConfig: normalizeOptions,
    normalizeValue: (config, value) => {
      if (isEmpty(value)) return null;
      if (typeof value !== 'string' || !optionIds(config).has(value)) {
        invalid('Unknown select option');
      }
      return value;
    },
    operators: ['is', 'is_not', 'is_empty', 'is_not_empty'],
  },
  multi_select: {
    normalizeConfig: normalizeOptions,
    normalizeValue: (config, value) => {
      if (isEmpty(value)) return null;
      if (!Array.isArray(value)) invalid('Invalid multi-select value');
      const allowed = optionIds(config);
      const unique = [...new Set(value)];
      if (unique.some((v) => typeof v !== 'string' || !allowed.has(v))) {
        invalid('Unknown select option');
      }
      return unique.length ? (unique as string[]) : null;
    },
    operators: ['contains', 'not_contains', 'is_empty', 'is_not_empty'],
  },
  date: {
    normalizeConfig: noConfig,
    normalizeValue: (_config, value) => {
      if (isEmpty(value)) return null;
      if (typeof value !== 'object' || Array.isArray(value)) {
        invalid('Invalid date value');
      }
      const { start, end } = value as DateValue;
      const normalized: DateValue = { start: validateDate(start) };
      if (!isEmpty(end)) {
        normalized.end = validateDate(end);
        if (Date.parse(normalized.end) < Date.parse(normalized.start)) {
          invalid('Date end is before start');
        }
      }
      return normalized;
    },
    operators: ['is', 'gt', 'gte', 'lt', 'lte', 'is_empty', 'is_not_empty'],
  },
  checkbox: {
    normalizeConfig: noConfig,
    normalizeValue: (_config, value) => {
      if (isEmpty(value)) return null;
      if (typeof value !== 'boolean') invalid('Invalid checkbox value');
      return value;
    },
    operators: ['is'],
  },
  person: {
    normalizeConfig: noConfig,
    normalizeValue: (_config, value) => {
      if (isEmpty(value)) return null;
      if (typeof value !== 'string' || !UUID.test(value)) {
        invalid('Invalid person value');
      }
      return value;
    },
    operators: ['is', 'is_not', 'is_empty', 'is_not_empty'],
  },
  url: {
    normalizeConfig: noConfig,
    normalizeValue: (_config, value) => {
      if (isEmpty(value)) return null;
      if (typeof value !== 'string' || value.length > MAX_URL) {
        invalid('Invalid url value');
      }
      let parsed: URL;
      try {
        parsed = new URL(value);
      } catch {
        return invalid('Invalid url value');
      }
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        invalid('Only http(s) urls are allowed');
      }
      return value;
    },
    operators: ['is', 'contains', 'is_empty', 'is_not_empty'],
  },
};

export function isPropertyType(type: unknown): type is PropertyType {
  return (
    typeof type === 'string' &&
    (PROPERTY_TYPE_NAMES as readonly string[]).includes(type)
  );
}

export function getPropertyType(type: string): PropertyTypeDefinition {
  if (!isPropertyType(type)) invalid(`Unknown property type: ${type}`);
  return PROPERTY_TYPES[type];
}

/**
 * Validates a partial `props` patch ({ [propertyId]: value }) against the
 * collection's properties and returns the normalized patch. Unknown property
 * ids are rejected so props can't accumulate junk keys.
 */
export function normalizePropsPatch(
  properties: Array<{ id: string; type: string; config: unknown }>,
  patch: Record<string, unknown>,
): Record<string, PropertyValue> {
  const byId = new Map(properties.map((p) => [p.id, p]));
  const result: Record<string, PropertyValue> = {};
  for (const [propertyId, value] of Object.entries(patch ?? {})) {
    const property = byId.get(propertyId);
    if (!property) invalid(`Unknown property: ${propertyId}`);
    result[propertyId] = getPropertyType(property.type).normalizeValue(
      (property.config ?? {}) as PropertyConfig,
      value,
    );
  }
  return result;
}
