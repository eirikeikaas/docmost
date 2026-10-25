import { useState } from "react";
import { ActionIcon, Button, Table, TextInput } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { IconArrowsMaximize, IconPlus } from "@tabler/icons-react";
import {
  ICollection,
  IItem,
  IItemView,
  PropertyValue,
} from "@/features/collection/types/collection.types";
import { ItemCell } from "@/features/collection/components/item-cell";
import {
  AddPropertyButton,
  PropertyHeaderMenu,
} from "@/features/collection/components/property-controls";
import {
  useCollectionMutations,
  useItemMutations,
} from "@/features/collection/queries/collection-query";

type Props = {
  collection: ICollection;
  pageId: string;
  view: IItemView;
  items: IItem[];
  onOpenItem: (item: IItem) => void;
};

function TitleCell({
  item,
  editable,
  onSave,
}: {
  item: IItem;
  editable: boolean;
  onSave: (title: string) => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(item.title);
  return (
    <TextInput
      variant="unstyled"
      size="sm"
      value={draft}
      readOnly={!editable}
      placeholder={t("Untitled")}
      onChange={(e) => setDraft(e.currentTarget.value)}
      onBlur={() => draft !== item.title && onSave(draft)}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
    />
  );
}

export function TableView({ collection, pageId, view, items, onOpenItem }: Props) {
  const { t } = useTranslation();
  const editable = collection.canEdit;
  const itemMutations = useItemMutations(collection.id);
  const { addProperty, editProperty, removeProperty } = useCollectionMutations(
    pageId,
    collection.id,
  );

  const visible = view.config.visibleProperties;
  const properties = visible
    ? collection.properties.filter((p) => visible.includes(p.id))
    : collection.properties;

  const setProp = (itemId: string, propertyId: string, value: PropertyValue) =>
    itemMutations.update.mutate({ itemId, props: { [propertyId]: value } });

  return (
    <Table.ScrollContainer minWidth={600}>
      <Table withColumnBorders stickyHeader highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th miw={260}>{t("Name")}</Table.Th>
            {properties.map((property) => (
              <Table.Th key={property.id} miw={180}>
                <PropertyHeaderMenu
                  property={property}
                  editable={editable}
                  onRename={(name) =>
                    editProperty.mutateAsync({
                      collectionId: collection.id,
                      propertyId: property.id,
                      name,
                    })
                  }
                  onEditOptions={(config) =>
                    editProperty.mutateAsync({
                      collectionId: collection.id,
                      propertyId: property.id,
                      config,
                    })
                  }
                  onDelete={() =>
                    removeProperty.mutateAsync({
                      collectionId: collection.id,
                      propertyId: property.id,
                    })
                  }
                />
              </Table.Th>
            ))}
            <Table.Th w={44}>
              {editable && (
                <AddPropertyButton
                  onAdd={(data) =>
                    addProperty.mutateAsync({
                      collectionId: collection.id,
                      ...data,
                    })
                  }
                />
              )}
            </Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {items.map((item) => (
            <Table.Tr key={item.id}>
              <Table.Td>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <TitleCell
                      item={item}
                      editable={editable}
                      onSave={(title) =>
                        itemMutations.update.mutate({ itemId: item.id, title })
                      }
                    />
                  </div>
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    size="sm"
                    aria-label={t("Open item")}
                    onClick={() => onOpenItem(item)}
                  >
                    <IconArrowsMaximize size={14} />
                  </ActionIcon>
                </div>
              </Table.Td>
              {properties.map((property) => (
                <Table.Td key={property.id}>
                  <ItemCell
                    property={property}
                    value={item.props[property.id]}
                    editable={editable}
                    onChange={(value) => setProp(item.id, property.id, value)}
                  />
                </Table.Td>
              ))}
              <Table.Td />
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      {editable && (
        <Button
          variant="subtle"
          color="gray"
          size="xs"
          mt="xs"
          leftSection={<IconPlus size={14} />}
          loading={itemMutations.create.isPending}
          onClick={() => itemMutations.create.mutate({ collectionId: collection.id })}
        >
          {t("New item")}
        </Button>
      )}
    </Table.ScrollContainer>
  );
}
