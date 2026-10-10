import {
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { randomBytes } from 'node:crypto';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { executeTx } from '@docmost/db/utils';
import { AuthProvider, User, Workspace } from '@docmost/db/types/entity.types';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { AuthAccountRepo } from '@docmost/db/repos/auth-provider/auth-account.repo';
import { SignupService } from '../../auth/services/signup.service';
import { SessionService } from '../../session/session.service';
import { validateAllowedEmail } from '../../auth/auth.util';
import { AuditEvent, AuditResource } from '../../../common/events/audit-events';
import {
  AUDIT_SERVICE,
  IAuditService,
} from '../../../integrations/audit/audit.service';

// Shared by every SSO protocol (OIDC, SAML, ...): each protocol controller
// resolves its own provider-specific identity assertion down to this common
// shape before handing off here.
export interface SsoIdentity {
  providerUserId: string;
  email: string;
  emailVerified: boolean;
  name?: string;
}

function isUserDisabled(user: User): boolean {
  return Boolean(user.deletedAt) || Boolean(user.deactivatedAt);
}

// The account-linking/JIT-provisioning policy that guards against the
// classic SSO account-takeover attack: an attacker asserting an email that
// matches an existing local user. Read resolveOrProvisionUser() top to
// bottom before changing it - the ordering is the security property.
@Injectable()
export class SsoLoginService {
  constructor(
    private readonly userRepo: UserRepo,
    private readonly authAccountRepo: AuthAccountRepo,
    private readonly signupService: SignupService,
    private readonly sessionService: SessionService,
    @InjectKysely() private readonly db: KyselyDB,
    @Inject(AUDIT_SERVICE) private readonly auditService: IAuditService,
  ) {}

  async resolveOrProvisionUser(
    provider: AuthProvider,
    workspace: Workspace,
    identity: SsoIdentity,
  ): Promise<User> {
    const { providerUserId, email, emailVerified, name } = identity;

    // 1. Existing link for this exact external identity. Email is never
    // re-consulted once a link exists - the provider's own subject
    // identifier is the only trust anchor from here on, forever.
    const link = await this.authAccountRepo.findByProviderAndProviderUserId(
      provider.id,
      providerUserId,
      workspace.id,
    );
    if (link) {
      const user = await this.userRepo.findById(link.userId, workspace.id);
      if (!user || isUserDisabled(user)) {
        throw new UnauthorizedException('This account is disabled');
      }
      return user;
    }

    // 2. First login for this external identity. email_verified becomes
    // load-bearing for both linking (3) and provisioning (4) below. No
    // per-provider override in this milestone: fail closed rather than
    // silently trust an unverified email claim.
    if (emailVerified !== true) {
      throw new UnauthorizedException(
        'Your identity provider must assert a verified email address to sign in via SSO',
      );
    }

    // 3. Existing local account with this verified email - link it. This
    // grants no new access (the account already existed), so it is not
    // gated on allowSignup.
    const existingUser = await this.userRepo.findByEmail(email, workspace.id);
    if (existingUser) {
      if (isUserDisabled(existingUser)) {
        throw new UnauthorizedException('This account is disabled');
      }
      await this.authAccountRepo.insertAuthAccount({
        userId: existingUser.id,
        authProviderId: provider.id,
        providerUserId,
        workspaceId: workspace.id,
      });
      this.auditService.log({
        event: AuditEvent.USER_SSO_ACCOUNT_LINKED,
        resourceType: AuditResource.USER,
        resourceId: existingUser.id,
        metadata: { providerId: provider.id },
      });
      return existingUser;
    }

    // 4. Brand-new account. This DOES grant new workspace access, so it is
    // gated on the provider's own allowSignup flag plus the workspace-wide
    // emailDomains allow-list.
    if (!provider.allowSignup) {
      throw new ForbiddenException(
        'Sign-up via this identity provider is not enabled',
      );
    }
    validateAllowedEmail(email, workspace);

    return executeTx(this.db, async (trx) => {
      const generatedPassword = randomBytes(32).toString('base64url');
      const user = await this.signupService.signup(
        {
          name: name || email.split('@')[0],
          email,
          password: generatedPassword,
        },
        workspace.id,
        trx,
      );
      await this.userRepo.updateUser(
        { hasGeneratedPassword: true, emailVerifiedAt: new Date() },
        user.id,
        workspace.id,
        trx,
      );
      await this.authAccountRepo.insertAuthAccount(
        {
          userId: user.id,
          authProviderId: provider.id,
          providerUserId,
          workspaceId: workspace.id,
        },
        trx,
      );
      return user;
    });
  }

  async issueSession(user: User, source: 'oidc' | 'saml'): Promise<string> {
    this.auditService.log({
      event: AuditEvent.USER_LOGIN,
      resourceType: AuditResource.USER,
      resourceId: user.id,
      metadata: { source },
    });
    return this.sessionService.createSessionAndToken(user);
  }
}
