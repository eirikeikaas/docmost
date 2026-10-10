import { OidcMappableRole } from "@/features/sso/types/sso.types";

export type RoleMap = Record<string, OidcMappableRole>;

const ROLES: OidcMappableRole[] = ["admin", "member"];

// "agents_admin=admin, agents_manage=member" (one per line or comma
// separated) -> { agents_admin: "admin", agents_manage: "member" }.
// Returns null when something is not a `claim value = admin|member` pair, so
// the form can say so instead of silently dropping it.
export function parseRoleMapText(text: string): RoleMap | null {
  const out: RoleMap = {};
  for (const part of text.split(/[\n,]/)) {
    const pair = part.trim();
    if (!pair) continue;

    const separator = pair.lastIndexOf("=");
    if (separator <= 0) return null;

    const claimValue = pair.slice(0, separator).trim();
    const role = pair
      .slice(separator + 1)
      .trim()
      .toLowerCase();
    if (!claimValue || !ROLES.includes(role as OidcMappableRole)) return null;
    out[claimValue] = role as OidcMappableRole;
  }
  return out;
}

export function formatRoleMap(roleMap: RoleMap | undefined): string {
  return Object.entries(roleMap ?? {})
    .map(([claimValue, role]) => `${claimValue}=${role}`)
    .join("\n");
}
