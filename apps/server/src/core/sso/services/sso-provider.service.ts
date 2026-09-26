import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AuthProviderRepo } from '@docmost/db/repos/auth-provider/auth-provider.repo';
import { AuthProvider } from '@docmost/db/types/entity.types';
import { EncryptionService } from '../../../integrations/encryption/encryption.service';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { CreateOidcProviderDto } from '../dto/create-oidc-provider.dto';
import { UpdateOidcProviderDto } from '../dto/update-oidc-provider.dto';
import { AuditEvent, AuditResource } from '../../../common/events/audit-events';
import {
  AUDIT_SERVICE,
  IAuditService,
} from '../../../integrations/audit/audit.service';
import { OidcClientRegistryService } from './oidc-client-registry.service';

// A provider always has a secret from the moment it's created - the create
// DTO requires one and the update DTO has no way to null it back out - so
// hasClientSecret is always true for anything this service hands back.
// oidcClientSecret itself (plaintext or ciphertext) must never appear in an
// admin-facing response.
export interface OidcProviderView {
  id: string;
  name: string;
  type: string;
  oidcIssuer: string;
  oidcClientId: string;
  hasClientSecret: boolean;
  allowSignup: boolean;
  isEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function toView(provider: AuthProvider): OidcProviderView {
  return {
    id: provider.id,
    name: provider.name,
    type: provider.type,
    oidcIssuer: provider.oidcIssuer,
    oidcClientId: provider.oidcClientId,
    hasClientSecret: true,
    allowSignup: provider.allowSignup,
    isEnabled: provider.isEnabled,
    createdAt: provider.createdAt,
    updatedAt: provider.updatedAt,
  };
}

@Injectable()
export class SsoProviderService {
  constructor(
    private readonly authProviderRepo: AuthProviderRepo,
    private readonly encryptionService: EncryptionService,
    private readonly oidcClientRegistry: OidcClientRegistryService,
    @Inject(AUDIT_SERVICE) private readonly auditService: IAuditService,
  ) {}

  async list(workspaceId: string): Promise<OidcProviderView[]> {
    const providers = await this.authProviderRepo.findByWorkspaceId(
      workspaceId,
    );
    return providers.map(toView);
  }

  async create(
    dto: CreateOidcProviderDto,
    user: User,
    workspace: Workspace,
  ): Promise<OidcProviderView> {
    const provider = await this.authProviderRepo.insertOidcProvider({
      name: dto.name,
      oidcIssuer: dto.oidcIssuer,
      oidcClientId: dto.oidcClientId,
      oidcClientSecret: this.encryptionService.encrypt(dto.oidcClientSecret),
      allowSignup: dto.allowSignup ?? false,
      isEnabled: dto.isEnabled ?? false,
      creatorId: user.id,
      workspaceId: workspace.id,
    });

    this.auditService.log({
      event: AuditEvent.SSO_PROVIDER_CREATED,
      resourceType: AuditResource.SSO_PROVIDER,
      resourceId: provider.id,
      changes: {
        after: { name: provider.name, isEnabled: provider.isEnabled },
      },
    });

    return toView(provider);
  }

  async update(
    dto: UpdateOidcProviderDto,
    workspace: Workspace,
  ): Promise<OidcProviderView> {
    const existing = await this.authProviderRepo.findById(
      dto.id,
      workspace.id,
    );
    if (!existing) {
      throw new NotFoundException('SSO provider not found');
    }

    const updated = await this.authProviderRepo.updateOidcProvider(
      dto.id,
      workspace.id,
      {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.oidcIssuer !== undefined ? { oidcIssuer: dto.oidcIssuer } : {}),
        ...(dto.oidcClientId !== undefined
          ? { oidcClientId: dto.oidcClientId }
          : {}),
        ...(dto.oidcClientSecret !== undefined
          ? {
              oidcClientSecret: this.encryptionService.encrypt(
                dto.oidcClientSecret,
              ),
            }
          : {}),
        ...(dto.allowSignup !== undefined
          ? { allowSignup: dto.allowSignup }
          : {}),
        ...(dto.isEnabled !== undefined ? { isEnabled: dto.isEnabled } : {}),
      },
    );

    // Discovery config may now be stale (rotated secret, edited issuer).
    this.oidcClientRegistry.invalidate(dto.id);

    this.auditService.log({
      event: AuditEvent.SSO_PROVIDER_UPDATED,
      resourceType: AuditResource.SSO_PROVIDER,
      resourceId: updated.id,
      changes: {
        before: { name: existing.name, isEnabled: existing.isEnabled },
        after: { name: updated.name, isEnabled: updated.isEnabled },
      },
    });

    return toView(updated);
  }

  async delete(id: string, workspace: Workspace): Promise<void> {
    const existing = await this.authProviderRepo.findById(id, workspace.id);
    if (!existing) {
      throw new NotFoundException('SSO provider not found');
    }

    await this.authProviderRepo.softDeleteById(id, workspace.id);
    this.oidcClientRegistry.invalidate(id);

    this.auditService.log({
      event: AuditEvent.SSO_PROVIDER_DELETED,
      resourceType: AuditResource.SSO_PROVIDER,
      resourceId: id,
      changes: { before: { name: existing.name } },
    });
  }
}
