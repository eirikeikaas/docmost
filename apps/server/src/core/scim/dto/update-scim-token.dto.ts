import { IsBoolean, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class UpdateScimTokenDto {
  @IsUUID()
  id: string;

  @IsOptional()
  @MinLength(1)
  @MaxLength(100)
  @IsString()
  name?: string;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;
}
