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
