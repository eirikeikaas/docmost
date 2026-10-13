// Roles an identity provider may grant. "owner" is never assigned through SSO.
export type OidcMappableRole = "admin" | "member";

export interface IOidcProvider {
  id: string;
  name: string;
  type: string;
  oidcIssuer: string;
  oidcClientId: string;
  hasClientSecret: boolean;
  allowSignup: boolean;
  isEnabled: boolean;
  trustUnverifiedEmail: boolean;
  roleClaim: string;
  roleMap: Record<string, OidcMappableRole>;
  defaultRole: OidcMappableRole;
  requiredRoles: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ICreateOidcProvider {
  name: string;
  oidcIssuer: string;
  oidcClientId: string;
  oidcClientSecret: string;
  allowSignup?: boolean;
  isEnabled?: boolean;
  trustUnverifiedEmail?: boolean;
  roleClaim?: string;
  roleMap?: Record<string, OidcMappableRole>;
  defaultRole?: OidcMappableRole;
  requiredRoles?: string[];
}

export interface IUpdateOidcProvider extends Partial<ICreateOidcProvider> {
  id: string;
}
