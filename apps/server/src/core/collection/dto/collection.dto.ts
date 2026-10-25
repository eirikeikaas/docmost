import {
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { PROPERTY_TYPE_NAMES } from '../property-types/property-types';

export const VIEW_TYPES = ['table', 'kanban'] as const;
export type ViewType = (typeof VIEW_TYPES)[number];

export class CreateCollectionDto {
  @IsUUID()
  spaceId: string;

  @IsOptional()
  @IsString()
  parentPageId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  icon?: string;
}

export class CollectionInfoDto {
  @ValidateIf((o) => !o.pageId)
  @IsUUID()
  collectionId?: string;

  @ValidateIf((o) => !o.collectionId)
  @IsString()
  @IsNotEmpty()
  pageId?: string;
}

export class CollectionIdDto {
  @IsUUID()
  collectionId: string;
}

// Properties

export class CreatePropertyDto extends CollectionIdDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsIn(PROPERTY_TYPE_NAMES)
  type: string;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}

export class UpdatePropertyDto extends CollectionIdDto {
  @IsUUID()
  propertyId: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}

export class PropertyIdDto extends CollectionIdDto {
  @IsUUID()
  propertyId: string;
}

export class ReorderPropertyDto extends PropertyIdDto {
  // Place the property right after this one; null/omitted = first.
  @IsOptional()
  @IsUUID()
  afterPropertyId?: string | null;
}

// Views

export class CreateViewDto extends CollectionIdDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsIn(VIEW_TYPES)
  type: ViewType;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}

export class UpdateViewDto extends CollectionIdDto {
  @IsUUID()
  viewId: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}

export class ViewIdDto extends CollectionIdDto {
  @IsUUID()
  viewId: string;
}

// Items

export class ListItemsDto extends CollectionIdDto {
  // Use this view's filters/sorts unless explicit ones are given.
  @IsOptional()
  @IsUUID()
  viewId?: string;

  @IsOptional()
  @IsArray()
  filters?: Array<{ propertyId: string; op: string; value?: unknown }>;

  @IsOptional()
  @IsArray()
  sorts?: Array<{ propertyId: string; direction: string }>;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  cursor?: string;
}

export class CreateItemDto extends CollectionIdDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  title?: string;

  // { [propertyId]: value }
  @IsOptional()
  @IsObject()
  props?: Record<string, unknown>;

  // Neighbours for ordering; omit both to append to the end.
  @IsOptional()
  @IsUUID()
  afterItemId?: string;

  @IsOptional()
  @IsUUID()
  beforeItemId?: string;
}

export class ItemIdDto {
  @IsUUID()
  itemId: string;
}

export class UpdateItemDto extends ItemIdDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  title?: string;

  // Partial patch; `null` clears a value.
  @IsOptional()
  @IsObject()
  props?: Record<string, unknown>;
}

export class MoveItemDto extends ItemIdDto {
  @IsOptional()
  @IsUUID()
  afterItemId?: string;

  @IsOptional()
  @IsUUID()
  beforeItemId?: string;

  // Applied atomically with the move (e.g. the kanban group property).
  @IsOptional()
  @IsObject()
  props?: Record<string, unknown>;
}
