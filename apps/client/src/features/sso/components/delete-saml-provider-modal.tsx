import { Button, Group, Modal, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { useDeleteSamlProviderMutation } from "@/features/sso/queries/sso-query";
import { ISamlProvider } from "@/features/sso/types/sso.types";

interface Props {
  opened: boolean;
  onClose: () => void;
  provider?: ISamlProvider;
}

export default function DeleteSamlProviderModal({
  opened,
  onClose,
  provider,
}: Props) {
  const { t } = useTranslation();
  const deleteMutation = useDeleteSamlProviderMutation();

  const handleDelete = async () => {
    if (!provider) return;
    await deleteMutation.mutateAsync({ id: provider.id });
    onClose();
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={t("Delete SSO provider")}
      closeButtonProps={{ "aria-label": t("Close") }}
    >
      <Text size="sm">
        {t(
          'Are you sure you want to delete the "{{name}}" SSO provider? Members who signed in through it will keep their account, but will no longer be able to sign in this way.',
          { name: provider?.name },
        )}
      </Text>

      <Group justify="flex-end" mt="md">
        <Button variant="default" onClick={onClose}>
          {t("Cancel")}
        </Button>
        <Button color="red" loading={deleteMutation.isPending} onClick={handleDelete}>
          {t("Delete")}
        </Button>
      </Group>
    </Modal>
  );
}
