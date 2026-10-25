import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { ScimTokenRepo } from '@docmost/db/repos/scim/scim-token.repo';
import { ScimToken, User, Workspace } from '@docmost/db/types/entity.types';
import { CreateScimTokenDto } from '../dto/create-scim-token.dto';
import { UpdateScimTokenDto } from '../dto/update-scim-token.dto';
import { SCIM_TOKEN_PREFIX } from '../scim.constants';
import { hashScimToken } from '../scim.util';
import { AuditEvent, AuditResource } from '../../../common/events/audit-events';
import {
  AUDIT_SERVICE,
  IAuditService,
} from '../../../integrations/audit/audit.service';

export interface ScimTokenView {
  id: string;
  name: string;
  tokenLastFour: string;
  isEnabled: boolean;
  lastUsedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// Only the create response carries the plaintext token - it is shown once
// and never retrievable again, the same convention as every other bearer
// token/API key in this app.
export interface ScimTokenCreatedView extends ScimTokenView {
  token: string;
}

function toView(token: ScimToken): ScimTokenView {
  return {
    id: token.id,
    name: token.name,
    tokenLastFour: token.tokenLastFour,
    isEnabled: token.isEnabled,
    lastUsedAt: token.lastUsedAt,
    createdAt: token.createdAt,
    updatedAt: token.updatedAt,
  };
}

@Injectable()
export class ScimTokenService {
  constructor(
    private readonly scimTokenRepo: ScimTokenRepo,
    @Inject(AUDIT_SERVICE) private readonly auditService: IAuditService,
  ) {}

  async list(workspaceId: string): Promise<ScimTokenView[]> {
    const tokens = await this.scimTokenRepo.findByWorkspaceId(workspaceId);
    return tokens.map(toView);
  }

  async create(
    dto: CreateScimTokenDto,
    user: User,
    workspace: Workspace,
  ): Promise<ScimTokenCreatedView> {
    const token = `${SCIM_TOKEN_PREFIX}${randomBytes(24).toString('base64url')}`;
    const created = await this.scimTokenRepo.insertToken({
      name: dto.name,
      tokenHash: hashScimToken(token),
      tokenLastFour: token.slice(-4),
      isEnabled: dto.isEnabled ?? true,
      creatorId: user.id,
      workspaceId: workspace.id,
    });

    this.auditService.log({
      event: AuditEvent.SCIM_TOKEN_CREATED,
      resourceType: AuditResource.SCIM_TOKEN,
      resourceId: created.id,
      changes: { after: { name: created.name, isEnabled: created.isEnabled } },
    });

    return { ...toView(created), token };
  }

  async update(
    dto: UpdateScimTokenDto,
    workspace: Workspace,
  ): Promise<ScimTokenView> {
    const existing = await this.scimTokenRepo.findById(dto.id, workspace.id);
    if (!existing) {
      throw new NotFoundException('SCIM token not found');
    }

    const updated = await this.scimTokenRepo.updateToken(dto.id, workspace.id, {
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.isEnabled !== undefined ? { isEnabled: dto.isEnabled } : {}),
    });

    this.auditService.log({
      event: AuditEvent.SCIM_TOKEN_UPDATED,
      resourceType: AuditResource.SCIM_TOKEN,
      resourceId: updated.id,
      changes: {
        before: { name: existing.name, isEnabled: existing.isEnabled },
        after: { name: updated.name, isEnabled: updated.isEnabled },
      },
    });

    return toView(updated);
  }

  async delete(id: string, workspace: Workspace): Promise<void> {
    const existing = await this.scimTokenRepo.findById(id, workspace.id);
    if (!existing) {
      throw new NotFoundException('SCIM token not found');
    }

    await this.scimTokenRepo.softDeleteById(id, workspace.id);

    this.auditService.log({
      event: AuditEvent.SCIM_TOKEN_DELETED,
      resourceType: AuditResource.SCIM_TOKEN,
      resourceId: id,
      changes: { before: { name: existing.name } },
    });
  }
}
