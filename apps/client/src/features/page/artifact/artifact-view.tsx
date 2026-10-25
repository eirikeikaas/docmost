import { useTranslation } from "react-i18next";

type Props = {
  artifactUrl: string;
};

export function ArtifactView({ artifactUrl }: Props) {
  const { t } = useTranslation();

  return (
    <iframe
      key={artifactUrl}
      src={artifactUrl}
      title={t("Claude artifact")}
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads"
      referrerPolicy="no-referrer"
      loading="lazy"
      style={{ flex: 1, minHeight: 0, width: "100%", border: 0, display: "block" }}
    />
  );
}
