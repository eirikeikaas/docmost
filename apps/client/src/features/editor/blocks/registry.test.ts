import { Node } from "@tiptap/core";
import { beforeEach, describe, expect, it } from "vitest";
import {
  clearSchemaBlocksForTests,
  getSchemaExtensions,
  registerSchemaBlock,
} from "@docmost/editor-ext";
import {
  clearBlocksForTests,
  getClientExtensions,
  getSlashItems,
  registerBlock,
} from "./registry";

const StubBlock = Node.create({
  name: "stubBlock",
  group: "block",
  atom: true,
  renderHTML() {
    return ["div", { "data-type": "stubBlock" }];
  },
});

const OtherStubBlock = Node.create({
  name: "otherStubBlock",
  group: "block",
  atom: true,
  renderHTML() {
    return ["div", { "data-type": "otherStubBlock" }];
  },
});

describe("block registries", () => {
  beforeEach(() => {
    clearBlocksForTests();
    clearSchemaBlocksForTests();
  });

  it("registers schema blocks and returns them from getSchemaExtensions", () => {
    registerSchemaBlock(StubBlock);

    expect(getSchemaExtensions()).toEqual([StubBlock]);
  });

  it("throws on duplicate schema block names", () => {
    registerSchemaBlock(StubBlock);

    expect(() => registerSchemaBlock(StubBlock)).toThrow(
      /duplicate schema block name "stubBlock"/,
    );
  });

  it("registers client blocks and returns configured extensions", () => {
    const configured = StubBlock.configure({ HTMLAttributes: { class: "x" } });

    registerBlock({
      name: "stubBlock",
      node: StubBlock,
      configureClient: () => configured,
    });

    expect(getClientExtensions()).toEqual([configured]);
  });

  it("returns the bare node when configureClient is omitted", () => {
    registerBlock({
      name: "stubBlock",
      node: StubBlock,
    });

    expect(getClientExtensions()).toEqual([StubBlock]);
  });

  it("throws on duplicate client block names", () => {
    registerBlock({
      name: "stubBlock",
      node: StubBlock,
    });

    expect(() =>
      registerBlock({
        name: "stubBlock",
        node: OtherStubBlock,
      }),
    ).toThrow(/duplicate block name "stubBlock"/);
  });

  it("groups slash menu contributions by category", () => {
    registerBlock({
      name: "stubBlock",
      node: StubBlock,
      slash: {
        group: "basic",
        items: [
          {
            title: "Stub",
            description: "A stub block",
            searchTerms: ["stub"],
            icon: null,
            command: () => undefined,
          },
        ],
      },
    });

    registerBlock({
      name: "otherStubBlock",
      node: OtherStubBlock,
      slash: {
        group: "advanced",
        items: [
          {
            title: "Other stub",
            description: "Another stub block",
            searchTerms: ["other"],
            icon: null,
            command: () => undefined,
          },
        ],
      },
    });

    expect(getSlashItems()).toEqual({
      basic: [
        expect.objectContaining({
          title: "Stub",
          searchTerms: ["stub"],
        }),
      ],
      advanced: [
        expect.objectContaining({
          title: "Other stub",
          searchTerms: ["other"],
        }),
      ],
    });
  });
});
