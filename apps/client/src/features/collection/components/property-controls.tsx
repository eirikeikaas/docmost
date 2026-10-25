import { useState } from "react";
import {
  ActionIcon,
  Button,
  Group,
  Menu,
  Modal,
  Popover,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { useTranslation } from "react-i18next";
import {
  IconDots,
  IconPencil,
  IconPlus,
  IconTrash,
  IconListDetails,
} from "@tabler/icons-react";
import {
  IItemProperty,
  PROPERTY_TYPES,
  PropertyConfig,
  PropertyType,
} from "@/features/collection/types/collection.types";

const hasOptions = (type: PropertyType) =>
  type === "select" || type === "multi_select";

const TYPE_LABELS: Record<PropertyType, string> = {
  text: "Text",
  number: "Number",
  select: "Select",
  multi_select: "Multi-select",
  date: "Date",
  checkbox: "Checkbox",
  person: "Person",
  url: "URL",
};

/** One option name per line; existing options keep their id by name match. */
function optionsFromText(
  text: string,
  existing: PropertyConfig["options"] = [],
): PropertyConfig {
  const names = [
    ...new Set(
      text
        .split("\n")
        .map((n) => n.trim())
        .filter(Boolean),
    ),
  ];
  return {
    options: names.map((name) => {
      const match = existing.find((o) => o.name === name);
      return match ?? { id: "", name };
    }),
  };
}

export function AddPropertyButton({
  onAdd,
}: {
  onAdd: (data: {
    name: string;
    type: PropertyType;
    config?: PropertyConfig;
  }) => Promise<unknown>;
}) {
  const { t } = useTranslation();
  const [opened, { toggle, close }] = useDisclosure(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<PropertyType>("text");
  const [options, setOptions] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!name.trim()) return;
    setLoading(true);
    try {
      await onAdd({
        name: name.trim(),
        type,
        config: hasOptions(type) ? optionsFromText(options) : undefined,
      });
      setName("");
      setOptions("");
      setType("text");
      close();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Popover opened={opened} onChange={toggle} position="bottom-end" withArrow>
      <Popover.Target>
        <ActionIcon
          variant="subtle"
          color="gray"
          onClick={toggle}
          aria-label={t("Add property")}
        >
          <IconPlus size={16} />
        </ActionIcon>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="xs" w={240}>
          <TextInput
            data-autofocus
            label={t("Name")}
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
          />
          <Select
            label={t("Type")}
            allowDeselect={false}
            data={PROPERTY_TYPES.map((p) => ({
              value: p,
              label: t(TYPE_LABELS[p]),
            }))}
            value={type}
            onChange={(v) => v && setType(v as PropertyType)}
          />
          {hasOptions(type) && (
            <Textarea
              label={t("Options")}
              description={t("One per line")}
              autosize
              minRows={3}
              value={options}
              onChange={(e) => setOptions(e.currentTarget.value)}
            />
          )}
          <Button size="xs" onClick={submit} loading={loading}>
            {t("Add property")}
          </Button>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}

export function PropertyHeaderMenu({
  property,
  editable,
  onRename,
  onEditOptions,
  onDelete,
}: {
  property: IItemProperty;
  editable: boolean;
  onRename: (name: string) => Promise<unknown>;
  onEditOptions: (config: PropertyConfig) => Promise<unknown>;
  onDelete: () => Promise<unknown>;
}) {
  const { t } = useTranslation();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(property.name);
  const [optionsOpened, { open: openOptions, close: closeOptions }] =
    useDisclosure(false);
  const [optionsText, setOptionsText] = useState("");

  const commitRename = async () => {
    setRenaming(false);
    const next = name.trim();
    if (next && next !== property.name) await onRename(next);
    else setName(property.name);
  };

  return (
    <Group gap={4} wrap="nowrap" justify="space-between">
      {renaming ? (
        <TextInput
          size="xs"
          data-autofocus
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          onBlur={commitRename}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        />
      ) : (
        <Text size="sm" fw={500} truncate>
          {property.name}
        </Text>
      )}
      {editable && (
        <Menu position="bottom-end" withinPortal>
          <Menu.Target>
            <ActionIcon
              variant="subtle"
              color="gray"
              size="sm"
              aria-label={t("Property menu")}
            >
              <IconDots size={14} />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item
              leftSection={<IconPencil size={14} />}
              onClick={() => {
                setName(property.name);
                setRenaming(true);
              }}
            >
              {t("Rename")}
            </Menu.Item>
            {hasOptions(property.type) && (
              <Menu.Item
                leftSection={<IconListDetails size={14} />}
                onClick={() => {
                  setOptionsText(
                    (property.config.options ?? []).map((o) => o.name).join("\n"),
                  );
                  openOptions();
                }}
              >
                {t("Edit options")}
              </Menu.Item>
            )}
            <Menu.Item
              color="red"
              leftSection={<IconTrash size={14} />}
              onClick={() => onDelete()}
            >
              {t("Delete property")}
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      )}

      <Modal
        opened={optionsOpened}
        onClose={closeOptions}
        title={t("Edit options")}
        centered
      >
        <Textarea
          autosize
          minRows={4}
          description={t("One per line. Renaming an option creates a new one.")}
          value={optionsText}
          onChange={(e) => setOptionsText(e.currentTarget.value)}
        />
        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={closeOptions}>
            {t("Cancel")}
          </Button>
          <Button
            onClick={async () => {
              await onEditOptions(
                optionsFromText(optionsText, property.config.options),
              );
              closeOptions();
            }}
          >
            {t("Save")}
          </Button>
        </Group>
      </Modal>
    </Group>
  );
}
