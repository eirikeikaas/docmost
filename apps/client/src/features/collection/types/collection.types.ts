import { IPage } from "@/features/page/types/page.types";

export type PropertyType =
  | "text"
  | "number"
  | "select"
  | "multi_select"
  | "date"
  | "checkbox"
  | "person"
  | "url";

export const PROPERTY_TYPES: PropertyType[] = [
  "text",
  "number",
  "select",
  "multi_select",
  "date",
  "checkbox",
  "person",
  "url",
];

export type SelectOption = { id: string; name: string; color?: string };

export type PropertyConfig = {
  options?: SelectOption[];
  format?: "number" | "percent";
};

export type DateValue = { start: string; end?: string };

export type PropertyValue =
  | string
  | number
  | boolean
  | string[]
  | DateValue
  | null;

export type ItemProps = Record<string, PropertyValue | undefined>;

export interface IItemProperty {
  id: string;
  collectionId: string;
  name: string;
  type: PropertyType;
  config: PropertyConfig;
  position: string;
}

export type FilterOperator =
  | "is"
  | "is_not"
  | "contains"
  | "not_contains"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "is_empty"
  | "is_not_empty";

export type ItemFilter = {
  propertyId: string;
  op: FilterOperator;
  value?: unknown;
};

export type ItemSort = { propertyId: string; direction: "asc" | "desc" };

export type ViewType = "table" | "kanban";

export type ViewConfig = {
  filters?: ItemFilter[];
  sorts?: ItemSort[];
  groupBy?: string;
  visibleProperties?: string[];
  cardProperties?: string[];
  columnWidths?: Record<string, number>;
};

export interface IItemView {
  id: string;
  collectionId: string;
  name: string;
  type: ViewType;
  config: ViewConfig;
  position: string;
}

export interface ICollection {
  id: string;
  pageId: string;
  spaceId: string;
  properties: IItemProperty[];
  views: IItemView[];
  canEdit: boolean;
}

export interface ICreatedCollection extends ICollection {
  page: IPage;
}

export interface IItem {
  id: string;
  collectionId: string;
  pageId: string | null;
  title: string;
  props: ItemProps;
  position: string;
  createdAt: string;
  updatedAt: string;
}

export interface IItemList {
  items: IItem[];
  nextCursor: string | null;
}
