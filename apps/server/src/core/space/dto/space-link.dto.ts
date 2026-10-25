import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';
import { SPACE_LINK_PROVIDERS } from '../space-links';
import type { SpaceLinkProvider } from '../space-links';

export class SetSpaceLinkDto {
  @IsString()
  @IsNotEmpty()
  spaceId: string;

  @IsIn(SPACE_LINK_PROVIDERS)
  provider: SpaceLinkProvider;

  @IsOptional()
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] })
  @MaxLength(2048)
  url?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  externalId?: string;
}

export class RemoveSpaceLinkDto {
  @IsString()
  @IsNotEmpty()
  spaceId: string;

  @IsIn(SPACE_LINK_PROVIDERS)
  provider: SpaceLinkProvider;
}

export class SpaceByProjectDto {
  @IsString()
  @IsNotEmpty()
  projectId: string;
}
