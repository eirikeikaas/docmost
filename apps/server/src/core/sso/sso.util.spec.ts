import {
  extractClaimValues,
  isSafeRedirectPath,
  resolveEmailFromClaims,
} from './sso.util';

describe('extractClaimValues', () => {
  it('reads an array claim', () => {
    expect(
      extractClaimValues({ roles: ['agents_admin', 'agents_manage'] }, 'roles'),
    ).toEqual(['agents_admin', 'agents_manage']);
  });

  it('treats a bare string as a single value without splitting it', () => {
    expect(extractClaimValues({ roles: 'Docs Admin' }, 'roles')).toEqual([
      'Docs Admin',
    ]);
  });

  it('distinguishes an absent claim (undefined) from an empty one ([])', () => {
    expect(extractClaimValues({}, 'roles')).toBeUndefined();
    expect(extractClaimValues(undefined, 'roles')).toBeUndefined();
    expect(extractClaimValues({ roles: null }, 'roles')).toBeUndefined();
    expect(extractClaimValues({ roles: [] }, 'roles')).toEqual([]);
  });

  it('drops non-string and blank entries', () => {
    expect(
      extractClaimValues({ roles: ['a', 1, null, '  ', ' b '] }, 'roles'),
    ).toEqual(['a', 'b']);
    expect(extractClaimValues({ roles: { a: 1 } }, 'roles')).toEqual([]);
  });

  it('walks a dotted path', () => {
    expect(
      extractClaimValues(
        { realm_access: { roles: ['x'] } },
        'realm_access.roles',
      ),
    ).toEqual(['x']);
    expect(
      extractClaimValues({ realm_access: {} }, 'realm_access.roles'),
    ).toBeUndefined();
  });

  it('prefers an exact top-level match for claim names that contain dots', () => {
    expect(
      extractClaimValues(
        { 'https://example.com/roles': ['x'] },
        'https://example.com/roles',
      ),
    ).toEqual(['x']);
  });

  it('does not read inherited properties', () => {
    expect(extractClaimValues({}, 'constructor')).toBeUndefined();
    expect(extractClaimValues({}, '__proto__.polluted')).toBeUndefined();
  });
});

describe('resolveEmailFromClaims', () => {
  it('prefers the email claim', () => {
    expect(
      resolveEmailFromClaims([
        {
          email: 'Jane@Contoso.com',
          preferred_username: 'jane@other.com',
          upn: 'jane@third.com',
        },
      ]),
    ).toEqual({ email: 'jane@contoso.com', claim: 'email' });
  });

  it('falls back to preferred_username, then upn', () => {
    expect(
      resolveEmailFromClaims([
        { preferred_username: 'jane@contoso.com', upn: 'jane@upn.com' },
      ]),
    ).toEqual({ email: 'jane@contoso.com', claim: 'preferred_username' });

    expect(resolveEmailFromClaims([{ upn: 'jane@upn.com' }])).toEqual({
      email: 'jane@upn.com',
      claim: 'upn',
    });
  });

  it('accepts only values that look like an address', () => {
    expect(
      resolveEmailFromClaims([
        { email: 'not-an-email', preferred_username: 'also no', upn: 'x' },
      ]),
    ).toBeUndefined();
    expect(
      resolveEmailFromClaims([{ email: '@nope', preferred_username: 'nope@' }]),
    ).toBeUndefined();
    expect(resolveEmailFromClaims([{ email: 'a b@c.com' }])).toBeUndefined();
    expect(resolveEmailFromClaims([{ email: 42 as any }])).toBeUndefined();
  });

  it('skips an unusable email claim and takes the next claim', () => {
    expect(
      resolveEmailFromClaims([
        { email: 'no-at-sign', preferred_username: 'jane@contoso.com' },
      ]),
    ).toEqual({ email: 'jane@contoso.com', claim: 'preferred_username' });
  });

  it('looks in every source for a claim before moving to the next claim', () => {
    expect(
      resolveEmailFromClaims([
        { preferred_username: 'jane@contoso.com' },
        { email: 'jane@mail.contoso.com' },
      ]),
    ).toEqual({ email: 'jane@mail.contoso.com', claim: 'email' });
  });

  it('returns undefined when there is nothing usable', () => {
    expect(resolveEmailFromClaims([])).toBeUndefined();
    expect(resolveEmailFromClaims([undefined, {}])).toBeUndefined();
  });
});

describe('isSafeRedirectPath', () => {
  it('accepts a relative path and rejects open-redirect shapes', () => {
    expect(isSafeRedirectPath('/home')).toBe('/home');
    expect(isSafeRedirectPath('//evil.example')).toBeNull();
    expect(isSafeRedirectPath('https://evil.example')).toBeNull();
    expect(isSafeRedirectPath(undefined)).toBeNull();
  });
});
