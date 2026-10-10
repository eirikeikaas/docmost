import { createHash } from 'node:crypto';

// A plain SHA-256 digest is the standard pattern for bearer-token lookup
// (GitHub PATs, Stripe keys, ...): the raw token already carries 256 bits
// of its own entropy from randomBytes, so a deterministic hash is safe to
// index on and doesn't need per-row salting the way a password would.
export function hashScimToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
