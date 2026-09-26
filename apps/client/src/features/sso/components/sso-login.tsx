import { Button, Stack } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { useWorkspacePublicDataQuery } from "@/features/workspace/queries/workspace-query.ts";
import { buildOidcLoginUrl } from "@/features/sso/services/sso-service";
import { getRedirectParam } from "@/lib/app-route.ts";

export default function SsoLogin() {
  const { t } = useTranslation();
  const { data } = useWorkspacePublicDataQuery();

  const oidcProviders = (data?.authProviders ?? []).filter(
    (provider: any) => provider.type === "oidc",
  );

  if (oidcProviders.length === 0) {
    return null;
  }

  return (
    <Stack mb="md">
      {oidcProviders.map((provider: any) => (
        <Button
          key={provider.id}
          component="a"
          href={buildOidcLoginUrl(provider.id, getRedirectParam() ?? undefined)}
          variant="default"
          fullWidth
        >
          {t("Continue with {{name}}", { name: provider.name })}
        </Button>
      ))}
    </Stack>
  );
}
