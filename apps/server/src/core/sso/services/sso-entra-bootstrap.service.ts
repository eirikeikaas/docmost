import { Inject, Injectable, Logger } from '@nestjs/common';
import { AuthProviderRepo } from '@docmost/db/repos/auth-provider/auth-provider.repo';
import { WorkspaceRepo } from '@docmost/db/repos/workspace/workspace.repo';
import {
  AuthProvider,
  UpdatableAuthProvider,
  Workspace,
} from '@docmost/db/types/entity.types';
import { EnvironmentService } from '../../../integrations/environment/environment.service';
import { EncryptionService } from '../../../integrations/encryption/encryption.service';
import {
  AUDIT_SERVICE,
  IAuditService,
} from '../../../integrations/audit/audit.service';
import {
  AuditEvent,
  AuditLogPayload,
  AuditResource,
} from '../../../common/events/audit-events';
import { OidcClientRegistryService } from './oidc-client-registry.service';
import {
  buildEntraDiscoveryUrl,
  buildEntraIssuer,
  isEntraTenantGuid,
  isValidEntraTenantId,
  parseRoleMapEnv,
} from '../entra.util';
import {
  mergeOidcProviderSettings,
  OidcProviderSettings,
  parseOidcProviderSettings,
} from '../oidc-provider-settings';

const DISCOVERY_TIMEOUT_MS = 5000;

interface DesiredEntraProvider {
  name: string;
  issuer: string;
  clientId: string;
  clientSecret: string;
  allowSignup: boolean;
  settings: Pick<
    OidcProviderSettings,
    'trustUnverifiedEmail' | 'roleMap' | 'requiredRoles'
  >;
}

function sortedJson(value: unknown): string {
  const sort = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(sort);
    if (typeof input === 'object' && input !== null) {
      return Object.fromEntries(
        Object.entries(input as Record<string, unknown>)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, val]) => [key, sort(val)]),
      );
    }
    return input;
  };
  return JSON.stringify(sort(value));
}

// Lets a deployment configure Microsoft Entra ID from the environment instead
// of clicking through the admin UI. Runs once per application start and is
// idempotent: it creates the provider when it is missing and otherwise only
// writes the fields that actually differ, so a restart is a no-op.
//
// While the SSO_OIDC_ENTRA_* variables are set they are the source of truth
// for the fields below (issuer, client id/secret, display name, allowSignup,
// isEnabled, trustUnverifiedEmail, roleMap, requiredRoles); edits made to
// those in the admin UI are reverted on the next start. Everything else about
// the provider (e.g. roleClaim, defaultRole) stays under the admin's control.
//
// It never throws: a misconfiguration is logged and the application starts
// normally, with password login unaffected.
@Injectable()
export class SsoEntraBootstrapService {
  private readonly logger = new Logger(SsoEntraBootstrapService.name);

  constructor(
    private readonly environmentService: EnvironmentService,
    private readonly workspaceRepo: WorkspaceRepo,
    private readonly authProviderRepo: AuthProviderRepo,
    private readonly encryptionService: EncryptionService,
    private readonly oidcClientRegistry: OidcClientRegistryService,
    @Inject(AUDIT_SERVICE) private readonly auditService: IAuditService,
  ) {}

  async run(): Promise<void> {
    try {
      await this.bootstrap();
    } catch (err: any) {
      this.logger.error(
        `Entra SSO bootstrap failed, skipping: ${err?.message ?? err}`,
      );
    }
  }

  private async bootstrap(): Promise<void> {
    // The cloud edition has many workspaces and no single deployment-wide
    // identity provider.
    if (this.environmentService.isCloud()) return;

    const tenant = this.environmentService.getSsoOidcEntraTenantId();
    const clientId = this.environmentService.getSsoOidcEntraClientId();
    const clientSecret = this.environmentService.getSsoOidcEntraClientSecret();

    if (!tenant && !clientId && !clientSecret) return;
    if (!tenant || !clientId || !clientSecret) {
      this.logger.warn(
        'SSO_OIDC_ENTRA_TENANT_ID, SSO_OIDC_ENTRA_CLIENT_ID and SSO_OIDC_ENTRA_CLIENT_SECRET must all be set to configure Microsoft Entra ID; ignoring the partial configuration',
      );
      return;
    }

    if (!isValidEntraTenantId(tenant)) {
      this.logger.error(
        'SSO_OIDC_ENTRA_TENANT_ID must be a tenant (directory) GUID or a verified domain. "common", "organizations" and "consumers" are not supported because their issuer never matches the issued tokens; skipping Entra SSO bootstrap',
      );
      return;
    }

    const roleMap = parseRoleMapEnv(
      this.environmentService.getSsoOidcEntraRoleMap(),
    );
    if (!roleMap) {
      this.logger.error(
        'SSO_OIDC_ENTRA_ROLE_MAP must look like "agents_admin=admin,agents_manage=member" (admin or member only, never owner); skipping Entra SSO bootstrap',
      );
      return;
    }

    // Nothing to attach the provider to until the first-run setup has created
    // the workspace; restart once it has.
    const workspace = await this.workspaceRepo.findFirst();
    if (!workspace) {
      this.logger.debug(
        'No workspace exists yet; Entra SSO will be configured on the first start after setup',
      );
      return;
    }

    const issuer = await this.resolveIssuer(tenant.trim());
    if (!issuer) return;

    await this.upsertProvider(workspace, {
      name: this.environmentService.getSsoOidcEntraDisplayName(),
      issuer,
      clientId,
      clientSecret,
      allowSignup: this.environmentService.getSsoOidcEntraAllowSignup(),
      settings: {
        trustUnverifiedEmail: true,
        roleMap,
        requiredRoles: this.environmentService.getSsoOidcEntraRequiredRoles(),
      },
    });
  }

  // Entra advertises (and signs tokens with) the tenant GUID in the issuer even
  // when discovery was started from a domain, so a domain has to be translated
  // to the GUID issuer it resolves to - the OIDC client rejects any mismatch.
  private async resolveIssuer(tenant: string): Promise<string | undefined> {
    if (isEntraTenantGuid(tenant)) return buildEntraIssuer(tenant);

    try {
      const response = await fetch(buildEntraDiscoveryUrl(tenant), {
        signal: AbortSignal.timeout(DISCOVERY_TIMEOUT_MS),
      });
      if (!response.ok) {
        throw new Error(`discovery returned HTTP ${response.status}`);
      }
      const document = (await response.json()) as { issuer?: unknown };
      const match =
        typeof document.issuer === 'string'
          ? /^https:\/\/login\.microsoftonline\.com\/([0-9a-f-]{36})\/v2\.0$/i.exec(
              document.issuer,
            )
          : null;
      if (!match || !isEntraTenantGuid(match[1])) {
        throw new Error('discovery returned an unexpected issuer');
      }
      return buildEntraIssuer(match[1]);
    } catch (err: any) {
      this.logger.error(
        `Could not resolve the tenant GUID for "${tenant}" (${err?.message ?? err}); set SSO_OIDC_ENTRA_TENANT_ID to the tenant GUID instead. Skipping Entra SSO bootstrap`,
      );
      return undefined;
    }
  }

  private async upsertProvider(
    workspace: Workspace,
    desired: DesiredEntraProvider,
  ): Promise<void> {
    const providers = await this.authProviderRepo.findByWorkspaceId(
      workspace.id,
      'oidc',
    );
    const match =
      providers.find((provider) => provider.name === desired.name) ??
      providers.find(
        (provider) =>
          provider.oidcIssuer === desired.issuer &&
          provider.oidcClientId === desired.clientId,
      );

    if (!match) {
      const created = await this.authProviderRepo.insertOidcProvider({
        name: desired.name,
        oidcIssuer: desired.issuer,
        oidcClientId: desired.clientId,
        oidcClientSecret: this.encryptionService.encrypt(desired.clientSecret),
        allowSignup: desired.allowSignup,
        isEnabled: true,
        settings: mergeOidcProviderSettings(undefined, desired.settings),
        creatorId: null,
        workspaceId: workspace.id,
      });
      await this.audit(workspace, {
        event: AuditEvent.SSO_PROVIDER_CREATED,
        resourceType: AuditResource.SSO_PROVIDER,
        resourceId: created.id,
        changes: { after: { name: created.name, isEnabled: true } },
        metadata: { source: 'environment' },
      });
      this.logger.log(`Created the "${desired.name}" SSO provider`);
      return;
    }

    const existing = await this.authProviderRepo.findById(
      match.id,
      workspace.id,
      'oidc',
      { includeSecret: true },
    );
    if (!existing) return;

    const changes = this.diff(existing, desired);
    if (Object.keys(changes).length === 0) {
      this.logger.debug(`The "${desired.name}" SSO provider is up to date`);
      return;
    }

    await this.authProviderRepo.updateOidcProvider(
      existing.id,
      workspace.id,
      changes,
    );
    // A rotated secret or edited issuer must not be served from the cache.
    this.oidcClientRegistry.invalidate(existing.id);
    await this.audit(workspace, {
      event: AuditEvent.SSO_PROVIDER_UPDATED,
      resourceType: AuditResource.SSO_PROVIDER,
      resourceId: existing.id,
      // Field names only: never log values, the secret in particular.
      metadata: { source: 'environment', fields: Object.keys(changes) },
    });
    this.logger.log(
      `Updated the "${desired.name}" SSO provider (${Object.keys(changes).join(', ')})`,
    );
  }

  // Auditing is best effort: it must never undo or abort the bootstrap.
  private async audit(
    workspace: Workspace,
    payload: AuditLogPayload,
  ): Promise<void> {
    try {
      await this.auditService.logWithContext(payload, {
        workspaceId: workspace.id,
        actorType: 'system',
      });
    } catch (err: any) {
      this.logger.warn(`Could not write the audit entry: ${err?.message}`);
    }
  }

  private diff(
    existing: AuthProvider,
    desired: DesiredEntraProvider,
  ): UpdatableAuthProvider {
    const changes: UpdatableAuthProvider = {};

    if (existing.name !== desired.name) changes.name = desired.name;
    if (existing.oidcIssuer !== desired.issuer) {
      changes.oidcIssuer = desired.issuer;
    }
    if (existing.oidcClientId !== desired.clientId) {
      changes.oidcClientId = desired.clientId;
    }
    if (!this.secretMatches(existing.oidcClientSecret, desired.clientSecret)) {
      changes.oidcClientSecret = this.encryptionService.encrypt(
        desired.clientSecret,
      );
    }
    if (existing.allowSignup !== desired.allowSignup) {
      changes.allowSignup = desired.allowSignup;
    }
    if (existing.isEnabled !== true) changes.isEnabled = true;

    const current = parseOidcProviderSettings(existing.settings);
    const settingsDiffer =
      current.trustUnverifiedEmail !== desired.settings.trustUnverifiedEmail ||
      sortedJson(current.roleMap) !== sortedJson(desired.settings.roleMap) ||
      sortedJson([...current.requiredRoles].sort()) !==
        sortedJson([...desired.settings.requiredRoles].sort());
    if (settingsDiffer) {
      changes.settings = mergeOidcProviderSettings(
        existing.settings,
        desired.settings,
      );
    }

    return changes;
  }

  private secretMatches(stored: string | null, plaintext: string): boolean {
    if (!stored) return false;
    try {
      return this.encryptionService.decrypt(stored) === plaintext;
    } catch {
      // Undecryptable (e.g. APP_SECRET rotated): rewrite it.
      return false;
    }
  }
}
