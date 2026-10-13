// Server-side twin of the client's apps/client/src/lib/app-route.ts
// safeRedirectPath() — the server is the one issuing the final res.redirect(),
// so a client-only check isn't sufficient. Rejects protocol-relative ("//..."),
// disguised-scheme, and otherwise non-relative paths.
export function isSafeRedirectPath(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  if (input.length === 0 || input.length > 2048) return null;
  // Reject whitespace, backslash, and any Unicode "Other" category char.
  if (/[\s\\]|\p{C}/u.test(input)) return null;
  if (!input.startsWith('/') || input.startsWith('//')) return null;
  if (input.toLowerCase().includes('://')) return null;
  if (/^\/[a-z][a-z0-9+\-.]*:/i.test(input)) return null;
  return input;
}

function readOwn(source: unknown, key: string): unknown {
  if (typeof source !== 'object' || source === null) return undefined;
  return Object.prototype.hasOwnProperty.call(source, key)
    ? (source as Record<string, unknown>)[key]
    : undefined;
}

// Reads a (possibly nested) claim. An exact top-level match wins, so claim
// names that themselves contain dots (e.g. "https://example.com/roles") keep
// working; otherwise a dotted path such as "realm_access.roles" is walked.
function readClaim(claims: unknown, claimName: string): unknown {
  const direct = readOwn(claims, claimName);
  if (direct !== undefined) return direct;
  if (!claimName.includes('.')) return undefined;

  let cursor: unknown = claims;
  for (const part of claimName.split('.')) {
    cursor = readOwn(cursor, part);
    if (cursor === undefined) return undefined;
  }
  return cursor;
}

// Returns the values of a role-style claim as a string list, or undefined when
// the claim is absent altogether (callers distinguish "absent" - try another
// source - from "present but empty"). A bare string is a single value; it is
// deliberately not split on spaces or commas.
export function extractClaimValues(
  claims: unknown,
  claimName: string,
): string[] | undefined {
  const value = readClaim(claims, claimName);
  if (value === undefined || value === null) return undefined;

  const items = Array.isArray(value) ? value : [value];
  return items
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export type EmailClaimName = 'email' | 'preferred_username' | 'upn';

// Microsoft Entra v2 ID tokens often omit `email`, but always carry
// preferred_username (and sometimes upn), which for work accounts is the
// user's sign-in address. Only a value that looks like an address is accepted.
const EMAIL_CLAIM_ORDER: readonly EmailClaimName[] = [
  'email',
  'preferred_username',
  'upn',
];

export function resolveEmailFromClaims(
  sources: ReadonlyArray<Record<string, unknown> | undefined>,
): { email: string; claim: EmailClaimName } | undefined {
  for (const claim of EMAIL_CLAIM_ORDER) {
    for (const source of sources) {
      const raw = readOwn(source, claim);
      if (typeof raw !== 'string') continue;
      const candidate = raw.trim().toLowerCase();
      if (/^[^\s@]+@[^\s@]+$/.test(candidate)) {
        return { email: candidate, claim };
      }
    }
  }
  return undefined;
}
