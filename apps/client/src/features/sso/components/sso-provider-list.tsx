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
import { IconDots, IconPencil, IconTrash } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { useOidcProvidersQuery } from "@/features/sso/queries/sso-query";
import { IOidcProvider } from "@/features/sso/types/sso.types";
import NoTableResults from "@/components/common/no-table-results.tsx";
import OidcProviderFormModal from "@/features/sso/components/oidc-provider-form-modal";
import DeleteOidcProviderModal from "@/features/sso/components/delete-oidc-provider-modal";

export default function SsoProviderList() {
  const { t } = useTranslation();
  const { data, isLoading } = useOidcProvidersQuery();
  const [editing, setEditing] = useState<IOidcProvider | undefined>();
  const [deleting, setDeleting] = useState<IOidcProvider | undefined>();

  return (
    <>
      <Table.ScrollContainer minWidth={500}>
        <Table highlightOnHover verticalSpacing="sm" layout="fixed">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t("Name")}</Table.Th>
              <Table.Th>{t("Issuer")}</Table.Th>
              <Table.Th w={100}>{t("Status")}</Table.Th>
              <Table.Th w={60}>
                <VisuallyHidden>{t("Actions")}</VisuallyHidden>
              </Table.Th>
            </Table.Tr>
          </Table.Thead>

          <Table.Tbody>
            {!isLoading && data?.length > 0 ? (
              data.map((provider) => (
                <Table.Tr key={provider.id}>
                  <Table.Td>
                    <Text fz="sm" fw={500}>
                      {provider.name}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text fz="sm" c="dimmed" truncate>
                      {provider.oidcIssuer}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Badge
                      variant="light"
                      color={provider.isEnabled ? "green" : "gray"}
                    >
                      {provider.isEnabled ? t("Enabled") : t("Disabled")}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Group gap="xs" justify="flex-end" wrap="nowrap">
                      <Menu shadow="md" position="bottom-end">
                        <Menu.Target>
                          <ActionIcon variant="subtle" color="gray">
                            <IconDots size={18} />
                          </ActionIcon>
                        </Menu.Target>
                        <Menu.Dropdown>
                          <Menu.Item
                            leftSection={<IconPencil size={16} />}
                            onClick={() => setEditing(provider)}
                          >
                            {t("Edit")}
                          </Menu.Item>
                          <Menu.Item
                            color="red"
                            leftSection={<IconTrash size={16} />}
                            onClick={() => setDeleting(provider)}
                          >
                            {t("Delete")}
                          </Menu.Item>
                        </Menu.Dropdown>
                      </Menu>
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

      <OidcProviderFormModal
        opened={Boolean(editing)}
        provider={editing}
        onClose={() => setEditing(undefined)}
      />
      <DeleteOidcProviderModal
        opened={Boolean(deleting)}
        provider={deleting}
        onClose={() => setDeleting(undefined)}
      />
    </>
  );
}
