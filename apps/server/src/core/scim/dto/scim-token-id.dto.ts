import { IsUUID } from 'class-validator';

export class ScimTokenIdDto {
  @IsUUID()
  id: string;
}
