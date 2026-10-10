import { Logger } from '@nestjs/common';
import { SsoEntraBootstrapService } from './sso-entra-bootstrap.service';

const GUID = '0f1e2d3c-4b5a-4978-8a9b-0c1d2e3f4a5b';
const ISSUER = `https://login.microsoftonline.com/${GUID}/v2.0`;
const workspace: any = { id: 'ws_1' };

type Env = Partial<{
  cloud: boolean;
  tenant: string;
  clientId: string;
  clientSecret: string;
  displayName: string;
  allowSignup: boolean;
  roleMap: string;
  requiredRoles: string[];
}>;

const fullEnv: Env = {
  tenant: GUID,
  clientId: 'client-id',
  clientSecret: 'client-secret',
  roleMap: 'agents_admin=admin,agents_manage=member',
  requiredRoles: ['agents_admin', 'agents_manage', 'agents_member'],
};

function createService(
  env: Env = fullEnv,
  overrides: Partial<Record<string, any>> = {},
) {
  const environmentService = {
    isCloud: jest.fn().mockReturnValue(env.cloud ?? false),
    getSsoOidcEntraTenantId: jest.fn().mockReturnValue(env.tenant),
    getSsoOidcEntraClientId: jest.fn().mockReturnValue(env.clientId),
    getSsoOidcEntraClientSecret: jest.fn().mockReturnValue(env.clientSecret),
    getSsoOidcEntraDisplayName: jest
      .fn()
      .mockReturnValue(env.displayName ?? 'Microsoft Entra ID'),
    getSsoOidcEntraAllowSignup: jest
      .fn()
      .mockReturnValue(env.allowSignup ?? true),
    getSsoOidcEntraRoleMap: jest.fn().mockReturnValue(env.roleMap ?? ''),
    getSsoOidcEntraRequiredRoles: jest
      .fn()
      .mockReturnValue(env.requiredRoles ?? []),
  };
  const workspaceRepo = {
    findFirst: jest.fn().mockResolvedValue(workspace),
    ...overrides.workspaceRepo,
  };
  const authProviderRepo = {
    findByWorkspaceId: jest.fn().mockResolvedValue([]),
    findById: jest.fn(),
    insertOidcProvider: jest
      .fn()
      .mockImplementation(async (row) => ({ id: 'provider_1', ...row })),
    updateOidcProvider: jest.fn().mockResolvedValue(undefined),
    ...overrides.authProviderRepo,
  };
  const encryptionService = {
    encrypt: jest.fn((v: string) => `enc(${v})`),
    decrypt: jest.fn((v: string) => {
      if (!v.startsWith('enc(')) throw new Error('bad ciphertext');
      return v.slice(4, -1);
    }),
  };
  const oidcClientRegistry = { invalidate: jest.fn() };
  const auditService = { logWithContext: jest.fn() };

  const service = new SsoEntraBootstrapService(
    environmentService as any,
    workspaceRepo as any,
    authProviderRepo as any,
    encryptionService as any,
    oidcClientRegistry as any,
    auditService as any,
  );

  return {
    service,
    environmentService,
    workspaceRepo,
    authProviderRepo,
    encryptionService,
    oidcClientRegistry,
    auditService,
  };
}

// What a previous bootstrap run would have stored.
function storedProvider(overrides: Record<string, unknown> = {}) {
  return {
    id: 'provider_1',
    name: 'Microsoft Entra ID',
    type: 'oidc',
    oidcIssuer: ISSUER,
    oidcClientId: 'client-id',
    oidcClientSecret: 'enc(client-secret)',
    allowSignup: true,
    isEnabled: true,
    settings: {
      trustUnverifiedEmail: true,
      roleClaim: 'roles',
      roleMappings: [
        { claimValue: 'agents_admin', role: 'admin' },
        { claimValue: 'agents_manage', role: 'member' },
      ],
      defaultRole: 'member',
      requiredRoles: ['agents_admin', 'agents_manage', 'agents_member'],
    },
    ...overrides,
  };
}

describe('SsoEntraBootstrapService', () => {
  let warn: jest.SpyInstance;
  let error: jest.SpyInstance;
  let log: jest.SpyInstance;
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'debug').mockImplementation();
    fetchSpy = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('when there is nothing to do', () => {
    it('does nothing, silently, when no SSO_OIDC_ENTRA_* variable is set', async () => {
      const { service, workspaceRepo, authProviderRepo } = createService({});

      await service.run();

      expect(workspaceRepo.findFirst).not.toHaveBeenCalled();
      expect(authProviderRepo.insertOidcProvider).not.toHaveBeenCalled();
      expect(warn).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
    });

    it('does nothing on the cloud edition', async () => {
      const { service, workspaceRepo } = createService({
        ...fullEnv,
        cloud: true,
      });

      await service.run();

      expect(workspaceRepo.findFirst).not.toHaveBeenCalled();
    });

    it('warns about, and ignores, a partial configuration', async () => {
      for (const partial of [
        { tenant: GUID },
        { tenant: GUID, clientId: 'client-id' },
        { clientSecret: 'client-secret' },
      ]) {
        const { service, authProviderRepo } = createService(partial);
        await service.run();
        expect(authProviderRepo.insertOidcProvider).not.toHaveBeenCalled();
      }
      expect(warn).toHaveBeenCalledTimes(3);
    });

    it('skips silently when no workspace exists yet', async () => {
      const { service, authProviderRepo } = createService(fullEnv, {
        workspaceRepo: { findFirst: jest.fn().mockResolvedValue(undefined) },
      });

      await service.run();

      expect(authProviderRepo.findByWorkspaceId).not.toHaveBeenCalled();
      expect(authProviderRepo.insertOidcProvider).not.toHaveBeenCalled();
      expect(warn).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
    });
  });

  describe('tenant validation', () => {
    it.each(['common', 'organizations', 'consumers', 'Common'])(
      'refuses the multi-tenant authority "%s" without touching the database',
      async (tenant) => {
        const { service, workspaceRepo, authProviderRepo } = createService({
          ...fullEnv,
          tenant,
        });

        await service.run();

        expect(workspaceRepo.findFirst).not.toHaveBeenCalled();
        expect(authProviderRepo.insertOidcProvider).not.toHaveBeenCalled();
        expect(error).toHaveBeenCalledWith(
          expect.stringContaining('"common", "organizations" and "consumers"'),
        );
        expect(fetchSpy).not.toHaveBeenCalled();
      },
    );

    it.each(['contoso', 'not a tenant', 'x/../y', 'https://evil.example/'])(
      'refuses the malformed tenant "%s"',
      async (tenant) => {
        const { service, authProviderRepo } = createService({
          ...fullEnv,
          tenant,
        });

        await service.run();

        expect(authProviderRepo.insertOidcProvider).not.toHaveBeenCalled();
        expect(error).toHaveBeenCalled();
      },
    );

    it('refuses an invalid role map instead of guessing', async () => {
      for (const roleMap of ['agents_admin=owner', 'agents_admin', 'a=b']) {
        const { service, authProviderRepo } = createService({
          ...fullEnv,
          roleMap,
        });
        await service.run();
        expect(authProviderRepo.insertOidcProvider).not.toHaveBeenCalled();
      }
      expect(error).toHaveBeenCalledTimes(3);
    });
  });

  describe('creating the provider', () => {
    it('creates one provider from the environment', async () => {
      const { service, authProviderRepo, auditService } = createService();

      await service.run();

      expect(authProviderRepo.insertOidcProvider).toHaveBeenCalledTimes(1);
      expect(authProviderRepo.insertOidcProvider).toHaveBeenCalledWith({
        name: 'Microsoft Entra ID',
        oidcIssuer: ISSUER,
        oidcClientId: 'client-id',
        oidcClientSecret: 'enc(client-secret)',
        allowSignup: true,
        isEnabled: true,
        settings: {
          trustUnverifiedEmail: true,
          roleClaim: 'roles',
          roleMappings: [
            { claimValue: 'agents_admin', role: 'admin' },
            { claimValue: 'agents_manage', role: 'member' },
          ],
          defaultRole: 'member',
          requiredRoles: ['agents_admin', 'agents_manage', 'agents_member'],
        },
        creatorId: null,
        workspaceId: 'ws_1',
      });
      expect(auditService.logWithContext).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: { source: 'environment' },
        }),
        { workspaceId: 'ws_1', actorType: 'system' },
      );
    });

    it('never stores the client secret in plaintext or logs it', async () => {
      const { service, authProviderRepo, auditService } = createService();

      await service.run();

      const inserted = authProviderRepo.insertOidcProvider.mock.calls[0][0];
      expect(JSON.stringify(inserted)).not.toContain('"client-secret"');
      expect(
        JSON.stringify(auditService.logWithContext.mock.calls),
      ).not.toContain('client-secret');
      for (const spy of [warn, error, log]) {
        expect(JSON.stringify(spy.mock.calls)).not.toContain('client-secret');
      }
    });

    it('honours the display name and allowSignup', async () => {
      const { service, authProviderRepo } = createService({
        ...fullEnv,
        displayName: 'TRY Entra',
        allowSignup: false,
      });

      await service.run();

      expect(authProviderRepo.insertOidcProvider).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'TRY Entra', allowSignup: false }),
      );
    });

    it('works without a role map or required roles', async () => {
      const { service, authProviderRepo } = createService({
        tenant: GUID,
        clientId: 'client-id',
        clientSecret: 'client-secret',
      });

      await service.run();

      expect(authProviderRepo.insertOidcProvider).toHaveBeenCalledWith(
        expect.objectContaining({
          settings: expect.objectContaining({
            trustUnverifiedEmail: true,
            roleMappings: [],
            requiredRoles: [],
          }),
        }),
      );
    });

    it('lower-cases a GUID tenant in the issuer', async () => {
      const { service, authProviderRepo } = createService({
        ...fullEnv,
        tenant: GUID.toUpperCase(),
      });

      await service.run();

      expect(authProviderRepo.insertOidcProvider).toHaveBeenCalledWith(
        expect.objectContaining({ oidcIssuer: ISSUER }),
      );
    });
  });

  describe('idempotence', () => {
    it('writes nothing on a second start when the provider already matches', async () => {
      const { service, authProviderRepo } = createService(fullEnv, {
        authProviderRepo: {
          findByWorkspaceId: jest.fn().mockResolvedValue([storedProvider()]),
          findById: jest.fn().mockResolvedValue(storedProvider()),
        },
      });

      await service.run();
      await service.run();

      expect(authProviderRepo.insertOidcProvider).not.toHaveBeenCalled();
      expect(authProviderRepo.updateOidcProvider).not.toHaveBeenCalled();
    });

    it('does not depend on the order of requiredRoles or roleMap keys', async () => {
      const stored = storedProvider({
        settings: {
          trustUnverifiedEmail: true,
          roleClaim: 'roles',
          roleMappings: [
            { claimValue: 'agents_manage', role: 'member' },
            { claimValue: 'agents_admin', role: 'admin' },
          ],
          defaultRole: 'member',
          requiredRoles: ['agents_member', 'agents_admin', 'agents_manage'],
        },
      });
      const { service, authProviderRepo } = createService(fullEnv, {
        authProviderRepo: {
          findByWorkspaceId: jest.fn().mockResolvedValue([stored]),
          findById: jest.fn().mockResolvedValue(stored),
        },
      });

      await service.run();

      expect(authProviderRepo.updateOidcProvider).not.toHaveBeenCalled();
    });

    it('creates the provider exactly once across repeated starts', async () => {
      const rows: any[] = [];
      const { service, authProviderRepo } = createService(fullEnv, {
        authProviderRepo: {
          findByWorkspaceId: jest.fn(async () => rows),
          findById: jest.fn(async () => rows[0]),
          insertOidcProvider: jest.fn(async (row) => {
            const created = { id: 'provider_1', ...row };
            rows.push(created);
            return created;
          }),
        },
      });

      await service.run();
      await service.run();
      await service.run();

      expect(authProviderRepo.insertOidcProvider).toHaveBeenCalledTimes(1);
      expect(authProviderRepo.updateOidcProvider).not.toHaveBeenCalled();
    });

    it('updates only what changed and keeps admin-owned settings', async () => {
      const stored = storedProvider({
        oidcClientSecret: 'enc(old-secret)',
        isEnabled: false,
        settings: {
          trustUnverifiedEmail: true,
          roleClaim: 'groups',
          roleMappings: [{ claimValue: 'agents_admin', role: 'admin' }],
          defaultRole: 'admin',
          requiredRoles: ['agents_admin', 'agents_manage', 'agents_member'],
          somethingElse: 'keep',
        },
      });
      const { service, authProviderRepo, oidcClientRegistry } = createService(
        fullEnv,
        {
          authProviderRepo: {
            findByWorkspaceId: jest.fn().mockResolvedValue([stored]),
            findById: jest.fn().mockResolvedValue(stored),
          },
        },
      );

      await service.run();

      expect(authProviderRepo.insertOidcProvider).not.toHaveBeenCalled();
      expect(authProviderRepo.updateOidcProvider).toHaveBeenCalledWith(
        'provider_1',
        'ws_1',
        {
          oidcClientSecret: 'enc(client-secret)',
          isEnabled: true,
          settings: {
            trustUnverifiedEmail: true,
            roleClaim: 'groups',
            roleMappings: [
              { claimValue: 'agents_admin', role: 'admin' },
              { claimValue: 'agents_manage', role: 'member' },
            ],
            defaultRole: 'admin',
            requiredRoles: ['agents_admin', 'agents_manage', 'agents_member'],
            somethingElse: 'keep',
          },
        },
      );
      expect(oidcClientRegistry.invalidate).toHaveBeenCalledWith('provider_1');
    });

    it('re-enables the provider and turns trustUnverifiedEmail back on', async () => {
      const stored = storedProvider({
        isEnabled: false,
        allowSignup: false,
        settings: { trustUnverifiedEmail: false },
      });
      const { service, authProviderRepo } = createService(fullEnv, {
        authProviderRepo: {
          findByWorkspaceId: jest.fn().mockResolvedValue([stored]),
          findById: jest.fn().mockResolvedValue(stored),
        },
      });

      await service.run();

      expect(authProviderRepo.updateOidcProvider).toHaveBeenCalledWith(
        'provider_1',
        'ws_1',
        expect.objectContaining({
          isEnabled: true,
          allowSignup: true,
          settings: expect.objectContaining({ trustUnverifiedEmail: true }),
        }),
      );
    });

    it('rewrites a secret that can no longer be decrypted', async () => {
      const stored = storedProvider({ oidcClientSecret: 'garbage' });
      const { service, authProviderRepo } = createService(fullEnv, {
        authProviderRepo: {
          findByWorkspaceId: jest.fn().mockResolvedValue([stored]),
          findById: jest.fn().mockResolvedValue(stored),
        },
      });

      await service.run();

      expect(authProviderRepo.updateOidcProvider).toHaveBeenCalledWith(
        'provider_1',
        'ws_1',
        { oidcClientSecret: 'enc(client-secret)' },
      );
    });

    it('follows a renamed provider by issuer and client id instead of adding a duplicate', async () => {
      const stored = storedProvider({ name: 'Company SSO' });
      const { service, authProviderRepo } = createService(fullEnv, {
        authProviderRepo: {
          findByWorkspaceId: jest.fn().mockResolvedValue([stored]),
          findById: jest.fn().mockResolvedValue(stored),
        },
      });

      await service.run();

      expect(authProviderRepo.insertOidcProvider).not.toHaveBeenCalled();
      expect(authProviderRepo.updateOidcProvider).toHaveBeenCalledWith(
        'provider_1',
        'ws_1',
        { name: 'Microsoft Entra ID' },
      );
    });

    it('does not touch other providers', async () => {
      const other = storedProvider({
        id: 'provider_other',
        name: 'Okta',
        oidcIssuer: 'https://okta.example.com',
        oidcClientId: 'okta-client',
      });
      const { service, authProviderRepo } = createService(fullEnv, {
        authProviderRepo: {
          findByWorkspaceId: jest.fn().mockResolvedValue([other]),
        },
      });

      await service.run();

      expect(authProviderRepo.insertOidcProvider).toHaveBeenCalledTimes(1);
      expect(authProviderRepo.updateOidcProvider).not.toHaveBeenCalled();
    });
  });

  describe('a domain tenant', () => {
    const domainEnv = { ...fullEnv, tenant: 'Contoso.onmicrosoft.com' };

    it('resolves the tenant GUID from the discovery document', async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        json: async () => ({ issuer: ISSUER }),
      } as any);
      const { service, authProviderRepo } = createService(domainEnv);

      await service.run();

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://login.microsoftonline.com/contoso.onmicrosoft.com/v2.0/.well-known/openid-configuration',
        expect.anything(),
      );
      expect(authProviderRepo.insertOidcProvider).toHaveBeenCalledWith(
        expect.objectContaining({ oidcIssuer: ISSUER }),
      );
    });

    it('does not call the network for a GUID tenant', async () => {
      const { service } = createService(fullEnv);

      await service.run();

      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it.each([
      ['an HTTP error', { ok: false, status: 404, json: async () => ({}) }],
      [
        'a templated multi-tenant issuer',
        {
          ok: true,
          json: async () => ({
            issuer: 'https://login.microsoftonline.com/{tenantid}/v2.0',
          }),
        },
      ],
      [
        'a foreign issuer',
        {
          ok: true,
          json: async () => ({ issuer: 'https://evil.example/v2.0' }),
        },
      ],
      ['no issuer', { ok: true, json: async () => ({}) }],
    ])('skips when discovery returns %s', async (_label, response) => {
      fetchSpy.mockResolvedValue(response as any);
      const { service, authProviderRepo } = createService(domainEnv);

      await service.run();

      expect(authProviderRepo.insertOidcProvider).not.toHaveBeenCalled();
      expect(error).toHaveBeenCalledWith(
        expect.stringContaining('Could not resolve the tenant GUID'),
      );
    });

    it('skips when the network is down', async () => {
      fetchSpy.mockRejectedValue(new Error('getaddrinfo ENOTFOUND'));
      const { service, authProviderRepo } = createService(domainEnv);

      await expect(service.run()).resolves.toBeUndefined();

      expect(authProviderRepo.insertOidcProvider).not.toHaveBeenCalled();
    });
  });

  it('never throws, even when the database does', async () => {
    const { service } = createService(fullEnv, {
      authProviderRepo: {
        findByWorkspaceId: jest.fn().mockRejectedValue(new Error('db down')),
      },
    });

    await expect(service.run()).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith(expect.stringContaining('db down'));
  });

  it('still bootstraps when writing the audit entry fails', async () => {
    const { service, authProviderRepo, auditService } = createService();
    auditService.logWithContext.mockRejectedValue(new Error('audit down'));

    await service.run();

    expect(authProviderRepo.insertOidcProvider).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('audit down'));
  });
});
