import { NotFoundException } from '@nestjs/common';
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
