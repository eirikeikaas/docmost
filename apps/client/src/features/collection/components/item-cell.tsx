import { useEffect, useState } from "react";
import {
  Anchor,
  Badge,
  Checkbox,
  MultiSelect,
  NumberInput,
  Select,
  Text,
  TextInput,
} from "@mantine/core";
import { DateInput } from "@mantine/dates";
import { useTranslation } from "react-i18next";
import {
  DateValue,
  IItemProperty,
  PropertyValue,
} from "@/features/collection/types/collection.types";
import { useWorkspaceMembersQuery } from "@/features/workspace/queries/workspace-query.ts";

type Props = {
  property: IItemProperty;
  value: PropertyValue | undefined;
  editable: boolean;
  onChange: (value: PropertyValue) => void;
  /** Compact rendering for kanban cards (read-only badges, no inputs). */
  compact?: boolean;
};

function optionColor(color?: string) {
  return color ?? "gray";
}

function useMemberOptions(enabled: boolean) {
  const { data } = useWorkspaceMembersQuery(
    enabled ? { limit: 100 } : undefined,
  );
  return (data?.items ?? []).map((user) => ({
    value: user.id,
    label: user.name,
  }));
}

/** Read-only text for a value, used by compact cards and empty states. */
export function ItemValueBadges({ property, value }: Pick<Props, "property" | "value">) {
  const options = property.config.options ?? [];
  if (value === null || value === undefined) return null;

  switch (property.type) {
    case "select": {
      const option = options.find((o) => o.id === value);
      return option ? (
        <Badge size="sm" variant="light" color={optionColor(option.color)}>
          {option.name}
        </Badge>
      ) : null;
    }
    case "multi_select":
      return (
        <>
          {(value as string[]).map((id) => {
            const option = options.find((o) => o.id === id);
            return option ? (
              <Badge
                key={id}
                size="sm"
                variant="light"
                color={optionColor(option.color)}
              >
                {option.name}
              </Badge>
            ) : null;
          })}
        </>
      );
    case "checkbox":
      return <Checkbox size="xs" checked={value === true} readOnly />;
    case "date":
      return <Text size="xs">{(value as DateValue).start?.slice(0, 10)}</Text>;
    case "url":
      return (
        <Anchor size="xs" href={String(value)} target="_blank" rel="noreferrer noopener">
          {String(value)}
        </Anchor>
      );
    default:
      return <Text size="xs">{String(value)}</Text>;
  }
}

function PersonCell({ value, editable, onChange }: Omit<Props, "property" | "compact">) {
  const options = useMemberOptions(true);
  return (
    <Select
      variant="unstyled"
      size="sm"
      data={options}
      value={typeof value === "string" ? value : null}
      readOnly={!editable}
      searchable
      clearable={editable}
      onChange={(v) => onChange(v)}
    />
  );
}

/** Editable (or read-only) cell for one property of one item. */
export function ItemCell({ property, value, editable, onChange, compact }: Props) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<string>("");

  useEffect(() => {
    setDraft(typeof value === "string" || typeof value === "number" ? String(value) : "");
  }, [value]);

  if (compact) return <ItemValueBadges property={property} value={value} />;

  switch (property.type) {
    case "text":
    case "url":
      return (
        <TextInput
          variant="unstyled"
          size="sm"
          value={draft}
          readOnly={!editable}
          placeholder={property.type === "url" ? "https://" : undefined}
          onChange={(e) => setDraft(e.currentTarget.value)}
          onBlur={() => {
            const next = draft.trim() === "" ? null : draft;
            if (next !== (value ?? null)) onChange(next);
          }}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        />
      );
    case "number":
      return (
        <NumberInput
          variant="unstyled"
          size="sm"
          hideControls
          value={typeof value === "number" ? value : ""}
          readOnly={!editable}
          onBlur={(e) => {
            const raw = e.currentTarget.value.trim();
            const parsed = raw === "" ? null : Number(raw.replace(",", "."));
            if (parsed !== null && !Number.isFinite(parsed)) return;
            if (parsed !== (value ?? null)) onChange(parsed);
          }}
        />
      );
    case "select":
      return (
        <Select
          variant="unstyled"
          size="sm"
          data={(property.config.options ?? []).map((o) => ({
            value: o.id,
            label: o.name,
          }))}
          value={typeof value === "string" ? value : null}
          readOnly={!editable}
          clearable={editable}
          placeholder={t("Empty")}
          onChange={(v) => onChange(v)}
        />
      );
    case "multi_select":
      return (
        <MultiSelect
          variant="unstyled"
          size="sm"
          data={(property.config.options ?? []).map((o) => ({
            value: o.id,
            label: o.name,
          }))}
          value={Array.isArray(value) ? value : []}
          readOnly={!editable}
          placeholder={t("Empty")}
          onChange={(v) => onChange(v.length ? v : null)}
        />
      );
    case "date":
      return (
        <DateInput
          variant="unstyled"
          size="sm"
          valueFormat="YYYY-MM-DD"
          value={(value as DateValue | null)?.start?.slice(0, 10) ?? null}
          readOnly={!editable}
          clearable={editable}
          placeholder={t("Empty")}
          onChange={(v) => onChange(v ? { start: v } : null)}
        />
      );
    case "checkbox":
      return (
        <Checkbox
          checked={value === true}
          disabled={!editable}
          onChange={(e) => onChange(e.currentTarget.checked)}
        />
      );
    case "person":
      return <PersonCell value={value} editable={editable} onChange={onChange} />;
  }
}
