import 'reflect-metadata';
import { JwtService } from '@nestjs/jwt';
import { CamelCasePlugin, Kysely, sql } from 'kysely';
import { PostgresJSDialect } from 'kysely-postgres-js';
import * as postgres from 'postgres';
import { ServiceTokenRepo } from '@docmost/db/repos/service-token/service-token.repo';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { WorkspaceRepo } from '@docmost/db/repos/workspace/workspace.repo';
import { TokenService } from '../auth/services/token.service';
import { ServiceTokenService } from './service-token.service';

// Opt-in: runs the repository SQL and the service against a real, migrated
// Postgres. Skipped unless TEST_DATABASE_URL points at one, e.g.
//   TEST_DATABASE_URL=postgres://user:pw@localhost:5432/docmost_test \
//     pnpm --filter server exec jest service-token.db
// (migrate it first with `pnpm --filter server migration:latest`). It creates
// and deletes its own workspace.
const url = process.env.TEST_DATABASE_URL;
const describeDb = url ? describe : describe.skip;

describeDb('service tokens against Postgres', () => {
  let db: Kysely<any>;
  let repo: ServiceTokenRepo;
  let service: ServiceTokenService;
  let tokenService: TokenService;
  let workspaceId: string;
  let otherWorkspaceId: string;
  let adminId: string;
  let botId: string;
  let ownerId: string;

  const insertUser = async (
    wsId: string,
    name: string,
    role: string,
    extra: Record<string, unknown> = {},
  ) => {
    const row = await db
      .insertInto('users')
      .values({
        name,
        email: `${name}-${Date.now()}-${Math.random()}@example.com`,
        role,
        workspaceId: wsId,
        ...extra,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    return row.id as string;
  };

  beforeAll(async () => {
    db = new Kysely<any>({
      dialect: new PostgresJSDialect({
        postgres: postgres(url!, { onnotice: () => {} }),
      }),
      plugins: [new CamelCasePlugin()],
    });
    repo = new ServiceTokenRepo(db as any);
    const jwtService = new JwtService({
      secret: 'a-test-secret-that-is-long-enough-for-hs256',
      signOptions: { expiresIn: '30d', issuer: 'Docmost' },
    });
    tokenService = new TokenService(jwtService, {
      getAppSecret: () => 'a-test-secret-that-is-long-enough-for-hs256',
    } as any);
    service = new ServiceTokenService(
      repo,
      new UserRepo(db as any),
      new WorkspaceRepo(db as any),
      tokenService,
      db as any,
      { log: jest.fn() } as any,
    );

    workspaceId = (
      await db
        .insertInto('workspaces')
        .values({ name: 'service-token db spec' })
        .returning('id')
        .executeTakeFirstOrThrow()
    ).id;
    otherWorkspaceId = (
      await db
        .insertInto('workspaces')
        .values({ name: 'service-token db spec (other)' })
        .returning('id')
        .executeTakeFirstOrThrow()
    ).id;
    adminId = await insertUser(workspaceId, 'admin', 'admin');
    botId = await insertUser(workspaceId, 'bot', 'member');
    ownerId = await insertUser(workspaceId, 'owner', 'owner');
  });

  afterAll(async () => {
    await db
      .deleteFrom('workspaces')
      .where('id', 'in', [workspaceId, otherWorkspaceId])
      .execute();
    await db.destroy();
  });

  it('creates a token whose JWT authenticates as the bound user', async () => {
    const created = await service.create(
      { name: 'TRYlle', userId: botId, expiresInDays: 30 },
      { id: adminId } as any,
      { id: workspaceId } as any,
    );

    expect(created.token.split('.')).toHaveLength(3);
    expect(created.status).toBe('active');
    expect(created.tokenPrefix).toBe(created.token.split('.')[2].slice(0, 8));

    const payload = await tokenService.verifyJwt(created.token, 'service');
    expect(payload).toMatchObject({
      sub: botId,
      workspaceId,
      serviceTokenId: created.id,
    });

    const { user, workspace } = await service.authenticate(payload);
    expect(user.id).toBe(botId);
    expect(workspace.id).toBe(workspaceId);

    // Only the fingerprint is in the database.
    const stored = await db
      .selectFrom('serviceTokens')
      .selectAll()
      .where('id', '=', created.id)
      .executeTakeFirstOrThrow();
    expect(JSON.stringify(stored)).not.toContain(created.token);
    expect(stored.expiresAt.getTime() - Date.now()).toBeGreaterThan(
      29 * 86400_000,
    );
  });

  it('lists tokens with the bound user and a status', async () => {
    const created = await service.create(
      { name: 'listed', userId: botId },
      { id: adminId } as any,
      { id: workspaceId } as any,
    );

    const list = await service.list(workspaceId);
    const view = list.find((token) => token.id === created.id)!;

    expect(view).toMatchObject({
      name: 'listed',
      userId: botId,
      userName: 'bot',
      status: 'active',
      userDisabled: false,
    });
    expect(JSON.stringify(view)).not.toContain(created.token);
    expect(await service.list(otherWorkspaceId)).toEqual([]);
  });

  it('refuses to bind a token to an owner or to a user of another workspace', async () => {
    await expect(
      service.create(
        { name: 'x', userId: ownerId },
        { id: adminId } as any,
        {
          id: workspaceId,
        } as any,
      ),
    ).rejects.toThrow(/owner/);

    await expect(
      service.create(
        { name: 'x', userId: botId },
        { id: adminId } as any,
        {
          id: otherWorkspaceId,
        } as any,
      ),
    ).rejects.toThrow('User not found');
  });

  it('revokes once and rejects the token from then on', async () => {
    const created = await service.create(
      { name: 'to revoke', userId: botId },
      { id: adminId } as any,
      { id: workspaceId } as any,
    );
    const payload = await tokenService.verifyJwt(created.token, 'service');
    await expect(service.authenticate(payload)).resolves.toBeDefined();

    const first = await service.revoke(created.id, { id: workspaceId } as any);
    const second = await service.revoke(created.id, { id: workspaceId } as any);

    expect(first.status).toBe('revoked');
    expect(second.revokedAt).toEqual(first.revokedAt);
    await expect(service.authenticate(payload)).rejects.toThrow('Unauthorized');
    await expect(
      service.revoke(created.id, { id: otherWorkspaceId } as any),
    ).rejects.toThrow('Service token not found');
  });

  it('rejects the token when the user is deactivated or promoted to owner', async () => {
    const created = await service.create(
      { name: 'user state', userId: botId },
      { id: adminId } as any,
      { id: workspaceId } as any,
    );
    const payload = await tokenService.verifyJwt(created.token, 'service');

    await db
      .updateTable('users')
      .set({ deactivatedAt: new Date() })
      .where('id', '=', botId)
      .execute();
    await expect(service.authenticate(payload)).rejects.toThrow('Unauthorized');
    await db
      .updateTable('users')
      .set({ deactivatedAt: null })
      .where('id', '=', botId)
      .execute();
    await expect(service.authenticate(payload)).resolves.toBeDefined();

    await db
      .updateTable('users')
      .set({ role: 'owner' })
      .where('id', '=', botId)
      .execute();
    await expect(service.authenticate(payload)).rejects.toThrow('Unauthorized');
    await db
      .updateTable('users')
      .set({ role: 'member' })
      .where('id', '=', botId)
      .execute();
  });

  it('writes last_used_at at most once per interval', async () => {
    const created = await service.create(
      { name: 'throttle', userId: botId },
      { id: adminId } as any,
      { id: workspaceId } as any,
    );
    const read = async () =>
      (await repo.findById(created.id, workspaceId))!.lastUsedAt;

    expect(await read()).toBeNull();

    const t0 = new Date();
    await repo.touchLastUsed(created.id, t0, 60_000);
    expect((await read())!.getTime()).toBe(t0.getTime());

    // Within the interval: untouched.
    await repo.touchLastUsed(
      created.id,
      new Date(t0.getTime() + 30_000),
      60_000,
    );
    expect((await read())!.getTime()).toBe(t0.getTime());

    // Past the interval: written.
    const t1 = new Date(t0.getTime() + 61_000);
    await repo.touchLastUsed(created.id, t1, 60_000);
    expect((await read())!.getTime()).toBe(t1.getTime());
  });

  it('scopes lookups to the workspace', async () => {
    const created = await service.create(
      { name: 'scoped', userId: botId },
      { id: adminId } as any,
      { id: workspaceId } as any,
    );

    expect(await repo.findById(created.id, workspaceId)).toBeDefined();
    expect(await repo.findById(created.id, otherWorkspaceId)).toBeUndefined();
    expect(
      await repo.findByIdWithUser(created.id, otherWorkspaceId),
    ).toBeUndefined();
    expect(await repo.revoke(created.id, otherWorkspaceId)).toBeUndefined();
  });

  it('deletes the tokens with their user, and keeps them when the creator is deleted', async () => {
    const tempBot = await insertUser(workspaceId, 'temp-bot', 'member');
    const tempAdmin = await insertUser(workspaceId, 'temp-admin', 'admin');
    const created = await service.create(
      { name: 'cascade', userId: tempBot },
      { id: tempAdmin } as any,
      { id: workspaceId } as any,
    );

    await db.deleteFrom('users').where('id', '=', tempAdmin).execute();
    const kept = await repo.findById(created.id, workspaceId);
    expect(kept).toBeDefined();
    expect(kept!.creatorId).toBeNull();

    await db.deleteFrom('users').where('id', '=', tempBot).execute();
    expect(await repo.findById(created.id, workspaceId)).toBeUndefined();
  });

  it('has the expected columns', async () => {
    const columns = await sql<{ columnName: string }>`
      select column_name from information_schema.columns
      where table_name = 'service_tokens' order by column_name`.execute(db);

    expect(columns.rows.map((c) => c.columnName)).toEqual([
      'created_at',
      'creator_id',
      'expires_at',
      'id',
      'last_used_at',
      'name',
      'revoked_at',
      'token_prefix',
      'updated_at',
      'user_id',
      'workspace_id',
    ]);
  });
});
