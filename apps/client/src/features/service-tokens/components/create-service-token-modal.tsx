import { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Divider,
  Group,
  Modal,
  NumberInput,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { IconAlertTriangle } from "@tabler/icons-react";
import { zod4Resolver } from "mantine-form-zod-resolver";
import { z } from "zod/v4";
import { useTranslation } from "react-i18next";
import CopyTextButton from "@/components/common/copy.tsx";
import ServiceAccountSelect from "@/features/service-tokens/components/service-account-select";
import { useCreateServiceTokenMutation } from "@/features/service-tokens/queries/service-token-query";
import { ICreatedServiceToken } from "@/features/service-tokens/types/service-token.types";

const schema = z.object({
  name: z.string().trim().min(1).max(100),
  userId: z.string().min(1),
  expiresInDays: z.number().int().min(1).max(365),
});

type FormValues = z.infer<typeof schema>;

interface Props {
  opened: boolean;
  onClose: () => void;
}

export default function CreateServiceTokenModal({ opened, onClose }: Props) {
  const { t } = useTranslation();
  const createMutation = useCreateServiceTokenMutation();
  // The token exists only in this component's state: it is dropped when the
  // dialog closes, because the server will never show it again.
  const [created, setCreated] = useState<ICreatedServiceToken | undefined>();

  const form = useForm<FormValues>({
    validate: zod4Resolver(schema),
    initialValues: { name: "", userId: "", expiresInDays: 90 },
  });

  const handleClose = () => {
    setCreated(undefined);
    form.reset();
    onClose();
  };

  const handleSubmit = async (values: FormValues) => {
    const result = await createMutation.mutateAsync(values);
    setCreated(result);
  };

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title={created ? t("Service token created") : t("Create service token")}
      closeButtonProps={{ "aria-label": t("Close") }}
      closeOnClickOutside={!created}
      closeOnEscape={!created}
    >
      <Divider size="xs" mb="xs" />
      <Box maw={500} mx="auto">
        {created ? (
          <Stack>
            <Alert variant="light" color="yellow" icon={<IconAlertTriangle />}>
              {t(
                "Copy this token now. It is shown only once and cannot be retrieved later.",
              )}
            </Alert>
            <TextInput
              label={created.name}
              value={created.token}
              readOnly
              variant="filled"
              styles={{ input: { fontFamily: "monospace" } }}
              rightSection={<CopyTextButton text={created.token} />}
              onFocus={(event) => event.currentTarget.select()}
            />
            <Text size="sm" c="dimmed">
              {t("Send it as")} <code>Authorization: Bearer &lt;token&gt;</code>
            </Text>
            <Group justify="flex-end" mt="md">
              <Button onClick={handleClose}>{t("Done")}</Button>
            </Group>
          </Stack>
        ) : (
          <form onSubmit={form.onSubmit(handleSubmit)}>
            <Stack>
              <TextInput
                withAsterisk
                label={t("Name")}
                placeholder={t("e.g TRYlle")}
                variant="filled"
                data-autofocus
                {...form.getInputProps("name")}
              />
              <ServiceAccountSelect
                value={form.values.userId}
                onChange={(userId) => form.setFieldValue("userId", userId)}
                error={form.errors.userId}
              />
              <NumberInput
                withAsterisk
                label={t("Expires in (days)")}
                description={t("Between 1 and 365 days")}
                min={1}
                max={365}
                allowDecimal={false}
                allowNegative={false}
                variant="filled"
                {...form.getInputProps("expiresInDays")}
              />
            </Stack>

            <Group justify="flex-end" mt="md">
              <Button type="submit" loading={createMutation.isPending}>
                {t("Create token")}
              </Button>
            </Group>
          </form>
        )}
      </Box>
    </Modal>
  );
}
