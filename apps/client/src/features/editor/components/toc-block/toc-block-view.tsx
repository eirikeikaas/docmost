import { NodeViewProps, NodeViewWrapper } from "@tiptap/react";
import { Anchor, Stack, Text } from "@mantine/core";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Editor } from "@tiptap/core";
import classes from "./toc-block.module.css";

type TocItem = { text: string; level: number; pos: number };

function collectHeadings(editor: Editor): TocItem[] {
  const items: TocItem[] = [];
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === "heading" && node.textContent.trim()) {
      items.push({ text: node.textContent, level: node.attrs.level, pos });
    }
  });
  return items;
}

export default function TocBlockView(props: NodeViewProps) {
  const { editor } = props;
  const { t } = useTranslation();
  const [items, setItems] = useState<TocItem[]>(() => collectHeadings(editor));

  useEffect(() => {
    const update = () => setItems(collectHeadings(editor));
    editor.on("update", update);
    update();
    return () => {
      editor.off("update", update);
    };
  }, [editor]);

  const scrollTo = (pos: number) => {
    const dom = editor.view.nodeDOM(pos);
    if (dom instanceof HTMLElement) {
      dom.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const minLevel = items.length ? Math.min(...items.map((i) => i.level)) : 1;

  return (
    <NodeViewWrapper data-drag-handle>
      <div className={classes.container} contentEditable={false}>
        {items.length === 0 ? (
          <Text c="dimmed" size="md" py="md">
            {t("Add headings to generate a table of contents")}
          </Text>
        ) : (
          <Stack gap={4}>
            {items.map((item) => (
              <Anchor
                key={item.pos}
                component="button"
                type="button"
                size="sm"
                underline="hover"
                className={classes.link}
                style={{ paddingLeft: (item.level - minLevel) * 16 }}
                onClick={() => scrollTo(item.pos)}
              >
                {item.text}
              </Anchor>
            ))}
          </Stack>
        )}
      </div>
    </NodeViewWrapper>
  );
}
