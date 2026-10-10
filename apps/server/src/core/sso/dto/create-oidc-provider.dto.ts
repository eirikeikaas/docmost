import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateOidcProviderDto {
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(100)
  @IsString()
  name: string;

  @IsNotEmpty()
  @IsUrl({ protocols: ['http', 'https'], require_tld: false })
  oidcIssuer: string;

  @IsNotEmpty()
  @IsString()
  oidcClientId: string;

  @IsNotEmpty()
  @IsString()
  oidcClientSecret: string;

  @IsOptional()
  @IsBoolean()
  allowSignup?: boolean;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;
}
