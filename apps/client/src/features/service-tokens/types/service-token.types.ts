export type ServiceTokenStatus = "active" | "revoked" | "expired";

export interface IServiceToken {
  id: string;
  name: string;
  // Short non-secret fingerprint; the token itself is never listed.
  tokenPrefix: string;
  userId: string;
  userName: string | null;
  userEmail: string;
  // The bound user was deactivated or deleted: the token authenticates nobody.
  userDisabled: boolean;
  creatorId: string | null;
  status: ServiceTokenStatus;
  expiresAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

// The create response: the token is only ever returned here, once.
export interface ICreatedServiceToken extends IServiceToken {
  token: string;
}

export interface ICreateServiceToken {
  name: string;
  userId: string;
  expiresInDays?: number;
}
