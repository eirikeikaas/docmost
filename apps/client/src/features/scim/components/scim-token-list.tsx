import { useState } from "react";
import { ActionIcon, Badge, Group, Table, Text, VisuallyHidden } from "@mantine/core";
import { IconTrash } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { useScimTokensQuery } from "@/features/scim/queries/scim-query";
import { IScimToken } from "@/features/scim/types/scim.types";
import NoTableResults from "@/components/common/no-table-results.tsx";
import RevokeScimTokenModal from "@/features/scim/components/revoke-scim-token-modal";

export default function ScimTokenList() {
  const { t } = useTranslation();
  const { data, isLoading } = useScimTokensQuery();
  const [revoking, setRevoking] = useState<IScimToken | undefined>();

  return (
    <>
      <Table.ScrollContainer minWidth={500}>
        <Table highlightOnHover verticalSpacing="sm" layout="fixed">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t("Name")}</Table.Th>
              <Table.Th>{t("Token")}</Table.Th>
              <Table.Th w={100}>{t("Status")}</Table.Th>
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
                  </Table.Td>
                  <Table.Td>
                    <Text fz="sm" c="dimmed" ff="monospace">
                      •••• {token.tokenLastFour}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Badge variant="light" color={token.isEnabled ? "green" : "gray"}>
                      {token.isEnabled ? t("Enabled") : t("Disabled")}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Group justify="flex-end">
                      <ActionIcon
                        variant="subtle"
                        color="red"
                        onClick={() => setRevoking(token)}
                        aria-label={t("Revoke")}
                      >
                        <IconTrash size={16} />
                      </ActionIcon>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))
            ) : (
              <NoTableResults colSpan={4} />
            )}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>

      <RevokeScimTokenModal
        opened={Boolean(revoking)}
        token={revoking}
        onClose={() => setRevoking(undefined)}
      />
    </>
  );
}
