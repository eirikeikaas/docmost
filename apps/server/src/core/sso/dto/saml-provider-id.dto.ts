import { IsUUID } from 'class-validator';

export class SamlProviderIdDto {
  @IsUUID()
  id: string;
}
