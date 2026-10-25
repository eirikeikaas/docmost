import { NodeViewProps, NodeViewWrapper } from "@tiptap/react";
import { ActionIcon, Anchor, Group, SegmentedControl, Stack, Text } from "@mantine/core";
import { IconFileDescription } from "@tabler/icons-react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useRecentChangesQuery } from "@/features/page/queries/page-query";
import { useGetSpaceBySlugQuery } from "@/features/space/queries/space-query";
import { buildPageUrl } from "@/features/page/page.utils.ts";
import { timeAgo } from "@/lib/time";
import classes from "../subpages/subpages.module.css";
import styles from "../mention/mention.module.css";

export default function RecentPagesView(props: NodeViewProps) {
  const { editor, node, updateAttributes } = props;
  const { spaceSlug } = useParams();
  const { t } = useTranslation();
  const limit: number = node.attrs.limit ?? 5;

  const { data: space } = useGetSpaceBySlugQuery(spaceSlug);
  const { data, isLoading, error } = useRecentChangesQuery(space?.id);

  const pages = (data?.pages.flatMap((p) => p.items) ?? []).slice(0, limit);

  return (
    <NodeViewWrapper data-drag-handle>
      <div className={classes.container}>
        {editor.isEditable && (
          <SegmentedControl
            size="xs"
            mb="xs"
            value={String(limit)}
            data={["5", "10", "20"]}
            onChange={(v) => updateAttributes({ limit: Number(v) })}
          />
        )}
        {error ? (
          <Text c="dimmed" size="md" py="md">
            {t("Failed to load recent pages")}
          </Text>
        ) : isLoading || !space ? null : pages.length === 0 ? (
          <Text c="dimmed" size="md" py="md">
            {t("No recent pages")}
          </Text>
        ) : (
          <Stack gap={5}>
            {pages.map((page) => (
              <Group key={page.id} gap="xs" justify="space-between" wrap="nowrap">
                <Anchor
                  component={Link}
                  fw={500}
                  to={buildPageUrl(spaceSlug, page.slugId, page.title)}
                  underline="never"
                  className={styles.pageMentionLink}
                  draggable={false}
                >
                  {page.icon ? (
                    <span style={{ marginRight: "4px" }}>{page.icon}</span>
                  ) : (
                    <ActionIcon
                      variant="transparent"
                      color="gray"
                      component="span"
                      size={18}
                      style={{ verticalAlign: "text-bottom" }}
                    >
                      <IconFileDescription size={18} />
                    </ActionIcon>
                  )}
                  <span className={styles.pageMentionText}>
                    {page.title || t("untitled")}
                  </span>
                </Anchor>
                <Text size="xs" c="dimmed" style={{ whiteSpace: "nowrap" }}>
                  {timeAgo(new Date(page.updatedAt))}
                </Text>
              </Group>
            ))}
          </Stack>
        )}
      </div>
    </NodeViewWrapper>
  );
}
