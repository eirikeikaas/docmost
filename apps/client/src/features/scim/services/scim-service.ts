import api from "@/lib/api-client";
import {
  ICreateScimToken,
  IScimToken,
  IScimTokenCreated,
  IUpdateScimToken,
} from "@/features/scim/types/scim.types";

export async function getScimTokens(): Promise<IScimToken[]> {
  const req = await api.post<IScimToken[]>("/scim-tokens/list");
  return req.data;
}

export async function createScimToken(
  data: ICreateScimToken,
): Promise<IScimTokenCreated> {
  const req = await api.post<IScimTokenCreated>("/scim-tokens", data);
  return req.data;
}

export async function updateScimToken(
  data: IUpdateScimToken,
): Promise<IScimToken> {
  const req = await api.post<IScimToken>("/scim-tokens/update", data);
  return req.data;
}

export async function deleteScimToken(id: string): Promise<void> {
  await api.post<void>("/scim-tokens/delete", { id });
}

export function scimBaseUrl(): string {
  return `${window.location.origin}/api/scim/v2`;
}
