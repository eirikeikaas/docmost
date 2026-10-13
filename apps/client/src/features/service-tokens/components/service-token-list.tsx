import { useState } from "react";
import {
  ActionIcon,
  Badge,
  Group,
  Menu,
  Table,
  Text,
  VisuallyHidden,
} from "@mantine/core";
import { IconBan, IconDots } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import NoTableResults from "@/components/common/no-table-results.tsx";
import { formattedDate, timeAgo } from "@/lib/time.ts";
import { useServiceTokensQuery } from "@/features/service-tokens/queries/service-token-query";
import {
  IServiceToken,
  ServiceTokenStatus,
} from "@/features/service-tokens/types/service-token.types";
import RevokeServiceTokenModal from "@/features/service-tokens/components/revoke-service-token-modal";

const STATUS_COLOR: Record<ServiceTokenStatus, string> = {
  active: "green",
  revoked: "red",
  expired: "gray",
};

export default function ServiceTokenList() {
  const { t } = useTranslation();
  const { data, isLoading } = useServiceTokensQuery();
  const [revoking, setRevoking] = useState<IServiceToken | undefined>();

  const statusLabel = (status: ServiceTokenStatus) => {
    switch (status) {
      case "active":
        return t("Active");
      case "revoked":
        return t("Revoked");
      case "expired":
        return t("Expired");
    }
  };

  return (
    <>
      <Table.ScrollContainer minWidth={720}>
        <Table highlightOnHover verticalSpacing="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t("Name")}</Table.Th>
              <Table.Th>{t("Service account")}</Table.Th>
              <Table.Th>{t("Status")}</Table.Th>
              <Table.Th>{t("Expires")}</Table.Th>
              <Table.Th>{t("Last used")}</Table.Th>
              <Table.Th w={60}>
                <VisuallyHidden>{t("Actions")}</VisuallyHidden>
              </Table.Th>
            </Table.Tr>
          </Table.Thead>

          <Table.Tbody>
            {!isLoading && data?.length > 0 ? (
              data.map((token) => (
                <Table.Tr key={token.id}>
                  <Table.Td>
                    <Text fz="sm" fw={500}>
                      {token.name}
                    </Text>
                    <Text fz="xs" c="dimmed" ff="monospace">
                      …{token.tokenPrefix}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text fz="sm">{token.userName || token.userEmail}</Text>
                    <Text fz="xs" c="dimmed">
                      {token.userEmail}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Group gap={6} wrap="nowrap">
                      <Badge variant="light" color={STATUS_COLOR[token.status]}>
                        {statusLabel(token.status)}
                      </Badge>
                      {token.userDisabled && (
                        <Badge variant="light" color="yellow">
                          {t("User disabled")}
                        </Badge>
                      )}
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <Text fz="sm">
                      {token.expiresAt
                        ? formattedDate(new Date(token.expiresAt))
                        : t("Never")}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text fz="sm">
                      {token.lastUsedAt
                        ? timeAgo(new Date(token.lastUsedAt))
                        : t("Never")}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Menu shadow="md" position="bottom-end">
                      <Menu.Target>
                        <ActionIcon
                          variant="subtle"
                          color="gray"
                          aria-label={t("Actions")}
                        >
                          <IconDots size={18} />
                        </ActionIcon>
                      </Menu.Target>
                      <Menu.Dropdown>
                        <Menu.Item
                          color="red"
                          leftSection={<IconBan size={16} />}
                          disabled={token.status !== "active"}
                          onClick={() => setRevoking(token)}
                        >
                          {t("Revoke")}
                        </Menu.Item>
                      </Menu.Dropdown>
                    </Menu>
                  </Table.Td>
                </Table.Tr>
              ))
            ) : (
              <NoTableResults colSpan={6} text={t("No service tokens yet")} />
            )}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>

      <RevokeServiceTokenModal
        opened={Boolean(revoking)}
        token={revoking}
        onClose={() => setRevoking(undefined)}
      />
    </>
  );
}
