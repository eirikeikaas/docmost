import { Inject, Injectable } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { CacheItem, CacheProvider } from '@node-saml/node-saml';

const KEY_PREFIX = 'sso:saml:inresponseto:';
// Bounds the InResponseTo replay-protection window. Generous enough for
// clock skew between this server and the IdP, short enough that a captured
// SAMLResponse can't be replayed long after the fact.
const TTL_MS = 5 * 60 * 1000;

// node-saml's default InMemoryCacheProvider explicitly documents that it is
// NOT sufficient for a multi-instance/load-balanced deployment, since the
// AuthnRequest that seeds a cache entry may be handled by a different
// process than the one that later validates the response. This backs the
// same replay-protection cache with the app's existing Redis-backed
// CACHE_MANAGER instead, so it works correctly across instances.
@Injectable()
export class SamlReplayCacheProvider implements CacheProvider {
  constructor(@Inject(CACHE_MANAGER) private readonly cacheManager: Cache) {}

  async saveAsync(key: string, value: string): Promise<CacheItem | null> {
    const createdAt = Date.now();
    await this.cacheManager.set(KEY_PREFIX + key, value, TTL_MS);
    return { createdAt, value };
  }

  async getAsync(key: string): Promise<string | null> {
    const value = await this.cacheManager.get<string>(KEY_PREFIX + key);
    return value ?? null;
  }

  async removeAsync(key: string | null): Promise<string | null> {
    if (!key) return null;
    const value = await this.getAsync(key);
    await this.cacheManager.del(KEY_PREFIX + key);
    return value;
  }
}
