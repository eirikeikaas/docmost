import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ServiceTokenService } from './service-token.service';

const workspace: any = { id: 'ws_1' };
const admin: any = { id: 'admin_1', role: 'admin' };
const bot: any = {
  id: 'bot_1',
  name: 'TRYlle',
  email: 'trylle@example.com',
  role: 'member',
  workspaceId: 'ws_1',
  deactivatedAt: null,
  deletedAt: null,
};
const TOKEN = 'header.payload.SIGNATUREPART-with-more-characters';
const DAY_MS = 24 * 60 * 60 * 1000;

function createService(overrides: Partial<Record<string, any>> = {}) {
  const trx = { __trx: true };
  const db = {
    transaction: jest.fn().mockReturnValue({
      execute: (cb: (trx: unknown) => unknown) => cb(trx),
    }),
  } as any;

  const serviceTokenRepo = {
    insert: jest.fn().mockImplementation(async (row) => ({
      id: 'token_1',
      createdAt: new Date(),
      lastUsedAt: null,
      revokedAt: null,
      ...row,
    })),
    setTokenPrefix: jest.fn().mockImplementation(async (id, _ws, prefix) => ({
      id,
      workspaceId: 'ws_1',
      userId: 'bot_1',
      name: 'TRYlle prod',
      tokenPrefix: prefix,
      creatorId: 'admin_1',
      expiresAt: new Date(Date.now() + 90 * DAY_MS),
      lastUsedAt: null,
      revokedAt: null,
      createdAt: new Date(),
    })),
    findById: jest.fn(),
    findByIdWithUser: jest.fn(),
    listByWorkspace: jest.fn().mockResolvedValue([]),
    revoke: jest.fn(),
    touchLastUsed: jest.fn().mockResolvedValue(undefined),
    ...overrides.serviceTokenRepo,
  };
  const userRepo = {
    findById: jest.fn().mockResolvedValue(bot),
    ...overrides.userRepo,
  };
  const workspaceRepo = {
    findById: jest.fn().mockResolvedValue(workspace),
    ...overrides.workspaceRepo,
  };
  const tokenService = {
    generateServiceToken: jest.fn().mockResolvedValue(TOKEN),
    ...overrides.tokenService,
  };
  const auditService = { log: jest.fn() };

  const service = new ServiceTokenService(
    serviceTokenRepo as any,
    userRepo as any,
    workspaceRepo as any,
    tokenService as any,
    db,
    auditService as any,
  );

  return {
    service,
    serviceTokenRepo,
    userRepo,
    workspaceRepo,
    tokenService,
    auditService,
    trx,
  };
}

function storedRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'token_1',
    workspaceId: 'ws_1',
    userId: 'bot_1',
    name: 'TRYlle prod',
    tokenPrefix: 'SIGNATUR',
    creatorId: 'admin_1',
    expiresAt: new Date(Date.now() + 30 * DAY_MS),
    lastUsedAt: null,
    revokedAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

const payload = {
  sub: 'bot_1',
  workspaceId: 'ws_1',
  serviceTokenId: 'token_1',
  type: 'service' as const,
};

describe('ServiceTokenService.create', () => {
  it('creates the row, signs the token for it and returns the token once', async () => {
    const { service, serviceTokenRepo, tokenService, userRepo, trx } =
      createService();

    const created = await service.create(
      { name: '  TRYlle prod ', userId: 'bot_1' },
      admin,
      workspace,
    );

    expect(userRepo.findById).toHaveBeenCalledWith('bot_1', 'ws_1');
    expect(serviceTokenRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws_1',
        userId: 'bot_1',
        name: 'TRYlle prod',
        creatorId: 'admin_1',
        tokenPrefix: '',
      }),
      trx,
    );
    expect(tokenService.generateServiceToken).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceTokenId: 'token_1',
        user: bot,
        workspaceId: 'ws_1',
        expiresAt: expect.any(Date),
      }),
    );
    expect(serviceTokenRepo.setTokenPrefix).toHaveBeenCalledWith(
      'token_1',
      'ws_1',
      'SIGNATUR',
      trx,
    );
    expect(created.token).toBe(TOKEN);
    expect(created).toMatchObject({
      id: 'token_1',
      name: 'TRYlle prod',
      tokenPrefix: 'SIGNATUR',
      userId: 'bot_1',
      userEmail: 'trylle@example.com',
      status: 'active',
      userDisabled: false,
    });
  });

  it('defaults to a 90 day expiry and honours expiresInDays', async () => {
    const first = createService();
    await first.service.create(
      { name: 'a', userId: 'bot_1' },
      admin,
      workspace,
    );
    const defaultExpiry =
      first.serviceTokenRepo.insert.mock.calls[0][0].expiresAt.getTime();
    expect(defaultExpiry - Date.now()).toBeGreaterThan(89.9 * DAY_MS);
    expect(defaultExpiry - Date.now()).toBeLessThan(90.1 * DAY_MS);

    const second = createService();
    await second.service.create(
      { name: 'a', userId: 'bot_1', expiresInDays: 7 },
      admin,
      workspace,
    );
    const customExpiry =
      second.serviceTokenRepo.insert.mock.calls[0][0].expiresAt.getTime();
    expect(customExpiry - Date.now()).toBeGreaterThan(6.9 * DAY_MS);
    expect(customExpiry - Date.now()).toBeLessThan(7.1 * DAY_MS);
  });

  it('signs the token with the same expiry it stores', async () => {
    const { service, serviceTokenRepo, tokenService } = createService();

    await service.create(
      { name: 'a', userId: 'bot_1', expiresInDays: 30 },
      admin,
      workspace,
    );

    expect(tokenService.generateServiceToken.mock.calls[0][0].expiresAt).toBe(
      serviceTokenRepo.insert.mock.calls[0][0].expiresAt,
    );
  });

  it.each([0, -1, 366, 1.5, 'x' as any])(
    'rejects an out-of-range expiry (%s)',
    async (expiresInDays) => {
      const { service, serviceTokenRepo } = createService();

      await expect(
        service.create(
          { name: 'a', userId: 'bot_1', expiresInDays },
          admin,
          workspace,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(serviceTokenRepo.insert).not.toHaveBeenCalled();
    },
  );

  it('accepts the bounds 1 and 365 days', async () => {
    for (const expiresInDays of [1, 365]) {
      const { service } = createService();
      await expect(
        service.create(
          { name: 'a', userId: 'bot_1', expiresInDays },
          admin,
          workspace,
        ),
      ).resolves.toBeDefined();
    }
  });

  it('rejects an empty name', async () => {
    const { service, serviceTokenRepo } = createService();

    await expect(
      service.create({ name: '   ', userId: 'bot_1' }, admin, workspace),
    ).rejects.toThrow(BadRequestException);
    expect(serviceTokenRepo.insert).not.toHaveBeenCalled();
  });

  it('refuses to bind a token to an owner', async () => {
    const { service, serviceTokenRepo, tokenService } = createService({
      userRepo: {
        findById: jest.fn().mockResolvedValue({ ...bot, role: 'owner' }),
      },
    });

    await expect(
      service.create({ name: 'a', userId: 'bot_1' }, admin, workspace),
    ).rejects.toThrow(/workspace owner/);
    expect(serviceTokenRepo.insert).not.toHaveBeenCalled();
    expect(tokenService.generateServiceToken).not.toHaveBeenCalled();
  });

  it.each([
    ['deactivated', { deactivatedAt: new Date() }],
    ['deleted', { deletedAt: new Date() }],
  ])('refuses to bind a token to a %s user', async (_label, flags) => {
    const { service, serviceTokenRepo } = createService({
      userRepo: {
        findById: jest.fn().mockResolvedValue({ ...bot, ...flags }),
      },
    });

    await expect(
      service.create({ name: 'a', userId: 'bot_1' }, admin, workspace),
    ).rejects.toThrow(/disabled/);
    expect(serviceTokenRepo.insert).not.toHaveBeenCalled();
  });

  it('refuses a user that is not in this workspace', async () => {
    const { service, serviceTokenRepo } = createService({
      userRepo: { findById: jest.fn().mockResolvedValue(undefined) },
    });

    await expect(
      service.create({ name: 'a', userId: 'someone_else' }, admin, workspace),
    ).rejects.toThrow(NotFoundException);
    expect(serviceTokenRepo.insert).not.toHaveBeenCalled();
  });

  it('allows an admin or member to be the bound user', async () => {
    for (const role of ['member', 'admin']) {
      const { service } = createService({
        userRepo: { findById: jest.fn().mockResolvedValue({ ...bot, role }) },
      });
      await expect(
        service.create({ name: 'a', userId: 'bot_1' }, admin, workspace),
      ).resolves.toBeDefined();
    }
  });

  it('never stores, audits or lists the token itself - only the fingerprint', async () => {
    const { service, serviceTokenRepo, auditService } = createService();

    const created = await service.create(
      { name: 'a', userId: 'bot_1' },
      admin,
      workspace,
    );

    expect(created.token).toBe(TOKEN);
    expect(created.tokenPrefix).not.toBe(TOKEN);
    expect(TOKEN.startsWith(created.tokenPrefix)).toBe(false);

    const everythingPersisted = JSON.stringify([
      serviceTokenRepo.insert.mock.calls,
      serviceTokenRepo.setTokenPrefix.mock.calls,
      auditService.log.mock.calls,
    ]);
    expect(everythingPersisted).not.toContain(TOKEN);
    expect(everythingPersisted).not.toContain('header.payload');
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceType: 'service_token',
        resourceId: 'token_1',
      }),
    );
  });
});

describe('ServiceTokenService.list', () => {
  it('returns views with a status, without any token material', async () => {
    const { service } = createService({
      serviceTokenRepo: {
        listByWorkspace: jest.fn().mockResolvedValue([
          {
            ...storedRow({ id: 'a' }),
            userName: 'TRYlle',
            userEmail: 'trylle@example.com',
            userRole: 'member',
            userDeactivatedAt: null,
            userDeletedAt: null,
          },
          {
            ...storedRow({ id: 'b', revokedAt: new Date() }),
            userName: 'TRYlle',
            userEmail: 'trylle@example.com',
            userRole: 'member',
            userDeactivatedAt: null,
            userDeletedAt: null,
          },
          {
            ...storedRow({ id: 'c', expiresAt: new Date(Date.now() - 1000) }),
            userName: 'Old bot',
            userEmail: 'old@example.com',
            userRole: 'member',
            userDeactivatedAt: new Date(),
            userDeletedAt: null,
          },
        ]),
      },
    });

    const views = await service.list('ws_1');

    expect(views.map((v) => [v.id, v.status, v.userDisabled])).toEqual([
      ['a', 'active', false],
      ['b', 'revoked', false],
      ['c', 'expired', true],
    ]);
    for (const view of views) {
      expect(view).not.toHaveProperty('token');
      expect(JSON.stringify(view)).not.toContain('SIGNATUREPART');
    }
  });
});

describe('ServiceTokenService.revoke', () => {
  const withUser = (overrides: Record<string, unknown> = {}) => ({
    ...storedRow(overrides),
    userName: 'TRYlle',
    userEmail: 'trylle@example.com',
    userRole: 'member',
    userDeactivatedAt: null,
    userDeletedAt: null,
  });

  it('revokes an active token and audits it', async () => {
    const revokedAt = new Date();
    const { service, serviceTokenRepo, auditService } = createService({
      serviceTokenRepo: {
        findByIdWithUser: jest
          .fn()
          .mockResolvedValueOnce(withUser())
          .mockResolvedValueOnce(withUser({ revokedAt })),
        revoke: jest.fn().mockResolvedValue({ id: 'token_1', revokedAt }),
      },
    });

    const view = await service.revoke('token_1', workspace);

    expect(serviceTokenRepo.revoke).toHaveBeenCalledWith('token_1', 'ws_1');
    expect(view.status).toBe('revoked');
    expect(view.revokedAt).toBe(revokedAt);
    expect(auditService.log).toHaveBeenCalledTimes(1);
  });

  it('is idempotent: a revoked token is returned unchanged and not audited again', async () => {
    const revokedAt = new Date(Date.now() - 1000);
    const { service, serviceTokenRepo, auditService } = createService({
      serviceTokenRepo: {
        findByIdWithUser: jest.fn().mockResolvedValue(withUser({ revokedAt })),
      },
    });

    const view = await service.revoke('token_1', workspace);

    expect(view.revokedAt).toBe(revokedAt);
    expect(serviceTokenRepo.revoke).not.toHaveBeenCalled();
    expect(auditService.log).not.toHaveBeenCalled();
  });

  it('404s for a token that is not in this workspace', async () => {
    const { service, serviceTokenRepo } = createService({
      serviceTokenRepo: {
        findByIdWithUser: jest.fn().mockResolvedValue(undefined),
      },
    });

    await expect(service.revoke('nope', workspace)).rejects.toThrow(
      NotFoundException,
    );
    expect(serviceTokenRepo.findByIdWithUser).toHaveBeenCalledWith(
      'nope',
      'ws_1',
    );
    expect(serviceTokenRepo.revoke).not.toHaveBeenCalled();
  });
});

describe('ServiceTokenService.authenticate', () => {
  function authenticatable(overrides: Partial<Record<string, any>> = {}) {
    return createService({
      ...overrides,
      serviceTokenRepo: {
        findById: jest.fn().mockResolvedValue(storedRow()),
        ...overrides.serviceTokenRepo,
      },
    });
  }

  it('accepts a live token and returns the bound user and workspace', async () => {
    const { service, serviceTokenRepo, userRepo, workspaceRepo } =
      authenticatable();

    const result = await service.authenticate(payload);

    expect(result).toEqual({ user: bot, workspace });
    expect(serviceTokenRepo.findById).toHaveBeenCalledWith('token_1', 'ws_1');
    expect(workspaceRepo.findById).toHaveBeenCalledWith('ws_1');
    expect(userRepo.findById).toHaveBeenCalledWith('bot_1', 'ws_1');
  });

  it('accepts a token with no expiry', async () => {
    const { service } = authenticatable({
      serviceTokenRepo: {
        findById: jest.fn().mockResolvedValue(storedRow({ expiresAt: null })),
      },
    });

    await expect(service.authenticate(payload)).resolves.toBeDefined();
  });

  it('refuses an unknown token', async () => {
    const { service } = authenticatable({
      serviceTokenRepo: { findById: jest.fn().mockResolvedValue(undefined) },
    });

    await expect(service.authenticate(payload)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('refuses a revoked token', async () => {
    const { service, userRepo } = authenticatable({
      serviceTokenRepo: {
        findById: jest
          .fn()
          .mockResolvedValue(storedRow({ revokedAt: new Date() })),
      },
    });

    await expect(service.authenticate(payload)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(userRepo.findById).not.toHaveBeenCalled();
  });

  it('refuses an expired token even though its JWT is still valid', async () => {
    const { service } = authenticatable({
      serviceTokenRepo: {
        findById: jest
          .fn()
          .mockResolvedValue(
            storedRow({ expiresAt: new Date(Date.now() - 1) }),
          ),
      },
    });

    await expect(service.authenticate(payload)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('refuses when the token belongs to another workspace', async () => {
    const { service } = authenticatable({
      serviceTokenRepo: {
        findById: jest
          .fn()
          .mockResolvedValue(storedRow({ workspaceId: 'ws_other' })),
      },
    });

    await expect(service.authenticate(payload)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('looks the token up within the workspace named by the JWT', async () => {
    const { service, serviceTokenRepo } = authenticatable({
      serviceTokenRepo: { findById: jest.fn().mockResolvedValue(undefined) },
    });

    await expect(
      service.authenticate({ ...payload, workspaceId: 'ws_other' }),
    ).rejects.toThrow(UnauthorizedException);
    expect(serviceTokenRepo.findById).toHaveBeenCalledWith(
      'token_1',
      'ws_other',
    );
  });

  it('refuses when the JWT subject is not the user the row is bound to', async () => {
    const { service } = authenticatable();

    await expect(
      service.authenticate({ ...payload, sub: 'someone_else' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it.each([
    ['deactivated', { deactivatedAt: new Date() }],
    ['deleted', { deletedAt: new Date() }],
  ])('refuses when the bound user is %s', async (_label, flags) => {
    const { service } = authenticatable({
      userRepo: {
        findById: jest.fn().mockResolvedValue({ ...bot, ...flags }),
      },
    });

    await expect(service.authenticate(payload)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('refuses when the bound user no longer exists', async () => {
    const { service } = authenticatable({
      userRepo: { findById: jest.fn().mockResolvedValue(undefined) },
    });

    await expect(service.authenticate(payload)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('refuses when the bound user has since become an owner', async () => {
    const { service } = authenticatable({
      userRepo: {
        findById: jest.fn().mockResolvedValue({ ...bot, role: 'owner' }),
      },
    });

    await expect(service.authenticate(payload)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('refuses when the workspace is gone', async () => {
    const { service } = authenticatable({
      workspaceRepo: { findById: jest.fn().mockResolvedValue(undefined) },
    });

    await expect(service.authenticate(payload)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('refuses a payload that is missing its ids', async () => {
    const { service, serviceTokenRepo } = authenticatable();

    for (const broken of [
      { ...payload, serviceTokenId: undefined },
      { ...payload, sub: undefined },
      { ...payload, workspaceId: undefined },
    ]) {
      await expect(service.authenticate(broken as any)).rejects.toThrow(
        UnauthorizedException,
      );
    }
    expect(serviceTokenRepo.findById).not.toHaveBeenCalled();
  });

  it('gives every failure the same bare 401, so nothing can be probed', async () => {
    const failures = [
      authenticatable({
        serviceTokenRepo: { findById: jest.fn().mockResolvedValue(undefined) },
      }),
      authenticatable({
        serviceTokenRepo: {
          findById: jest
            .fn()
            .mockResolvedValue(storedRow({ revokedAt: new Date() })),
        },
      }),
      authenticatable({
        userRepo: {
          findById: jest
            .fn()
            .mockResolvedValue({ ...bot, deactivatedAt: new Date() }),
        },
      }),
    ];

    const responses = await Promise.all(
      failures.map(({ service }) =>
        service.authenticate(payload).catch((err) => err.getResponse()),
      ),
    );

    expect(new Set(responses.map((r) => JSON.stringify(r))).size).toBe(1);
  });

  describe('last_used_at', () => {
    it('is recorded for a token that has never been used', async () => {
      const { service, serviceTokenRepo } = authenticatable();

      await service.authenticate(payload);

      expect(serviceTokenRepo.touchLastUsed).toHaveBeenCalledWith(
        'token_1',
        expect.any(Date),
        60_000,
      );
    });

    it('is recorded when the previous use is older than a minute', async () => {
      const { service, serviceTokenRepo } = authenticatable({
        serviceTokenRepo: {
          findById: jest
            .fn()
            .mockResolvedValue(
              storedRow({ lastUsedAt: new Date(Date.now() - 61_000) }),
            ),
        },
      });

      await service.authenticate(payload);

      expect(serviceTokenRepo.touchLastUsed).toHaveBeenCalledTimes(1);
    });

    it('is not rewritten within a minute of the previous use', async () => {
      const { service, serviceTokenRepo } = authenticatable({
        serviceTokenRepo: {
          findById: jest
            .fn()
            .mockResolvedValue(
              storedRow({ lastUsedAt: new Date(Date.now() - 5_000) }),
            ),
        },
      });

      await service.authenticate(payload);
      await service.authenticate(payload);

      expect(serviceTokenRepo.touchLastUsed).not.toHaveBeenCalled();
    });

    it('is not awaited: authentication succeeds while the write is still pending', async () => {
      const { service } = authenticatable({
        serviceTokenRepo: {
          touchLastUsed: jest.fn().mockReturnValue(new Promise(() => {})),
        },
      });

      await expect(service.authenticate(payload)).resolves.toBeDefined();
    });

    it('never fails authentication when the write fails', async () => {
      const { service, serviceTokenRepo } = authenticatable({
        serviceTokenRepo: {
          touchLastUsed: jest.fn().mockRejectedValue(new Error('db down')),
        },
      });

      await expect(service.authenticate(payload)).resolves.toBeDefined();
      await new Promise((resolve) => setImmediate(resolve));
      expect(serviceTokenRepo.touchLastUsed).toHaveBeenCalled();
    });

    it('is not recorded for a refused token', async () => {
      const { service, serviceTokenRepo } = authenticatable({
        serviceTokenRepo: {
          findById: jest
            .fn()
            .mockResolvedValue(storedRow({ revokedAt: new Date() })),
        },
      });

      await expect(service.authenticate(payload)).rejects.toThrow();
      expect(serviceTokenRepo.touchLastUsed).not.toHaveBeenCalled();
    });
  });
});
