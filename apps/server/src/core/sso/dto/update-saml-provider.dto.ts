import { PartialType } from '@nestjs/mapped-types';
import { IsUUID } from 'class-validator';
import { CreateSamlProviderDto } from './create-saml-provider.dto';

export class UpdateSamlProviderDto extends PartialType(CreateSamlProviderDto) {
  @IsUUID()
  id: string;
}
