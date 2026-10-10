export interface IOidcProvider {
  id: string;
  name: string;
  type: string;
  oidcIssuer: string;
  oidcClientId: string;
  hasClientSecret: boolean;
  allowSignup: boolean;
  isEnabled: boolean;
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
}

export interface IUpdateOidcProvider extends Partial<ICreateOidcProvider> {
  id: string;
}
