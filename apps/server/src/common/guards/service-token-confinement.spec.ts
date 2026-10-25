import * as fs from 'node:fs';
import * as path from 'node:path';
import { PATH_METADATA } from '@nestjs/common/constants';
import { REQUIRE_SESSION_AUTH_KEY } from '../decorators/require-session-auth.decorator';

// A service token authenticates as an ordinary user, so everything that user
// may do through a normal controller is open to it - and nothing that creates
// or changes accounts, roles, credentials or workspace configuration may be.
// Those endpoints carry @RequireSessionAuth(), which JwtAuthGuard turns into a
// 403 for any authType other than an interactive session.
//
// This spec is the reviewed matrix. It fails when
//   * a controller is added that is not classified below, or
//   * the set of session-only handlers of a controller drifts from the list.
// so that exposing a new controller (or removing the marker from an existing
// handler) is a deliberate, visible change rather than a silent default.

type ControllerClass = new (...args: any[]) => any;

const SRC = path.resolve(__dirname, '..', '..');

// Every handler of these controllers needs an interactive session.
const SESSION_ONLY_CLASSES: string[] = [
  // login, setup, password reset/change, logout, collab-token
  'core/auth/auth.controller',
  // list / revoke login sessions
  'core/session/session.controller',
  // SSO provider administration
  'core/sso/controllers/sso-provider.controller',
  // service-token administration (list / create / revoke)
  'core/service-token/service-token.controller',
];

// Only these handlers of otherwise service-token-reachable controllers are
// session-only.
const SESSION_ONLY_HANDLERS: Record<string, string[]> = {
  // updating the account (name, email, ...)
  'core/user/user.controller': ['updateUser'],
  // workspace settings, member roles/lifecycle, invitations
  'core/workspace/controllers/workspace.controller': [
    'updateWorkspace',
    'deactivateWorkspaceMember',
    'activateWorkspaceMember',
    'deleteWorkspaceMember',
    'updateWorkspaceMemberRole',
    'getInvitations',
    'inviteUser',
    'resendInvite',
    'revokeInvite',
    'getInviteLink',
  ],
  // group and group-membership management
  'core/group/group.controller': [
    'createGroup',
    'updateGroup',
    'addGroupMember',
    'removeGroupMember',
    'deleteGroup',
  ],
  // deleting a space and space membership / role management
  'core/space/space.controller': [
    'deleteSpace',
    'addSpaceMember',
    'removeSpaceMember',
    'updateSpaceMemberRole',
  ],
  // avatar / workspace icon / space icon changes
  'core/attachment/attachment.controller': ['uploadAvatarOrLogo', 'removeIcon'],
  // publishing a space to the open internet
  'core/public-space/public-space.controller': ['publish'],
};

// Reachable with a service token, within the bound user's own permissions
// (space membership, page permissions, CASL abilities): nothing session-only.
const OPEN_CONTROLLERS: string[] = [
  'core/page/page.controller',
  'core/page/transclusion/transclusion.controller',
  // collections and their items inherit the host page's permissions
  'core/collection/collection.controller',
  'core/collection/item.controller',
  'core/comment/comment.controller',
  'core/search/search.controller',
  'core/label/label.controller',
  'core/share/share.controller',
  'core/favorite/favorite.controller',
  'core/notification/notification.controller',
  'core/watcher/watcher.controller',
  'core/watcher/space-watcher.controller',
  'integrations/export/export.controller',
  'integrations/import/import.controller',
  'integrations/import/file-task.controller',
];

// No JwtAuthGuard on the class: public, browser-navigated or infrastructure
// routes that a bearer token does not unlock.
const NOT_JWT_GUARDED: string[] = [
  'app.controller',
  'collaboration/server/collaboration.controller',
  'core/public-space/public-space-seo.controller',
  'core/share/share-seo.controller',
  'core/sso/controllers/sso-oidc.controller',
  'integrations/health/health.controller',
  'integrations/security/robots.txt.controller',
  'integrations/security/version.controller',
];

function loadControllers(file: string): ControllerClass[] {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require(path.join(SRC, file));
  return Object.values(mod).filter(
    (exported): exported is ControllerClass =>
      typeof exported === 'function' &&
      Reflect.hasMetadata(PATH_METADATA, exported),
  );
}

function routeHandlers(controller: ControllerClass): string[] {
  return Object.getOwnPropertyNames(controller.prototype).filter(
    (name) =>
      name !== 'constructor' &&
      typeof controller.prototype[name] === 'function' &&
      Reflect.hasMetadata(PATH_METADATA, controller.prototype[name]),
  );
}

// Same precedence as JwtAuthGuard's getAllAndOverride([handler, class]).
function isSessionOnly(controller: ControllerClass, handler: string): boolean {
  const onHandler = Reflect.getMetadata(
    REQUIRE_SESSION_AUTH_KEY,
    controller.prototype[handler],
  );
  if (onHandler !== undefined) return onHandler === true;
  return Reflect.getMetadata(REQUIRE_SESSION_AUTH_KEY, controller) === true;
}

// Walks the source tree for *.controller.ts files. The enterprise-licensed
// directory is never entered.
function findControllerFiles(dir = SRC, found: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (dir === SRC && entry.name === 'ee') continue;
      if (entry.name === 'node_modules') continue;
      findControllerFiles(path.join(dir, entry.name), found);
    } else if (entry.name.endsWith('.controller.ts')) {
      found.push(
        path
          .relative(SRC, path.join(dir, entry.name))
          .replace(/\\/g, '/')
          .replace(/\.ts$/, ''),
      );
    }
  }
  return found;
}

describe('service-token confinement', () => {
  it('classifies every controller in the source tree', () => {
    const classified = new Set([
      ...SESSION_ONLY_CLASSES,
      ...Object.keys(SESSION_ONLY_HANDLERS),
      ...OPEN_CONTROLLERS,
      ...NOT_JWT_GUARDED,
    ]);

    expect(findControllerFiles().sort()).toEqual([...classified].sort());
  });

  describe.each(SESSION_ONLY_CLASSES)('%s', (file) => {
    it('is session-only as a whole', () => {
      const controllers = loadControllers(file);
      expect(controllers.length).toBeGreaterThan(0);

      for (const controller of controllers) {
        expect(Reflect.getMetadata(REQUIRE_SESSION_AUTH_KEY, controller)).toBe(
          true,
        );
        for (const handler of routeHandlers(controller)) {
          expect([
            controller.name,
            handler,
            isSessionOnly(controller, handler),
          ]).toEqual([controller.name, handler, true]);
        }
      }
    });
  });

  describe.each(Object.entries(SESSION_ONLY_HANDLERS))(
    '%s',
    (file, expected) => {
      it('marks exactly the account / role / credential / settings handlers', () => {
        const controllers = loadControllers(file);
        expect(controllers.length).toBeGreaterThan(0);

        const marked = controllers.flatMap((controller) => {
          // Class-level marking would silently cover handlers added later and
          // hide the read endpoints this controller exists for.
          expect(
            Reflect.getMetadata(REQUIRE_SESSION_AUTH_KEY, controller),
          ).toBeUndefined();
          return routeHandlers(controller).filter((handler) =>
            isSessionOnly(controller, handler),
          );
        });

        expect(marked.sort()).toEqual([...expected].sort());
      });

      it('lists only handlers that exist', () => {
        const handlers = loadControllers(file).flatMap(routeHandlers);
        for (const handler of expected) {
          expect(handlers).toContain(handler);
        }
      });
    },
  );

  // Read as text, not loaded: some of these controllers pull in ESM-only
  // dependencies that this jest setup does not transform, and all that matters
  // here is that no handler or class is marked.
  describe.each(OPEN_CONTROLLERS)('%s', (file) => {
    it('is reachable with a service token (nothing session-only)', () => {
      const source = fs.readFileSync(path.join(SRC, `${file}.ts`), 'utf8');

      expect(source).not.toContain('RequireSessionAuth');
    });
  });
});
