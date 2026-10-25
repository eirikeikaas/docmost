import { describe, expect, it } from "vitest";
import {
  isCompleteFilter,
  newFilter,
  OPERATORS_BY_TYPE,
  retargetFilter,
} from "./filter.utils";
import { IItemProperty } from "@/features/collection/types/collection.types";

const property = (type: IItemProperty["type"], id = "p"): IItemProperty => ({
  id,
  collectionId: "c",
  name: id,
  type,
  config: {},
  position: "a0",
});

describe("filter utils", () => {
  it("starts a checkbox filter with a value so it is immediately applicable", () => {
    expect(newFilter(property("checkbox"))).toEqual({
      propertyId: "p",
      op: "is",
      value: true,
    });
  });

  it("treats value-less operators as complete and empty values as incomplete", () => {
    expect(isCompleteFilter({ propertyId: "p", op: "is_empty" })).toBe(true);
    expect(isCompleteFilter({ propertyId: "p", op: "is", value: "" })).toBe(false);
    expect(isCompleteFilter({ propertyId: "p", op: "is", value: 0 })).toBe(true);
    expect(isCompleteFilter({ propertyId: "p", op: "is" })).toBe(false);
  });

  it("resets operator and value when the property changes", () => {
    const next = retargetFilter(
      { propertyId: "a", op: "gt", value: 3 },
      property("select", "b"),
    );
    expect(next).toEqual({ propertyId: "b", op: "is" });
  });

  it("only offers operators the server accepts for each type", () => {
    // multi-select has no equality operators on the server
    expect(OPERATORS_BY_TYPE.multi_select).not.toContain("is");
    expect(OPERATORS_BY_TYPE.checkbox).toEqual(["is"]);
  });
});
