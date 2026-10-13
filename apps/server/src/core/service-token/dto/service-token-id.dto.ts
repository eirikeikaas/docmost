import { IsUUID } from 'class-validator';

export class ServiceTokenIdDto {
  @IsUUID()
  id: string;
}
