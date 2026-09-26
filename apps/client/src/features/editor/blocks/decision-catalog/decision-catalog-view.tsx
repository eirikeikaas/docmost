import { NodeViewProps, NodeViewWrapper } from "@tiptap/react";
import {
  Anchor,
  Group,
  Paper,
  Select,
  Stack,
  Text,
  Loader,
} from "@mantine/core";
import { IconListCheck } from "@tabler/icons-react";
import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  getValidDecisionCatalogLimit,
  getValidDecisionCatalogStatusFilter,
} from "@docmost/editor-ext";
import { useSpaceQuery } from "@/features/space/queries/space-query";
import { buildPageUrl } from "@/features/page/page.utils";
import { getPageTitle } from "@/features/page/page.utils";
import { useSpaceDecisionsQuery } from "./use-space-decisions-query";
import type { ISpaceDecisionItem } from "./decision-catalog.types";
import classes from "./decision-catalog-view.module.css";

type DecisionGroup = {
  pageId: string;
  pageTitle: string;
  pageSlugId: string;
  decisions: ISpaceDecisionItem[];
};

export default function DecisionCatalogView(props: NodeViewProps) {
  const { node, updateAttributes, editor } = props;
  const { t } = useTranslation();
  const { spaceSlug } = useParams();
  const { data: space } = useSpaceQuery(spaceSlug);
  const editable = editor?.isEditable ?? false;

  const statusFilter = getValidDecisionCatalogStatusFilter(
    node.attrs.statusFilter,
  );
  const limit = getValidDecisionCatalogLimit(node.attrs.limit);

  const { data, isLoading, error } = useSpaceDecisionsQuery(
    space?.id
      ? {
          spaceId: space.id,
          status: statusFilter,
          limit,
        }
      : null,
  );

  const groups = useMemo(() => groupByPage(data || [], t), [data, t]);

  return (
    <NodeViewWrapper>
      <Paper withBorder p="sm" radius="sm" className={classes.root}>
        <Group justify="space-between" mb="sm" wrap="nowrap">
          <Group gap="xs">
            <IconListCheck size={18} />
            <Text fw={600} size="sm">
              {t("Decision catalog")}
            </Text>
          </Group>
          {editable && (
            <Select
              size="xs"
              w={160}
              value={statusFilter}
              data={[
                { value: "all", label: t("All statuses") },
                { value: "undecided", label: t("Needs decision") },
                { value: "decided", label: t("Decided") },
              ]}
              onChange={(value) => {
                updateAttributes({
                  statusFilter: getValidDecisionCatalogStatusFilter(value),
                });
              }}
              allowDeselect={false}
            />
          )}
        </Group>

        {!space?.id && (
          <Text size="sm" c="dimmed">
            {t("Open a space page to load decisions.")}
          </Text>
        )}

        {space?.id && isLoading && <Loader size="sm" />}

        {space?.id && error && (
          <Text size="sm" c="red">
            {t("Failed to load decisions.")}
          </Text>
        )}

        {space?.id && !isLoading && !error && groups.length === 0 && (
          <Text size="sm" c="dimmed">
            {t("No decisions in this space yet.")}
          </Text>
        )}

        {groups.length > 0 && (
          <Stack gap="md">
            {groups.map((group) => (
              <div key={group.pageId}>
                <Anchor
                  component={Link}
                  to={buildPageUrl(spaceSlug, group.pageSlugId, group.pageTitle)}
                  size="sm"
                  fw={600}
                  mb={4}
                  display="inline-block"
                >
                  {group.pageTitle}
                </Anchor>
                <Stack gap={6}>
                  {group.decisions.map((decision) => (
                    <Group
                      key={decision.decisionId}
                      gap="xs"
                      align="flex-start"
                      wrap="nowrap"
                    >
                      <Text size="xs" c="dimmed" w={90} className={classes.status}>
                        {t(
                          decision.status === "decided"
                            ? "Decided"
                            : "Needs decision",
                        )}
                      </Text>
                      <Text size="sm" className={classes.decisionText}>
                        {decision.decisionText || t("Empty decision")}
                      </Text>
                    </Group>
                  ))}
                </Stack>
              </div>
            ))}
          </Stack>
        )}
      </Paper>
    </NodeViewWrapper>
  );
}

/**
 * Groups decision rows by source page for catalog display.
 *
 * @param items - Flat decision list from the API
 * @param t - i18n translate function for untitled page fallback
 * @returns Page-grouped decision sections
 */
function groupByPage(
  items: ISpaceDecisionItem[],
  t: (key: string) => string,
): DecisionGroup[] {
  const map = new Map<string, DecisionGroup>();

  for (const item of items) {
    let group = map.get(item.pageId);
    if (!group) {
      group = {
        pageId: item.pageId,
        pageSlugId: item.pageSlugId,
        pageTitle: getPageTitle(item.pageTitle, false, t as any),
        decisions: [],
      };
      map.set(item.pageId, group);
    }
    group.decisions.push(item);
  }

  return Array.from(map.values());
}
