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
  deleteOidcProvider,
  getOidcProviders,
  updateOidcProvider,
} from "@/features/sso/services/sso-service";
import {
  ICreateOidcProvider,
  IOidcProvider,
  IUpdateOidcProvider,
} from "@/features/sso/types/sso.types";

const OIDC_PROVIDERS_KEY = ["oidc-providers"];

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
