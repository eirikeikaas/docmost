import {
  useMutation,
  useQuery,
  useQueryClient,
  UseQueryResult,
} from "@tanstack/react-query";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import {
  createScimToken,
  deleteScimToken,
  getScimTokens,
  updateScimToken,
} from "@/features/scim/services/scim-service";
import {
  ICreateScimToken,
  IScimToken,
  IScimTokenCreated,
  IUpdateScimToken,
} from "@/features/scim/types/scim.types";

const SCIM_TOKENS_KEY = ["scim-tokens"];

export function useScimTokensQuery(): UseQueryResult<IScimToken[], Error> {
  return useQuery({
    queryKey: SCIM_TOKENS_KEY,
    queryFn: () => getScimTokens(),
  });
}

export function useCreateScimTokenMutation() {
  const queryClient = useQueryClient();

  return useMutation<IScimTokenCreated, Error, ICreateScimToken>({
    mutationFn: (data) => createScimToken(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SCIM_TOKENS_KEY });
    },
    onError: (error) => {
      const message = error["response"]?.data?.message;
      notifications.show({ message, color: "red" });
    },
  });
}

export function useUpdateScimTokenMutation() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  return useMutation<IScimToken, Error, IUpdateScimToken>({
    mutationFn: (data) => updateScimToken(data),
    onSuccess: () => {
      notifications.show({ message: t("SCIM token updated") });
      queryClient.invalidateQueries({ queryKey: SCIM_TOKENS_KEY });
    },
    onError: (error) => {
      const message = error["response"]?.data?.message;
      notifications.show({ message, color: "red" });
    },
  });
}

export function useDeleteScimTokenMutation() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  return useMutation<void, Error, { id: string }>({
    mutationFn: (data) => deleteScimToken(data.id),
    onSuccess: () => {
      notifications.show({ message: t("SCIM token revoked") });
      queryClient.invalidateQueries({ queryKey: SCIM_TOKENS_KEY });
    },
    onError: (error) => {
      const message = error["response"]?.data?.message;
      notifications.show({ message, color: "red" });
    },
  });
}
