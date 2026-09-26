import api from "@/lib/api-client";
import {
  ICreateOidcProvider,
  ICreateSamlProvider,
  IOidcProvider,
  ISamlProvider,
  IUpdateOidcProvider,
  IUpdateSamlProvider,
} from "@/features/sso/types/sso.types";

export async function getOidcProviders(): Promise<IOidcProvider[]> {
  const req = await api.post<IOidcProvider[]>("/sso/oidc/providers/list");
  return req.data;
}

export async function createOidcProvider(
  data: ICreateOidcProvider,
): Promise<IOidcProvider> {
  const req = await api.post<IOidcProvider>("/sso/oidc/providers", data);
  return req.data;
}

export async function updateOidcProvider(
  data: IUpdateOidcProvider,
): Promise<IOidcProvider> {
  const req = await api.post<IOidcProvider>(
    "/sso/oidc/providers/update",
    data,
  );
  return req.data;
}

export async function deleteOidcProvider(id: string): Promise<void> {
  await api.post<void>("/sso/oidc/providers/delete", { id });
}

// Real browser navigation, not a fetch() call - this builds the href for an
// <a> tag / window.location assignment.
export function buildOidcLoginUrl(
  providerId: string,
  redirectPath?: string,
): string {
  const params = redirectPath ? `?redirect=${encodeURIComponent(redirectPath)}` : "";
  return `/api/sso/oidc/${providerId}/login${params}`;
}

export async function getSamlProviders(): Promise<ISamlProvider[]> {
  const req = await api.post<ISamlProvider[]>("/sso/saml/providers/list");
  return req.data;
}

export async function createSamlProvider(
  data: ICreateSamlProvider,
): Promise<ISamlProvider> {
  const req = await api.post<ISamlProvider>("/sso/saml/providers", data);
  return req.data;
}

export async function updateSamlProvider(
  data: IUpdateSamlProvider,
): Promise<ISamlProvider> {
  const req = await api.post<ISamlProvider>(
    "/sso/saml/providers/update",
    data,
  );
  return req.data;
}

export async function deleteSamlProvider(id: string): Promise<void> {
  await api.post<void>("/sso/saml/providers/delete", { id });
}

export function buildSamlLoginUrl(
  providerId: string,
  redirectPath?: string,
): string {
  const params = redirectPath ? `?redirect=${encodeURIComponent(redirectPath)}` : "";
  return `/api/sso/saml/${providerId}/login${params}`;
}

export function samlMetadataUrl(): string {
  return `${window.location.origin}/api/sso/saml/metadata`;
}

export function samlAcsUrl(): string {
  return `${window.location.origin}/api/sso/saml/callback`;
}
