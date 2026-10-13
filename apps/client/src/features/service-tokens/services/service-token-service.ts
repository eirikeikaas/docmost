import api from "@/lib/api-client";
import {
  ICreatedServiceToken,
  ICreateServiceToken,
  IServiceToken,
} from "@/features/service-tokens/types/service-token.types";

export async function getServiceTokens(): Promise<IServiceToken[]> {
  const req = await api.post<IServiceToken[]>("/service-tokens/list");
  return req.data;
}

export async function createServiceToken(
  data: ICreateServiceToken,
): Promise<ICreatedServiceToken> {
  const req = await api.post<ICreatedServiceToken>(
    "/service-tokens/create",
    data,
  );
  return req.data;
}

export async function revokeServiceToken(id: string): Promise<IServiceToken> {
  const req = await api.post<IServiceToken>("/service-tokens/revoke", { id });
  return req.data;
}
