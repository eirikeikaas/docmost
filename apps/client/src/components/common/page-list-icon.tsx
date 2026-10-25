import { ThemeIcon } from "@mantine/core";
import {
  IconFileDescription,
  IconLayoutKanban,
  IconSparkles,
  IconTable,
} from "@tabler/icons-react";

type Props = {
  icon?: string | null;
  isBase?: boolean;
  isArtifact?: boolean;
  isCollection?: boolean;
};

export function PageListIcon({ icon, isBase, isArtifact, isCollection }: Props) {
  if (icon) {
    return <>{icon}</>;
  }
  return (
    <ThemeIcon variant="transparent" color="gray" size={18}>
      {isBase ? (
        <IconTable size={18} />
      ) : isCollection ? (
        <IconLayoutKanban size={18} />
      ) : isArtifact ? (
        <IconSparkles size={18} />
      ) : (
        <IconFileDescription size={18} />
      )}
    </ThemeIcon>
  );
}
