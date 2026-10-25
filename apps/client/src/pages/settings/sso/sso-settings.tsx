import { useState } from "react";
import { Button, Divider, Group, Title } from "@mantine/core";
import { useTranslation } from "react-i18next";
import SettingsTitle from "@/components/settings/settings-title.tsx";
import { DocumentTitle } from "@/components/ui/document-title.tsx";
import useUserRole from "@/hooks/use-user-role.tsx";
import SsoProviderList from "@/features/sso/components/sso-provider-list";
import OidcProviderFormModal from "@/features/sso/components/oidc-provider-form-modal";
import SamlProviderList from "@/features/sso/components/saml-provider-list";
import SamlProviderFormModal from "@/features/sso/components/saml-provider-form-modal";

export default function SsoSettings() {
  const { t } = useTranslation();
  const { isAdmin } = useUserRole();
  const [creatingOidc, setCreatingOidc] = useState(false);
  const [creatingSaml, setCreatingSaml] = useState(false);

  return (
    <>
      <DocumentTitle title={t("Single Sign-On")} />
      <SettingsTitle title={t("Single Sign-On")} />

      <Title order={4} mt="lg">
        {t("OIDC providers")}
      </Title>
      <Group my="md" justify="flex-end">
        {isAdmin && (
          <Button onClick={() => setCreatingOidc(true)}>
            {t("Add OIDC provider")}
          </Button>
        )}
      </Group>
      <SsoProviderList />

      <Divider my="xl" />

      <Title order={4}>{t("SAML providers")}</Title>
      <Group my="md" justify="flex-end">
        {isAdmin && (
          <Button onClick={() => setCreatingSaml(true)}>
            {t("Add SAML provider")}
          </Button>
        )}
      </Group>
      <SamlProviderList />

      <OidcProviderFormModal
        opened={creatingOidc}
        onClose={() => setCreatingOidc(false)}
      />
      <SamlProviderFormModal
        opened={creatingSaml}
        onClose={() => setCreatingSaml(false)}
      />
    </>
  );
}
