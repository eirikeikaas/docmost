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
import { UserRole } from '../../../common/helpers/types/permission';
import {
  hasRequiredRole,
  OidcMappableRole,
  parseOidcProviderSettings,
  resolveMappedRole,
} from '../oidc-provider-settings';
import { AuditEvent, AuditResource } from '../../../common/events/audit-events';
import {
  AUDIT_SERVICE,
  IAuditService,
} from '../../../integrations/audit/audit.service';

export interface OidcIdentity {
  providerUserId: string;
  email: string;
  // What the IdP itself asserted (email_verified === true on the email claim).
  // Whether an unverified email is accepted anyway is the provider's
  // trustUnverifiedEmail setting, applied below - never decided by the caller.
  emailVerified: boolean;
  name?: string;
  // Values of the provider's role claim; undefined/[] when the IdP sent none.
  roles?: string[];
}

function isUserDisabled(user: User): boolean {
  return Boolean(user.deletedAt) || Boolean(user.deactivatedAt);
}

// The account-linking/JIT-provisioning policy that guards against the
// classic SSO account-takeover attack: an attacker asserting an email that
// matches an existing local user. Read resolveOrProvisionUser() top to
// bottom before changing it - the ordering is the security property.
@Injectable()
export class SsoOidcLoginService {
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
    identity: OidcIdentity,
  ): Promise<User> {
    const { providerUserId, email, emailVerified, name } = identity;
    const settings = parseOidcProviderSettings(provider.settings);
    const roles = identity.roles ?? [];

    // 0. Role gate, on every login. A user the IdP has not assigned to this
    // application (none of requiredRoles in the role claim) is refused before
    // anything is looked up, linked or provisioned.
    if (!hasRequiredRole(roles, settings.requiredRoles)) {
      throw new ForbiddenException(
        'Your account is not assigned a role that allows signing in to this workspace',
      );
    }
    const mappedRole = resolveMappedRole(roles, settings.roleMap);

    // 1. Existing link for this exact external identity. Email is never
    // re-consulted once a link exists - sub is the only trust anchor from
    // here on, forever.
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
      return this.syncMappedRole(user, mappedRole, provider, workspace);
    }

    // 2. First login for this external identity. The email becomes
    // load-bearing for both linking (3) and provisioning (4) below, so it must
    // be one the IdP verified - or one the admin has explicitly told us to
    // trust for this provider (trustUnverifiedEmail, e.g. Microsoft Entra,
    // which never sends email_verified). Off by default: fail closed rather
    // than silently trust an unverified email claim.
    if (emailVerified !== true && !settings.trustUnverifiedEmail) {
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
      return this.syncMappedRole(existingUser, mappedRole, provider, workspace);
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

    // The role claim wins; defaultRole only applies here, to a brand-new user.
    const initialRole = mappedRole ?? settings.defaultRole;

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
        {
          hasGeneratedPassword: true,
          emailVerifiedAt: new Date(),
          role: initialRole,
        },
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
      return { ...user, role: initialRole };
    });
  }

  // Applies the roleMap result to an existing user on every login. Never
  // assigns 'owner' (the type cannot even express it) and never touches an
  // existing owner. When nothing matched (undefined) the user is left as is:
  // defaultRole is for provisioning, not for demoting.
  private async syncMappedRole(
    user: User,
    mappedRole: OidcMappableRole | undefined,
    provider: AuthProvider,
    workspace: Workspace,
  ): Promise<User> {
    if (
      !mappedRole ||
      user.role === UserRole.OWNER ||
      (mappedRole as string) === UserRole.OWNER ||
      user.role === mappedRole
    ) {
      return user;
    }

    await this.userRepo.updateUser({ role: mappedRole }, user.id, workspace.id);
    this.auditService.log({
      event: AuditEvent.USER_ROLE_CHANGED,
      resourceType: AuditResource.USER,
      resourceId: user.id,
      changes: {
        before: { role: user.role },
        after: { role: mappedRole },
      },
      metadata: { source: 'oidc', providerId: provider.id },
    });
    return { ...user, role: mappedRole };
  }

  async issueSession(user: User): Promise<string> {
    this.auditService.log({
      event: AuditEvent.USER_LOGIN,
      resourceType: AuditResource.USER,
      resourceId: user.id,
      metadata: { source: 'oidc' },
    });
    return this.sessionService.createSessionAndToken(user);
  }
}
