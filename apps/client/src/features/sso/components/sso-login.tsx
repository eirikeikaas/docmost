import { Button, Stack } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { useWorkspacePublicDataQuery } from "@/features/workspace/queries/workspace-query.ts";
import { buildOidcLoginUrl, buildSamlLoginUrl } from "@/features/sso/services/sso-service";
import { getRedirectParam } from "@/lib/app-route.ts";

function buildLoginUrl(provider: any, redirectPath?: string): string | undefined {
  if (provider.type === "oidc") return buildOidcLoginUrl(provider.id, redirectPath);
  if (provider.type === "saml") return buildSamlLoginUrl(provider.id, redirectPath);
  return undefined;
}

export default function SsoLogin() {
  const { t } = useTranslation();
  const { data } = useWorkspacePublicDataQuery();

  const providers = (data?.authProviders ?? []).filter(
    (provider: any) => provider.type === "oidc" || provider.type === "saml",
  );

  if (providers.length === 0) {
    return null;
  }

  return (
    <Stack mb="md">
      {providers.map((provider: any) => (
        <Button
          key={provider.id}
          component="a"
          href={buildLoginUrl(provider, getRedirectParam() ?? undefined)}
          variant="default"
          fullWidth
        >
          {t("Continue with {{name}}", { name: provider.name })}
        </Button>
      ))}
    </Stack>
  );
}
