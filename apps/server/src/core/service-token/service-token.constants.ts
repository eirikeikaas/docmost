export const SERVICE_TOKEN_DEFAULT_EXPIRY_DAYS = 90;
export const SERVICE_TOKEN_MIN_EXPIRY_DAYS = 1;
export const SERVICE_TOKEN_MAX_EXPIRY_DAYS = 365;

// last_used_at is a hint for admins, not an audit trail: write it at most this
// often per token instead of on every request.
export const SERVICE_TOKEN_LAST_USED_THROTTLE_MS = 60 * 1000;

// Length of the non-secret fingerprint stored in token_prefix: the first
// characters of the JWT's signature segment. (The first characters of the JWT
// as a whole are identical for every token, so they could not tell tokens
// apart.) 8 base64url characters are 48 of the signature's 256 bits, which
// reveals nothing usable.
export const SERVICE_TOKEN_PREFIX_LENGTH = 8;
