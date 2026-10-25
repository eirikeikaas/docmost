import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Group,
  Select,
  Stack,
  Text,
} from "@mantine/core";
import { useTranslation } from "react-i18next";
import { IconPlus } from "@tabler/icons-react";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import {
  draggable,
  dropTargetForElements,
  monitorForElements,
} from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import {
  attachClosestEdge,
  extractClosestEdge,
  type Edge,
} from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";
import {
  ICollection,
  IItem,
  IItemProperty,
  IItemView,
} from "@/features/collection/types/collection.types";
import {
  BoardColumn,
  columnValue,
  dropNeighbours,
  groupItemsByOption,
  NO_VALUE_COLUMN,
} from "@/features/collection/utils/board.utils";
import { ItemCell } from "@/features/collection/components/item-cell";
import {
  useCollectionMutations,
  useItemMutations,
} from "@/features/collection/queries/collection-query";

const CARD = "collection-card";
const COLUMN = "collection-column";

type Props = {
  collection: ICollection;
  pageId: string;
  view: IItemView;
  items: IItem[];
  onOpenItem: (item: IItem) => void;
};

function BoardCard({
  item,
  columnId,
  properties,
  editable,
  onOpen,
}: {
  item: IItem;
  columnId: string;
  properties: IItemProperty[];
  editable: boolean;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState<Edge | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return combine(
      draggable({
        element: el,
        canDrag: () => editable,
        getInitialData: () => ({ type: CARD, itemId: item.id }),
        onDragStart: () => setDragging(true),
        onDrop: () => setDragging(false),
      }),
      dropTargetForElements({
        element: el,
        canDrop: ({ source }) =>
          source.data.type === CARD && source.data.itemId !== item.id,
        getData: ({ input, element }) =>
          attachClosestEdge(
            { type: CARD, itemId: item.id, columnId },
            { input, element, allowedEdges: ["top", "bottom"] },
          ),
        onDrag: ({ self }) => setEdge(extractClosestEdge(self.data)),
        onDragLeave: () => setEdge(null),
        onDrop: () => setEdge(null),
      }),
    );
  }, [item.id, columnId, editable]);

  return (
    <Card
      ref={ref}
      withBorder
      padding="xs"
      radius="sm"
      onClick={onOpen}
      style={{
        cursor: editable ? "grab" : "pointer",
        opacity: dragging ? 0.4 : 1,
        borderTop: edge === "top" ? "2px solid var(--mantine-color-blue-5)" : undefined,
        borderBottom:
          edge === "bottom" ? "2px solid var(--mantine-color-blue-5)" : undefined,
      }}
    >
      <Text size="sm" fw={500} lineClamp={3}>
        {item.title || t("Untitled")}
      </Text>
      {properties.length > 0 && (
        <Group gap={4} mt={4}>
          {properties.map((property) => (
            <ItemCell
              key={property.id}
              property={property}
              value={item.props[property.id]}
              editable={false}
              onChange={() => undefined}
              compact
            />
          ))}
        </Group>
      )}
    </Card>
  );
}

function BoardColumnView({
  column,
  properties,
  editable,
  onOpenItem,
  onAdd,
}: {
  column: BoardColumn;
  properties: IItemProperty[];
  editable: boolean;
  onOpenItem: (item: IItem) => void;
  onAdd: () => void;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const [over, setOver] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return dropTargetForElements({
      element: el,
      canDrop: ({ source }) => source.data.type === CARD,
      getData: () => ({ type: COLUMN, columnId: column.id }),
      onDragEnter: () => setOver(true),
      onDragLeave: () => setOver(false),
      onDrop: () => setOver(false),
    });
  }, [column.id]);

  return (
    <Stack
      ref={ref}
      gap="xs"
      w={280}
      miw={280}
      p="xs"
      style={{
        borderRadius: "var(--mantine-radius-md)",
        background: over
          ? "var(--mantine-color-blue-light)"
          : "var(--mantine-color-default-hover)",
        alignSelf: "flex-start",
      }}
    >
      <Group justify="space-between" wrap="nowrap">
        <Group gap={6}>
          {column.name === null ? (
            <Text size="sm" c="dimmed">
              {t("No value")}
            </Text>
          ) : (
            <Badge variant="light" color={column.color ?? "gray"}>
              {column.name}
            </Badge>
          )}
          <Text size="xs" c="dimmed">
            {column.items.length}
          </Text>
        </Group>
        {editable && (
          <ActionIcon
            variant="subtle"
            color="gray"
            size="sm"
            aria-label={t("New item")}
            onClick={onAdd}
          >
            <IconPlus size={14} />
          </ActionIcon>
        )}
      </Group>
      {column.items.map((item) => (
        <BoardCard
          key={item.id}
          item={item}
          columnId={column.id}
          properties={properties}
          editable={editable}
          onOpen={() => onOpenItem(item)}
        />
      ))}
      {editable && column.items.length === 0 && (
        <Button
          variant="subtle"
          color="gray"
          size="xs"
          leftSection={<IconPlus size={14} />}
          onClick={onAdd}
        >
          {t("New item")}
        </Button>
      )}
    </Stack>
  );
}

export function KanbanView({ collection, pageId, view, items, onOpenItem }: Props) {
  const { t } = useTranslation();
  const editable = collection.canEdit;
  const itemMutations = useItemMutations(collection.id);
  const { editView } = useCollectionMutations(pageId, collection.id);

  const selectProperties = collection.properties.filter((p) => p.type === "select");
  const groupBy = selectProperties.find((p) => p.id === view.config.groupBy);

  const columns = useMemo(
    () => (groupBy ? groupItemsByOption(items, groupBy) : []),
    [items, groupBy],
  );

  // Keep a ref so the single drag monitor always sees the latest columns.
  const columnsRef = useRef(columns);
  columnsRef.current = columns;
  const moveRef = useRef(itemMutations.move.mutate);
  moveRef.current = itemMutations.move.mutate;

  useEffect(() => {
    if (!groupBy || !editable) return;
    return monitorForElements({
      canMonitor: ({ source }) => source.data.type === CARD,
      onDrop: ({ source, location }) => {
        const target = location.current.dropTargets[0];
        if (!target) return;
        const itemId = source.data.itemId as string;
        const columnId = target.data.columnId as string;
        const column = columnsRef.current.find((c) => c.id === columnId);
        if (!column) return;

        let index = column.items.length;
        if (target.data.type === CARD) {
          const at = column.items.findIndex((i) => i.id === target.data.itemId);
          if (at === -1) return;
          index = extractClosestEdge(target.data) === "bottom" ? at + 1 : at;
        }

        moveRef.current({
          itemId,
          ...dropNeighbours(column.items, index, itemId),
          props: { [groupBy.id]: columnValue(columnId) },
        });
      },
    });
  }, [groupBy, editable]);

  if (!groupBy) {
    return (
      <Stack gap="xs" maw={360}>
        <Text size="sm" c="dimmed">
          {selectProperties.length
            ? t("Choose a Select property to group the board by.")
            : t("Add a Select property to group the board by.")}
        </Text>
        {selectProperties.length > 0 && editable && (
          <Select
            placeholder={t("Group by")}
            data={selectProperties.map((p) => ({ value: p.id, label: p.name }))}
            onChange={(propertyId) =>
              propertyId &&
              editView.mutate({
                collectionId: collection.id,
                viewId: view.id,
                config: { ...view.config, groupBy: propertyId },
              })
            }
          />
        )}
      </Stack>
    );
  }

  const cardProperties = (
    view.config.cardProperties
      ? collection.properties.filter((p) => view.config.cardProperties!.includes(p.id))
      : collection.properties.filter((p) => p.id !== groupBy.id).slice(0, 2)
  ).filter((p) => p.type !== "text" || view.config.cardProperties);

  return (
    <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 12 }}>
      {columns
        .filter((c) => c.id !== NO_VALUE_COLUMN || c.items.length > 0)
        .map((column) => (
          <BoardColumnView
            key={column.id}
            column={column}
            properties={cardProperties}
            editable={editable}
            onOpenItem={onOpenItem}
            onAdd={() =>
              itemMutations.create.mutate({
                collectionId: collection.id,
                props:
                  column.id === NO_VALUE_COLUMN
                    ? {}
                    : { [groupBy.id]: column.id },
              })
            }
          />
        ))}
    </div>
  );
}
