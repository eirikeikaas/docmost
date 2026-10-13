import { Button, Group, Modal, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { useRevokeServiceTokenMutation } from "@/features/service-tokens/queries/service-token-query";
import { IServiceToken } from "@/features/service-tokens/types/service-token.types";

interface Props {
  opened: boolean;
  onClose: () => void;
  token?: IServiceToken;
}

export default function RevokeServiceTokenModal({
  opened,
  onClose,
  token,
}: Props) {
  const { t } = useTranslation();
  const revokeMutation = useRevokeServiceTokenMutation();

  const handleRevoke = async () => {
    if (!token) return;
    await revokeMutation.mutateAsync({ id: token.id });
    onClose();
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={t("Revoke service token")}
      closeButtonProps={{ "aria-label": t("Close") }}
    >
      <Text size="sm">
        {t(
          'Revoke the "{{name}}" token? Anything using it stops working immediately. This cannot be undone.',
          { name: token?.name },
        )}
      </Text>

      <Group justify="flex-end" mt="md">
        <Button variant="default" onClick={onClose}>
          {t("Cancel")}
        </Button>
        <Button
          color="red"
          loading={revokeMutation.isPending}
          onClick={handleRevoke}
        >
          {t("Revoke")}
        </Button>
      </Group>
    </Modal>
  );
}
