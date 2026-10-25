import 'reflect-metadata';
import { CamelCasePlugin, Kysely, sql } from 'kysely';
import { PostgresJSDialect } from 'kysely-postgres-js';
import * as postgres from 'postgres';
import { AuthProviderRepo } from '@docmost/db/repos/auth-provider/auth-provider.repo';
import { AuthAccountRepo } from '@docmost/db/repos/auth-provider/auth-account.repo';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { EncryptionService } from '../../integrations/encryption/encryption.service';
import { SsoProviderService } from './services/sso-provider.service';
import { SsoEntraBootstrapService } from './services/sso-entra-bootstrap.service';
import { SsoLoginService } from './services/sso-login.service';

// Opt-in: exercises the settings jsonb round trip, the environment bootstrap
// and role sync against a real, migrated Postgres. Skipped unless
// TEST_DATABASE_URL is set (see service-token.db.spec.ts). Creates and deletes
// its own workspace.
const url = process.env.TEST_DATABASE_URL;
const describeDb = url ? describe : describe.skip;

const GUID = '0f1e2d3c-4b5a-4978-8a9b-0c1d2e3f4a5b';

describeDb('OIDC provider settings against Postgres', () => {
  let db: Kysely<any>;
  let authProviderRepo: AuthProviderRepo;
  let encryption: EncryptionService;
  let workspace: { id: string };
  let adminId: string;

  const rawSettings = async (providerId: string) => {
    const result = await sql<{ type: string; settings: any }>`
      select jsonb_typeof(settings) as type, settings
      from auth_providers where id = ${providerId}`.execute(db);
    return result.rows[0];
  };

  beforeAll(async () => {
    db = new Kysely<any>({
      dialect: new PostgresJSDialect({ postgres: postgres(url!, { onnotice: () => {} }) }),
      plugins: [new CamelCasePlugin()],
    });
    authProviderRepo = new AuthProviderRepo(db as any);
    encryption = new EncryptionService({
      getAppSecret: () => 'a-test-secret-that-is-long-enough-for-hs256',
    } as any);

    workspace = await db
      .insertInto('workspaces')
      .values({ name: 'sso settings db spec' })
      .returning('id')
      .executeTakeFirstOrThrow();
    adminId = (
      await db
        .insertInto('users')
        .values({
          name: 'admin',
          email: `admin-${Date.now()}@example.com`,
          role: 'admin',
          workspaceId: workspace.id,
        })
        .returning('id')
        .executeTakeFirstOrThrow()
    ).id;
  });

  afterAll(async () => {
    await db.deleteFrom('workspaces').where('id', '=', workspace.id).execute();
    await db.destroy();
  });

  afterEach(async () => {
    await db.deleteFrom('authProviders').where('workspaceId', '=', workspace.id).execute();
  });

  describe('SsoProviderService', () => {
    const makeService = () =>
      new SsoProviderService(
        authProviderRepo,
        encryption,
        { invalidate: jest.fn() } as any,
        { log: jest.fn() } as any,
      );

    it('stores the settings as a jsonb object (not a JSON string) and reads them back', async () => {
      const service = makeService();

      const view = await service.create(
        {
          name: 'Entra',
          oidcIssuer: `https://login.microsoftonline.com/${GUID}/v2.0`,
          oidcClientId: 'client',
          oidcClientSecret: 'secret',
          trustUnverifiedEmail: true,
          roleMap: { agents_admin: 'admin', agents_manage: 'member' },
          requiredRoles: ['agents_admin'],
        } as any,
        { id: adminId } as any,
        workspace as any,
      );

      const stored = await rawSettings(view.id);
      expect(stored.type).toBe('object');
      expect(stored.settings).toMatchObject({
        trustUnverifiedEmail: true,
        roleClaim: 'roles',
        defaultRole: 'member',
        roleMappings: [
          { claimValue: 'agents_admin', role: 'admin' },
          { claimValue: 'agents_manage', role: 'member' },
        ],
        requiredRoles: ['agents_admin'],
      });

      // The API-facing view still has the plain map, with the claim values
      // intact (the database layer must not re-case them).
      const [listed] = await service.list(workspace.id);
      expect(listed).toMatchObject({
        trustUnverifiedEmail: true,
        roleMap: { agents_admin: 'admin', agents_manage: 'member' },
        requiredRoles: ['agents_admin'],
      });
      expect(listed).not.toHaveProperty('oidcClientSecret');
    });

    it('merges an update into what is stored and keeps unrelated keys', async () => {
      const service = makeService();
      const created = await service.create(
        {
          name: 'Entra',
          oidcIssuer: 'https://idp.example.com',
          oidcClientId: 'client',
          oidcClientSecret: 'secret',
          roleClaim: 'groups',
        } as any,
        { id: adminId } as any,
        workspace as any,
      );
      await db
        .updateTable('authProviders')
        .set({ settings: sql`settings || '{"unrelated": {"keep": true}}'::jsonb` })
        .where('id', '=', created.id)
        .execute();

      await service.update(
        { id: created.id, trustUnverifiedEmail: true } as any,
        workspace as any,
      );

      const stored = await rawSettings(created.id);
      expect(stored.settings).toMatchObject({
        unrelated: { keep: true },
        roleClaim: 'groups',
        trustUnverifiedEmail: true,
      });
    });

    it('leaves a provider without settings readable (defaults)', async () => {
      const row = await authProviderRepo.insertOidcProvider({
        name: 'plain',
        oidcIssuer: 'https://idp.example.com',
        oidcClientId: 'client',
        oidcClientSecret: encryption.encrypt('secret'),
        workspaceId: workspace.id,
      });

      const [view] = await makeService().list(workspace.id);

      expect(view.id).toBe(row.id);
      expect(view).toMatchObject({
        trustUnverifiedEmail: false,
        roleClaim: 'roles',
        roleMap: {},
        defaultRole: 'member',
        requiredRoles: [],
      });
    });
  });

  describe('SsoEntraBootstrapService', () => {
    const env = (overrides: Record<string, unknown> = {}) => ({
      isCloud: () => false,
      getSsoOidcEntraTenantId: () => GUID,
      getSsoOidcEntraClientId: () => 'client-id',
      getSsoOidcEntraClientSecret: () => 'client-secret',
      getSsoOidcEntraDisplayName: () => 'Microsoft Entra ID',
      getSsoOidcEntraAllowSignup: () => true,
      getSsoOidcEntraRoleMap: () => 'agents_admin=admin,agents_manage=member',
      getSsoOidcEntraRequiredRoles: () => ['agents_admin', 'agents_manage'],
      ...overrides,
    });
    const makeBootstrap = (environment = env()) =>
      new SsoEntraBootstrapService(
        environment as any,
        { findFirst: async () => workspace } as any,
        authProviderRepo,
        encryption,
        { invalidate: jest.fn() } as any,
        { logWithContext: jest.fn() } as any,
      );

    it('creates the provider once and is a no-op on every later start', async () => {
      await makeBootstrap().run();
      const [created] = await authProviderRepo.findByWorkspaceId(workspace.id, 'oidc');
      expect(created).toMatchObject({
        name: 'Microsoft Entra ID',
        oidcIssuer: `https://login.microsoftonline.com/${GUID}/v2.0`,
        oidcClientId: 'client-id',
        allowSignup: true,
        isEnabled: true,
      });
      const stored = await rawSettings(created.id);
      expect(stored.type).toBe('object');
      expect(stored.settings).toMatchObject({
        trustUnverifiedEmail: true,
        roleMappings: [
          { claimValue: 'agents_admin', role: 'admin' },
          { claimValue: 'agents_manage', role: 'member' },
        ],
        requiredRoles: ['agents_admin', 'agents_manage'],
      });
      const withSecret = await authProviderRepo.findById(created.id, workspace.id, 'oidc', {
        includeSecret: true,
      });
      expect(withSecret!.oidcClientSecret).not.toContain('client-secret');
      expect(encryption.decrypt(withSecret!.oidcClientSecret!)).toBe('client-secret');

      await makeBootstrap().run();
      await makeBootstrap().run();

      const all = await authProviderRepo.findByWorkspaceId(workspace.id, 'oidc');
      expect(all).toHaveLength(1);
      expect(all[0].updatedAt).toEqual(created.updatedAt);
    });

    it('picks up a change on the next start without duplicating the provider', async () => {
      await makeBootstrap().run();

      await makeBootstrap(
        env({
          getSsoOidcEntraClientSecret: () => 'rotated-secret',
          getSsoOidcEntraRoleMap: () => 'agents_admin=admin',
          getSsoOidcEntraRequiredRoles: () => [],
        }),
      ).run();

      const all = await authProviderRepo.findByWorkspaceId(workspace.id, 'oidc');
      expect(all).toHaveLength(1);
      const withSecret = await authProviderRepo.findById(all[0].id, workspace.id, 'oidc', {
        includeSecret: true,
      });
      expect(encryption.decrypt(withSecret!.oidcClientSecret!)).toBe('rotated-secret');
      expect((await rawSettings(all[0].id)).settings).toMatchObject({
        roleMappings: [{ claimValue: 'agents_admin', role: 'admin' }],
        requiredRoles: [],
      });
    });

    it('re-enables a provider an admin disabled', async () => {
      await makeBootstrap().run();
      const [created] = await authProviderRepo.findByWorkspaceId(workspace.id, 'oidc');
      await db
        .updateTable('authProviders')
        .set({ isEnabled: false })
        .where('id', '=', created.id)
        .execute();

      await makeBootstrap().run();

      const [after] = await authProviderRepo.findByWorkspaceId(workspace.id, 'oidc');
      expect(after.isEnabled).toBe(true);
    });
  });

  describe('SsoLoginService role sync', () => {
    const makeLogin = () =>
      new SsoLoginService(
        new UserRepo(db as any),
        new AuthAccountRepo(db as any),
        {} as any,
        {} as any,
        db as any,
        { log: jest.fn() } as any,
      );

    const linkedUser = async (role: string) => {
      const provider = await authProviderRepo.insertOidcProvider({
        name: `p-${Date.now()}-${Math.random()}`,
        oidcIssuer: 'https://idp.example.com',
        oidcClientId: 'client',
        oidcClientSecret: encryption.encrypt('secret'),
        allowSignup: true,
        isEnabled: true,
        settings: {
          roleMappings: [
            { claimValue: 'agents_admin', role: 'admin' },
            { claimValue: 'agents_member', role: 'member' },
          ],
        } as any,
        workspaceId: workspace.id,
      });
      const userId = (
        await db
          .insertInto('users')
          .values({
            name: 'linked',
            email: `linked-${Date.now()}-${Math.random()}@example.com`,
            role,
            workspaceId: workspace.id,
          })
          .returning('id')
          .executeTakeFirstOrThrow()
      ).id;
      await new AuthAccountRepo(db as any).insertAuthAccount({
        userId,
        authProviderId: provider.id,
        providerUserId: `sub-${userId}`,
        workspaceId: workspace.id,
      });
      return { provider, userId };
    };

    const roleOf = async (userId: string) =>
      (await db.selectFrom('users').select('role').where('id', '=', userId).executeTakeFirstOrThrow()).role;

    const login = (provider: any, userId: string, roles: string[]) =>
      makeLogin().resolveOrProvisionUser(provider, workspace as any, {
        providerUserId: `sub-${userId}`,
        email: 'ignored@example.com',
        emailVerified: false,
        roles,
      });

    it('promotes, demotes and never touches an owner', async () => {
      const promoted = await linkedUser('member');
      await login(promoted.provider, promoted.userId, ['agents_admin']);
      expect(await roleOf(promoted.userId)).toBe('admin');

      await login(promoted.provider, promoted.userId, ['agents_member']);
      expect(await roleOf(promoted.userId)).toBe('member');

      await login(promoted.provider, promoted.userId, ['unmapped']);
      expect(await roleOf(promoted.userId)).toBe('member');

      const owner = await linkedUser('owner');
      await login(owner.provider, owner.userId, ['agents_member']);
      await login(owner.provider, owner.userId, ['agents_admin']);
      expect(await roleOf(owner.userId)).toBe('owner');
    });
  });
});
