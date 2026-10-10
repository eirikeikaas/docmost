import { describe, expect, it } from "vitest";
import { formatRoleMap, parseRoleMapText } from "./role-map";

describe("parseRoleMapText", () => {
  it("parses one pair per line or comma separated", () => {
    expect(
      parseRoleMapText("agents_admin=admin\nagents_manage = member"),
    ).toEqual({ agents_admin: "admin", agents_manage: "member" });
    expect(
      parseRoleMapText("agents_admin=admin, agents_manage=MEMBER,"),
    ).toEqual({ agents_admin: "admin", agents_manage: "member" });
  });

  it("treats blank text as an empty map", () => {
    expect(parseRoleMapText("")).toEqual({});
    expect(parseRoleMapText(" \n ")).toEqual({});
  });

  it("rejects owner, unknown roles and malformed lines", () => {
    expect(parseRoleMapText("x=owner")).toBeNull();
    expect(parseRoleMapText("x=superuser")).toBeNull();
    expect(parseRoleMapText("x")).toBeNull();
    expect(parseRoleMapText("=admin")).toBeNull();
    expect(parseRoleMapText("x=")).toBeNull();
  });
});

describe("formatRoleMap", () => {
  it("round-trips through parseRoleMapText", () => {
    const map = { agents_admin: "admin", agents_manage: "member" } as const;
    expect(parseRoleMapText(formatRoleMap(map))).toEqual(map);
  });

  it("formats nothing as an empty string", () => {
    expect(formatRoleMap(undefined)).toBe("");
    expect(formatRoleMap({})).toBe("");
  });
});
