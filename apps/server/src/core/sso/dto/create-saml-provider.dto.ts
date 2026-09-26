import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateSamlProviderDto {
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(100)
  @IsString()
  name: string;

  @IsNotEmpty()
  @IsUrl({ protocols: ['http', 'https'], require_tld: false })
  samlUrl: string;

  // The IdP's public signing certificate (PEM), used to validate assertion
  // signatures. Not a secret - safe to store/return like any other public
  // key material.
  @IsNotEmpty()
  @IsString()
  samlCertificate: string;

  @IsOptional()
  @IsBoolean()
  allowSignup?: boolean;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;
}
