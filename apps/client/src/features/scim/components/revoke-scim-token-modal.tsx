import { Button, Group, Modal, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { useDeleteScimTokenMutation } from "@/features/scim/queries/scim-query";
import { IScimToken } from "@/features/scim/types/scim.types";

interface Props {
  opened: boolean;
  onClose: () => void;
  token?: IScimToken;
}

export default function RevokeScimTokenModal({ opened, onClose, token }: Props) {
  const { t } = useTranslation();
  const deleteMutation = useDeleteScimTokenMutation();

  const handleRevoke = async () => {
    if (!token) return;
    await deleteMutation.mutateAsync({ id: token.id });
    onClose();
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={t("Revoke SCIM token")}
      closeButtonProps={{ "aria-label": t("Close") }}
    >
      <Text size="sm">
        {t(
          'Are you sure you want to revoke the "{{name}}" token? Any identity provider using it will immediately lose access to SCIM provisioning.',
          { name: token?.name },
        )}
      </Text>

      <Group justify="flex-end" mt="md">
        <Button variant="default" onClick={onClose}>
          {t("Cancel")}
        </Button>
        <Button color="red" loading={deleteMutation.isPending} onClick={handleRevoke}>
          {t("Revoke")}
        </Button>
      </Group>
    </Modal>
  );
}
