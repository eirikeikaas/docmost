import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateScimTokenDto {
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(100)
  @IsString()
  name: string;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;
}
