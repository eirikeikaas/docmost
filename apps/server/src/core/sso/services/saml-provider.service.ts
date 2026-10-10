import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AuthProviderRepo } from '@docmost/db/repos/auth-provider/auth-provider.repo';
import { AuthProvider, User, Workspace } from '@docmost/db/types/entity.types';
import { CreateSamlProviderDto } from '../dto/create-saml-provider.dto';
import { UpdateSamlProviderDto } from '../dto/update-saml-provider.dto';
import { AuditEvent, AuditResource } from '../../../common/events/audit-events';
import {
  AUDIT_SERVICE,
  IAuditService,
} from '../../../integrations/audit/audit.service';
import { SamlClientRegistryService } from './saml-client-registry.service';

// samlCertificate is the IdP's public signing certificate, not a secret -
// unlike the OIDC client secret, it's fine to return as-is.
export interface SamlProviderView {
  id: string;
  name: string;
  type: string;
  samlUrl: string;
  samlCertificate: string;
  allowSignup: boolean;
  isEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function toView(provider: AuthProvider): SamlProviderView {
  return {
    id: provider.id,
    name: provider.name,
    type: provider.type,
    samlUrl: provider.samlUrl,
    samlCertificate: provider.samlCertificate,
    allowSignup: provider.allowSignup,
    isEnabled: provider.isEnabled,
    createdAt: provider.createdAt,
    updatedAt: provider.updatedAt,
  };
}

@Injectable()
export class SamlProviderService {
  constructor(
    private readonly authProviderRepo: AuthProviderRepo,
    private readonly samlClientRegistry: SamlClientRegistryService,
    @Inject(AUDIT_SERVICE) private readonly auditService: IAuditService,
  ) {}

  async list(workspaceId: string): Promise<SamlProviderView[]> {
    const providers = await this.authProviderRepo.findByWorkspaceId(
      workspaceId,
      'saml',
    );
    return providers.map(toView);
  }

  async create(
    dto: CreateSamlProviderDto,
    user: User,
    workspace: Workspace,
  ): Promise<SamlProviderView> {
    const provider = await this.authProviderRepo.insertProvider('saml', {
      name: dto.name,
      samlUrl: dto.samlUrl,
      samlCertificate: dto.samlCertificate,
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
    dto: UpdateSamlProviderDto,
    workspace: Workspace,
  ): Promise<SamlProviderView> {
    const existing = await this.authProviderRepo.findById(
      dto.id,
      workspace.id,
      'saml',
    );
    if (!existing) {
      throw new NotFoundException('SSO provider not found');
    }

    const updated = await this.authProviderRepo.updateProvider(
      dto.id,
      workspace.id,
      'saml',
      {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.samlUrl !== undefined ? { samlUrl: dto.samlUrl } : {}),
        ...(dto.samlCertificate !== undefined
          ? { samlCertificate: dto.samlCertificate }
          : {}),
        ...(dto.allowSignup !== undefined
          ? { allowSignup: dto.allowSignup }
          : {}),
        ...(dto.isEnabled !== undefined ? { isEnabled: dto.isEnabled } : {}),
      },
    );

    // The entry point/cert may now be stale in the cached SAML client.
    this.samlClientRegistry.invalidate(dto.id);

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
    const existing = await this.authProviderRepo.findById(
      id,
      workspace.id,
      'saml',
    );
    if (!existing) {
      throw new NotFoundException('SSO provider not found');
    }

    await this.authProviderRepo.softDeleteById(id, workspace.id, 'saml');
    this.samlClientRegistry.invalidate(id);

    this.auditService.log({
      event: AuditEvent.SSO_PROVIDER_DELETED,
      resourceType: AuditResource.SSO_PROVIDER,
      resourceId: id,
      changes: { before: { name: existing.name } },
    });
  }
}
