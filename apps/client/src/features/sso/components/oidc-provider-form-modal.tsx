import {
  Box,
  Button,
  Divider,
  Group,
  Modal,
  PasswordInput,
  Stack,
  Switch,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { zod4Resolver } from "mantine-form-zod-resolver";
import { z } from "zod/v4";
import { useTranslation } from "react-i18next";
import {
  useCreateOidcProviderMutation,
  useUpdateOidcProviderMutation,
} from "@/features/sso/queries/sso-query";
import { IOidcProvider } from "@/features/sso/types/sso.types";

const baseSchema = {
  name: z.string().trim().min(1).max(100),
  oidcIssuer: z.url(),
  oidcClientId: z.string().trim().min(1),
  allowSignup: z.boolean(),
  isEnabled: z.boolean(),
};

const createSchema = z.object({
  ...baseSchema,
  oidcClientSecret: z.string().trim().min(1),
});

const editSchema = z.object({
  ...baseSchema,
  oidcClientSecret: z.string(),
});

type FormValues = z.infer<typeof createSchema>;

interface Props {
  opened: boolean;
  onClose: () => void;
  provider?: IOidcProvider;
}

export default function OidcProviderFormModal({
  opened,
  onClose,
  provider,
}: Props) {
  const { t } = useTranslation();
  const createMutation = useCreateOidcProviderMutation();
  const updateMutation = useUpdateOidcProviderMutation();
  const isEdit = Boolean(provider);

  const form = useForm<FormValues>({
    validate: zod4Resolver(isEdit ? editSchema : createSchema),
    initialValues: {
      name: provider?.name ?? "",
      oidcIssuer: provider?.oidcIssuer ?? "",
      oidcClientId: provider?.oidcClientId ?? "",
      oidcClientSecret: "",
      allowSignup: provider?.allowSignup ?? false,
      isEnabled: provider?.isEnabled ?? false,
    },
  });

  const handleSubmit = async (values: FormValues) => {
    if (isEdit) {
      await updateMutation.mutateAsync({
        id: provider.id,
        ...values,
        // an empty secret field means "keep the existing one"
        oidcClientSecret: values.oidcClientSecret || undefined,
      });
    } else {
      await createMutation.mutateAsync(values);
    }
    form.reset();
    onClose();
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={isEdit ? t("Edit OIDC provider") : t("Add OIDC provider")}
      closeButtonProps={{ "aria-label": t("Close") }}
    >
      <Divider size="xs" mb="xs" />
      <Box maw={500} mx="auto">
        <form onSubmit={form.onSubmit(handleSubmit)}>
          <Stack>
            <TextInput
              withAsterisk
              label={t("Display name")}
              placeholder={t("e.g Okta")}
              variant="filled"
              {...form.getInputProps("name")}
            />
            <TextInput
              withAsterisk
              label={t("Issuer URL")}
              placeholder="https://your-idp.example.com"
              variant="filled"
              {...form.getInputProps("oidcIssuer")}
            />
            <TextInput
              withAsterisk
              label={t("Client ID")}
              variant="filled"
              {...form.getInputProps("oidcClientId")}
            />
            <PasswordInput
              withAsterisk={!isEdit}
              label={t("Client secret")}
              placeholder={
                isEdit ? t("Leave blank to keep the current secret") : ""
              }
              variant="filled"
              {...form.getInputProps("oidcClientSecret")}
            />
            <Switch
              label={t("Allow new users to sign up via this provider")}
              {...form.getInputProps("allowSignup", { type: "checkbox" })}
            />
            <Switch
              label={t("Enabled")}
              {...form.getInputProps("isEnabled", { type: "checkbox" })}
            />
          </Stack>

          <Group justify="flex-end" mt="md">
            <Button
              type="submit"
              loading={createMutation.isPending || updateMutation.isPending}
            >
              {isEdit ? t("Save") : t("Create")}
            </Button>
          </Group>
        </form>
      </Box>
    </Modal>
  );
}
