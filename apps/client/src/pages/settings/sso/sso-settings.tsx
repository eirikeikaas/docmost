import { useState } from "react";
import { Button, Group } from "@mantine/core";
import { useTranslation } from "react-i18next";
import SettingsTitle from "@/components/settings/settings-title.tsx";
import { DocumentTitle } from "@/components/ui/document-title.tsx";
import useUserRole from "@/hooks/use-user-role.tsx";
import SsoProviderList from "@/features/sso/components/sso-provider-list";
import OidcProviderFormModal from "@/features/sso/components/oidc-provider-form-modal";

export default function SsoSettings() {
  const { t } = useTranslation();
  const { isAdmin } = useUserRole();
  const [creating, setCreating] = useState(false);

  return (
    <>
      <DocumentTitle title={t("Single Sign-On")} />
      <SettingsTitle title={t("Single Sign-On")} />

      <Group my="md" justify="flex-end">
        {isAdmin && (
          <Button onClick={() => setCreating(true)}>
            {t("Add OIDC provider")}
          </Button>
        )}
      </Group>

      <SsoProviderList />

      <OidcProviderFormModal
        opened={creating}
        onClose={() => setCreating(false)}
      />
    </>
  );
}
