import { useState } from "react";
import {
  Alert,
  Box,
  Button,
  CopyButton,
  Divider,
  Group,
  Modal,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { zod4Resolver } from "mantine-form-zod-resolver";
import { z } from "zod/v4";
import { useTranslation } from "react-i18next";
import { useCreateScimTokenMutation } from "@/features/scim/queries/scim-query";

const schema = z.object({
  name: z.string().trim().min(1).max(100),
});
type FormValues = z.infer<typeof schema>;

export default function CreateScimTokenModal() {
  const { t } = useTranslation();
  const [opened, setOpened] = useState(false);
  const [createdToken, setCreatedToken] = useState<string | undefined>();
  const createMutation = useCreateScimTokenMutation();

  const form = useForm<FormValues>({
    validate: zod4Resolver(schema),
    initialValues: { name: "" },
  });

  const handleSubmit = async (values: FormValues) => {
    const result = await createMutation.mutateAsync(values);
    setCreatedToken(result.token);
  };

  const handleClose = () => {
    setOpened(false);
    setCreatedToken(undefined);
    form.reset();
  };

  return (
    <>
      <Button onClick={() => setOpened(true)}>{t("Create SCIM token")}</Button>

      <Modal
        opened={opened}
        onClose={handleClose}
        title={t("Create SCIM token")}
        closeButtonProps={{ "aria-label": t("Close") }}
      >
        <Divider size="xs" mb="xs" />
        <Box maw={500} mx="auto">
          {createdToken ? (
            <Stack>
              <Alert color="yellow" variant="light">
                {t(
                  "Copy this token now - it will not be shown again. Paste it into your identity provider's SCIM bearer token field.",
                )}
              </Alert>
              <Group gap="xs" wrap="nowrap">
                <Text ff="monospace" fz="sm" style={{ wordBreak: "break-all" }}>
                  {createdToken}
                </Text>
                <CopyButton value={createdToken}>
                  {({ copy, copied }) => (
                    <Button size="compact-xs" onClick={copy}>
                      {copied ? t("Copied") : t("Copy")}
                    </Button>
                  )}
                </CopyButton>
              </Group>
              <Group justify="flex-end" mt="md">
                <Button onClick={handleClose}>{t("Done")}</Button>
              </Group>
            </Stack>
          ) : (
            <form onSubmit={form.onSubmit(handleSubmit)}>
              <TextInput
                withAsterisk
                label={t("Token name")}
                placeholder={t("e.g Okta provisioning")}
                variant="filled"
                data-autofocus
                {...form.getInputProps("name")}
              />
              <Group justify="flex-end" mt="md">
                <Button type="submit" loading={createMutation.isPending}>
                  {t("Create")}
                </Button>
              </Group>
            </form>
          )}
        </Box>
      </Modal>
    </>
  );
}
