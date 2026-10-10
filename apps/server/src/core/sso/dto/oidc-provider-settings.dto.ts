import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  OIDC_MAPPABLE_ROLES,
  MAX_OIDC_ROLE_CLAIM_LENGTH,
  MAX_OIDC_ROLE_ENTRIES,
  MAX_OIDC_ROLE_VALUE_LENGTH,
  OidcMappableRole,
} from '../oidc-provider-settings';
import { IsOidcRoleMap } from './is-oidc-role-map.validator';

// The optional, per-provider options stored in auth_providers.settings.
export class OidcProviderSettingsDto {
  // Accept the provider's email claim without email_verified=true. Needed for
  // Microsoft Entra, which omits it; read the nOAuth note in docs/sso-entra.md
  // before turning it on for anything but a single-tenant issuer.
  @IsOptional()
  @IsBoolean()
  trustUnverifiedEmail?: boolean;

  // Claim (or dotted path) holding the user's roles. No whitespace.
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_OIDC_ROLE_CLAIM_LENGTH)
  @Matches(/^\S+$/, { message: 'roleClaim must not contain whitespace' })
  roleClaim?: string;

  // claim value -> 'admin' | 'member'. Replaces the whole map; {} clears it.
  @IsOptional()
  @IsObject()
  @IsOidcRoleMap()
  roleMap?: Record<string, OidcMappableRole>;

  @IsOptional()
  @IsIn(OIDC_MAPPABLE_ROLES)
  defaultRole?: OidcMappableRole;

  // Replaces the whole list; [] clears it.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_OIDC_ROLE_ENTRIES)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(MAX_OIDC_ROLE_VALUE_LENGTH, { each: true })
  requiredRoles?: string[];
}
