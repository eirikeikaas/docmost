import { useState } from "react";
import {
  ActionIcon,
  Button,
  Checkbox,
  Group,
  NumberInput,
  Popover,
  SegmentedControl,
  Select,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { useTranslation } from "react-i18next";
import { IconAdjustmentsHorizontal, IconPlus, IconX } from "@tabler/icons-react";
import {
  ICollection,
  IItemProperty,
  IItemView,
  ItemFilter,
  ViewConfig,
} from "@/features/collection/types/collection.types";
import {
  isCompleteFilter,
  needsValue,
  newFilter,
  OPERATOR_LABELS,
  OPERATORS_BY_TYPE,
  retargetFilter,
} from "@/features/collection/utils/filter.utils";

function FilterValue({
  property,
  filter,
  onChange,
}: {
  property: IItemProperty;
  filter: ItemFilter;
  onChange: (value: unknown) => void;
}) {
  const { t } = useTranslation();
  switch (property.type) {
    case "select":
    case "multi_select":
      return (
        <Select
          size="xs"
          data={(property.config.options ?? []).map((o) => ({
            value: o.id,
            label: o.name,
          }))}
          value={typeof filter.value === "string" ? filter.value : null}
          onChange={onChange}
        />
      );
    case "checkbox":
      return (
        <Checkbox
          checked={filter.value === true}
          onChange={(e) => onChange(e.currentTarget.checked)}
        />
      );
    case "number":
      return (
        <NumberInput
          size="xs"
          hideControls
          value={typeof filter.value === "number" ? filter.value : ""}
          onChange={(v) => onChange(typeof v === "number" ? v : undefined)}
        />
      );
    case "date":
      return (
        <TextInput
          size="xs"
          placeholder="YYYY-MM-DD"
          value={typeof filter.value === "string" ? filter.value : ""}
          onChange={(e) => onChange(e.currentTarget.value)}
        />
      );
    default:
      return (
        <TextInput
          size="xs"
          placeholder={t("Value")}
          value={typeof filter.value === "string" ? filter.value : ""}
          onChange={(e) => onChange(e.currentTarget.value)}
        />
      );
  }
}

type Props = {
  collection: ICollection;
  view: IItemView;
  onChange: (config: ViewConfig) => void;
};

/** Sort, filters, grouping and visible columns for one view. */
export function ViewSettings({ collection, view, onChange }: Props) {
  const { t } = useTranslation();
  const properties = collection.properties;
  const byId = new Map(properties.map((p) => [p.id, p]));
  const config = view.config;

  // Filters being edited may be incomplete; only complete ones are saved.
  const [filters, setFilters] = useState<ItemFilter[]>(
    (config.filters ?? []).filter((f) => byId.has(f.propertyId)),
  );

  const saveFilters = (next: ItemFilter[]) => {
    setFilters(next);
    onChange({ ...config, filters: next.filter(isCompleteFilter) });
  };

  const sort = config.sorts?.find((s) => byId.has(s.propertyId));
  const sortable = properties.filter((p) => p.type !== "multi_select");
  const selectProperties = properties.filter((p) => p.type === "select");

  return (
    <Popover position="bottom-end" width={380} withArrow shadow="md">
      <Popover.Target>
        <Button
          variant="default"
          size="xs"
          leftSection={<IconAdjustmentsHorizontal size={14} />}
        >
          {t("View settings")}
          {(filters.length > 0 || sort) && ` (${filters.length + (sort ? 1 : 0)})`}
        </Button>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="md">
          {view.type === "kanban" && (
            <Select
              label={t("Group by")}
              data={selectProperties.map((p) => ({ value: p.id, label: p.name }))}
              value={config.groupBy ?? null}
              onChange={(groupBy) =>
                groupBy && onChange({ ...config, groupBy })
              }
            />
          )}

          <Stack gap={4}>
            <Text size="sm" fw={500}>
              {t("Sort")}
            </Text>
            <Group gap="xs" wrap="nowrap">
              <Select
                size="xs"
                style={{ flex: 1 }}
                placeholder={t("None")}
                clearable
                data={sortable.map((p) => ({ value: p.id, label: p.name }))}
                value={sort?.propertyId ?? null}
                onChange={(propertyId) =>
                  onChange({
                    ...config,
                    sorts: propertyId
                      ? [
                          {
                            propertyId,
                            direction: sort?.direction ?? "asc",
                          },
                        ]
                      : [],
                  })
                }
              />
              <SegmentedControl
                size="xs"
                disabled={!sort}
                value={sort?.direction ?? "asc"}
                data={[
                  { value: "asc", label: "A→Z" },
                  { value: "desc", label: "Z→A" },
                ]}
                onChange={(direction) =>
                  sort &&
                  onChange({
                    ...config,
                    sorts: [
                      { propertyId: sort.propertyId, direction: direction as "asc" | "desc" },
                    ],
                  })
                }
              />
            </Group>
          </Stack>

          <Stack gap={4}>
            <Text size="sm" fw={500}>
              {t("Filters")}
            </Text>
            {filters.map((filter, index) => {
              const property = byId.get(filter.propertyId)!;
              return (
                <Group key={index} gap={4} wrap="nowrap" align="flex-start">
                  <Select
                    size="xs"
                    w={110}
                    allowDeselect={false}
                    data={properties.map((p) => ({ value: p.id, label: p.name }))}
                    value={filter.propertyId}
                    onChange={(propertyId) => {
                      const next = byId.get(propertyId ?? "");
                      if (!next) return;
                      saveFilters(
                        filters.map((f, i) =>
                          i === index ? retargetFilter(f, next) : f,
                        ),
                      );
                    }}
                  />
                  <Select
                    size="xs"
                    w={110}
                    allowDeselect={false}
                    data={OPERATORS_BY_TYPE[property.type].map((op) => ({
                      value: op,
                      label: t(OPERATOR_LABELS[op]),
                    }))}
                    value={filter.op}
                    onChange={(op) =>
                      op &&
                      saveFilters(
                        filters.map((f, i) =>
                          i === index
                            ? {
                                ...f,
                                op: op as ItemFilter["op"],
                                ...(needsValue(op as ItemFilter["op"])
                                  ? {}
                                  : { value: undefined }),
                              }
                            : f,
                        ),
                      )
                    }
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {needsValue(filter.op) && (
                      <FilterValue
                        property={property}
                        filter={filter}
                        onChange={(value) =>
                          saveFilters(
                            filters.map((f, i) =>
                              i === index ? { ...f, value } : f,
                            ),
                          )
                        }
                      />
                    )}
                  </div>
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    size="sm"
                    aria-label={t("Remove filter")}
                    onClick={() => saveFilters(filters.filter((_, i) => i !== index))}
                  >
                    <IconX size={14} />
                  </ActionIcon>
                </Group>
              );
            })}
            {properties.length > 0 && (
              <Button
                variant="subtle"
                size="xs"
                leftSection={<IconPlus size={14} />}
                onClick={() => saveFilters([...filters, newFilter(properties[0])])}
              >
                {t("Add filter")}
              </Button>
            )}
          </Stack>

          {view.type === "table" && (
            <Checkbox.Group
              label={t("Visible properties")}
              value={config.visibleProperties ?? properties.map((p) => p.id)}
              onChange={(visibleProperties) =>
                onChange({ ...config, visibleProperties })
              }
            >
              <Stack gap={4} mt={4}>
                {properties.map((p) => (
                  <Checkbox key={p.id} size="xs" value={p.id} label={p.name} />
                ))}
              </Stack>
            </Checkbox.Group>
          )}
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
