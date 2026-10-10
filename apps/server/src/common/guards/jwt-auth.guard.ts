import {
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import {
  OAUTH_SCOPE_KEY,
  OAuthRouteScope,
} from '../decorators/oauth-scope.decorator';
import { REQUIRE_SESSION_AUTH_KEY } from '../decorators/require-session-auth.decorator';
import { JwtType } from '../../core/auth/dto/jwt-payload';
import { Reflector } from '@nestjs/core';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { addDays } from 'date-fns';

// Route families that belong to enterprise modules, which are not part of this
// repository's open-source tree and so cannot carry @RequireSessionAuth() from
// here: MFA, API-key and OAuth-grant management. A service token is refused on
// them outright, whatever those modules declare - minting or altering
// credentials is never something a credential may do. Matched against the
// registered route and the normalised request path, so "//api//mfa" and
// "/API/MFA" are caught as well.
export const SERVICE_TOKEN_DENIED_PATH_PREFIXES: readonly string[] = [
  '/api/mfa',
  '/api/api-keys',
  '/api/oauth',
];

function normalizePath(path: unknown): string {
  if (typeof path !== 'string') return '';
  return (
    '/' +
    path
      .split('?')[0]
      .split('#')[0]
      .toLowerCase()
      .split('/')
      .filter(Boolean)
      .join('/')
  );
}

export function isServiceTokenDeniedPath(path: unknown): boolean {
  const normalized = normalizePath(path);
  return SERVICE_TOKEN_DENIED_PATH_PREFIXES.some(
    (prefix) => normalized === prefix || normalized.startsWith(prefix + '/'),
  );
}

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  private logger = new Logger('JwtAuthGuard');

  constructor(
    private reflector: Reflector,
    private environmentService: EnvironmentService,
  ) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    return super.canActivate(context);
  }

  handleRequest(err: any, user: any, info: any, ctx: ExecutionContext) {
    if (err || !user) {
      throw err || new UnauthorizedException();
    }

    const requiresSession = this.reflector.getAllAndOverride<boolean>(
      REQUIRE_SESSION_AUTH_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );
    if (requiresSession && user.authType !== JwtType.ACCESS) {
      this.logger.debug(
        `session-only endpoint ${ctx.getClass()?.name}.${ctx.getHandler()?.name} refused authType ${user.authType}`,
      );
      throw new ForbiddenException(
        'This action requires an interactive user session',
      );
    }

    if (user.authType === JwtType.SERVICE) {
      const request = ctx.switchToHttp?.()?.getRequest?.();
      if (
        isServiceTokenDeniedPath(request?.routeOptions?.url) ||
        isServiceTokenDeniedPath(request?.raw?.url ?? request?.url)
      ) {
        this.logger.debug(
          `service token refused on ${ctx.getClass()?.name}.${ctx.getHandler()?.name}`,
        );
        throw new ForbiddenException(
          'This action cannot be performed with a service token',
        );
      }
    }

    if (user.oauth) {
      const required = this.reflector.getAllAndOverride<
        OAuthRouteScope | undefined
      >(OAUTH_SCOPE_KEY, [ctx.getHandler(), ctx.getClass()]);
      if (!required) {
        this.logger.warn(
          `oauth scope check: no @OAuthScope metadata on ${ctx.getClass()?.name}.${ctx.getHandler()?.name}`,
        );
        throw new ForbiddenException('OAuth tokens cannot access this endpoint');
      }
      const scopes: string[] = user.oauth.scopes ?? [];
      const satisfied =
        required === 'read'
          ? scopes.includes('read') || scopes.includes('write')
          : scopes.includes('write');
      if (!satisfied) {
        throw new ForbiddenException('insufficient_scope');
      }
    }

    this.setJoinedWorkspacesCookie(user, ctx);
    return user;
  }

  setJoinedWorkspacesCookie(user: any, ctx: ExecutionContext) {
    if (this.environmentService.isCloud()) {
      const req = ctx.switchToHttp().getRequest();
      const res = ctx.switchToHttp().getResponse();

      const workspaceId = user?.workspace?.id;
      let workspaceIds = [];
      try {
        workspaceIds = req.cookies.joinedWorkspaces
          ? JSON.parse(req.cookies.joinedWorkspaces)
          : [];
      } catch (err) {
        /* empty */
      }

      if (!workspaceIds.includes(workspaceId)) {
        workspaceIds.push(workspaceId);
      }

      res.setCookie('joinedWorkspaces', JSON.stringify(workspaceIds), {
        httpOnly: false,
        domain: '.' + this.environmentService.getSubdomainHost(),
        path: '/',
        expires: addDays(new Date(), 365),
        secure: this.environmentService.isHttps(),
      });
    }
  }
}
