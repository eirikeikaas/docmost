import { BadRequestException, Injectable } from '@nestjs/common';
import { discovery, Configuration } from 'openid-client';
import { EncryptionService } from '../../../integrations/encryption/encryption.service';
import { EnvironmentService } from '../../../integrations/environment/environment.service';
import { AuthProvider } from '@docmost/db/types/entity.types';
import { OIDC_CONFIG_CACHE_TTL_MS } from '../sso.constants';

interface CacheEntry {
  config: Configuration;
  expiresAt: number;
}

// Discovery (and the JWKS fetch it triggers) is not free, so results are
// cached briefly per provider. The TTL bounds how long a just-rotated
// secret or just-disabled provider can still be served from cache -
// callers must invalidate() on every update/disable/delete.
@Injectable()
export class OidcClientRegistryService {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    private readonly encryptionService: EncryptionService,
    private readonly environmentService: EnvironmentService,
  ) {}

  async getConfig(
    provider: Pick<
      AuthProvider,
      'id' | 'oidcIssuer' | 'oidcClientId' | 'oidcClientSecret'
    >,
  ): Promise<Configuration> {
    const cached = this.cache.get(provider.id);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.config;
    }

    if (
      !provider.oidcIssuer ||
      !provider.oidcClientId ||
      !provider.oidcClientSecret
    ) {
      throw new BadRequestException('This SSO provider is not fully configured');
    }

    const issuerUrl = new URL(provider.oidcIssuer);
    if (
      issuerUrl.protocol !== 'https:' &&
      !this.environmentService.isDevelopment()
    ) {
      throw new BadRequestException('OIDC issuer must use https');
    }

    const clientSecret = this.encryptionService.decrypt(
      provider.oidcClientSecret,
    );
    const config = await discovery(issuerUrl, provider.oidcClientId, clientSecret);

    this.cache.set(provider.id, {
      config,
      expiresAt: Date.now() + OIDC_CONFIG_CACHE_TTL_MS,
    });
    return config;
  }

  invalidate(providerId: string): void {
    this.cache.delete(providerId);
  }
}
