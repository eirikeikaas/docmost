export interface IScimToken {
  id: string;
  name: string;
  tokenLastFour: string;
  isEnabled: boolean;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IScimTokenCreated extends IScimToken {
  token: string;
}

export interface ICreateScimToken {
  name: string;
  isEnabled?: boolean;
}

export interface IUpdateScimToken {
  id: string;
  name?: string;
  isEnabled?: boolean;
}
