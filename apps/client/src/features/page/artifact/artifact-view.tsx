import { useTranslation } from "react-i18next";

type Props = {
  artifactUrl: string;
};

export function ArtifactView({ artifactUrl }: Props) {
  const { t } = useTranslation();

  // allow-scripts + allow-same-origin on a same-origin URL would let the framed
  // page remove its own sandbox and reach the app session.
  let sameOrigin = false;
  try {
    sameOrigin = new URL(artifactUrl).origin === window.location.origin;
  } catch {
    sameOrigin = true;
  }
  const sandbox = sameOrigin
    ? "allow-scripts allow-forms allow-popups allow-downloads"
    : "allow-scripts allow-same-origin allow-forms allow-popups allow-downloads";

  return (
    <iframe
      key={artifactUrl}
      src={artifactUrl}
      title={t("Claude artifact")}
      sandbox={sandbox}
      referrerPolicy="no-referrer"
      loading="lazy"
      style={{ flex: 1, minHeight: 0, width: "100%", border: 0, display: "block" }}
    />
  );
}
