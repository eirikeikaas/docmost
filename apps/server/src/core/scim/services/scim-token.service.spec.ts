import { NotFoundException } from '@nestjs/common';
import { ScimTokenService } from './scim-token.service';

const workspace: any = { id: 'ws_1' };
const user: any = { id: 'user_1' };

function createService(overrides: Partial<Record<string, any>> = {}) {
  const scimTokenRepo = {
    findByWorkspaceId: jest.fn().mockResolvedValue([]),
    findById: jest.fn(),
    insertToken: jest.fn(),
    updateToken: jest.fn(),
    softDeleteById: jest.fn().mockResolvedValue(undefined),
    ...overrides.scimTokenRepo,
  };
  const auditService = { log: jest.fn() };

  const service = new ScimTokenService(scimTokenRepo as any, auditService as any);
  return { service, scimTokenRepo, auditService };
}

describe('ScimTokenService', () => {
  it('generates a token, stores only its hash, and returns the plaintext exactly once', async () => {
    const { service, scimTokenRepo } = createService({
      scimTokenRepo: {
        insertToken: jest.fn().mockImplementation((data) =>
          Promise.resolve({
            id: 'token_1',
            name: data.name,
            tokenLastFour: data.tokenLastFour,
            isEnabled: data.isEnabled,
            lastUsedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          }),
        ),
      },
    });

    const result = await service.create({ name: 'Okta' } as any, user, workspace);

    expect(result.token).toMatch(/^scim_/);
    expect(result.tokenLastFour).toBe(result.token.slice(-4));
    expect(result).not.toHaveProperty('tokenHash');

    const inserted = scimTokenRepo.insertToken.mock.calls[0][0];
    expect(inserted.tokenHash).not.toBe(result.token);
    expect(typeof inserted.tokenHash).toBe('string');
  });

  it('throws when updating a token that does not exist in this workspace', async () => {
    const { service } = createService({
      scimTokenRepo: { findById: jest.fn().mockResolvedValue(undefined) },
    });

    await expect(
      service.update({ id: 'missing' } as any, workspace),
    ).rejects.toThrow(NotFoundException);
  });

  it('soft-deletes a token on revoke', async () => {
    const { service, scimTokenRepo } = createService({
      scimTokenRepo: {
        findById: jest.fn().mockResolvedValue({ id: 'token_1', name: 'Okta' }),
      },
    });

    await service.delete('token_1', workspace);

    expect(scimTokenRepo.softDeleteById).toHaveBeenCalledWith(
      'token_1',
      workspace.id,
    );
  });
});
