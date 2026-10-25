import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Group, Modal, Textarea, TextInput } from "@mantine/core";
import { parseArtifactUrl } from "@/features/page/artifact/artifact.utils.ts";

type Props = {
  opened: boolean;
  onClose: () => void;
  onCreate: (artifactUrl: string, title: string) => Promise<void>;
  initialTitle?: string;
  initialUrl?: string;
  title?: string;
  submitLabel?: string;
};

export function CreateArtifactPageModal({
  opened,
  onClose,
  onCreate,
  title,
  submitLabel,
  initialTitle = "",
  initialUrl = "",
}: Props) {
  const { t } = useTranslation();
  const [value, setValue] = useState(initialUrl);
  const [pageTitle, setPageTitle] = useState(initialTitle);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (opened) {
      setValue(initialUrl);
      setPageTitle(initialTitle);
    }
  }, [opened, initialUrl, initialTitle]);

  const handleClose = () => {
    setValue("");
    setPageTitle("");
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
      await onCreate(parsed, pageTitle.trim());
      handleClose();
    } catch {
      setError(t("Failed to create page"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title={title ?? t("New artifact page")}
      centered
    >
      <TextInput
        data-autofocus
        label={t("Title")}
        placeholder={t("Untitled")}
        value={pageTitle}
        onChange={(e) => setPageTitle(e.currentTarget.value)}
        mb="sm"
      />
      <Textarea
        autosize
        minRows={3}
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
          {submitLabel ?? t("Create")}
        </Button>
      </Group>
    </Modal>
  );
}
