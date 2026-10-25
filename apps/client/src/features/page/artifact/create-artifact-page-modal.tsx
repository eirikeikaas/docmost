import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Group, Modal, Textarea } from "@mantine/core";
import { parseArtifactUrl } from "@/features/page/artifact/artifact.utils.ts";

type Props = {
  opened: boolean;
  onClose: () => void;
  onCreate: (artifactUrl: string) => Promise<void>;
};

export function CreateArtifactPageModal({ opened, onClose, onCreate }: Props) {
  const { t } = useTranslation();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleClose = () => {
    setValue("");
    setError(null);
    onClose();
  };

  const handleSubmit = async () => {
    const parsed = parseArtifactUrl(value);
    if (!parsed) {
      setError(t("Enter a valid https URL or embed code"));
      return;
    }
    setLoading(true);
    try {
      await onCreate(parsed);
      handleClose();
    } catch {
      setError(t("Failed to create page"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal opened={opened} onClose={handleClose} title={t("New artifact page")} centered>
      <Textarea
        autosize
        minRows={3}
        data-autofocus
        label={t("Artifact URL or embed code")}
        description={t(
          "Paste the embed code from a published Claude artifact. Add this Docmost domain to its allowed domains.",
        )}
        placeholder='<iframe src="https://…"></iframe>'
        value={value}
        error={error}
        onChange={(e) => {
          setValue(e.currentTarget.value);
          setError(null);
        }}
      />
      <Group justify="flex-end" mt="md">
        <Button variant="default" onClick={handleClose}>
          {t("Cancel")}
        </Button>
        <Button onClick={handleSubmit} loading={loading}>
          {t("Create")}
        </Button>
      </Group>
    </Modal>
  );
}
