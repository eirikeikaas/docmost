import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { EnvironmentVariables } from './environment.validation';

const baseEnv = {
  DATABASE_URL: 'postgresql://docmost:pw@localhost:5432/docmost',
  REDIS_URL: 'redis://localhost:6379',
  APP_SECRET: 'x'.repeat(32),
};

function failingProperties(extra: Record<string, string | undefined>) {
  const config = plainToInstance(EnvironmentVariables, {
    ...baseEnv,
    ...extra,
  });
  return validateSync(config).map((error) => error.property);
}

describe('EnvironmentVariables - SSO_OIDC_ENTRA_*', () => {
  it('is valid with none of the variables set', () => {
    expect(failingProperties({})).toEqual([]);
  });

  it('is valid with a complete, correct configuration', () => {
    expect(
      failingProperties({
        SSO_OIDC_ENTRA_TENANT_ID: '0f1e2d3c-4b5a-4978-8a9b-0c1d2e3f4a5b',
        SSO_OIDC_ENTRA_CLIENT_ID: 'client-id',
        SSO_OIDC_ENTRA_CLIENT_SECRET: 'secret',
        SSO_OIDC_ENTRA_DISPLAY_NAME: 'Microsoft Entra ID',
        SSO_OIDC_ENTRA_ALLOW_SIGNUP: 'true',
        SSO_OIDC_ENTRA_ROLE_MAP: 'agents_admin=admin,agents_manage=member',
        SSO_OIDC_ENTRA_REQUIRED_ROLES: 'agents_admin,agents_manage',
      }),
    ).toEqual([]);
  });

  it('accepts a verified domain as the tenant', () => {
    expect(
      failingProperties({
        SSO_OIDC_ENTRA_TENANT_ID: 'contoso.onmicrosoft.com',
      }),
    ).toEqual([]);
  });

  it('treats blank values as unset', () => {
    expect(
      failingProperties({
        SSO_OIDC_ENTRA_TENANT_ID: '',
        SSO_OIDC_ENTRA_ALLOW_SIGNUP: ' ',
        SSO_OIDC_ENTRA_ROLE_MAP: '',
      }),
    ).toEqual([]);
  });

  it.each(['common', 'organizations', 'consumers', 'contoso', 'a b'])(
    'rejects the tenant "%s"',
    (tenant) => {
      expect(failingProperties({ SSO_OIDC_ENTRA_TENANT_ID: tenant })).toEqual([
        'SSO_OIDC_ENTRA_TENANT_ID',
      ]);
    },
  );

  it('rejects a role map that maps to owner or is malformed', () => {
    expect(
      failingProperties({ SSO_OIDC_ENTRA_ROLE_MAP: 'agents_admin=owner' }),
    ).toEqual(['SSO_OIDC_ENTRA_ROLE_MAP']);
    expect(
      failingProperties({ SSO_OIDC_ENTRA_ROLE_MAP: 'agents_admin' }),
    ).toEqual(['SSO_OIDC_ENTRA_ROLE_MAP']);
  });

  it('rejects a non-boolean allow-signup flag', () => {
    expect(failingProperties({ SSO_OIDC_ENTRA_ALLOW_SIGNUP: 'yes' })).toEqual([
      'SSO_OIDC_ENTRA_ALLOW_SIGNUP',
    ]);
  });
});
