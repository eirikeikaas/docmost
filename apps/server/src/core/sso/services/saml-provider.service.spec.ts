import { NotFoundException } from '@nestjs/common';
import { SamlProviderService } from './saml-provider.service';

const workspace: any = { id: 'ws_1' };
const user: any = { id: 'user_1' };

function createService(overrides: Partial<Record<string, any>> = {}) {
  const authProviderRepo = {
    findByWorkspaceId: jest.fn().mockResolvedValue([]),
    findById: jest.fn(),
    insertProvider: jest.fn(),
    updateProvider: jest.fn(),
    softDeleteById: jest.fn().mockResolvedValue(undefined),
    ...overrides.authProviderRepo,
  };
  const samlClientRegistry = { invalidate: jest.fn() };
  const auditService = { log: jest.fn() };

  const service = new SamlProviderService(
    authProviderRepo as any,
    samlClientRegistry as any,
    auditService as any,
  );

  return { service, authProviderRepo, samlClientRegistry, auditService };
}

const validCert = '-----BEGIN CERTIFICATE-----\nMIIB...\n-----END CERTIFICATE-----';

describe('SamlProviderService', () => {
  it('creates a provider and never omits the (non-secret) certificate from the response', async () => {
    const { service, authProviderRepo } = createService({
      authProviderRepo: {
        insertProvider: jest.fn().mockResolvedValue({
          id: 'provider_1',
          name: 'Azure AD',
          type: 'saml',
          samlUrl: 'https://idp.example.com/sso/saml',
          samlCertificate: validCert,
          allowSignup: false,
          isEnabled: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      },
    });

    const result = await service.create(
      {
        name: 'Azure AD',
        samlUrl: 'https://idp.example.com/sso/saml',
        samlCertificate: validCert,
      } as any,
      user,
      workspace,
    );

    expect(authProviderRepo.insertProvider).toHaveBeenCalledWith(
      'saml',
      expect.objectContaining({
        samlUrl: 'https://idp.example.com/sso/saml',
        samlCertificate: validCert,
      }),
    );
    expect(result.samlCertificate).toBe(validCert);
  });

  it('invalidates the cached SAML client when the entry point or certificate changes', async () => {
    const { service, authProviderRepo, samlClientRegistry } = createService({
      authProviderRepo: {
        findById: jest
          .fn()
          .mockResolvedValue({ id: 'provider_1', name: 'Azure AD', isEnabled: false }),
        updateProvider: jest.fn().mockResolvedValue({
          id: 'provider_1',
          name: 'Azure AD',
          type: 'saml',
          samlUrl: 'https://idp.example.com/sso/saml',
          samlCertificate: validCert,
          allowSignup: false,
          isEnabled: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      },
    });

    await service.update(
      { id: 'provider_1', samlCertificate: validCert } as any,
      workspace,
    );

    expect(authProviderRepo.updateProvider).toHaveBeenCalledWith(
      'provider_1',
      workspace.id,
      'saml',
      { samlCertificate: validCert },
    );
    expect(samlClientRegistry.invalidate).toHaveBeenCalledWith('provider_1');
  });

  it('throws when updating a provider that does not exist in this workspace', async () => {
    const { service } = createService({
      authProviderRepo: { findById: jest.fn().mockResolvedValue(undefined) },
    });

    await expect(
      service.update({ id: 'missing' } as any, workspace),
    ).rejects.toThrow(NotFoundException);
  });

  it('soft-deletes and invalidates the cached client on delete', async () => {
    const { service, authProviderRepo, samlClientRegistry } = createService({
      authProviderRepo: {
        findById: jest.fn().mockResolvedValue({ id: 'provider_1', name: 'Azure AD' }),
      },
    });

    await service.delete('provider_1', workspace);

    expect(authProviderRepo.softDeleteById).toHaveBeenCalledWith(
      'provider_1',
      workspace.id,
      'saml',
    );
    expect(samlClientRegistry.invalidate).toHaveBeenCalledWith('provider_1');
  });
});
