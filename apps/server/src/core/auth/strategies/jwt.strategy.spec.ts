import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';
import { JwtType } from '../dto/jwt-payload';

const workspace: any = { id: 'ws_1' };
const user: any = {
  id: 'user_1',
  role: 'member',
  deactivatedAt: null,
  deletedAt: null,
};

function createStrategy(overrides: Partial<Record<string, any>> = {}) {
  const userRepo = {
    findById: jest.fn().mockResolvedValue(user),
    ...overrides.userRepo,
  };
  const workspaceRepo = {
    findById: jest.fn().mockResolvedValue(workspace),
    ...overrides.workspaceRepo,
  };
  const userSessionRepo = {
    findActiveById: jest
      .fn()
      .mockResolvedValue({
        id: 'session_1',
        userId: 'user_1',
        workspaceId: 'ws_1',
      }),
    ...overrides.userSessionRepo,
  };
  const sessionActivityService = { trackActivity: jest.fn() };
  const environmentService = {
    getAppSecret: () => 'secret-secret-secret-secret-123456',
  };
  const moduleRef = { get: jest.fn() };
  const serviceTokenService = {
    authenticate: jest.fn().mockResolvedValue({
      user: { id: 'bot_1' },
      workspace,
    }),
    ...overrides.serviceTokenService,
  };

  const strategy = new JwtStrategy(
    userRepo as any,
    workspaceRepo as any,
    userSessionRepo as any,
    sessionActivityService as any,
    environmentService as any,
    moduleRef as any,
    serviceTokenService as any,
  );

  return { strategy, moduleRef, serviceTokenService, userRepo };
}

const request = (workspaceId = 'ws_1') => ({ raw: { workspaceId } });

const servicePayload = {
  sub: 'bot_1',
  workspaceId: 'ws_1',
  serviceTokenId: 'token_1',
  type: 'service' as const,
};

describe('JwtStrategy.validate - service tokens', () => {
  it('returns the bound user and workspace with authType service', async () => {
    const { strategy, serviceTokenService } = createStrategy();

    const result = await strategy.validate(request(), servicePayload);

    expect(result).toEqual({
      user: { id: 'bot_1' },
      workspace,
      authType: JwtType.SERVICE,
    });
    expect(serviceTokenService.authenticate).toHaveBeenCalledWith(
      servicePayload,
    );
  });

  it('never consults the enterprise modules', async () => {
    const { strategy, moduleRef } = createStrategy();

    await strategy.validate(request(), servicePayload);

    expect(moduleRef.get).not.toHaveBeenCalled();
  });

  it('propagates a refusal from the service token check', async () => {
    const { strategy } = createStrategy({
      serviceTokenService: {
        authenticate: jest.fn().mockRejectedValue(new UnauthorizedException()),
      },
    });

    await expect(strategy.validate(request(), servicePayload)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('is checked against the workspace of the request before anything else', async () => {
    const { strategy, serviceTokenService } = createStrategy();

    await expect(
      strategy.validate(request('ws_other'), servicePayload),
    ).rejects.toThrow('Workspace does not match');
    expect(serviceTokenService.authenticate).not.toHaveBeenCalled();
  });

  it('refuses a payload without a workspace', async () => {
    const { strategy, serviceTokenService } = createStrategy();

    await expect(
      strategy.validate(request(), {
        ...servicePayload,
        workspaceId: undefined,
      }),
    ).rejects.toThrow(UnauthorizedException);
    expect(serviceTokenService.authenticate).not.toHaveBeenCalled();
  });
});

describe('JwtStrategy.validate - other token types are unchanged', () => {
  it('still authenticates an access token as a session', async () => {
    const { strategy, serviceTokenService } = createStrategy();

    const result = await strategy.validate(request(), {
      sub: 'user_1',
      email: 'user@example.com',
      workspaceId: 'ws_1',
      type: 'access',
      sessionId: 'session_1',
    });

    expect(result).toEqual({ user, workspace, authType: JwtType.ACCESS });
    expect(serviceTokenService.authenticate).not.toHaveBeenCalled();
  });

  it.each(['collab', 'exchange', 'attachment', 'mfa_token', 'pdf_render'])(
    'refuses a %s token',
    async (type) => {
      const { strategy, serviceTokenService } = createStrategy();

      await expect(
        strategy.validate(request(), {
          sub: 'user_1',
          workspaceId: 'ws_1',
          type,
        } as any),
      ).rejects.toThrow(UnauthorizedException);
      expect(serviceTokenService.authenticate).not.toHaveBeenCalled();
    },
  );

  it('does not let an api_key payload reach the service token check', async () => {
    const { strategy, serviceTokenService } = createStrategy();

    // No enterprise module in this checkout: refused, and never routed to the
    // service token path.
    await expect(
      strategy.validate(request(), {
        sub: 'user_1',
        workspaceId: 'ws_1',
        apiKeyId: 'key_1',
        type: 'api_key',
      }),
    ).rejects.toThrow(UnauthorizedException);
    expect(serviceTokenService.authenticate).not.toHaveBeenCalled();
  });
});
