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

    expect(user).toEqual({ id: 'new_user_1', role: 'member' });
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

describe('SsoOidcLoginService - trustUnverifiedEmail', () => {
  const entraProvider = (settings: Record<string, unknown> = {}): any => ({
    ...provider,
    settings,
  });

  it('refuses an unverified email by default (fail closed)', async () => {
    const { service, authAccountRepo, signupService } = createService();

    await expect(
      service.resolveOrProvisionUser(entraProvider(), workspace, {
        providerUserId: 'sub_new',
        email: 'new.user@contoso.com',
        emailVerified: false,
      }),
    ).rejects.toThrow(UnauthorizedException);

    expect(signupService.signup).not.toHaveBeenCalled();
    expect(authAccountRepo.insertAuthAccount).not.toHaveBeenCalled();
  });

  it('refuses an unverified email when the setting is present but not exactly true', async () => {
    const { service } = createService();

    await expect(
      service.resolveOrProvisionUser(
        entraProvider({ trustUnverifiedEmail: 'true' }),
        workspace,
        {
          providerUserId: 'sub_new',
          email: 'new.user@contoso.com',
          emailVerified: false,
        },
      ),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('provisions a new user from an unverified email when the provider trusts it', async () => {
    const { service, signupService, authAccountRepo } = createService();

    const user = await service.resolveOrProvisionUser(
      entraProvider({ trustUnverifiedEmail: true }),
      workspace,
      {
        providerUserId: 'sub_new',
        email: 'new.user@contoso.com',
        emailVerified: false,
      },
    );

    expect(user.id).toBe('new_user_1');
    expect(signupService.signup).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'new.user@contoso.com' }),
      workspace.id,
      expect.anything(),
    );
    expect(authAccountRepo.insertAuthAccount).toHaveBeenCalled();
  });

  it('links an existing local account by an unverified email when the provider trusts it', async () => {
    const existingUser = {
      id: 'existing_user',
      role: 'member',
      deletedAt: null,
      deactivatedAt: null,
    };
    const { service, authAccountRepo } = createService({
      userRepo: { findByEmail: jest.fn().mockResolvedValue(existingUser) },
    });

    const user = await service.resolveOrProvisionUser(
      entraProvider({ trustUnverifiedEmail: true }),
      workspace,
      {
        providerUserId: 'sub_new',
        email: 'existing@contoso.com',
        emailVerified: false,
      },
    );

    expect(user).toBe(existingUser);
    expect(authAccountRepo.insertAuthAccount).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'existing_user' }),
    );
  });

  it('still honours allowSignup for a trusted unverified email', async () => {
    const { service, signupService } = createService();

    await expect(
      service.resolveOrProvisionUser(
        { ...entraProvider({ trustUnverifiedEmail: true }), allowSignup: false },
        workspace,
        {
          providerUserId: 'sub_new',
          email: 'new.user@contoso.com',
          emailVerified: false,
        },
      ),
    ).rejects.toThrow(ForbiddenException);

    expect(signupService.signup).not.toHaveBeenCalled();
  });

  it('still enforces the workspace emailDomains allow-list for a trusted unverified email', async () => {
    const { service, signupService } = createService();

    await expect(
      service.resolveOrProvisionUser(
        entraProvider({ trustUnverifiedEmail: true }),
        { ...workspace, emailDomains: ['contoso.com'] } as any,
        {
          providerUserId: 'sub_new',
          email: 'someone@evil.example',
          emailVerified: false,
        },
      ),
    ).rejects.toThrow();

    expect(signupService.signup).not.toHaveBeenCalled();
  });
});

describe('SsoOidcLoginService - requiredRoles', () => {
  const gated: any = {
    ...provider,
    settings: { requiredRoles: ['agents_admin', 'agents_manage'] },
  };

  it('refuses with 403 when the role claim holds none of the required roles', async () => {
    const { service, authAccountRepo, userRepo } = createService();

    await expect(
      service.resolveOrProvisionUser(gated, workspace, {
        providerUserId: 'sub_1',
        email: 'user@contoso.com',
        emailVerified: true,
        roles: ['agents_member'],
      }),
    ).rejects.toThrow(ForbiddenException);

    expect(authAccountRepo.findByProviderAndProviderUserId).not.toHaveBeenCalled();
    expect(userRepo.findByEmail).not.toHaveBeenCalled();
  });

  it('refuses when the IdP sent no roles at all', async () => {
    const { service } = createService();

    await expect(
      service.resolveOrProvisionUser(gated, workspace, {
        providerUserId: 'sub_1',
        email: 'user@contoso.com',
        emailVerified: true,
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('refuses an already-linked user whose role was revoked at the IdP', async () => {
    const { service } = createService({
      authAccountRepo: {
        findByProviderAndProviderUserId: jest
          .fn()
          .mockResolvedValue({ userId: 'user_1' }),
      },
      userRepo: {
        findById: jest
          .fn()
          .mockResolvedValue({ id: 'user_1', role: 'admin' }),
      },
    });

    await expect(
      service.resolveOrProvisionUser(gated, workspace, {
        providerUserId: 'sub_1',
        email: 'user@contoso.com',
        emailVerified: true,
        roles: [],
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('lets a login through when any one required role is present', async () => {
    const { service } = createService();

    const user = await service.resolveOrProvisionUser(gated, workspace, {
      providerUserId: 'sub_new',
      email: 'user@contoso.com',
      emailVerified: true,
      roles: ['something_else', 'agents_manage'],
    });

    expect(user.id).toBe('new_user_1');
  });

  it('does not gate anything when requiredRoles is empty', async () => {
    const { service } = createService();

    await expect(
      service.resolveOrProvisionUser(
        { ...provider, settings: { requiredRoles: [] } } as any,
        workspace,
        {
          providerUserId: 'sub_new',
          email: 'user@contoso.com',
          emailVerified: true,
        },
      ),
    ).resolves.toBeDefined();
  });
});

describe('SsoOidcLoginService - role mapping', () => {
  const mapped: any = {
    ...provider,
    settings: {
      roleMappings: [
        { claimValue: 'agents_admin', role: 'admin' },
        { claimValue: 'agents_manage', role: 'member' },
        { claimValue: 'agents_member', role: 'member' },
      ],
    },
  };
  const linked = (user: Record<string, unknown>) =>
    createService({
      authAccountRepo: {
        findByProviderAndProviderUserId: jest
          .fn()
          .mockResolvedValue({ userId: user.id }),
      },
      userRepo: { findById: jest.fn().mockResolvedValue(user) },
    });
  const login = (
    service: SsoOidcLoginService,
    roles: string[],
    providerOverride: any = mapped,
  ) =>
    service.resolveOrProvisionUser(providerOverride, workspace, {
      providerUserId: 'sub_1',
      email: 'user@contoso.com',
      emailVerified: true,
      roles,
    });

  it('promotes an existing member to admin on login', async () => {
    const { service, userRepo, auditService } = linked({
      id: 'user_1',
      role: 'member',
    });

    const user = await login(service, ['agents_admin']);

    expect(user.role).toBe('admin');
    expect(userRepo.updateUser).toHaveBeenCalledWith(
      { role: 'admin' },
      'user_1',
      workspace.id,
    );
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceId: 'user_1',
        changes: { before: { role: 'member' }, after: { role: 'admin' } },
      }),
    );
  });

  it('lets the highest privilege win when several claim values match', async () => {
    const { service, userRepo } = linked({ id: 'user_1', role: 'member' });

    const user = await login(service, [
      'agents_member',
      'agents_admin',
      'agents_manage',
    ]);

    expect(user.role).toBe('admin');
    expect(userRepo.updateUser).toHaveBeenCalledTimes(1);
  });

  it('applies the mapping on every login, including a demotion', async () => {
    const { service, userRepo } = linked({ id: 'user_1', role: 'admin' });

    const user = await login(service, ['agents_manage']);

    expect(user.role).toBe('member');
    expect(userRepo.updateUser).toHaveBeenCalledWith(
      { role: 'member' },
      'user_1',
      workspace.id,
    );
  });

  it('does not write when the role already matches', async () => {
    const { service, userRepo, auditService } = linked({
      id: 'user_1',
      role: 'admin',
    });

    await login(service, ['agents_admin']);

    expect(userRepo.updateUser).not.toHaveBeenCalled();
    expect(auditService.log).not.toHaveBeenCalled();
  });

  it('never changes an existing owner, whatever the claim says', async () => {
    const { service, userRepo } = linked({ id: 'user_1', role: 'owner' });

    const demoted = await login(service, ['agents_member']);
    expect(demoted.role).toBe('owner');

    const same = await login(service, ['agents_admin']);
    expect(same.role).toBe('owner');

    expect(userRepo.updateUser).not.toHaveBeenCalled();
  });

  it('never assigns owner, even if the stored role mappings try to', async () => {
    const { service, userRepo } = linked({ id: 'user_1', role: 'member' });
    const sneaky: any = {
      ...provider,
      settings: {
        roleMappings: [
          { claimValue: 'agents_owner', role: 'owner' },
          { claimValue: 'agents_admin', role: 'admin' },
        ],
      },
    };

    const user = await login(service, ['agents_owner'], sneaky);

    expect(user.role).toBe('member');
    expect(userRepo.updateUser).not.toHaveBeenCalled();
  });

  it('leaves an existing user alone when nothing matches (defaultRole is not a demotion)', async () => {
    const { service, userRepo } = linked({ id: 'user_1', role: 'admin' });

    const user = await login(
      service,
      ['unmapped_role'],
      { ...mapped, settings: { ...mapped.settings, defaultRole: 'member' } },
    );

    expect(user.role).toBe('admin');
    expect(userRepo.updateUser).not.toHaveBeenCalled();
  });

  it('syncs the role when linking an existing local user by email', async () => {
    const existingUser = {
      id: 'existing_user',
      role: 'member',
      deletedAt: null,
      deactivatedAt: null,
    };
    const { service, userRepo } = createService({
      userRepo: { findByEmail: jest.fn().mockResolvedValue(existingUser) },
    });

    const user = await login(service, ['agents_admin']);

    expect(user.role).toBe('admin');
    expect(userRepo.updateUser).toHaveBeenCalledWith(
      { role: 'admin' },
      'existing_user',
      workspace.id,
    );
  });

  it('does not sync roles for a disabled linked user', async () => {
    const { service, userRepo } = linked({
      id: 'user_1',
      role: 'member',
      deactivatedAt: new Date(),
    });

    await expect(login(service, ['agents_admin'])).rejects.toThrow(
      UnauthorizedException,
    );
    expect(userRepo.updateUser).not.toHaveBeenCalled();
  });

  it('provisions a brand-new user with the mapped role', async () => {
    const { service, userRepo } = createService();

    const user = await login(service, ['agents_admin']);

    expect(user.role).toBe('admin');
    expect(userRepo.updateUser).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'admin', hasGeneratedPassword: true }),
      'new_user_1',
      workspace.id,
      expect.anything(),
    );
  });

  it('provisions a brand-new user with defaultRole when nothing matches', async () => {
    const { service, userRepo } = createService();

    const user = await login(service, ['unmapped_role'], {
      ...mapped,
      settings: { ...mapped.settings, defaultRole: 'admin' },
    });

    expect(user.role).toBe('admin');
    expect(userRepo.updateUser).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'admin' }),
      'new_user_1',
      workspace.id,
      expect.anything(),
    );
  });

  it('falls back to member for a brand-new user when no defaultRole is configured', async () => {
    const { service, userRepo } = createService();

    await login(service, [], { ...provider, settings: {} });

    expect(userRepo.updateUser).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'member' }),
      'new_user_1',
      workspace.id,
      expect.anything(),
    );
  });

  it('ignores an owner defaultRole in stored settings', async () => {
    const { service, userRepo } = createService();

    await login(service, [], { ...provider, settings: { defaultRole: 'owner' } });

    expect(userRepo.updateUser).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'member' }),
      'new_user_1',
      workspace.id,
      expect.anything(),
    );
  });
});
