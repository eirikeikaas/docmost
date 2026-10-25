import { useState } from "react";
import {
  ActionIcon,
  Group,
  Loader,
  Menu,
  Stack,
  Tabs,
  Text,
} from "@mantine/core";
import { useTranslation } from "react-i18next";
import {
  IconLayoutKanban,
  IconPlus,
  IconTable,
  IconTrash,
} from "@tabler/icons-react";
import {
  IItem,
  PropertyValue,
  ViewType,
} from "@/features/collection/types/collection.types";
import {
  useCollectionMutations,
  useCollectionQuery,
  useItemMutations,
  useItemsQuery,
} from "@/features/collection/queries/collection-query";
import { TableView } from "@/features/collection/components/table-view";
import { KanbanView } from "@/features/collection/components/kanban-view";
import { ViewSettings } from "@/features/collection/components/view-settings";
import { ItemModal } from "@/features/collection/components/item-modal";

const VIEW_ICONS: Record<ViewType, React.ReactNode> = {
  table: <IconTable size={14} />,
  kanban: <IconLayoutKanban size={14} />,
};

export function CollectionView({ pageId }: { pageId: string }) {
  const { t } = useTranslation();
  const { data: collection, isError, isLoading } = useCollectionQuery(pageId);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [openItemId, setOpenItemId] = useState<string | null>(null);

  const view =
    collection?.views.find((v) => v.id === activeViewId) ?? collection?.views[0];

  const { data: items = [], isLoading: itemsLoading } = useItemsQuery(
    collection?.id ?? "",
    view?.id,
  );
  const itemMutations = useItemMutations(collection?.id ?? "");
  const { addView, editView, removeView } = useCollectionMutations(
    pageId,
    collection?.id ?? "",
  );

  if (isLoading) {
    return (
      <Group justify="center" p="xl">
        <Loader size="sm" />
      </Group>
    );
  }
  if (isError || !collection || !view) {
    return <Text c="dimmed">{t("Failed to load collection.")}</Text>;
  }

  const editable = collection.canEdit;
  const openItem: IItem | null = items.find((i) => i.id === openItemId) ?? null;

  const createView = async (type: ViewType) => {
    const created = await addView.mutateAsync({
      collectionId: collection.id,
      name: type === "table" ? t("Table") : t("Board"),
      type,
      config:
        type === "kanban"
          ? {
              groupBy: collection.properties.find((p) => p.type === "select")?.id,
            }
          : {},
    });
    setActiveViewId(created.id);
  };

  const setProp = (itemId: string, propertyId: string, value: PropertyValue) =>
    itemMutations.update.mutate({ itemId, props: { [propertyId]: value } });

  const ViewComponent = view.type === "kanban" ? KanbanView : TableView;

  return (
    <Stack gap="sm" pb="xl">
      <Group justify="space-between" wrap="nowrap" align="flex-end">
        <Tabs
          value={view.id}
          onChange={(id) => setActiveViewId(id)}
          variant="default"
          style={{ minWidth: 0 }}
        >
          <Tabs.List style={{ flexWrap: "nowrap", overflowX: "auto" }}>
            {collection.views.map((v) => (
              <Tabs.Tab key={v.id} value={v.id} leftSection={VIEW_ICONS[v.type]}>
                {v.name}
              </Tabs.Tab>
            ))}
            {editable && (
              <Menu position="bottom-start">
                <Menu.Target>
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    size="sm"
                    ml={4}
                    mt={6}
                    aria-label={t("Add view")}
                  >
                    <IconPlus size={14} />
                  </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Item
                    leftSection={VIEW_ICONS.table}
                    onClick={() => createView("table")}
                  >
                    {t("Table view")}
                  </Menu.Item>
                  <Menu.Item
                    leftSection={VIEW_ICONS.kanban}
                    onClick={() => createView("kanban")}
                  >
                    {t("Board view")}
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
            )}
          </Tabs.List>
        </Tabs>

        <Group gap="xs" wrap="nowrap">
          {editable && collection.views.length > 1 && (
            <ActionIcon
              variant="subtle"
              color="red"
              aria-label={t("Delete view")}
              onClick={async () => {
                await removeView.mutateAsync({
                  collectionId: collection.id,
                  viewId: view.id,
                });
                setActiveViewId(null);
              }}
            >
              <IconTrash size={16} />
            </ActionIcon>
          )}
          {editable && (
            <ViewSettings
              key={view.id}
              collection={collection}
              view={view}
              onChange={(config) =>
                editView.mutate({
                  collectionId: collection.id,
                  viewId: view.id,
                  config,
                })
              }
            />
          )}
        </Group>
      </Group>

      {itemsLoading ? (
        <Group justify="center" p="xl">
          <Loader size="sm" />
        </Group>
      ) : (
        <ViewComponent
          collection={collection}
          pageId={pageId}
          view={view}
          items={items}
          onOpenItem={(item) => setOpenItemId(item.id)}
        />
      )}

      <ItemModal
        item={openItem}
        properties={collection.properties}
        editable={editable}
        onClose={() => setOpenItemId(null)}
        onTitle={(itemId, title) => itemMutations.update.mutate({ itemId, title })}
        onProp={setProp}
        onDelete={(itemId) => itemMutations.remove.mutate(itemId)}
      />
    </Stack>
  );
}
