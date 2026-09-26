import { PartialType } from '@nestjs/mapped-types';
import { IsUUID } from 'class-validator';
import { CreateOidcProviderDto } from './create-oidc-provider.dto';

export class UpdateOidcProviderDto extends PartialType(CreateOidcProviderDto) {
  @IsUUID()
  id: string;
}
