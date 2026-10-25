import { ScimUserService } from './scim-user.service';

const ctx = { workspaceId: 'ws_1' };

function createService(overrides: Partial<Record<string, any>> = {}) {
  const trx = { __trx: true };
  const db = {
    transaction: jest.fn().mockReturnValue({
      execute: (cb: (trx: unknown) => unknown) => cb(trx),
    }),
  } as any;

  const userRepo = {
    findById: jest.fn(),
    findByEmail: jest.fn().mockResolvedValue(undefined),
    findAllByWorkspaceId: jest.fn().mockResolvedValue([]),
    updateUser: jest.fn().mockResolvedValue(undefined),
    roleCountByWorkspaceId: jest.fn().mockResolvedValue(5),
    ...overrides.userRepo,
  };
  const userSessionRepo = {
    revokeByUserId: jest.fn().mockResolvedValue(undefined),
    ...overrides.userSessionRepo,
  };
  const signupService = {
    signup: jest.fn().mockResolvedValue({ id: 'new_user_1', email: 'new@example.com', name: 'New' }),
    ...overrides.signupService,
  };
  const auditService = { log: jest.fn() };

  const service = new ScimUserService(
    userRepo as any,
    userSessionRepo as any,
    signupService as any,
    db,
    auditService as any,
  );

  return { service, userRepo, userSessionRepo, signupService, auditService };
}

describe('ScimUserService.egress', () => {
  it('returns a single mapped user when an id is given', async () => {
    const { service, userRepo } = createService({
      userRepo: {
        findById: jest.fn().mockResolvedValue({
          id: 'user_1',
          email: 'user@example.com',
          name: 'User One',
          deactivatedAt: null,
          deletedAt: null,
          scimExternalId: 'ext-1',
        }),
      },
    });

    const result = await service.egress({ id: 'user_1' }, ctx);

    expect(result).toEqual(
      expect.objectContaining({ id: 'user_1', userName: 'user@example.com', active: true }),
    );
  });

  it('applies the SCIMMY filter to the full user list when no id is given', async () => {
    const match = jest.fn().mockReturnValue(['filtered']);
    const { service } = createService({
      userRepo: {
        findAllByWorkspaceId: jest.fn().mockResolvedValue([
          { id: 'u1', email: 'a@example.com', name: 'A', deactivatedAt: null, deletedAt: null },
        ]),
      },
    });

    const result = await service.egress({ filter: { match } }, ctx);

    expect(match).toHaveBeenCalled();
    expect(result).toEqual(['filtered']);
  });
});

describe('ScimUserService.ingress', () => {
  it('JIT-provisions a brand-new user via SignupService', async () => {
    const { service, signupService, userRepo } = createService();

    await service.ingress(
      {},
      { userName: 'new@example.com', displayName: 'New', externalId: 'ext-1' },
      ctx,
    );

    expect(signupService.signup).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'new@example.com', name: 'New' }),
      ctx.workspaceId,
      expect.anything(),
    );
    expect(userRepo.updateUser).toHaveBeenCalledWith(
      expect.objectContaining({ hasGeneratedPassword: true, scimExternalId: 'ext-1' }),
      'new_user_1',
      ctx.workspaceId,
      expect.anything(),
    );
  });

  it('treats a create for an existing email as a link rather than an error', async () => {
    const { service, signupService, userRepo } = createService({
      userRepo: {
        findByEmail: jest.fn().mockResolvedValue({ id: 'existing_1', email: 'dup@example.com' }),
      },
    });

    await service.ingress({}, { userName: 'dup@example.com', externalId: 'ext-2' }, ctx);

    expect(signupService.signup).not.toHaveBeenCalled();
    expect(userRepo.updateUser).toHaveBeenCalledWith(
      { scimExternalId: 'ext-2' },
      'existing_1',
      ctx.workspaceId,
    );
  });

  it('deactivates a user when active is set to false on update, revoking sessions', async () => {
    const { service, userRepo, userSessionRepo } = createService({
      userRepo: {
        findById: jest.fn().mockResolvedValue({
          id: 'user_1',
          email: 'user@example.com',
          role: 'member',
          deactivatedAt: null,
        }),
      },
    });

    await service.ingress(
      { id: 'user_1' },
      { userName: 'user@example.com', active: false },
      ctx,
    );

    expect(userRepo.updateUser).toHaveBeenCalledWith(
      { deactivatedAt: expect.any(Date) },
      'user_1',
      ctx.workspaceId,
    );
    expect(userSessionRepo.revokeByUserId).toHaveBeenCalledWith('user_1', ctx.workspaceId);
  });

  it('refuses to deactivate the last remaining workspace owner', async () => {
    const { service, userRepo } = createService({
      userRepo: {
        findById: jest.fn().mockResolvedValue({
          id: 'owner_1',
          email: 'owner@example.com',
          role: 'owner',
          deactivatedAt: null,
        }),
        roleCountByWorkspaceId: jest.fn().mockResolvedValue(1),
      },
    });

    await expect(
      service.ingress({ id: 'owner_1' }, { userName: 'owner@example.com', active: false }, ctx),
    ).rejects.toThrow('Cannot deactivate the last workspace owner');
  });
});
