import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { notifications } from "@mantine/notifications";
import { useQueryClient } from "@tanstack/react-query";
import { IconFileDescription } from "@tabler/icons-react";
import { Button, Group, Modal, Stack, Text, TextInput } from "@mantine/core";
import { useTranslation } from "react-i18next";
import {
  IItem,
  IItemProperty,
  PropertyValue,
} from "@/features/collection/types/collection.types";
import { ItemCell } from "@/features/collection/components/item-cell";
import { openItemPage } from "@/features/collection/services/collection-service";
import { buildPageUrl } from "@/features/page/page.utils.ts";

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
  const [opening, setOpening] = useState(false);
  const navigate = useNavigate();
  const { spaceSlug } = useParams();
  const queryClient = useQueryClient();

  const openAsPage = async () => {
    if (!item) return;
    setOpening(true);
    try {
      const page = await openItemPage(item.id);
      queryClient.invalidateQueries({
        queryKey: ["collection-items", item.collectionId],
      });
      onClose();
      navigate(buildPageUrl(spaceSlug, page.slugId, page.title));
    } catch {
      notifications.show({ message: t("Failed to open page"), color: "red" });
    } finally {
      setOpening(false);
    }
  };

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
            <Group justify="space-between" mt="sm">
              <Button
                variant="light"
                leftSection={<IconFileDescription size={16} />}
                loading={opening}
                onClick={openAsPage}
              >
                {item.pageId ? t("Open page") : t("Open as page")}
              </Button>
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
