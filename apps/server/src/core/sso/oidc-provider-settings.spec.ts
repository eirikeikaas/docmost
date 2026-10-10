import {
  hasRequiredRole,
  mergeOidcProviderSettings,
  parseOidcProviderSettings,
  resolveMappedRole,
} from './oidc-provider-settings';

describe('parseOidcProviderSettings', () => {
  it('returns the fail-closed defaults for missing, null or non-object settings', () => {
    const defaults = {
      trustUnverifiedEmail: false,
      roleClaim: 'roles',
      roleMap: {},
      defaultRole: 'member',
      requiredRoles: [],
    };

    expect(parseOidcProviderSettings(undefined)).toEqual(defaults);
    expect(parseOidcProviderSettings(null)).toEqual(defaults);
    expect(parseOidcProviderSettings({})).toEqual(defaults);
    expect(parseOidcProviderSettings('nope')).toEqual(defaults);
    expect(parseOidcProviderSettings([])).toEqual(defaults);
  });

  it('only treats trustUnverifiedEmail as on when it is exactly true', () => {
    expect(
      parseOidcProviderSettings({ trustUnverifiedEmail: true })
        .trustUnverifiedEmail,
    ).toBe(true);
    for (const value of ['true', 1, 'yes', {}, [], null]) {
      expect(
        parseOidcProviderSettings({ trustUnverifiedEmail: value })
          .trustUnverifiedEmail,
      ).toBe(false);
    }
  });

  it('reads a custom roleClaim and falls back to roles for blank or invalid ones', () => {
    expect(parseOidcProviderSettings({ roleClaim: ' groups ' }).roleClaim).toBe(
      'groups',
    );
    expect(parseOidcProviderSettings({ roleClaim: '   ' }).roleClaim).toBe(
      'roles',
    );
    expect(parseOidcProviderSettings({ roleClaim: 42 }).roleClaim).toBe(
      'roles',
    );
  });

  it('keeps only admin and member entries of the role mappings and drops owner', () => {
    const { roleMap } = parseOidcProviderSettings({
      roleMappings: [
        { claimValue: 'agents_admin', role: 'admin' },
        { claimValue: 'agents_manage', role: 'member' },
        { claimValue: 'agents_owner', role: 'owner' },
        { claimValue: 'bogus', role: 'superuser' },
        { claimValue: 'also_bogus', role: 7 },
        { claimValue: '  ', role: 'admin' },
        { role: 'admin' },
        'junk',
      ],
    });

    expect(roleMap).toEqual({ agents_admin: 'admin', agents_manage: 'member' });
  });

  it('keeps claim values with underscores, dashes and dots exactly as stored', () => {
    // The persisted list exists so that nothing re-cases these.
    const { roleMap } = parseOidcProviderSettings({
      roleMappings: [
        { claimValue: 'agents_admin', role: 'admin' },
        { claimValue: 'Docs-Admin', role: 'admin' },
        { claimValue: 'a.b_c', role: 'member' },
      ],
    });

    expect(roleMap).toEqual({
      agents_admin: 'admin',
      'Docs-Admin': 'admin',
      'a.b_c': 'member',
    });
  });

  it('ignores a hand-written roleMap object: its keys cannot be read back reliably', () => {
    expect(
      parseOidcProviderSettings({ roleMap: { agents_admin: 'admin' } }).roleMap,
    ).toEqual({});
  });

  it('lets the first entry win for a repeated claim value', () => {
    const { roleMap } = parseOidcProviderSettings({
      roleMappings: [
        { claimValue: 'x', role: 'member' },
        { claimValue: 'x', role: 'admin' },
      ],
    });

    expect(roleMap).toEqual({ x: 'member' });
  });

  it('refuses owner as defaultRole', () => {
    expect(
      parseOidcProviderSettings({ defaultRole: 'owner' }).defaultRole,
    ).toBe('member');
    expect(
      parseOidcProviderSettings({ defaultRole: 'admin' }).defaultRole,
    ).toBe('admin');
  });

  it('trims, de-duplicates and filters requiredRoles', () => {
    expect(
      parseOidcProviderSettings({
        requiredRoles: [
          ' agents_admin ',
          'agents_admin',
          '',
          3,
          'agents_manage',
        ],
      }).requiredRoles,
    ).toEqual(['agents_admin', 'agents_manage']);
    expect(
      parseOidcProviderSettings({ requiredRoles: 'agents_admin' })
        .requiredRoles,
    ).toEqual([]);
  });
});

describe('mergeOidcProviderSettings', () => {
  it('returns undefined for an empty patch so callers skip the write', () => {
    expect(mergeOidcProviderSettings({ a: 1 }, {})).toBeUndefined();
    expect(
      mergeOidcProviderSettings({ a: 1 }, { roleClaim: undefined }),
    ).toBeUndefined();
  });

  it('preserves keys it does not own and settings that were not patched', () => {
    const merged = mergeOidcProviderSettings(
      {
        somethingElse: { keep: true },
        roleClaim: 'groups',
        roleMappings: [{ claimValue: 'x', role: 'admin' }],
      },
      { trustUnverifiedEmail: true },
    );

    expect(merged).toEqual({
      somethingElse: { keep: true },
      trustUnverifiedEmail: true,
      roleClaim: 'groups',
      roleMappings: [{ claimValue: 'x', role: 'admin' }],
      defaultRole: 'member',
      requiredRoles: [],
    });
  });

  it('drops a hand-written roleMap object when it rewrites the settings', () => {
    const merged = mergeOidcProviderSettings(
      { roleMap: { agentsAdmin: 'admin' } },
      { trustUnverifiedEmail: true },
    );

    expect(merged).not.toHaveProperty('roleMap');
    expect(merged).toHaveProperty('roleMappings', []);
  });

  it('replaces roleMap and requiredRoles wholesale, and lets empty values clear them', () => {
    const merged = mergeOidcProviderSettings(
      {
        roleMappings: [{ claimValue: 'old', role: 'admin' }],
        requiredRoles: ['old'],
      },
      { roleMap: {}, requiredRoles: [] },
    );

    expect(merged).toMatchObject({ roleMappings: [], requiredRoles: [] });
  });

  it('normalises what it writes (no owner, no blanks)', () => {
    const merged = mergeOidcProviderSettings(undefined, {
      roleMap: { a: 'admin', b: 'owner' } as any,
      requiredRoles: [' x ', 'x'],
      defaultRole: 'owner' as any,
    });

    expect(merged).toMatchObject({
      roleMappings: [{ claimValue: 'a', role: 'admin' }],
      requiredRoles: ['x'],
      defaultRole: 'member',
    });
  });
});

describe('resolveMappedRole', () => {
  const roleMap = {
    agents_admin: 'admin',
    agents_manage: 'member',
  } as const;

  it('returns the highest privilege among the matching values', () => {
    expect(resolveMappedRole(['agents_manage', 'agents_admin'], roleMap)).toBe(
      'admin',
    );
    expect(resolveMappedRole(['agents_admin', 'agents_manage'], roleMap)).toBe(
      'admin',
    );
    expect(resolveMappedRole(['agents_manage'], roleMap)).toBe('member');
  });

  it('returns undefined when nothing matches', () => {
    expect(resolveMappedRole(['other'], roleMap)).toBeUndefined();
    expect(resolveMappedRole([], roleMap)).toBeUndefined();
  });

  it('is case-sensitive and ignores inherited object keys', () => {
    expect(resolveMappedRole(['AGENTS_ADMIN'], roleMap)).toBeUndefined();
    expect(
      resolveMappedRole(['constructor', 'toString', '__proto__'], roleMap),
    ).toBeUndefined();
  });
});

describe('hasRequiredRole', () => {
  it('is always satisfied when no role is required', () => {
    expect(hasRequiredRole([], [])).toBe(true);
    expect(hasRequiredRole(['anything'], [])).toBe(true);
  });

  it('needs at least one required role in the claim', () => {
    expect(hasRequiredRole(['a', 'b'], ['b', 'c'])).toBe(true);
    expect(hasRequiredRole(['a'], ['b', 'c'])).toBe(false);
    expect(hasRequiredRole([], ['b'])).toBe(false);
  });
});
