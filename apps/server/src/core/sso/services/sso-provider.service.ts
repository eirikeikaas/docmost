import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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
import {
  mergeOidcProviderSettings,
  OidcMappableRole,
  OidcProviderSettings,
  parseOidcProviderSettings,
} from '../oidc-provider-settings';
import { isMultiTenantEntraIssuer } from '../entra.util';

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
  // Per-provider options (auth_providers.settings), always fully populated.
  trustUnverifiedEmail: boolean;
  roleClaim: string;
  roleMap: Record<string, OidcMappableRole>;
  defaultRole: OidcMappableRole;
  requiredRoles: string[];
  createdAt: Date;
  updatedAt: Date;
}

function toView(provider: AuthProvider): OidcProviderView {
  const settings = parseOidcProviderSettings(provider.settings);
  return {
    id: provider.id,
    name: provider.name,
    type: provider.type,
    oidcIssuer: provider.oidcIssuer,
    oidcClientId: provider.oidcClientId,
    hasClientSecret: true,
    allowSignup: provider.allowSignup,
    isEnabled: provider.isEnabled,
    trustUnverifiedEmail: settings.trustUnverifiedEmail,
    roleClaim: settings.roleClaim,
    roleMap: settings.roleMap,
    defaultRole: settings.defaultRole,
    requiredRoles: settings.requiredRoles,
    createdAt: provider.createdAt,
    updatedAt: provider.updatedAt,
  };
}

function settingsPatchFromDto(
  dto: Partial<OidcProviderSettings>,
): Partial<OidcProviderSettings> {
  return {
    trustUnverifiedEmail: dto.trustUnverifiedEmail,
    roleClaim: dto.roleClaim,
    roleMap: dto.roleMap,
    defaultRole: dto.defaultRole,
    requiredRoles: dto.requiredRoles,
  };
}

// A multi-tenant Entra authority (common/organizations/consumers) advertises a
// templated issuer that never matches a real token, so every login would fail
// at the OIDC library. Say so when the provider is saved, not at first login.
function assertIssuerIsUsable(issuer: string | undefined) {
  if (issuer && isMultiTenantEntraIssuer(issuer)) {
    throw new BadRequestException(
      'Multi-tenant Microsoft Entra issuers (common, organizations, consumers) are not supported. Use your tenant-specific issuer, e.g. https://login.microsoftonline.com/<tenant-id>/v2.0',
    );
  }
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
      'oidc',
    );
    return providers.map(toView);
  }

  async create(
    dto: CreateOidcProviderDto,
    user: User,
    workspace: Workspace,
  ): Promise<OidcProviderView> {
    assertIssuerIsUsable(dto.oidcIssuer);

    const settings = mergeOidcProviderSettings(
      undefined,
      settingsPatchFromDto(dto),
    );

    const provider = await this.authProviderRepo.insertProvider('oidc', {
      name: dto.name,
      oidcIssuer: dto.oidcIssuer,
      oidcClientId: dto.oidcClientId,
      oidcClientSecret: this.encryptionService.encrypt(dto.oidcClientSecret),
      allowSignup: dto.allowSignup ?? false,
      isEnabled: dto.isEnabled ?? false,
      ...(settings ? { settings } : {}),
      creatorId: user.id,
      workspaceId: workspace.id,
    });

    this.auditService.log({
      event: AuditEvent.SSO_PROVIDER_CREATED,
      resourceType: AuditResource.SSO_PROVIDER,
      resourceId: provider.id,
      changes: {
        after: {
          name: provider.name,
          isEnabled: provider.isEnabled,
          trustUnverifiedEmail: toView(provider).trustUnverifiedEmail,
        },
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
      'oidc',
    );
    if (!existing) {
      throw new NotFoundException('SSO provider not found');
    }

    assertIssuerIsUsable(dto.oidcIssuer);

    const settings = mergeOidcProviderSettings(
      existing.settings,
      settingsPatchFromDto(dto),
    );

    const updated = await this.authProviderRepo.updateProvider(
      dto.id,
      workspace.id,
      'oidc',
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
        ...(settings ? { settings } : {}),
      },
    );

    // Discovery config may now be stale (rotated secret, edited issuer).
    this.oidcClientRegistry.invalidate(dto.id);

    this.auditService.log({
      event: AuditEvent.SSO_PROVIDER_UPDATED,
      resourceType: AuditResource.SSO_PROVIDER,
      resourceId: updated.id,
      changes: {
        before: {
          name: existing.name,
          isEnabled: existing.isEnabled,
          trustUnverifiedEmail: parseOidcProviderSettings(existing.settings)
            .trustUnverifiedEmail,
        },
        after: {
          name: updated.name,
          isEnabled: updated.isEnabled,
          trustUnverifiedEmail: toView(updated).trustUnverifiedEmail,
        },
      },
    });

    return toView(updated);
  }

  async delete(id: string, workspace: Workspace): Promise<void> {
    const existing = await this.authProviderRepo.findById(
      id,
      workspace.id,
      'oidc',
    );
    if (!existing) {
      throw new NotFoundException('SSO provider not found');
    }

    await this.authProviderRepo.softDeleteById(id, workspace.id, 'oidc');
    this.oidcClientRegistry.invalidate(id);

    this.auditService.log({
      event: AuditEvent.SSO_PROVIDER_DELETED,
      resourceType: AuditResource.SSO_PROVIDER,
      resourceId: id,
      changes: { before: { name: existing.name } },
    });
  }
}
