import { NodeViewContent, NodeViewProps, NodeViewWrapper } from "@tiptap/react";
import { ActionIcon, Group, Paper, Text, Tooltip } from "@mantine/core";
import {
  IconCircleCheck,
  IconCircleDashed,
} from "@tabler/icons-react";
import type { DecisionStatus } from "@docmost/editor-ext";
import { useTranslation } from "react-i18next";
import classes from "./decision-view.module.css";

export default function DecisionView(props: NodeViewProps) {
  const { node, updateAttributes, editor } = props;
  const { t } = useTranslation();
  const status = (node.attrs.status || "undecided") as DecisionStatus;
  const isDecided = status === "decided";
  const editable = editor?.isEditable ?? false;

  /**
   * Toggles the decision between undecided and decided.
   *
   * @returns void
   */
  const toggleStatus = () => {
    if (!editable) {
      return;
    }
    updateAttributes({
      status: isDecided ? "undecided" : "decided",
    });
  };

  return (
    <NodeViewWrapper>
      <Paper
        withBorder
        p="xs"
        radius="sm"
        className={isDecided ? classes.decided : classes.undecided}
      >
        <Group gap="xs" align="flex-start" wrap="nowrap">
          <Tooltip
            label={t(isDecided ? "Mark as undecided" : "Mark as decided")}
          >
            <ActionIcon
              variant="subtle"
              color={isDecided ? "green" : "gray"}
              onClick={toggleStatus}
              disabled={!editable}
              aria-label={t(isDecided ? "Decided" : "Needs decision")}
              className={classes.statusButton}
            >
              {isDecided ? (
                <IconCircleCheck size={20} />
              ) : (
                <IconCircleDashed size={20} />
              )}
            </ActionIcon>
          </Tooltip>
          <div className={classes.body}>
            <Text size="xs" c="dimmed" mb={4} className={classes.label}>
              {t(isDecided ? "Decided" : "Needs decision")}
            </Text>
            <NodeViewContent className={classes.content} />
          </div>
        </Group>
      </Paper>
    </NodeViewWrapper>
  );
}
