import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { SsoOidcLoginService } from './sso-oidc-login.service';

const provider: any = {
  id: 'provider_1',
  allowSignup: true,
  workspaceId: 'ws_1',
};
const workspace: any = { id: 'ws_1', emailDomains: [] };

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
    updateUser: jest.fn().mockResolvedValue(undefined),
    ...overrides.userRepo,
  };
  const authAccountRepo = {
    findByProviderAndProviderUserId: jest.fn().mockResolvedValue(undefined),
    insertAuthAccount: jest.fn().mockResolvedValue(undefined),
    ...overrides.authAccountRepo,
  };
  const signupService = {
    signup: jest.fn().mockResolvedValue({ id: 'new_user_1' }),
    ...overrides.signupService,
  };
  const sessionService = {
    createSessionAndToken: jest.fn().mockResolvedValue('jwt-token'),
    ...overrides.sessionService,
  };
  const auditService = { log: jest.fn() };

  const service = new SsoOidcLoginService(
    userRepo as any,
    authAccountRepo as any,
    signupService as any,
    sessionService as any,
    db,
    auditService as any,
  );

  return { service, userRepo, authAccountRepo, signupService, sessionService, auditService };
}

describe('SsoOidcLoginService.resolveOrProvisionUser', () => {
  it('logs straight in when a link already exists, without re-checking email', async () => {
    const existingUser = { id: 'user_1', deletedAt: null, deactivatedAt: null };
    const { service, authAccountRepo, userRepo } = createService({
      authAccountRepo: {
        findByProviderAndProviderUserId: jest
          .fn()
          .mockResolvedValue({ userId: 'user_1' }),
      },
      userRepo: { findById: jest.fn().mockResolvedValue(existingUser) },
    });

    const user = await service.resolveOrProvisionUser(provider, workspace, {
      providerUserId: 'sub_1',
      email: 'attacker@example.com', // must never be consulted once linked
      emailVerified: false,
      name: undefined,
    });

    expect(user).toBe(existingUser);
    expect(userRepo.findByEmail).not.toHaveBeenCalled();
  });

  it('rejects a linked-user login when the local account is disabled', async () => {
    const { service } = createService({
      authAccountRepo: {
        findByProviderAndProviderUserId: jest
          .fn()
          .mockResolvedValue({ userId: 'user_1' }),
      },
      userRepo: {
        findById: jest
          .fn()
          .mockResolvedValue({ id: 'user_1', deactivatedAt: new Date() }),
      },
    });

    await expect(
      service.resolveOrProvisionUser(provider, workspace, {
        providerUserId: 'sub_1',
        email: 'user@example.com',
        emailVerified: true,
      }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a first-time login whose IdP does not assert a verified email, even with a matching local account', async () => {
    const { service, authAccountRepo, userRepo } = createService({
      userRepo: {
        findByEmail: jest.fn().mockResolvedValue({ id: 'victim_user' }),
      },
    });

    await expect(
      service.resolveOrProvisionUser(provider, workspace, {
        providerUserId: 'sub_new',
        email: 'victim@example.com',
        emailVerified: false,
      }),
    ).rejects.toThrow(UnauthorizedException);

    expect(authAccountRepo.insertAuthAccount).not.toHaveBeenCalled();
  });

  it('links to an existing local user by verified email without requiring allowSignup', async () => {
    const existingUser = { id: 'existing_user', deletedAt: null, deactivatedAt: null };
    const { service, authAccountRepo } = createService({
      userRepo: { findByEmail: jest.fn().mockResolvedValue(existingUser) },
    });

    const user = await service.resolveOrProvisionUser(
      { ...provider, allowSignup: false },
      workspace,
      {
        providerUserId: 'sub_new',
        email: 'existing@example.com',
        emailVerified: true,
      },
    );

    expect(user).toBe(existingUser);
    expect(authAccountRepo.insertAuthAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'existing_user',
        authProviderId: 'provider_1',
        providerUserId: 'sub_new',
      }),
    );
  });

  it('rejects provisioning a brand-new user when allowSignup is false', async () => {
    const { service, signupService } = createService();

    await expect(
      service.resolveOrProvisionUser(
        { ...provider, allowSignup: false },
        workspace,
        {
          providerUserId: 'sub_new',
          email: 'brandnew@example.com',
          emailVerified: true,
        },
      ),
    ).rejects.toThrow(ForbiddenException);

    expect(signupService.signup).not.toHaveBeenCalled();
  });

  it('JIT-provisions a brand-new user with a generated password when allowSignup is true', async () => {
    const { service, signupService, userRepo, authAccountRepo } =
      createService();

    const user = await service.resolveOrProvisionUser(provider, workspace, {
      providerUserId: 'sub_new',
      email: 'brandnew@example.com',
      emailVerified: true,
      name: 'Brand New',
    });

    expect(user).toEqual({ id: 'new_user_1' });
    expect(signupService.signup).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'brandnew@example.com',
        name: 'Brand New',
      }),
      workspace.id,
      expect.anything(),
    );
    expect(userRepo.updateUser).toHaveBeenCalledWith(
      expect.objectContaining({ hasGeneratedPassword: true }),
      'new_user_1',
      workspace.id,
      expect.anything(),
    );
    expect(authAccountRepo.insertAuthAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'new_user_1',
        authProviderId: 'provider_1',
        providerUserId: 'sub_new',
      }),
      expect.anything(),
    );
  });
});

describe('SsoOidcLoginService.issueSession', () => {
  it('mints a session token and logs a login audit event', async () => {
    const { service, sessionService, auditService } = createService();

    const token = await service.issueSession({ id: 'user_1' } as any);

    expect(token).toBe('jwt-token');
    expect(sessionService.createSessionAndToken).toHaveBeenCalledWith({
      id: 'user_1',
    });
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: { source: 'oidc' } }),
    );
  });
});
