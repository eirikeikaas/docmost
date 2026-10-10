import { Alert, Button, CopyButton, Group, Stack } from "@mantine/core";
import { useTranslation } from "react-i18next";
import SettingsTitle from "@/components/settings/settings-title.tsx";
import { DocumentTitle } from "@/components/ui/document-title.tsx";
import useUserRole from "@/hooks/use-user-role.tsx";
import ScimTokenList from "@/features/scim/components/scim-token-list";
import CreateScimTokenModal from "@/features/scim/components/create-scim-token-modal";
import { scimBaseUrl } from "@/features/scim/services/scim-service";

export default function ScimSettings() {
  const { t } = useTranslation();
  const { isAdmin } = useUserRole();

  return (
    <>
      <DocumentTitle title={t("SCIM Provisioning")} />
      <SettingsTitle title={t("SCIM Provisioning")} />

      <Alert variant="light" my="md">
        <Stack gap={4}>
          <Group justify="space-between" wrap="nowrap">
            <span>{t("SCIM base URL")}</span>
            <CopyButton value={scimBaseUrl()}>
              {({ copy, copied }) => (
                <Button size="compact-xs" variant="subtle" onClick={copy}>
                  {copied ? t("Copied") : t("Copy")}
                </Button>
              )}
            </CopyButton>
          </Group>
        </Stack>
      </Alert>

      <Group my="md" justify="flex-end">
        {isAdmin && <CreateScimTokenModal />}
      </Group>

      <ScimTokenList />
    </>
  );
}
