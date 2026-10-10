import {
  buildEntraDiscoveryUrl,
  buildEntraIssuer,
  isEntraTenantGuid,
  isMultiTenantEntraIssuer,
  isValidEntraTenantId,
  parseRoleMapEnv,
} from './entra.util';

const GUID = '0f1e2d3c-4b5a-6978-8a9b-0c1d2e3f4a5b';

describe('isValidEntraTenantId', () => {
  it('accepts a tenant GUID in any case', () => {
    expect(isValidEntraTenantId(GUID)).toBe(true);
    expect(isValidEntraTenantId(GUID.toUpperCase())).toBe(true);
    expect(isEntraTenantGuid(GUID)).toBe(true);
  });

  it('accepts a verified domain', () => {
    expect(isValidEntraTenantId('contoso.onmicrosoft.com')).toBe(true);
    expect(isValidEntraTenantId('try.no')).toBe(true);
  });

  it('refuses the multi-tenant aliases in any case', () => {
    for (const alias of [
      'common',
      'organizations',
      'consumers',
      'Common',
      'CONSUMERS',
    ]) {
      expect(isValidEntraTenantId(alias)).toBe(false);
    }
  });

  it('refuses anything else that is not a GUID or a domain', () => {
    for (const value of [
      '',
      '   ',
      'contoso',
      'not a tenant',
      'contoso.com/../evil',
      'contoso.com/v2.0',
      'https://login.microsoftonline.com/x',
      `${GUID}/extra`,
      '0f1e2d3c-4b5a-6978-8a9b',
      '-bad.example.com',
      undefined,
      null,
      42,
    ]) {
      expect(isValidEntraTenantId(value as any)).toBe(false);
    }
  });
});

describe('issuer builders', () => {
  it('builds the tenant-specific v2.0 issuer', () => {
    expect(buildEntraIssuer(GUID.toUpperCase())).toBe(
      `https://login.microsoftonline.com/${GUID}/v2.0`,
    );
  });

  it('builds the discovery URL for a GUID or a domain', () => {
    expect(buildEntraDiscoveryUrl('Contoso.onmicrosoft.com')).toBe(
      'https://login.microsoftonline.com/contoso.onmicrosoft.com/v2.0/.well-known/openid-configuration',
    );
  });
});

describe('isMultiTenantEntraIssuer', () => {
  it('flags common, organizations and consumers on the Entra authority', () => {
    for (const tenant of ['common', 'organizations', 'consumers', 'Common']) {
      expect(
        isMultiTenantEntraIssuer(
          `https://login.microsoftonline.com/${tenant}/v2.0`,
        ),
      ).toBe(true);
    }
  });

  it('does not flag tenant-specific issuers or other providers', () => {
    expect(
      isMultiTenantEntraIssuer(
        `https://login.microsoftonline.com/${GUID}/v2.0`,
      ),
    ).toBe(false);
    expect(
      isMultiTenantEntraIssuer('https://accounts.example.com/common'),
    ).toBe(false);
    expect(isMultiTenantEntraIssuer('not a url')).toBe(false);
    expect(isMultiTenantEntraIssuer('https://login.microsoftonline.com/')).toBe(
      false,
    );
  });
});

describe('parseRoleMapEnv', () => {
  it('parses the comma separated claim=role format', () => {
    expect(parseRoleMapEnv('agents_admin=admin,agents_manage=member')).toEqual({
      agents_admin: 'admin',
      agents_manage: 'member',
    });
  });

  it('tolerates whitespace, case in the role and a trailing comma', () => {
    expect(
      parseRoleMapEnv(' agents_admin = Admin , agents_manage=MEMBER, '),
    ).toEqual({ agents_admin: 'admin', agents_manage: 'member' });
  });

  it('treats blank input as an empty map', () => {
    expect(parseRoleMapEnv('')).toEqual({});
    expect(parseRoleMapEnv(undefined)).toEqual({});
    expect(parseRoleMapEnv('   ')).toEqual({});
  });

  it('refuses owner and unknown roles', () => {
    expect(parseRoleMapEnv('x=owner')).toBeNull();
    expect(parseRoleMapEnv('x=superuser')).toBeNull();
  });

  it('refuses malformed pairs', () => {
    expect(parseRoleMapEnv('agents_admin')).toBeNull();
    expect(parseRoleMapEnv('=admin')).toBeNull();
    expect(parseRoleMapEnv('agents_admin=')).toBeNull();
    expect(parseRoleMapEnv('a=admin,b')).toBeNull();
  });
});
