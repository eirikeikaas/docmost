import {
  isOidcMappableRole,
  MAX_OIDC_ROLE_ENTRIES,
  MAX_OIDC_ROLE_VALUE_LENGTH,
  OidcMappableRole,
} from './oidc-provider-settings';

// Helpers for Microsoft Entra ID (formerly Azure AD) as a generic OIDC
// provider. Written from Microsoft's public v2.0 endpoint documentation: the
// issuer of a v2.0 token is https://login.microsoftonline.com/<tenant-guid>/v2.0.

export const ENTRA_AUTHORITY_HOST = 'login.microsoftonline.com';

// Multi-tenant authorities. Their discovery document advertises a templated
// issuer ("{tenantid}"), and real tokens carry the signing-in tenant's GUID,
// so the issuer can never match and the OIDC library refuses them. Refuse the
// configuration up front with a readable message instead.
export const ENTRA_MULTI_TENANT_ALIASES: readonly string[] = [
  'common',
  'organizations',
  'consumers',
];

const GUID_SOURCE =
  '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const DOMAIN_SOURCE =
  '(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]';

const GUID_REGEX = new RegExp(`^${GUID_SOURCE}$`, 'i');
const DOMAIN_REGEX = new RegExp(`^${DOMAIN_SOURCE}$`, 'i');

export function isEntraTenantGuid(value: string): boolean {
  return GUID_REGEX.test(value);
}

// A tenant is addressed by its directory (tenant) GUID or by one of its
// verified domains (e.g. contoso.onmicrosoft.com). A bare word - which is what
// common/organizations/consumers are - is never a valid tenant.
export function isValidEntraTenantId(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const tenant = value.trim();
  if (tenant.length === 0 || tenant.length > 253) return false;
  if (ENTRA_MULTI_TENANT_ALIASES.includes(tenant.toLowerCase())) return false;
  return GUID_REGEX.test(tenant) || DOMAIN_REGEX.test(tenant);
}

export function buildEntraIssuer(tenantGuid: string): string {
  return `https://${ENTRA_AUTHORITY_HOST}/${tenantGuid.trim().toLowerCase()}/v2.0`;
}

export function buildEntraDiscoveryUrl(tenant: string): string {
  return `https://${ENTRA_AUTHORITY_HOST}/${tenant.trim().toLowerCase()}/v2.0/.well-known/openid-configuration`;
}

// True for an issuer URL on the Entra authority whose tenant segment is one of
// the multi-tenant aliases.
export function isMultiTenantEntraIssuer(issuer: string): boolean {
  let url: URL;
  try {
    url = new URL(issuer);
  } catch {
    return false;
  }
  if (url.hostname.toLowerCase() !== ENTRA_AUTHORITY_HOST) return false;
  const [tenant] = url.pathname.split('/').filter(Boolean);
  if (tenant === undefined) return false;
  try {
    return ENTRA_MULTI_TENANT_ALIASES.includes(
      decodeURIComponent(tenant).toLowerCase(),
    );
  } catch {
    // Malformed percent-encoding is not one of the aliases.
    return false;
  }
}

// "agents_admin=admin,agents_manage=member" -> { agents_admin: 'admin', ... }
// Returns null when the string is not in that form or maps anything other than
// admin|member (in particular 'owner').
export function parseRoleMapEnv(
  raw: string | undefined,
): Record<string, OidcMappableRole> | null {
  const out: Record<string, OidcMappableRole> = {};
  const text = (raw ?? '').trim();
  if (text.length === 0) return out;

  for (const pair of text.split(',')) {
    const trimmed = pair.trim();
    // Empty pairs (a trailing comma, ",,") are ignored.
    if (trimmed.length === 0) continue;

    const separator = trimmed.lastIndexOf('=');
    if (separator <= 0) return null;

    const claimValue = trimmed.slice(0, separator).trim();
    const role = trimmed
      .slice(separator + 1)
      .trim()
      .toLowerCase();
    if (
      claimValue.length === 0 ||
      claimValue.length > MAX_OIDC_ROLE_VALUE_LENGTH ||
      claimValue === '__proto__' ||
      !isOidcMappableRole(role)
    ) {
      return null;
    }
    out[claimValue] = role;
    if (Object.keys(out).length > MAX_OIDC_ROLE_ENTRIES) return null;
  }
  return out;
}

export function isValidRoleMapEnv(value: unknown): boolean {
  return typeof value === 'string' && parseRoleMapEnv(value) !== null;
}
