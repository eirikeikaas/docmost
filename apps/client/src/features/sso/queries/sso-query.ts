import {
  useMutation,
  useQuery,
  useQueryClient,
  UseQueryResult,
} from "@tanstack/react-query";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import {
  createOidcProvider,
  createSamlProvider,
  deleteOidcProvider,
  deleteSamlProvider,
  getOidcProviders,
  getSamlProviders,
  updateOidcProvider,
  updateSamlProvider,
} from "@/features/sso/services/sso-service";
import {
  ICreateOidcProvider,
  ICreateSamlProvider,
  IOidcProvider,
  ISamlProvider,
  IUpdateOidcProvider,
  IUpdateSamlProvider,
} from "@/features/sso/types/sso.types";

const OIDC_PROVIDERS_KEY = ["oidc-providers"];
const SAML_PROVIDERS_KEY = ["saml-providers"];

export function useOidcProvidersQuery(): UseQueryResult<
  IOidcProvider[],
  Error
> {
  return useQuery({
    queryKey: OIDC_PROVIDERS_KEY,
    queryFn: () => getOidcProviders(),
  });
}

export function useCreateOidcProviderMutation() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  return useMutation<IOidcProvider, Error, ICreateOidcProvider>({
    mutationFn: (data) => createOidcProvider(data),
    onSuccess: () => {
      notifications.show({ message: t("SSO provider created") });
      queryClient.invalidateQueries({ queryKey: OIDC_PROVIDERS_KEY });
    },
    onError: (error) => {
      const message = error["response"]?.data?.message;
      notifications.show({ message, color: "red" });
    },
  });
}

export function useUpdateOidcProviderMutation() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  return useMutation<IOidcProvider, Error, IUpdateOidcProvider>({
    mutationFn: (data) => updateOidcProvider(data),
    onSuccess: () => {
      notifications.show({ message: t("SSO provider updated") });
      queryClient.invalidateQueries({ queryKey: OIDC_PROVIDERS_KEY });
    },
    onError: (error) => {
      const message = error["response"]?.data?.message;
      notifications.show({ message, color: "red" });
    },
  });
}

export function useDeleteOidcProviderMutation() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  return useMutation<void, Error, { id: string }>({
    mutationFn: (data) => deleteOidcProvider(data.id),
    onSuccess: () => {
      notifications.show({ message: t("SSO provider deleted") });
      queryClient.invalidateQueries({ queryKey: OIDC_PROVIDERS_KEY });
    },
    onError: (error) => {
      const message = error["response"]?.data?.message;
      notifications.show({ message, color: "red" });
    },
  });
}

export function useSamlProvidersQuery(): UseQueryResult<
  ISamlProvider[],
  Error
> {
  return useQuery({
    queryKey: SAML_PROVIDERS_KEY,
    queryFn: () => getSamlProviders(),
  });
}

export function useCreateSamlProviderMutation() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  return useMutation<ISamlProvider, Error, ICreateSamlProvider>({
    mutationFn: (data) => createSamlProvider(data),
    onSuccess: () => {
      notifications.show({ message: t("SSO provider created") });
      queryClient.invalidateQueries({ queryKey: SAML_PROVIDERS_KEY });
    },
    onError: (error) => {
      const message = error["response"]?.data?.message;
      notifications.show({ message, color: "red" });
    },
  });
}

export function useUpdateSamlProviderMutation() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  return useMutation<ISamlProvider, Error, IUpdateSamlProvider>({
    mutationFn: (data) => updateSamlProvider(data),
    onSuccess: () => {
      notifications.show({ message: t("SSO provider updated") });
      queryClient.invalidateQueries({ queryKey: SAML_PROVIDERS_KEY });
    },
    onError: (error) => {
      const message = error["response"]?.data?.message;
      notifications.show({ message, color: "red" });
    },
  });
}

export function useDeleteSamlProviderMutation() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  return useMutation<void, Error, { id: string }>({
    mutationFn: (data) => deleteSamlProvider(data.id),
    onSuccess: () => {
      notifications.show({ message: t("SSO provider deleted") });
      queryClient.invalidateQueries({ queryKey: SAML_PROVIDERS_KEY });
    },
    onError: (error) => {
      const message = error["response"]?.data?.message;
      notifications.show({ message, color: "red" });
    },
  });
}
