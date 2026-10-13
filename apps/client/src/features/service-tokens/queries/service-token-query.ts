import {
  useMutation,
  useQuery,
  useQueryClient,
  UseQueryResult,
} from "@tanstack/react-query";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import {
  createServiceToken,
  getServiceTokens,
  revokeServiceToken,
} from "@/features/service-tokens/services/service-token-service";
import {
  ICreatedServiceToken,
  ICreateServiceToken,
  IServiceToken,
} from "@/features/service-tokens/types/service-token.types";

export const SERVICE_TOKENS_KEY = ["service-tokens"];

export function useServiceTokensQuery(): UseQueryResult<
  IServiceToken[],
  Error
> {
  return useQuery({
    queryKey: SERVICE_TOKENS_KEY,
    queryFn: () => getServiceTokens(),
  });
}

// No success toast here: the create dialog itself shows the token, once.
export function useCreateServiceTokenMutation() {
  const queryClient = useQueryClient();

  return useMutation<ICreatedServiceToken, Error, ICreateServiceToken>({
    mutationFn: (data) => createServiceToken(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SERVICE_TOKENS_KEY });
    },
    onError: (error) => {
      const message = error["response"]?.data?.message;
      notifications.show({ message, color: "red" });
    },
  });
}

export function useRevokeServiceTokenMutation() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  return useMutation<IServiceToken, Error, { id: string }>({
    mutationFn: (data) => revokeServiceToken(data.id),
    onSuccess: () => {
      notifications.show({ message: t("Service token revoked") });
      queryClient.invalidateQueries({ queryKey: SERVICE_TOKENS_KEY });
    },
    onError: (error) => {
      const message = error["response"]?.data?.message;
      notifications.show({ message, color: "red" });
    },
  });
}
