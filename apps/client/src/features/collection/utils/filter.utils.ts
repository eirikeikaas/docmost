import {
  FilterOperator,
  ItemFilter,
  IItemProperty,
  PropertyType,
} from "@/features/collection/types/collection.types";

/** Mirrors the server's property-type registry (operators per type). */
export const OPERATORS_BY_TYPE: Record<PropertyType, FilterOperator[]> = {
  text: ["contains", "not_contains", "is", "is_not", "is_empty", "is_not_empty"],
  number: ["is", "is_not", "gt", "gte", "lt", "lte", "is_empty", "is_not_empty"],
  select: ["is", "is_not", "is_empty", "is_not_empty"],
  multi_select: ["contains", "not_contains", "is_empty", "is_not_empty"],
  date: ["is", "gt", "gte", "lt", "lte", "is_empty", "is_not_empty"],
  checkbox: ["is"],
  person: ["is", "is_not", "is_empty", "is_not_empty"],
  url: ["contains", "is", "is_empty", "is_not_empty"],
};

export const OPERATOR_LABELS: Record<FilterOperator, string> = {
  is: "is",
  is_not: "is not",
  contains: "contains",
  not_contains: "does not contain",
  gt: "is after / greater than",
  gte: "is on or after / at least",
  lt: "is before / less than",
  lte: "is on or before / at most",
  is_empty: "is empty",
  is_not_empty: "is not empty",
};

export const needsValue = (op: FilterOperator) =>
  op !== "is_empty" && op !== "is_not_empty";

/** A fresh filter for a property, with the first operator and a sane default. */
export function newFilter(property: IItemProperty): ItemFilter {
  const op = OPERATORS_BY_TYPE[property.type][0];
  return {
    propertyId: property.id,
    op,
    ...(needsValue(op) && property.type === "checkbox" ? { value: true } : {}),
  };
}

/** A filter is applied only once it has everything the server needs. */
export function isCompleteFilter(filter: ItemFilter): boolean {
  if (!needsValue(filter.op)) return true;
  return filter.value !== undefined && filter.value !== null && filter.value !== "";
}

/** Switching property resets operator and value (they depend on the type). */
export function retargetFilter(
  filter: ItemFilter,
  property: IItemProperty,
): ItemFilter {
  return { ...newFilter(property), propertyId: property.id };
}
