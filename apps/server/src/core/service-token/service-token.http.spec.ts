import 'reflect-metadata';
import { Controller, Post, UseGuards } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { KYSELY_MODULE_CONNECTION_TOKEN } from 'nestjs-kysely';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequireSessionAuth } from '../../common/decorators/require-session-auth.decorator';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AUDIT_SERVICE } from '../../integrations/audit/audit.service';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { WorkspaceRepo } from '@docmost/db/repos/workspace/workspace.repo';
import { UserSessionRepo } from '@docmost/db/repos/session/user-session.repo';
import { ServiceTokenRepo } from '@docmost/db/repos/service-token/service-token.repo';
import { JwtStrategy } from '../auth/strategies/jwt.strategy';
import { TokenService } from '../auth/services/token.service';
import { SessionActivityService } from '../session/session-activity.service';
import WorkspaceAbilityFactory from '../casl/abilities/workspace-ability.factory';
import { ServiceTokenController } from './service-token.controller';
import { ServiceTokenService } from './service-token.service';

// The service-token path end to end, short of the database: a real JwtStrategy,
// JwtAuthGuard, TokenService, ServiceTokenService and the real
// ServiceTokenController behind a Fastify instance, with in-memory repos.

const SECRET = 'a-test-secret-that-is-long-enough-for-hs256';
const WORKSPACE_ID = 'ws_1';

// Stand-ins for ordinary and session-only endpoints.
@Controller('pages')
class OpenController {
  @UseGuards(JwtAuthGuard)
  @Post('info')
  info(@AuthUser() user: any) {
    return { userId: user.id };
  }
}

@UseGuards(JwtAuthGuard)
@RequireSessionAuth()
@Controller('users-admin')
class SessionOnlyController {
  @Post('change')
  change() {
    return { changed: true };
  }
}

// An enterprise-owned route family this checkout cannot annotate.
@Controller('mfa')
class EnterpriseLikeController {
  @UseGuards(JwtAuthGuard)
  @Post('disable')
  disable() {
    return { disabled: true };
  }
}

const users: Record<string, any> = {
  admin_1: {
    id: 'admin_1',
    name: 'Admin',
    email: 'admin@example.com',
    role: 'admin',
    workspaceId: WORKSPACE_ID,
    deactivatedAt: null,
    deletedAt: null,
  },
  member_1: {
    id: 'member_1',
    name: 'Member',
    email: 'member@example.com',
    role: 'member',
    workspaceId: WORKSPACE_ID,
    deactivatedAt: null,
    deletedAt: null,
  },
  bot_1: {
    id: 'bot_1',
    name: 'TRYlle',
    email: 'trylle@example.com',
    role: 'member',
    workspaceId: WORKSPACE_ID,
    deactivatedAt: null,
    deletedAt: null,
  },
};

describe('service tokens over HTTP', () => {
  let app: NestFastifyApplication;
  let tokenService: TokenService;
  let serviceTokenService: ServiceTokenService;
  let rows: any[];
  // The workspace the "domain middleware" resolves for the request.
  let requestWorkspaceId: string;

  beforeEach(async () => {
    rows = [];
    requestWorkspaceId = WORKSPACE_ID;
    for (const user of Object.values(users)) {
      user.deactivatedAt = null;
      user.deletedAt = null;
    }
    users.bot_1.role = 'member';

    const serviceTokenRepo = {
      insert: async (row: any) => {
        const inserted = {
          id: `token_${rows.length + 1}`,
          createdAt: new Date(),
          lastUsedAt: null,
          revokedAt: null,
          ...row,
        };
        rows.push(inserted);
        return inserted;
      },
      setTokenPrefix: async (id: string, _ws: string, tokenPrefix: string) => {
        const row = rows.find((r) => r.id === id);
        row.tokenPrefix = tokenPrefix;
        return row;
      },
      findById: async (id: string, workspaceId: string) =>
        rows.find((r) => r.id === id && r.workspaceId === workspaceId),
      findByIdWithUser: async (id: string, workspaceId: string) => {
        const row = rows.find(
          (r) => r.id === id && r.workspaceId === workspaceId,
        );
        if (!row) return undefined;
        const user = users[row.userId];
        return {
          ...row,
          userName: user.name,
          userEmail: user.email,
          userRole: user.role,
          userDeactivatedAt: user.deactivatedAt,
          userDeletedAt: user.deletedAt,
        };
      },
      listByWorkspace: async (workspaceId: string) =>
        rows
          .filter((r) => r.workspaceId === workspaceId)
          .map((row) => ({
            ...row,
            userName: users[row.userId].name,
            userEmail: users[row.userId].email,
            userRole: users[row.userId].role,
            userDeactivatedAt: users[row.userId].deactivatedAt,
            userDeletedAt: users[row.userId].deletedAt,
          })),
      revoke: async (id: string, workspaceId: string) => {
        const row = rows.find(
          (r) => r.id === id && r.workspaceId === workspaceId && !r.revokedAt,
        );
        if (row) row.revokedAt = new Date();
        return row;
      },
      touchLastUsed: async (id: string, now: Date) => {
        rows.find((r) => r.id === id).lastUsedAt = now;
      },
    };

    const moduleRef = await Test.createTestingModule({
      imports: [
        JwtModule.register({
          secret: SECRET,
          signOptions: { issuer: 'Docmost' },
        }),
      ],
      controllers: [
        OpenController,
        SessionOnlyController,
        EnterpriseLikeController,
        ServiceTokenController,
      ],
      providers: [
        JwtStrategy,
        TokenService,
        ServiceTokenService,
        WorkspaceAbilityFactory,
        { provide: ServiceTokenRepo, useValue: serviceTokenRepo },
        {
          provide: UserRepo,
          useValue: {
            findById: async (id: string, workspaceId: string) =>
              users[id]?.workspaceId === workspaceId
                ? { ...users[id] }
                : undefined,
          },
        },
        {
          provide: WorkspaceRepo,
          useValue: {
            findById: async (id: string) =>
              id === WORKSPACE_ID ? { id: WORKSPACE_ID } : undefined,
          },
        },
        {
          provide: UserSessionRepo,
          useValue: {
            findActiveById: async (id: string) =>
              ({
                session_admin: {
                  id,
                  userId: 'admin_1',
                  workspaceId: WORKSPACE_ID,
                },
                session_member: {
                  id,
                  userId: 'member_1',
                  workspaceId: WORKSPACE_ID,
                },
              })[id],
          },
        },
        {
          provide: SessionActivityService,
          useValue: { trackActivity: () => undefined },
        },
        {
          provide: EnvironmentService,
          useValue: { getAppSecret: () => SECRET, isCloud: () => false },
        },
        { provide: AUDIT_SERVICE, useValue: { log: () => undefined } },
        {
          provide: KYSELY_MODULE_CONNECTION_TOKEN(),
          useValue: {
            transaction: () => ({ execute: (cb: any) => cb({}) }),
          },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    app.setGlobalPrefix('api');
    app
      .getHttpAdapter()
      .getInstance()
      .addHook('onRequest', (req, _reply, done) => {
        (req.raw as any).workspaceId = requestWorkspaceId;
        done();
      });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    tokenService = moduleRef.get(TokenService);
    serviceTokenService = moduleRef.get(ServiceTokenService);
  });

  afterEach(async () => {
    await app?.close();
  });

  const post = (url: string, token?: string, payload?: unknown) =>
    app.inject({
      method: 'POST',
      url,
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        'content-type': 'application/json',
      },
      payload: JSON.stringify(payload ?? {}),
    });

  const mintServiceToken = async (userId = 'bot_1', expiresInDays = 30) =>
    serviceTokenService.create(
      { name: 'TRYlle', userId, expiresInDays },
      users.admin_1,
      { id: WORKSPACE_ID } as any,
    );

  const sessionToken = () =>
    tokenService.generateAccessToken(users.admin_1, 'session_admin');

  it('authenticates as the bound user on an ordinary route', async () => {
    const { token } = await mintServiceToken();

    const response = await post('/api/pages/info', token);

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ userId: 'bot_1' });
    expect(rows[0].lastUsedAt).toBeInstanceOf(Date);
  });

  it('needs a token at all', async () => {
    expect((await post('/api/pages/info')).statusCode).toBe(401);
    expect((await post('/api/pages/info', 'not.a.jwt')).statusCode).toBe(401);
  });

  it('is refused on a session-only route, while a session is allowed', async () => {
    const { token } = await mintServiceToken();

    const refused = await post('/api/users-admin/change', token);
    expect(refused.statusCode).toBe(403);
    expect(refused.json().message).toBe(
      'This action requires an interactive user session',
    );

    expect(
      (await post('/api/users-admin/change', await sessionToken())).statusCode,
    ).toBe(201);
  });

  it('cannot reach service-token administration, so it can neither mint nor revoke', async () => {
    const { token, id } = await mintServiceToken();

    for (const [url, body] of [
      ['/api/service-tokens/list', {}],
      ['/api/service-tokens/create', { name: 'x', userId: 'bot_1' }],
      ['/api/service-tokens/revoke', { id }],
    ] as const) {
      const response = await post(url, token, body);
      expect(response.statusCode).toBe(403);
    }
    expect(rows).toHaveLength(1);
    expect(rows[0].revokedAt).toBeNull();
  });

  it('is refused on enterprise credential routes it cannot annotate', async () => {
    const { token } = await mintServiceToken();

    const response = await post('/api/mfa/disable', token);

    expect(response.statusCode).toBe(403);
    expect(response.json().message).toBe(
      'This action cannot be performed with a service token',
    );
    // A session still gets through the guard.
    expect(
      (await post('/api/mfa/disable', await sessionToken())).statusCode,
    ).toBe(201);
  });

  it('is rejected after revocation, immediately', async () => {
    const { token, id } = await mintServiceToken();
    expect((await post('/api/pages/info', token)).statusCode).toBe(201);

    const revoked = await post(
      '/api/service-tokens/revoke',
      await sessionToken(),
      { id },
    );
    expect(revoked.statusCode).toBe(200);
    expect(revoked.json().status).toBe('revoked');

    expect((await post('/api/pages/info', token)).statusCode).toBe(401);
  });

  it('is rejected once the row has expired, although the JWT has not', async () => {
    const { token } = await mintServiceToken();
    rows[0].expiresAt = new Date(Date.now() - 1000);

    expect((await post('/api/pages/info', token)).statusCode).toBe(401);
  });

  it('is rejected when the bound user is deactivated or becomes an owner', async () => {
    const { token } = await mintServiceToken();

    users.bot_1.deactivatedAt = new Date();
    expect((await post('/api/pages/info', token)).statusCode).toBe(401);

    users.bot_1.deactivatedAt = null;
    expect((await post('/api/pages/info', token)).statusCode).toBe(201);

    users.bot_1.role = 'owner';
    expect((await post('/api/pages/info', token)).statusCode).toBe(401);
  });

  it('is rejected on another workspace', async () => {
    const { token } = await mintServiceToken();
    requestWorkspaceId = 'ws_other';

    const response = await post('/api/pages/info', token);

    expect(response.statusCode).toBe(401);
    expect(response.json().message).toBe('Workspace does not match');
  });

  it('is rejected with a forged payload even if the row exists', async () => {
    const { token } = await mintServiceToken();
    const [header, , signature] = token.split('.');
    const forged = Buffer.from(
      JSON.stringify({
        sub: 'admin_1',
        workspaceId: WORKSPACE_ID,
        serviceTokenId: rows[0].id,
        type: 'service',
      }),
    ).toString('base64url');

    expect(
      (await post('/api/pages/info', `${header}.${forged}.${signature}`))
        .statusCode,
    ).toBe(401);
  });

  it('is not accepted as a different kind of token (no type confusion)', async () => {
    // A collab token has the same signature scheme but another type.
    const collab = await tokenService.generateCollabToken(
      users.bot_1,
      WORKSPACE_ID,
    );
    expect((await post('/api/pages/info', collab)).statusCode).toBe(401);
  });

  it('lets an admin session manage tokens, and the minted token then works', async () => {
    const session = await sessionToken();

    const created = await post('/api/service-tokens/create', session, {
      name: 'TRYlle prod',
      userId: 'bot_1',
      expiresInDays: 30,
    });
    expect(created.statusCode).toBe(200);
    const body = created.json();
    expect(body.token.split('.')).toHaveLength(3);
    expect(body).toMatchObject({
      name: 'TRYlle prod',
      userId: 'bot_1',
      status: 'active',
    });

    const list = await post('/api/service-tokens/list', session);
    expect(list.statusCode).toBe(200);
    expect(JSON.stringify(list.json())).not.toContain(body.token);
    expect(list.json()).toHaveLength(1);

    expect((await post('/api/pages/info', body.token)).statusCode).toBe(201);
  });

  it('refuses a non-admin session on the administration endpoints', async () => {
    const memberSession = await tokenService.generateAccessToken(
      users.member_1,
      'session_member',
    );

    expect(
      (await post('/api/service-tokens/list', memberSession)).statusCode,
    ).toBe(403);
    expect(
      (
        await post('/api/service-tokens/create', memberSession, {
          name: 'x',
          userId: 'bot_1',
        })
      ).statusCode,
    ).toBe(403);
    expect(rows).toHaveLength(0);
  });

  it('refuses to mint a token for an owner through the endpoint', async () => {
    const session = await sessionToken();
    users.bot_1.role = 'owner';

    const response = await post('/api/service-tokens/create', session, {
      name: 'x',
      userId: 'bot_1',
    });

    expect(response.statusCode).toBe(400);
    expect(rows).toHaveLength(0);
  });
});
