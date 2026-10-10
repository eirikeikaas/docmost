import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  SERVICE_TOKEN_MAX_EXPIRY_DAYS,
  SERVICE_TOKEN_MIN_EXPIRY_DAYS,
} from '../service-token.constants';

export class CreateServiceTokenDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  name: string;

  // The service-account user the token authenticates as.
  @IsUUID()
  userId: string;

  // Defaults to 90 days.
  @IsOptional()
  @IsInt()
  @Min(SERVICE_TOKEN_MIN_EXPIRY_DAYS)
  @Max(SERVICE_TOKEN_MAX_EXPIRY_DAYS)
  expiresInDays?: number;
}
