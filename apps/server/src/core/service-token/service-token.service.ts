import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { executeTx } from '@docmost/db/utils';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { WorkspaceRepo } from '@docmost/db/repos/workspace/workspace.repo';
import {
  ServiceTokenRepo,
  ServiceTokenWithUser,
} from '@docmost/db/repos/service-token/service-token.repo';
import { TokenService } from '../auth/services/token.service';
import { JwtServiceTokenPayload } from '../auth/dto/jwt-payload';
import { UserRole } from '../../common/helpers/types/permission';
import { isUserDisabled } from '../../common/helpers';
import { AuditEvent, AuditResource } from '../../common/events/audit-events';
import {
  AUDIT_SERVICE,
  IAuditService,
} from '../../integrations/audit/audit.service';
import { CreateServiceTokenDto } from './dto/create-service-token.dto';
import {
  SERVICE_TOKEN_DEFAULT_EXPIRY_DAYS,
  SERVICE_TOKEN_LAST_USED_THROTTLE_MS,
  SERVICE_TOKEN_MAX_EXPIRY_DAYS,
  SERVICE_TOKEN_MIN_EXPIRY_DAYS,
  SERVICE_TOKEN_PREFIX_LENGTH,
} from './service-token.constants';

export type ServiceTokenStatus = 'active' | 'revoked' | 'expired';

// What an admin sees. The token itself is never part of it (only the create
// response carries it, once) and neither is anything that could reconstruct it.
export interface ServiceTokenView {
  id: string;
  name: string;
  tokenPrefix: string;
  userId: string;
  userName: string | null;
  userEmail: string;
  // True when the bound user has been deactivated or deleted: the token stays
  // listed, but it authenticates nobody.
  userDisabled: boolean;
  creatorId: string | null;
  status: ServiceTokenStatus;
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}

export interface CreatedServiceToken extends ServiceTokenView {
  token: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function statusOf(
  row: Pick<ServiceTokenWithUser, 'revokedAt' | 'expiresAt'>,
  now = Date.now(),
): ServiceTokenStatus {
  if (row.revokedAt) return 'revoked';
  if (row.expiresAt && new Date(row.expiresAt).getTime() <= now) {
    return 'expired';
  }
  return 'active';
}

function toView(row: ServiceTokenWithUser): ServiceTokenView {
  return {
    id: row.id,
    name: row.name,
    tokenPrefix: row.tokenPrefix,
    userId: row.userId,
    userName: row.userName,
    userEmail: row.userEmail,
    userDisabled: Boolean(row.userDeactivatedAt || row.userDeletedAt),
    creatorId: row.creatorId,
    status: statusOf(row),
    expiresAt: row.expiresAt,
    lastUsedAt: row.lastUsedAt,
    revokedAt: row.revokedAt,
    createdAt: row.createdAt,
  };
}

@Injectable()
export class ServiceTokenService {
  private readonly logger = new Logger(ServiceTokenService.name);

  constructor(
    private readonly serviceTokenRepo: ServiceTokenRepo,
    private readonly userRepo: UserRepo,
    private readonly workspaceRepo: WorkspaceRepo,
    private readonly tokenService: TokenService,
    @InjectKysely() private readonly db: KyselyDB,
    @Inject(AUDIT_SERVICE) private readonly auditService: IAuditService,
  ) {}

  async list(workspaceId: string): Promise<ServiceTokenView[]> {
    const rows = await this.serviceTokenRepo.listByWorkspace(workspaceId);
    return rows.map(toView);
  }

  // Creates the row and the signed token together. The token is returned here
  // and nowhere else: only a short fingerprint is stored.
  async create(
    dto: CreateServiceTokenDto,
    actor: User,
    workspace: Workspace,
  ): Promise<CreatedServiceToken> {
    const name = dto.name?.trim();
    if (!name) {
      throw new BadRequestException('A service token needs a name');
    }

    const days = dto.expiresInDays ?? SERVICE_TOKEN_DEFAULT_EXPIRY_DAYS;
    if (
      !Number.isInteger(days) ||
      days < SERVICE_TOKEN_MIN_EXPIRY_DAYS ||
      days > SERVICE_TOKEN_MAX_EXPIRY_DAYS
    ) {
      throw new BadRequestException(
        `expiresInDays must be between ${SERVICE_TOKEN_MIN_EXPIRY_DAYS} and ${SERVICE_TOKEN_MAX_EXPIRY_DAYS}`,
      );
    }

    const boundUser = await this.userRepo.findById(dto.userId, workspace.id);
    if (!boundUser) {
      throw new NotFoundException('User not found');
    }
    if (isUserDisabled(boundUser)) {
      throw new BadRequestException(
        'A service token cannot be bound to a disabled user',
      );
    }
    // A token is a standing credential. Ownership is the one role it must
    // never carry, whoever the token is handed to.
    if (boundUser.role === UserRole.OWNER) {
      throw new BadRequestException(
        'A service token cannot be bound to a workspace owner. Use a dedicated service account with the member role.',
      );
    }

    const expiresAt = new Date(Date.now() + days * DAY_MS);

    const { row, token } = await executeTx(this.db, async (trx) => {
      const inserted = await this.serviceTokenRepo.insert(
        {
          workspaceId: workspace.id,
          userId: boundUser.id,
          name,
          tokenPrefix: '',
          creatorId: actor.id,
          expiresAt,
        },
        trx,
      );

      const signed = await this.tokenService.generateServiceToken({
        serviceTokenId: inserted.id,
        user: boundUser,
        workspaceId: workspace.id,
        expiresAt,
      });

      const stored = await this.serviceTokenRepo.setTokenPrefix(
        inserted.id,
        workspace.id,
        this.fingerprint(signed),
        trx,
      );
      return { row: stored, token: signed };
    });

    this.auditService.log({
      event: AuditEvent.SERVICE_TOKEN_CREATED,
      resourceType: AuditResource.SERVICE_TOKEN,
      resourceId: row.id,
      changes: {
        after: {
          name: row.name,
          userId: row.userId,
          expiresAt: row.expiresAt,
        },
      },
    });

    return {
      ...toView({
        ...row,
        userName: boundUser.name,
        userEmail: boundUser.email,
        userRole: boundUser.role,
        userDeactivatedAt: boundUser.deactivatedAt,
        userDeletedAt: boundUser.deletedAt,
      }),
      token,
    };
  }

  // Idempotent: revoking a revoked token returns it unchanged.
  async revoke(id: string, workspace: Workspace): Promise<ServiceTokenView> {
    const existing = await this.serviceTokenRepo.findByIdWithUser(
      id,
      workspace.id,
    );
    if (!existing) {
      throw new NotFoundException('Service token not found');
    }
    if (existing.revokedAt) {
      return toView(existing);
    }

    const revoked = await this.serviceTokenRepo.revoke(id, workspace.id);
    if (revoked) {
      this.auditService.log({
        event: AuditEvent.SERVICE_TOKEN_REVOKED,
        resourceType: AuditResource.SERVICE_TOKEN,
        resourceId: id,
        changes: {
          before: { name: existing.name, userId: existing.userId },
        },
      });
    }

    const current = await this.serviceTokenRepo.findByIdWithUser(
      id,
      workspace.id,
    );
    return toView(current ?? { ...existing, revokedAt: new Date() });
  }

  // Called by the JWT strategy for every request that presents a service
  // token, after the signature and `exp` have been verified. The signature only
  // proves we issued the token once; this decides whether it is still good.
  // Every failure is the same bare 401, so a caller cannot tell a revoked token
  // from an unknown one or from a disabled account.
  async authenticate(
    payload: JwtServiceTokenPayload,
  ): Promise<{ user: User; workspace: Workspace }> {
    if (!payload.serviceTokenId || !payload.sub || !payload.workspaceId) {
      throw new UnauthorizedException();
    }

    const row = await this.serviceTokenRepo.findById(
      payload.serviceTokenId,
      payload.workspaceId,
    );
    if (!row || row.revokedAt) {
      throw new UnauthorizedException();
    }
    if (row.expiresAt && new Date(row.expiresAt).getTime() <= Date.now()) {
      throw new UnauthorizedException();
    }
    if (row.workspaceId !== payload.workspaceId || row.userId !== payload.sub) {
      throw new UnauthorizedException();
    }

    const workspace = await this.workspaceRepo.findById(row.workspaceId);
    if (!workspace) {
      throw new UnauthorizedException();
    }

    const user = await this.userRepo.findById(row.userId, row.workspaceId);
    // The owner check repeats the one at creation: the account may have been
    // promoted since, and a standing credential must not follow it there.
    if (!user || isUserDisabled(user) || user.role === UserRole.OWNER) {
      throw new UnauthorizedException();
    }

    this.touchLastUsed(row.id, row.lastUsedAt);
    return { user, workspace };
  }

  // Fire and forget: authentication must not wait for, or fail on, a
  // bookkeeping write.
  private touchLastUsed(id: string, lastUsedAt: Date | null): void {
    const now = new Date();
    if (
      lastUsedAt &&
      now.getTime() - new Date(lastUsedAt).getTime() <
        SERVICE_TOKEN_LAST_USED_THROTTLE_MS
    ) {
      return;
    }

    void (async () => {
      try {
        await this.serviceTokenRepo.touchLastUsed(
          id,
          now,
          SERVICE_TOKEN_LAST_USED_THROTTLE_MS,
        );
      } catch (err: any) {
        this.logger.debug(
          `Could not record last use of service token ${id}: ${err?.message}`,
        );
      }
    })();
  }

  private fingerprint(token: string): string {
    const signature = token.split('.')[2] ?? '';
    return signature.slice(0, SERVICE_TOKEN_PREFIX_LENGTH);
  }
}
