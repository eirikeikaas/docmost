import { describe, expect, it } from "vitest";
import {
  applyMove,
  applyProps,
  columnValue,
  dropNeighbours,
  groupItemsByOption,
  NO_VALUE_COLUMN,
} from "./board.utils";
import {
  IItem,
  IItemProperty,
} from "@/features/collection/types/collection.types";

const status: IItemProperty = {
  id: "status",
  collectionId: "c",
  name: "Status",
  type: "select",
  position: "a0",
  config: {
    options: [
      { id: "todo", name: "Todo" },
      { id: "done", name: "Done" },
    ],
  },
};

const item = (id: string, value?: string): IItem => ({
  id,
  collectionId: "c",
  pageId: null,
  title: id,
  props: value ? { status: value } : {},
  position: id,
  createdAt: "",
  updatedAt: "",
});

describe("groupItemsByOption", () => {
  it("makes a column per option plus a trailing no-value column", () => {
    const columns = groupItemsByOption(
      [item("a", "todo"), item("b"), item("c", "done"), item("d", "todo")],
      status,
    );
    expect(columns.map((c) => c.id)).toEqual(["todo", "done", NO_VALUE_COLUMN]);
    expect(columns[0].items.map((i) => i.id)).toEqual(["a", "d"]);
    expect(columns[2].items.map((i) => i.id)).toEqual(["b"]);
  });

  it("puts items with an unknown option into the no-value column", () => {
    const columns = groupItemsByOption([item("a", "deleted-option")], status);
    expect(columns[2].items).toHaveLength(1);
  });
});

describe("dropNeighbours", () => {
  const column = [item("a"), item("b"), item("c")];

  it("handles top, middle, bottom and empty columns", () => {
    expect(dropNeighbours(column, 0, "x")).toEqual({ beforeItemId: "a" });
    expect(dropNeighbours(column, 1, "x")).toEqual({
      afterItemId: "a",
      beforeItemId: "b",
    });
    expect(dropNeighbours(column, 3, "x")).toEqual({ afterItemId: "c" });
    expect(dropNeighbours([], 0, "x")).toEqual({});
  });

  it("ignores the moving card within its own column", () => {
    // dragging "a" to index 2 of [a,b,c] lands after "c"
    expect(dropNeighbours(column, 2, "a")).toEqual({ afterItemId: "c" });
    // dragging "c" to index 0 lands before "a"
    expect(dropNeighbours(column, 0, "c")).toEqual({ beforeItemId: "a" });
  });
});

describe("applyMove / applyProps", () => {
  const items = [item("a", "todo"), item("b", "todo"), item("c", "done")];

  it("reorders next to the neighbour and changes the group value", () => {
    const moved = applyMove(items, "a", { afterItemId: "c" }, { status: "done" });
    expect(moved.map((i) => i.id)).toEqual(["b", "c", "a"]);
    expect(moved[2].props.status).toBe("done");
  });

  it("moves before a neighbour and clears values with null", () => {
    const moved = applyMove(items, "c", { beforeItemId: "a" }, {
      status: columnValue(NO_VALUE_COLUMN),
    });
    expect(moved.map((i) => i.id)).toEqual(["c", "a", "b"]);
    expect(moved[0].props.status).toBeUndefined();
  });

  it("does not mutate its input", () => {
    applyMove(items, "a", { afterItemId: "c" }, { status: "done" });
    expect(items[0].props.status).toBe("todo");
  });

  it("applyProps removes null values", () => {
    expect(applyProps(item("a", "todo"), { status: null }).props).toEqual({});
  });
});
