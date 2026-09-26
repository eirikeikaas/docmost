import {
  Alert,
  Box,
  Button,
  CopyButton,
  Divider,
  Group,
  Modal,
  Stack,
  Switch,
  Textarea,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { zod4Resolver } from "mantine-form-zod-resolver";
import { z } from "zod/v4";
import { useTranslation } from "react-i18next";
import {
  useCreateSamlProviderMutation,
  useUpdateSamlProviderMutation,
} from "@/features/sso/queries/sso-query";
import { ISamlProvider } from "@/features/sso/types/sso.types";
import { samlAcsUrl, samlMetadataUrl } from "@/features/sso/services/sso-service";

const schema = z.object({
  name: z.string().trim().min(1).max(100),
  samlUrl: z.url(),
  samlCertificate: z.string().trim().min(1),
  allowSignup: z.boolean(),
  isEnabled: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

interface Props {
  opened: boolean;
  onClose: () => void;
  provider?: ISamlProvider;
}

export default function SamlProviderFormModal({
  opened,
  onClose,
  provider,
}: Props) {
  const { t } = useTranslation();
  const createMutation = useCreateSamlProviderMutation();
  const updateMutation = useUpdateSamlProviderMutation();
  const isEdit = Boolean(provider);

  const form = useForm<FormValues>({
    validate: zod4Resolver(schema),
    initialValues: {
      name: provider?.name ?? "",
      samlUrl: provider?.samlUrl ?? "",
      samlCertificate: provider?.samlCertificate ?? "",
      allowSignup: provider?.allowSignup ?? false,
      isEnabled: provider?.isEnabled ?? false,
    },
  });

  const handleSubmit = async (values: FormValues) => {
    if (isEdit) {
      await updateMutation.mutateAsync({ id: provider.id, ...values });
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
      title={isEdit ? t("Edit SAML provider") : t("Add SAML provider")}
      closeButtonProps={{ "aria-label": t("Close") }}
      size="lg"
    >
      <Divider size="xs" mb="xs" />
      <Box maw={500} mx="auto">
        <Alert variant="light" mb="md">
          <Stack gap={4}>
            <Group justify="space-between" wrap="nowrap">
              <span>{t("SP Entity ID / metadata URL")}</span>
              <CopyButton value={samlMetadataUrl()}>
                {({ copy, copied }) => (
                  <Button size="compact-xs" variant="subtle" onClick={copy}>
                    {copied ? t("Copied") : t("Copy")}
                  </Button>
                )}
              </CopyButton>
            </Group>
            <Group justify="space-between" wrap="nowrap">
              <span>{t("ACS URL")}</span>
              <CopyButton value={samlAcsUrl()}>
                {({ copy, copied }) => (
                  <Button size="compact-xs" variant="subtle" onClick={copy}>
                    {copied ? t("Copied") : t("Copy")}
                  </Button>
                )}
              </CopyButton>
            </Group>
          </Stack>
        </Alert>

        <form onSubmit={form.onSubmit(handleSubmit)}>
          <Stack>
            <TextInput
              withAsterisk
              label={t("Display name")}
              placeholder={t("e.g Azure AD")}
              variant="filled"
              {...form.getInputProps("name")}
            />
            <TextInput
              withAsterisk
              label={t("IdP SSO URL (entry point)")}
              placeholder="https://your-idp.example.com/sso/saml"
              variant="filled"
              {...form.getInputProps("samlUrl")}
            />
            <Textarea
              withAsterisk
              label={t("IdP signing certificate (PEM)")}
              placeholder="-----BEGIN CERTIFICATE-----"
              variant="filled"
              autosize
              minRows={4}
              maxRows={10}
              {...form.getInputProps("samlCertificate")}
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
