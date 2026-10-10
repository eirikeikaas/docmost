import { buildMessage, ValidateBy, ValidationOptions } from 'class-validator';
import {
  isOidcMappableRole,
  MAX_OIDC_ROLE_ENTRIES,
  MAX_OIDC_ROLE_VALUE_LENGTH,
} from '../oidc-provider-settings';

export const IS_OIDC_ROLE_MAP = 'isOidcRoleMap';

// { "<claim value>": "admin" | "member" } - 'owner' is rejected on purpose:
// workspace ownership is never granted through SSO.
export function isOidcRoleMap(value: unknown): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const entries = Object.entries(value);
  if (entries.length > MAX_OIDC_ROLE_ENTRIES) return false;
  return entries.every(
    ([claimValue, role]) =>
      claimValue.trim().length > 0 &&
      claimValue.length <= MAX_OIDC_ROLE_VALUE_LENGTH &&
      isOidcMappableRole(role),
  );
}

export function IsOidcRoleMap(
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return ValidateBy(
    {
      name: IS_OIDC_ROLE_MAP,
      validator: {
        validate: (value): boolean => isOidcRoleMap(value),
        defaultMessage: buildMessage(
          (eachPrefix) =>
            eachPrefix +
            '$property must map claim values to "admin" or "member" (at most ' +
            MAX_OIDC_ROLE_ENTRIES +
            ' entries)',
          validationOptions,
        ),
      },
    },
    validationOptions,
  );
}
