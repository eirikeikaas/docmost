import { useEffect, useState } from "react";
import { Button, Group, Modal, Stack, Text, TextInput } from "@mantine/core";
import { useTranslation } from "react-i18next";
import {
  IItem,
  IItemProperty,
  PropertyValue,
} from "@/features/collection/types/collection.types";
import { ItemCell } from "@/features/collection/components/item-cell";

type Props = {
  item: IItem | null;
  properties: IItemProperty[];
  editable: boolean;
  onClose: () => void;
  onTitle: (itemId: string, title: string) => void;
  onProp: (itemId: string, propertyId: string, value: PropertyValue) => void;
  onDelete: (itemId: string) => void;
};

/** Full editor for one item: title plus every property. */
export function ItemModal({
  item,
  properties,
  editable,
  onClose,
  onTitle,
  onProp,
  onDelete,
}: Props) {
  const { t } = useTranslation();
  const [title, setTitle] = useState("");

  useEffect(() => {
    setTitle(item?.title ?? "");
  }, [item?.id, item?.title]);

  return (
    <Modal
      opened={!!item}
      onClose={onClose}
      centered
      size="lg"
      title={t("Item")}
    >
      {item && (
        <Stack gap="sm">
          <TextInput
            data-autofocus
            size="md"
            placeholder={t("Untitled")}
            value={title}
            readOnly={!editable}
            onChange={(e) => setTitle(e.currentTarget.value)}
            onBlur={() => title !== item.title && onTitle(item.id, title)}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          />
          {properties.map((property) => (
            <Group key={property.id} wrap="nowrap" align="center">
              <Text size="sm" c="dimmed" w={140} truncate>
                {property.name}
              </Text>
              <div style={{ flex: 1, minWidth: 0 }}>
                <ItemCell
                  property={property}
                  value={item.props[property.id]}
                  editable={editable}
                  onChange={(value) => onProp(item.id, property.id, value)}
                />
              </div>
            </Group>
          ))}
          {editable && (
            <Group justify="flex-end" mt="sm">
              <Button
                color="red"
                variant="subtle"
                onClick={() => {
                  onDelete(item.id);
                  onClose();
                }}
              >
                {t("Delete item")}
              </Button>
            </Group>
          )}
        </Stack>
      )}
    </Modal>
  );
}
