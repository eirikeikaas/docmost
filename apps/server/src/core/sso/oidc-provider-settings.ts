import type { JsonObject } from '@docmost/db/types/db';

// Per-provider OIDC options. They live in the existing auth_providers.settings
// jsonb column as flat top-level keys, so adding them needs no migration.
//
// The role map is persisted as a list of { claimValue, role } pairs
// (`roleMappings`), never as an object keyed by claim value: the database layer
// camelCases the keys of every JSON object it reads (Kysely's CamelCasePlugin),
// which would silently turn the claim value "agents_admin" into "agentsAdmin".
// Keys of an object are not safe for user-controlled strings; values are.
//
// Everything is read through parseOidcProviderSettings(): a stored value that
// is missing, has the wrong type or is out of range falls back to the safe
// default instead of throwing, so a hand-edited row can never make a login
// fail open (or crash).

// The only roles an identity provider may grant. 'owner' is deliberately not
// representable: ownership is never assigned (or removed) through SSO.
export type OidcMappableRole = 'admin' | 'member';

export const OIDC_MAPPABLE_ROLES: readonly OidcMappableRole[] = [
  'admin',
  'member',
];

export const DEFAULT_OIDC_ROLE_CLAIM = 'roles';
export const MAX_OIDC_ROLE_CLAIM_LENGTH = 200;
export const MAX_OIDC_ROLE_VALUE_LENGTH = 200;
export const MAX_OIDC_ROLE_ENTRIES = 50;

// One entry of the persisted role map.
export interface StoredRoleMapping {
  claimValue: string;
  role: OidcMappableRole;
}

export interface OidcProviderSettings {
  // Accept the IdP's email claim as verified even when it does not carry
  // email_verified=true (Microsoft Entra v2 ID tokens never do). Off by
  // default: the first login then fails closed.
  trustUnverifiedEmail: boolean;
  // Name (or dotted path) of the claim that carries the user's roles/groups.
  roleClaim: string;
  // claim value -> workspace role.
  roleMap: Record<string, OidcMappableRole>;
  // Role for a brand-new user when no roleMap entry matches.
  defaultRole: OidcMappableRole;
  // When non-empty, a login whose role claim holds none of these is refused.
  requiredRoles: string[];
}

export function isOidcMappableRole(value: unknown): value is OidcMappableRole {
  return value === 'admin' || value === 'member';
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOwn(obj: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function normalizeRoleMap(raw: unknown): Record<string, OidcMappableRole> {
  const out: Record<string, OidcMappableRole> = {};
  if (!isPlainObject(raw)) return out;

  for (const [key, value] of Object.entries(raw)) {
    if (Object.keys(out).length >= MAX_OIDC_ROLE_ENTRIES) break;
    const claimValue = key.trim();
    if (
      claimValue.length === 0 ||
      claimValue.length > MAX_OIDC_ROLE_VALUE_LENGTH ||
      claimValue === '__proto__'
    ) {
      continue;
    }
    // Anything that is not exactly admin|member (including 'owner') is
    // dropped rather than coerced.
    if (isOidcMappableRole(value)) {
      out[claimValue] = value;
    }
  }
  return out;
}

// The persisted list -> the record the rest of the code works with.
function roleMapFromStored(raw: unknown): Record<string, OidcMappableRole> {
  if (!Array.isArray(raw)) return {};
  const asRecord: Record<string, unknown> = {};
  for (const entry of raw) {
    if (
      isPlainObject(entry) &&
      typeof entry.claimValue === 'string' &&
      !hasOwn(asRecord, entry.claimValue.trim())
    ) {
      asRecord[entry.claimValue.trim()] = entry.role;
    }
  }
  return normalizeRoleMap(asRecord);
}

function roleMapToStored(
  roleMap: Record<string, OidcMappableRole>,
): StoredRoleMapping[] {
  return Object.entries(roleMap).map(([claimValue, role]) => ({
    claimValue,
    role,
  }));
}

function normalizeRoleList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out = new Set<string>();
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const value = item.trim();
    if (value.length === 0 || value.length > MAX_OIDC_ROLE_VALUE_LENGTH) {
      continue;
    }
    out.add(value);
    if (out.size >= MAX_OIDC_ROLE_ENTRIES) break;
  }
  return [...out];
}

function normalizeRoleClaim(raw: unknown): string {
  if (typeof raw !== 'string') return DEFAULT_OIDC_ROLE_CLAIM;
  const value = raw.trim();
  if (value.length === 0 || value.length > MAX_OIDC_ROLE_CLAIM_LENGTH) {
    return DEFAULT_OIDC_ROLE_CLAIM;
  }
  return value;
}

export function parseOidcProviderSettings(raw: unknown): OidcProviderSettings {
  const source = isPlainObject(raw) ? raw : {};
  return {
    trustUnverifiedEmail: source.trustUnverifiedEmail === true,
    roleClaim: normalizeRoleClaim(source.roleClaim),
    roleMap: roleMapFromStored(source.roleMappings),
    defaultRole: isOidcMappableRole(source.defaultRole)
      ? source.defaultRole
      : 'member',
    requiredRoles: normalizeRoleList(source.requiredRoles),
  };
}

// Merges a (partial) change into the stored settings object. Keys this module
// does not own are preserved untouched; the keys it does own are written
// normalised. Returns undefined when the patch is empty so callers can skip
// the write altogether.
export function mergeOidcProviderSettings(
  stored: unknown,
  patch: Partial<OidcProviderSettings>,
): JsonObject | undefined {
  const defined = Object.entries(patch).filter(
    ([, value]) => value !== undefined,
  );
  if (defined.length === 0) return undefined;

  const base = isPlainObject(stored) ? { ...stored } : {};
  const current = parseOidcProviderSettings(stored);
  const next: OidcProviderSettings = { ...current };

  if (patch.trustUnverifiedEmail !== undefined) {
    next.trustUnverifiedEmail = patch.trustUnverifiedEmail === true;
  }
  if (patch.roleClaim !== undefined) {
    next.roleClaim = normalizeRoleClaim(patch.roleClaim);
  }
  if (patch.roleMap !== undefined) {
    next.roleMap = normalizeRoleMap(patch.roleMap);
  }
  if (patch.defaultRole !== undefined) {
    next.defaultRole = isOidcMappableRole(patch.defaultRole)
      ? patch.defaultRole
      : current.defaultRole;
  }
  if (patch.requiredRoles !== undefined) {
    next.requiredRoles = normalizeRoleList(patch.requiredRoles);
  }

  const { roleMap, ...scalars } = next;
  // A hand-written `roleMap` object cannot be read back reliably (see the note
  // at the top); the list below replaces it.
  delete base.roleMap;
  return {
    ...base,
    ...scalars,
    roleMappings: roleMapToStored(roleMap),
  } as unknown as JsonObject;
}

// Highest privilege wins: admin beats member. Returns undefined when no value
// in the claim has a roleMap entry (the caller then leaves existing users as
// they are).
export function resolveMappedRole(
  claimValues: readonly string[],
  roleMap: Record<string, OidcMappableRole>,
): OidcMappableRole | undefined {
  let resolved: OidcMappableRole | undefined;
  for (const value of claimValues) {
    if (!hasOwn(roleMap, value)) continue;
    const role = roleMap[value];
    if (role === 'admin') return 'admin';
    if (role === 'member') resolved = 'member';
  }
  return resolved;
}

export function hasRequiredRole(
  claimValues: readonly string[],
  requiredRoles: readonly string[],
): boolean {
  if (requiredRoles.length === 0) return true;
  return claimValues.some((value) => requiredRoles.includes(value));
}
