import { BadRequestException, Injectable } from '@nestjs/common';
import { SAML, SamlConfig, ValidateInResponseTo } from '@node-saml/node-saml';
import { EnvironmentService } from '../../../integrations/environment/environment.service';
import { AuthProvider } from '@docmost/db/types/entity.types';
import { SamlReplayCacheProvider } from './saml-replay-cache-provider.service';

interface CacheEntry {
  saml: SAML;
  expiresAt: number;
}

// Mirrors OidcClientRegistryService's short-TTL cache: bounds how long an
// edited/disabled provider's old config can still be served from cache.
const CONFIG_CACHE_TTL_MS = 10 * 60 * 1000;

@Injectable()
export class SamlClientRegistryService {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    private readonly environmentService: EnvironmentService,
    private readonly cacheProvider: SamlReplayCacheProvider,
  ) {}

  getClient(
    provider: Pick<AuthProvider, 'id' | 'samlUrl' | 'samlCertificate'>,
  ): SAML {
    const cached = this.cache.get(provider.id);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.saml;
    }

    if (!provider.samlUrl || !provider.samlCertificate) {
      throw new BadRequestException(
        'This SSO provider is not fully configured',
      );
    }

    const entryPointUrl = new URL(provider.samlUrl);
    if (
      entryPointUrl.protocol !== 'https:' &&
      !this.environmentService.isDevelopment()
    ) {
      throw new BadRequestException('SAML entry point must use https');
    }

    const config: SamlConfig = {
      entryPoint: provider.samlUrl,
      idpCert: provider.samlCertificate,
      issuer: this.spEntityId(),
      callbackUrl: this.callbackUrl(),
      cacheProvider: this.cacheProvider,
      validateInResponseTo: ValidateInResponseTo.always,
      wantAssertionsSigned: true,
    };

    const saml = new SAML(config);
    this.cache.set(provider.id, {
      saml,
      expiresAt: Date.now() + CONFIG_CACHE_TTL_MS,
    });
    return saml;
  }

  invalidate(providerId: string): void {
    this.cache.delete(providerId);
  }

  // Single, provider-agnostic SP identity: every configured SAML IdP is
  // registered against this same entity ID and ACS URL, mirroring the
  // OIDC controller's single global redirect_uri design.
  spEntityId(): string {
    return `${this.environmentService.getAppUrl()}/api/sso/saml/metadata`;
  }

  callbackUrl(): string {
    return `${this.environmentService.getAppUrl()}/api/sso/saml/callback`;
  }
}
