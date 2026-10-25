import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Button, Group, Text, TextInput } from "@mantine/core";
import { IconExternalLink, IconInfoCircle } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { useUpdatePageMutation } from "@/features/page/queries/page-query.ts";
import { parseArtifactUrl } from "@/features/page/artifact/artifact.utils.ts";

type Props = {
  pageId: string;
  artifactUrl: string;
  editable: boolean;
};

export function ArtifactView({ pageId, artifactUrl, editable }: Props) {
  const { t } = useTranslation();
  const updatePageMutation = useUpdatePageMutation();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(artifactUrl);

  const handleSave = async () => {
    const parsed = parseArtifactUrl(value);
    if (!parsed) {
      notifications.show({
        message: t("Enter a valid https URL or embed code"),
        color: "red",
      });
      return;
    }
    try {
      await updatePageMutation.mutateAsync({ pageId, artifactUrl: parsed });
      setEditing(false);
    } catch {
      notifications.show({
        message: t("Failed to update artifact"),
        color: "red",
      });
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1, minHeight: 0 }}>
      <Group justify="space-between" gap="xs">
        <Button
          component="a"
          href={artifactUrl}
          target="_blank"
          rel="noopener noreferrer"
          variant="subtle"
          size="xs"
          leftSection={<IconExternalLink size={14} />}
        >
          {t("Open in new tab")}
        </Button>
        {editable && !editing && (
          <Button variant="subtle" size="xs" onClick={() => setEditing(true)}>
            {t("Change artifact")}
          </Button>
        )}
      </Group>

      {editing && (
        <Group align="flex-end" gap="xs" wrap="nowrap">
          <TextInput
            style={{ flex: 1 }}
            size="xs"
            label={t("Artifact URL or embed code")}
            value={value}
            onChange={(e) => setValue(e.currentTarget.value)}
          />
          <Button size="xs" onClick={handleSave} loading={updatePageMutation.isPending}>
            {t("Save")}
          </Button>
          <Button size="xs" variant="default" onClick={() => setEditing(false)}>
            {t("Cancel")}
          </Button>
        </Group>
      )}

      <iframe
        key={artifactUrl}
        src={artifactUrl}
        title={t("Claude artifact")}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads"
        referrerPolicy="no-referrer"
        loading="lazy"
        style={{
          flex: 1,
          minHeight: "70vh",
          width: "100%",
          border: "1px solid var(--mantine-color-default-border)",
          borderRadius: 8,
        }}
      />

      <Alert variant="light" color="gray" icon={<IconInfoCircle size={16} />} p="xs">
        <Text size="xs">
          {t(
            "If the artifact does not load, add this Docmost domain to the artifact's allowed embed domains in Claude.",
          )}
        </Text>
      </Alert>
    </div>
  );
}
