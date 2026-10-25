import {
  useMutation,
  useQuery,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import {
  createItem,
  createProperty,
  createView,
  deleteItem,
  deleteProperty,
  deleteView,
  getCollectionByPageId,
  listAllItems,
  moveItem,
  updateItem,
  updateProperty,
  updateView,
} from "@/features/collection/services/collection-service";
import {
  ICollection,
  IItem,
  PropertyValue,
} from "@/features/collection/types/collection.types";
import {
  applyMove,
  applyProps,
  DropNeighbours,
} from "@/features/collection/utils/board.utils";

const collectionKey = (pageId: string) => ["collection", pageId];
const itemsKey = (collectionId: string, viewId?: string) => [
  "collection-items",
  collectionId,
  viewId ?? null,
];

export function useCollectionQuery(pageId: string | undefined) {
  return useQuery({
    queryKey: collectionKey(pageId ?? ""),
    queryFn: () => getCollectionByPageId(pageId!),
    enabled: !!pageId,
    staleTime: 60 * 1000,
  });
}

export function useItemsQuery(collectionId: string, viewId?: string) {
  return useQuery({
    queryKey: itemsKey(collectionId, viewId),
    queryFn: () => listAllItems({ collectionId, viewId }),
    enabled: !!viewId,
    placeholderData: keepPreviousData,
  });
}

/**
 * Item mutations for one collection. Edits and moves are applied to every
 * cached view of the collection immediately; the server response replaces the
 * optimistic row, and a failure refetches.
 */
export function useItemMutations(collectionId: string) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const prefix = ["collection-items", collectionId];

  const mapCaches = (fn: (items: IItem[]) => IItem[]) =>
    queryClient.setQueriesData<IItem[]>({ queryKey: prefix }, (items) =>
      items ? fn(items) : items,
    );

  const replace = (saved: IItem) =>
    mapCaches((items) => items.map((i) => (i.id === saved.id ? saved : i)));

  const onError = () => {
    notifications.show({ message: t("Failed to save changes"), color: "red" });
    queryClient.invalidateQueries({ queryKey: prefix });
  };

  const create = useMutation({
    mutationFn: createItem,
    onSuccess: (created, vars) => {
      // Appended items go last; items created next to a neighbour are
      // refetched so the cache stays in server order.
      if (vars.afterItemId || vars.beforeItemId) {
        queryClient.invalidateQueries({ queryKey: prefix });
      } else {
        mapCaches((items) => [...items, created]);
      }
    },
    onError,
  });

  const update = useMutation({
    mutationFn: updateItem,
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: prefix });
      mapCaches((items) =>
        items.map((i) =>
          i.id === vars.itemId
            ? {
                ...applyProps(i, (vars.props ?? {}) as Record<string, PropertyValue>),
                ...(vars.title !== undefined && { title: vars.title }),
              }
            : i,
        ),
      );
    },
    onSuccess: replace,
    onError,
  });

  const move = useMutation({
    mutationFn: moveItem,
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: prefix });
      const neighbours: DropNeighbours = {
        afterItemId: vars.afterItemId,
        beforeItemId: vars.beforeItemId,
      };
      mapCaches((items) =>
        applyMove(
          items,
          vars.itemId,
          neighbours,
          vars.props as Record<string, PropertyValue> | undefined,
        ),
      );
    },
    onSuccess: replace,
    onError,
  });

  const remove = useMutation({
    mutationFn: deleteItem,
    onMutate: async (itemId) => {
      await queryClient.cancelQueries({ queryKey: prefix });
      mapCaches((items) => items.filter((i) => i.id !== itemId));
    },
    onError,
  });

  return { create, update, move, remove };
}

/** Property and view mutations; they patch the cached collection. */
export function useCollectionMutations(pageId: string, collectionId: string) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const patchCollection = (fn: (c: ICollection) => ICollection) =>
    queryClient.setQueryData<ICollection>(collectionKey(pageId), (c) =>
      c ? fn(c) : c,
    );

  const onError = () => {
    notifications.show({ message: t("Failed to save changes"), color: "red" });
    queryClient.invalidateQueries({ queryKey: collectionKey(pageId) });
  };

  const addProperty = useMutation({
    mutationFn: createProperty,
    onSuccess: (property) =>
      patchCollection((c) => ({
        ...c,
        properties: [...c.properties, property],
      })),
    onError,
  });

  const editProperty = useMutation({
    mutationFn: updateProperty,
    onSuccess: (property) =>
      patchCollection((c) => ({
        ...c,
        properties: c.properties.map((p) =>
          p.id === property.id ? property : p,
        ),
      })),
    onError,
  });

  const removeProperty = useMutation({
    mutationFn: deleteProperty,
    onSuccess: (_void, vars) => {
      patchCollection((c) => ({
        ...c,
        properties: c.properties.filter((p) => p.id !== vars.propertyId),
      }));
      queryClient.invalidateQueries({
        queryKey: ["collection-items", collectionId],
      });
    },
    onError,
  });

  const addView = useMutation({
    mutationFn: createView,
    onSuccess: (view) =>
      patchCollection((c) => ({ ...c, views: [...c.views, view] })),
    onError,
  });

  const editView = useMutation({
    mutationFn: updateView,
    onSuccess: (view) => {
      patchCollection((c) => ({
        ...c,
        views: c.views.map((v) => (v.id === view.id ? view : v)),
      }));
      // filters/sorts live in the view config and are applied server-side
      queryClient.invalidateQueries({
        queryKey: ["collection-items", collectionId, view.id],
      });
    },
    onError,
  });

  const removeView = useMutation({
    mutationFn: deleteView,
    onSuccess: (_void, vars) =>
      patchCollection((c) => ({
        ...c,
        views: c.views.filter((v) => v.id !== vars.viewId),
      })),
    onError,
  });

  return {
    addProperty,
    editProperty,
    removeProperty,
    addView,
    editView,
    removeView,
  };
}
