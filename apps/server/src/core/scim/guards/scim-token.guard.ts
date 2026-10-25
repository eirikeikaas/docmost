import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ScimTokenRepo } from '@docmost/db/repos/scim/scim-token.repo';
import { hashScimToken } from '../scim.util';

// SCIM tokens are a separate credential space from the interactive JWT
// session cookie - an IdP calling the SCIM API never has a Docmost user
// session, only this bearer token.
@Injectable()
export class ScimTokenGuard implements CanActivate {
  constructor(private readonly scimTokenRepo: ScimTokenRepo) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const workspace = req.raw?.workspace;
    if (!workspace) {
      throw new UnauthorizedException();
    }

    const authHeader = req.headers?.authorization as string | undefined;
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.slice('Bearer '.length).trim()
      : undefined;
    if (!token) {
      throw new UnauthorizedException();
    }

    const scimToken = await this.scimTokenRepo.findByTokenHash(
      hashScimToken(token),
      workspace.id,
    );
    if (!scimToken) {
      throw new UnauthorizedException();
    }

    // Best-effort - a failed timestamp update should never fail the request.
    this.scimTokenRepo.touchLastUsed(scimToken.id).catch(() => {});

    req.scimToken = scimToken;
    req.workspace = workspace;
    return true;
  }
}
