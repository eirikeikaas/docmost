import { Inject, Injectable } from '@nestjs/common';
import SCIMMY from 'scimmy';
import { randomBytes } from 'node:crypto';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { executeTx } from '@docmost/db/utils';
import { User } from '@docmost/db/types/entity.types';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { UserSessionRepo } from '@docmost/db/repos/session/user-session.repo';
import { SignupService } from '../../auth/services/signup.service';
import { UserRole } from '../../../common/helpers/types/permission';
import { AuditEvent, AuditResource } from '../../../common/events/audit-events';
import {
  AUDIT_SERVICE,
  IAuditService,
} from '../../../integrations/audit/audit.service';

export interface ScimUserResource {
  id: string;
  externalId?: string;
  userName: string;
  name?: { formatted?: string };
  displayName?: string;
  emails?: { value: string; primary?: boolean }[];
  active: boolean;
}

function toScimUser(user: User): ScimUserResource {
  return {
    id: user.id,
    externalId: user.scimExternalId ?? undefined,
    userName: user.email,
    name: { formatted: user.name },
    displayName: user.name,
    emails: [{ value: user.email, primary: true }],
    active: !user.deactivatedAt && !user.deletedAt,
  };
}

function extractEmail(instance: any): string | undefined {
  const fromEmails = Array.isArray(instance.emails)
    ? (instance.emails.find((e: any) => e?.primary) ?? instance.emails[0])
        ?.value
    : undefined;
  const email = fromEmails ?? instance.userName;
  return typeof email === 'string' ? email.toLowerCase().trim() : undefined;
}

function extractName(instance: any, fallbackEmail: string): string {
  return (
    instance.name?.formatted ||
    instance.displayName ||
    [instance.name?.givenName, instance.name?.familyName]
      .filter(Boolean)
      .join(' ') ||
    fallbackEmail.split('@')[0]
  );
}

// Registered against SCIMMY.Resources.User by ScimResourcesRegistrar. Not
// used directly by the HTTP controller - SCIMMY calls these via the
// Resource.read/write/dispose methods the controller invokes.
@Injectable()
export class ScimUserService {
  constructor(
    private readonly userRepo: UserRepo,
    private readonly userSessionRepo: UserSessionRepo,
    private readonly signupService: SignupService,
    @InjectKysely() private readonly db: KyselyDB,
    @Inject(AUDIT_SERVICE) private readonly auditService: IAuditService,
  ) {}

  async egress(
    resource: any,
    ctx: { workspaceId: string },
  ): Promise<ScimUserResource | ScimUserResource[]> {
    if (resource.id) {
      const user = await this.userRepo.findById(resource.id, ctx.workspaceId, {
        includeScimExternalId: true,
      });
      if (!user) {
        throw new SCIMMY.Types.Error(404, '', 'User not found');
      }
      return toScimUser(user);
    }

    const all = await this.userRepo.findAllByWorkspaceId(ctx.workspaceId);
    const mapped = all.map(toScimUser);
    return resource.filter ? resource.filter.match(mapped) : mapped;
  }

  async ingress(
    resource: any,
    instance: any,
    ctx: { workspaceId: string },
  ): Promise<ScimUserResource> {
    const email = extractEmail(instance);
    if (!email) {
      throw new SCIMMY.Types.Error(
        400,
        'invalidValue',
        'A userName or email is required',
      );
    }
    const name = extractName(instance, email);

    if (resource.id) {
      const existing = await this.userRepo.findById(
        resource.id,
        ctx.workspaceId,
      );
      if (!existing) {
        throw new SCIMMY.Types.Error(404, '', 'User not found');
      }
      await this.userRepo.updateUser(
        {
          name,
          ...(instance.externalId !== undefined
            ? { scimExternalId: instance.externalId }
            : {}),
        },
        resource.id,
        ctx.workspaceId,
      );
      if (typeof instance.active === 'boolean') {
        await this.setActiveState(existing, instance.active, ctx.workspaceId);
      }
      const updated = await this.userRepo.findById(
        resource.id,
        ctx.workspaceId,
        { includeScimExternalId: true },
      );
      return toScimUser(updated);
    }

    // Many IdPs re-POST an existing user during periodic reconciliation -
    // treat that as an update (and link the externalId) rather than a
    // uniqueness error.
    const already = await this.userRepo.findByEmail(email, ctx.workspaceId);
    if (already) {
      await this.userRepo.updateUser(
        {
          ...(instance.externalId !== undefined
            ? { scimExternalId: instance.externalId }
            : {}),
        },
        already.id,
        ctx.workspaceId,
      );
      return toScimUser({ ...already, scimExternalId: instance.externalId });
    }

    const generatedPassword = randomBytes(32).toString('base64url');
    const user = await executeTx(this.db, async (trx) => {
      const created = await this.signupService.signup(
        { name, email, password: generatedPassword },
        ctx.workspaceId,
        trx,
      );
      await this.userRepo.updateUser(
        {
          hasGeneratedPassword: true,
          emailVerifiedAt: new Date(),
          ...(instance.externalId !== undefined
            ? { scimExternalId: instance.externalId }
            : {}),
        },
        created.id,
        ctx.workspaceId,
        trx,
      );
      return created;
    });

    return toScimUser({ ...user, scimExternalId: instance.externalId });
  }

  async degress(resource: any, ctx: { workspaceId: string }): Promise<void> {
    const user = await this.userRepo.findById(resource.id, ctx.workspaceId);
    if (!user) {
      throw new SCIMMY.Types.Error(404, '', 'User not found');
    }
    await this.setActiveState(user, false, ctx.workspaceId);
  }

  // SCIM DELETE deactivates rather than hard-deletes, matching this app's
  // own semantics: deactivation preserves authored content and history,
  // which a hard delete (via WorkspaceService.deleteUser) does not.
  private async setActiveState(
    user: User,
    active: boolean,
    workspaceId: string,
  ): Promise<void> {
    if (active === false && !user.deactivatedAt) {
      if (user.role === UserRole.OWNER) {
        const ownerCount = await this.userRepo.roleCountByWorkspaceId(
          UserRole.OWNER,
          workspaceId,
        );
        if (ownerCount <= 1) {
          throw new SCIMMY.Types.Error(
            409,
            '',
            'Cannot deactivate the last workspace owner',
          );
        }
      }
      await this.userRepo.updateUser(
        { deactivatedAt: new Date() },
        user.id,
        workspaceId,
      );
      await this.userSessionRepo.revokeByUserId(user.id, workspaceId);
      this.auditService.log({
        event: AuditEvent.USER_DEACTIVATED,
        resourceType: AuditResource.USER,
        resourceId: user.id,
        metadata: { source: 'scim' },
      });
    } else if (active === true && user.deactivatedAt) {
      await this.userRepo.updateUser(
        { deactivatedAt: null },
        user.id,
        workspaceId,
      );
      this.auditService.log({
        event: AuditEvent.USER_ACTIVATED,
        resourceType: AuditResource.USER,
        resourceId: user.id,
        metadata: { source: 'scim' },
      });
    }
  }
}
