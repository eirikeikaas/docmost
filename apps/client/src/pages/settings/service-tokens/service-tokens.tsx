import { useState } from "react";
import { Alert, Button, Group, Text } from "@mantine/core";
import { IconInfoCircle } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import SettingsTitle from "@/components/settings/settings-title.tsx";
import { DocumentTitle } from "@/components/ui/document-title.tsx";
import useUserRole from "@/hooks/use-user-role.tsx";
import ServiceTokenList from "@/features/service-tokens/components/service-token-list";
import CreateServiceTokenModal from "@/features/service-tokens/components/create-service-token-modal";

export default function ServiceTokens() {
  const { t } = useTranslation();
  const { isAdmin } = useUserRole();
  const [creating, setCreating] = useState(false);

  if (!isAdmin) {
    return null;
  }

  return (
    <>
      <DocumentTitle title={t("Service tokens")} />
      <SettingsTitle title={t("Service tokens")} />

      <Alert variant="light" color="blue" icon={<IconInfoCircle />}>
        <Text size="sm">
          {t(
            "A service token lets a program call the API as a service account, with exactly that user's access. Tokens expire, can be revoked at any time, and cannot manage accounts, roles or settings.",
          )}
        </Text>
      </Alert>

      <Group my="md" justify="flex-end">
        <Button onClick={() => setCreating(true)}>
          {t("Create service token")}
        </Button>
      </Group>

      <ServiceTokenList />

      <CreateServiceTokenModal
        opened={creating}
        onClose={() => setCreating(false)}
      />
    </>
  );
}
