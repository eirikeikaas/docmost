import { IsUUID } from 'class-validator';

export class OidcProviderIdDto {
  @IsUUID()
  id: string;
}
