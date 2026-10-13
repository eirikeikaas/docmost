import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SsoProviderService } from './sso-provider.service';

const workspace: any = { id: 'ws_1' };
const user: any = { id: 'user_1' };

function createService(overrides: Partial<Record<string, any>> = {}) {
  const authProviderRepo = {
    findByWorkspaceId: jest.fn().mockResolvedValue([]),
    findById: jest.fn(),
    insertOidcProvider: jest.fn(),
    updateOidcProvider: jest.fn(),
    softDeleteById: jest.fn().mockResolvedValue(undefined),
    ...overrides.authProviderRepo,
  };
  const encryptionService = {
    encrypt: jest.fn((v: string) => `enc(${v})`),
    decrypt: jest.fn((v: string) => v.replace(/^enc\(|\)$/g, '')),
    ...overrides.encryptionService,
  };
  const oidcClientRegistry = { invalidate: jest.fn() };
  const auditService = { log: jest.fn() };

  const service = new SsoProviderService(
    authProviderRepo as any,
    encryptionService as any,
    oidcClientRegistry as any,
    auditService as any,
  );

  return { service, authProviderRepo, encryptionService, oidcClientRegistry, auditService };
}

describe('SsoProviderService', () => {
  it('encrypts the client secret on create and never returns it in plaintext', async () => {
    const { service, authProviderRepo, encryptionService } = createService({
      authProviderRepo: {
        insertOidcProvider: jest.fn().mockResolvedValue({
          id: 'provider_1',
          name: 'Okta',
          type: 'oidc',
          oidcIssuer: 'https://idp.example.com',
          oidcClientId: 'client-id',
          allowSignup: false,
          isEnabled: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      },
    });

    const result = await service.create(
      {
        name: 'Okta',
        oidcIssuer: 'https://idp.example.com',
        oidcClientId: 'client-id',
        oidcClientSecret: 'super-secret',
      } as any,
      user,
      workspace,
    );

    expect(encryptionService.encrypt).toHaveBeenCalledWith('super-secret');
    expect(authProviderRepo.insertOidcProvider).toHaveBeenCalledWith(
      expect.objectContaining({ oidcClientSecret: 'enc(super-secret)' }),
    );
    expect(result).not.toHaveProperty('oidcClientSecret');
    expect(result.hasClientSecret).toBe(true);
  });

  it('does not touch the stored secret on update when none is supplied', async () => {
    const existing = {
      id: 'provider_1',
      name: 'Okta',
      isEnabled: false,
    };
    const { service, authProviderRepo, encryptionService } = createService({
      authProviderRepo: {
        findById: jest.fn().mockResolvedValue(existing),
        updateOidcProvider: jest.fn().mockResolvedValue({
          ...existing,
          name: 'Okta Renamed',
          type: 'oidc',
          oidcIssuer: 'https://idp.example.com',
          oidcClientId: 'client-id',
          allowSignup: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      },
    });

    await service.update(
      { id: 'provider_1', name: 'Okta Renamed' } as any,
      workspace,
    );

    expect(encryptionService.encrypt).not.toHaveBeenCalled();
    expect(authProviderRepo.updateOidcProvider).toHaveBeenCalledWith(
      'provider_1',
      workspace.id,
      { name: 'Okta Renamed' },
    );
  });

  it('re-encrypts and invalidates the cached config when a new secret is supplied on update', async () => {
    const { service, authProviderRepo, encryptionService, oidcClientRegistry } =
      createService({
        authProviderRepo: {
          findById: jest.fn().mockResolvedValue({ id: 'provider_1', name: 'Okta', isEnabled: false }),
          updateOidcProvider: jest.fn().mockResolvedValue({
            id: 'provider_1',
            name: 'Okta',
            type: 'oidc',
            oidcIssuer: 'https://idp.example.com',
            oidcClientId: 'client-id',
            allowSignup: false,
            isEnabled: false,
            createdAt: new Date(),
            updatedAt: new Date(),
          }),
        },
      });

    await service.update(
      { id: 'provider_1', oidcClientSecret: 'rotated-secret' } as any,
      workspace,
    );

    expect(encryptionService.encrypt).toHaveBeenCalledWith('rotated-secret');
    expect(authProviderRepo.updateOidcProvider).toHaveBeenCalledWith(
      'provider_1',
      workspace.id,
      { oidcClientSecret: 'enc(rotated-secret)' },
    );
    expect(oidcClientRegistry.invalidate).toHaveBeenCalledWith('provider_1');
  });

  it('throws when updating a provider that does not exist in this workspace', async () => {
    const { service } = createService({
      authProviderRepo: { findById: jest.fn().mockResolvedValue(undefined) },
    });

    await expect(
      service.update({ id: 'missing' } as any, workspace),
    ).rejects.toThrow(NotFoundException);
  });

  it('soft-deletes and invalidates the cached config on delete', async () => {
    const { service, authProviderRepo, oidcClientRegistry } = createService({
      authProviderRepo: {
        findById: jest.fn().mockResolvedValue({ id: 'provider_1', name: 'Okta' }),
      },
    });

    await service.delete('provider_1', workspace);

    expect(authProviderRepo.softDeleteById).toHaveBeenCalledWith(
      'provider_1',
      workspace.id,
    );
    expect(oidcClientRegistry.invalidate).toHaveBeenCalledWith('provider_1');
  });
});

describe('SsoProviderService - per-provider settings', () => {
  const baseRow = {
    id: 'provider_1',
    name: 'Microsoft Entra ID',
    type: 'oidc',
    oidcIssuer: 'https://login.microsoftonline.com/tenant/v2.0',
    oidcClientId: 'client-id',
    allowSignup: true,
    isEnabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it('exposes the defaults for a provider with no stored settings, and never the secret', async () => {
    const { service } = createService({
      authProviderRepo: {
        findByWorkspaceId: jest
          .fn()
          .mockResolvedValue([{ ...baseRow, settings: null }]),
      },
    });

    const [view] = await service.list(workspace.id);

    expect(view).toMatchObject({
      trustUnverifiedEmail: false,
      roleClaim: 'roles',
      roleMap: {},
      defaultRole: 'member',
      requiredRoles: [],
    });
    expect(view).not.toHaveProperty('oidcClientSecret');
    expect(view).not.toHaveProperty('settings');
  });

  it('exposes stored settings in the list response', async () => {
    const { service } = createService({
      authProviderRepo: {
        findByWorkspaceId: jest.fn().mockResolvedValue([
          {
            ...baseRow,
            settings: {
              trustUnverifiedEmail: true,
              roleClaim: 'groups',
              roleMappings: [
                { claimValue: 'agents_admin', role: 'admin' },
                { claimValue: 'bad', role: 'owner' },
              ],
              defaultRole: 'admin',
              requiredRoles: ['agents_admin'],
            },
          },
        ]),
      },
    });

    const [view] = await service.list(workspace.id);

    expect(view).toMatchObject({
      trustUnverifiedEmail: true,
      roleClaim: 'groups',
      roleMap: { agents_admin: 'admin' },
      defaultRole: 'admin',
      requiredRoles: ['agents_admin'],
    });
  });

  it('stores the settings on create and returns them', async () => {
    const insertOidcProvider = jest.fn().mockImplementation(async (row) => ({
      ...baseRow,
      settings: row.settings,
    }));
    const { service } = createService({
      authProviderRepo: { insertOidcProvider },
    });

    const view = await service.create(
      {
        name: 'Microsoft Entra ID',
        oidcIssuer: baseRow.oidcIssuer,
        oidcClientId: 'client-id',
        oidcClientSecret: 'super-secret',
        trustUnverifiedEmail: true,
        roleMap: { agents_admin: 'admin' },
        requiredRoles: ['agents_admin'],
      } as any,
      user,
      workspace,
    );

    expect(insertOidcProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        settings: expect.objectContaining({
          trustUnverifiedEmail: true,
          roleMappings: [{ claimValue: 'agents_admin', role: 'admin' }],
          requiredRoles: ['agents_admin'],
          roleClaim: 'roles',
          defaultRole: 'member',
        }),
      }),
    );
    expect(view.trustUnverifiedEmail).toBe(true);
    expect(view.roleMap).toEqual({ agents_admin: 'admin' });
  });

  it('does not write settings on create when none were supplied', async () => {
    const insertOidcProvider = jest.fn().mockResolvedValue(baseRow);
    const { service } = createService({
      authProviderRepo: { insertOidcProvider },
    });

    await service.create(
      {
        name: 'Okta',
        oidcIssuer: 'https://idp.example.com',
        oidcClientId: 'client-id',
        oidcClientSecret: 'secret',
      } as any,
      user,
      workspace,
    );

    expect(insertOidcProvider.mock.calls[0][0]).not.toHaveProperty('settings');
  });

  it('merges a settings change on update without dropping what was not sent', async () => {
    const existing = {
      ...baseRow,
      settings: {
        roleClaim: 'groups',
        roleMappings: [{ claimValue: 'agents_admin', role: 'admin' }],
        somethingElse: 'keep',
      },
    };
    const updateOidcProvider = jest
      .fn()
      .mockImplementation(async (_id, _ws, patch) => ({
        ...existing,
        settings: patch.settings,
      }));
    const { service } = createService({
      authProviderRepo: {
        findById: jest.fn().mockResolvedValue(existing),
        updateOidcProvider,
      },
    });

    const view = await service.update(
      { id: 'provider_1', trustUnverifiedEmail: true } as any,
      workspace,
    );

    expect(updateOidcProvider).toHaveBeenCalledWith(
      'provider_1',
      workspace.id,
      {
        settings: {
          somethingElse: 'keep',
          trustUnverifiedEmail: true,
          roleClaim: 'groups',
          roleMappings: [{ claimValue: 'agents_admin', role: 'admin' }],
          defaultRole: 'member',
          requiredRoles: [],
        },
      },
    );
    expect(view.roleClaim).toBe('groups');
    expect(view.trustUnverifiedEmail).toBe(true);
  });

  it('lets an update clear roleMap and requiredRoles', async () => {
    const existing = {
      ...baseRow,
      settings: {
        roleMappings: [{ claimValue: 'a', role: 'admin' }],
        requiredRoles: ['a'],
      },
    };
    const updateOidcProvider = jest
      .fn()
      .mockImplementation(async (_id, _ws, patch) => ({
        ...existing,
        settings: patch.settings,
      }));
    const { service } = createService({
      authProviderRepo: {
        findById: jest.fn().mockResolvedValue(existing),
        updateOidcProvider,
      },
    });

    const view = await service.update(
      { id: 'provider_1', roleMap: {}, requiredRoles: [] } as any,
      workspace,
    );

    expect(view.roleMap).toEqual({});
    expect(view.requiredRoles).toEqual([]);
  });

  it.each(['common', 'organizations', 'consumers'])(
    'refuses a multi-tenant Entra issuer (%s) on create',
    async (tenant) => {
      const { service, authProviderRepo } = createService();

      await expect(
        service.create(
          {
            name: 'Entra',
            oidcIssuer: `https://login.microsoftonline.com/${tenant}/v2.0`,
            oidcClientId: 'client-id',
            oidcClientSecret: 'secret',
          } as any,
          user,
          workspace,
        ),
      ).rejects.toThrow(BadRequestException);

      expect(authProviderRepo.insertOidcProvider).not.toHaveBeenCalled();
    },
  );

  it('refuses a multi-tenant Entra issuer on update', async () => {
    const { service, authProviderRepo } = createService({
      authProviderRepo: {
        findById: jest.fn().mockResolvedValue({ ...baseRow, settings: {} }),
      },
    });

    await expect(
      service.update(
        {
          id: 'provider_1',
          oidcIssuer: 'https://login.microsoftonline.com/common/v2.0',
        } as any,
        workspace,
      ),
    ).rejects.toThrow(BadRequestException);

    expect(authProviderRepo.updateOidcProvider).not.toHaveBeenCalled();
  });
});
