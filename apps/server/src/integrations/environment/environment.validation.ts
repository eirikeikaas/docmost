import {
  IsIn,
  IsNotEmpty,
  IsNotIn,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MinLength,
  ValidateBy,
  ValidateIf,
  validateSync,
} from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { IsISO6391 } from '../../common/validators/is-iso6391';
import {
  isValidEntraTenantId,
  isValidRoleMapEnv,
} from '../../core/sso/entra.util';

// An optional variable left blank in .env (KEY=) counts as unset.
const isSet = (value: unknown): boolean =>
  value !== undefined && value !== null && String(value).trim() !== '';

function EnvCheck(
  check: (value: unknown) => boolean,
  message: string,
): PropertyDecorator {
  return ValidateBy({
    name: 'envCheck',
    validator: {
      validate: (value): boolean => check(value),
      defaultMessage: () => message,
    },
  });
}

export class EnvironmentVariables {
  @IsNotEmpty()
  @IsUrl(
    {
      protocols: ['postgres', 'postgresql'],
      require_tld: false,
      allow_underscores: true,
    },
    { message: 'DATABASE_URL must be a valid postgres connection string' },
  )
  DATABASE_URL: string;

  @IsNotEmpty()
  @IsUrl(
    {
      protocols: ['redis', 'rediss'],
      require_tld: false,
      allow_underscores: true,
    },
    { message: 'REDIS_URL must be a valid redis connection string' },
  )
  REDIS_URL: string;

  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_tld: false })
  APP_URL: string;

  @IsNotEmpty()
  @MinLength(32)
  @IsNotIn(['REPLACE_WITH_LONG_SECRET'])
  APP_SECRET: string;

  @IsOptional()
  @IsIn(['smtp', 'postmark'])
  MAIL_DRIVER: string;

  @IsOptional()
  @IsIn(['local', 's3', 'azure'])
  STORAGE_DRIVER: string;

  @IsOptional()
  @ValidateIf((obj) => obj.COLLAB_URL != '' && obj.COLLAB_URL != null)
  @IsUrl({ protocols: ['http', 'https'], require_tld: false })
  COLLAB_URL: string;

  @IsOptional()
  CLOUD: boolean;

  @IsOptional()
  @IsUrl(
    { protocols: [], require_tld: true },
    {
      message:
        'SUBDOMAIN_HOST must be a valid FQDN domain without the http protocol. e.g example.com',
    },
  )
  @ValidateIf((obj) => obj.CLOUD === 'true'.toLowerCase())
  SUBDOMAIN_HOST: string;

  @IsOptional()
  @IsIn(['database', 'typesense'])
  @IsString()
  SEARCH_DRIVER: string;

  @IsOptional()
  @IsUrl(
    {
      protocols: ['http', 'https'],
      require_tld: false,
      allow_underscores: true,
    },
    {
      message:
        'TYPESENSE_URL must be a valid typesense url e.g http://localhost:8108',
    },
  )
  @ValidateIf((obj) => obj.SEARCH_DRIVER === 'typesense')
  TYPESENSE_URL: string;

  @ValidateIf((obj) => obj.SEARCH_DRIVER === 'typesense')
  @IsNotEmpty()
  @IsString()
  TYPESENSE_API_KEY: string;

  @IsOptional()
  @ValidateIf((obj) => obj.SEARCH_DRIVER === 'typesense')
  @IsISO6391()
  @IsString()
  TYPESENSE_LOCALE: string;

  @IsOptional()
  @ValidateIf((obj) => obj.AI_DRIVER)
  @IsIn(['openai', 'openai-compatible', 'gemini', 'ollama'])
  @IsString()
  AI_DRIVER: string;

  @IsOptional()
  @ValidateIf((obj) => obj.AI_VECTOR_DRIVER)
  @IsIn(['pgvector', 'turbopuffer'])
  @IsString()
  AI_VECTOR_DRIVER: string;

  @ValidateIf((obj) => obj.AI_VECTOR_DRIVER === 'turbopuffer')
  @IsNotEmpty()
  @IsString()
  TURBOPUFFER_API_KEY: string;

  @ValidateIf(
    (obj) =>
      obj.AI_VECTOR_DRIVER === 'turbopuffer' && !obj.TURBOPUFFER_BASE_URL,
  )
  @IsNotEmpty({
    message:
      'TURBOPUFFER_REGION is required when AI_VECTOR_DRIVER is turbopuffer, unless TURBOPUFFER_BASE_URL is set',
  })
  @IsString()
  TURBOPUFFER_REGION: string;

  @IsOptional()
  @ValidateIf((obj) => obj.TURBOPUFFER_BASE_URL != '' && obj.TURBOPUFFER_BASE_URL != null)
  @IsUrl({ protocols: ['http', 'https'], require_tld: false })
  TURBOPUFFER_BASE_URL: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9\-_.]{1,90}$/, {
    message:
      'TURBOPUFFER_NAMESPACE_PREFIX may only contain letters, digits, dot, dash, underscore (max 90 chars)',
  })
  TURBOPUFFER_NAMESPACE_PREFIX: string;

  @IsOptional()
  @IsString()
  AI_EMBEDDING_MODEL: string;

  @ValidateIf((obj) => obj.AI_EMBEDDING_DIMENSION)
  @IsIn(['768', '1024', '1536', '2000', '3072'])
  @IsString()
  AI_EMBEDDING_DIMENSION: string;

  @IsOptional()
  @ValidateIf((obj) => obj.AI_EMBEDDING_SUPPORTS_MRL)
  @IsIn(['true', 'false'])
  @IsString()
  AI_EMBEDDING_SUPPORTS_MRL: string;

  @ValidateIf((obj) => obj.AI_DRIVER)
  @IsString()
  @IsNotEmpty()
  AI_COMPLETION_MODEL: string;

  @IsOptional()
  @ValidateIf(
    (obj) =>
      obj.AI_DRIVER && ['openai', 'openai-compatible'].includes(obj.AI_DRIVER),
  )
  @IsString()
  @IsNotEmpty()
  OPENAI_API_KEY: string;

  @IsOptional()
  @ValidateIf(
    (obj) =>
      obj.AI_DRIVER === 'openai-compatible' ||
      (obj.AI_DRIVER === 'openai' && obj.OPENAI_API_URL),
  )
  @IsUrl({ protocols: ['http', 'https'], require_tld: false })
  OPENAI_API_URL: string;

  @ValidateIf((obj) => obj.AI_DRIVER && obj.AI_DRIVER === 'gemini')
  @IsString()
  @IsNotEmpty()
  GEMINI_API_KEY: string;

  @ValidateIf((obj) => obj.AI_DRIVER && obj.AI_DRIVER === 'ollama')
  @IsUrl({ protocols: ['http', 'https'], require_tld: false })
  OLLAMA_API_URL: string;

  @IsOptional()
  @IsIn(['postgres', 'clickhouse'])
  @IsString()
  EVENT_STORE_DRIVER: string;

  // Microsoft Entra ID bootstrap - see docs/sso-entra.md
  @ValidateIf((obj) => isSet(obj.SSO_OIDC_ENTRA_TENANT_ID))
  @EnvCheck(
    isValidEntraTenantId,
    'SSO_OIDC_ENTRA_TENANT_ID must be a tenant (directory) GUID or a verified domain such as contoso.onmicrosoft.com. "common", "organizations" and "consumers" are not supported: their issuer never matches the issued tokens',
  )
  SSO_OIDC_ENTRA_TENANT_ID: string;

  @IsOptional()
  @IsString()
  SSO_OIDC_ENTRA_CLIENT_ID: string;

  @IsOptional()
  @IsString()
  SSO_OIDC_ENTRA_CLIENT_SECRET: string;

  @IsOptional()
  @IsString()
  SSO_OIDC_ENTRA_DISPLAY_NAME: string;

  @ValidateIf((obj) => isSet(obj.SSO_OIDC_ENTRA_ALLOW_SIGNUP))
  @IsIn(['true', 'false'], {
    message: 'SSO_OIDC_ENTRA_ALLOW_SIGNUP must be "true" or "false"',
  })
  SSO_OIDC_ENTRA_ALLOW_SIGNUP: string;

  @ValidateIf((obj) => isSet(obj.SSO_OIDC_ENTRA_ROLE_MAP))
  @EnvCheck(
    isValidRoleMapEnv,
    'SSO_OIDC_ENTRA_ROLE_MAP must look like "agents_admin=admin,agents_manage=member" (roles can only map to admin or member, never owner)',
  )
  SSO_OIDC_ENTRA_ROLE_MAP: string;

  @IsOptional()
  @IsString()
  SSO_OIDC_ENTRA_REQUIRED_ROLES: string;

  @ValidateIf((obj) => obj.EVENT_STORE_DRIVER === 'clickhouse')
  @IsNotEmpty()
  @IsUrl(
    { protocols: ['http', 'https'], require_tld: false },
    {
      message:
        'CLICKHOUSE_URL must be a valid URL e.g http://user:password@localhost:8123/docmost',
    },
  )
  CLICKHOUSE_URL: string;
}

export function validate(config: Record<string, any>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config);

  const errors = validateSync(validatedConfig);

  if (errors.length > 0) {
    console.error(
      'The Environment variables has failed the following validations:',
    );

    errors.map((error) => {
      console.error(JSON.stringify(error.constraints));
    });

    console.error(
      'Please fix the environment variables and try again. Exiting program...',
    );
    process.exit(1);
  }

  return validatedConfig;
}
