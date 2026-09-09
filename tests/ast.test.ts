import type { Node } from "comark";
import { describe, expect, it } from "vite-plus/test";

import { getAttributes, getChildren, getTag } from "../src/utils/ast";

describe("ast utils", () => {
  describe("getTag", () => {
    it("returns tag name when node is an element array with string tag", () => {
      expect(getTag(["div", {}])).toBe("div");
      expect(getTag(["p", { class: "foo" }, "hello"])).toBe("p");
      expect(getTag(["custom-component", { prop: "value" }])).toBe("custom-component");
    });

    it("returns null for non-element nodes", () => {
      expect(getTag("plain text")).toBeNull();
      expect(getTag([] as unknown as Node)).toBeNull();
      expect(getTag([123, {}] as unknown as Node)).toBeNull();
      expect(getTag(null as unknown as Node)).toBeNull();
      expect(getTag(undefined as unknown as Node)).toBeNull();
      expect(getTag({} as unknown as Node)).toBeNull();
    });
  });

  describe("getAttributes", () => {
    it("returns attributes object when node has attributes", () => {
      expect(getAttributes(["div", { class: "test", id: "1" }])).toEqual({
        class: "test",
        id: "1",
      });
      expect(getAttributes(["a", { href: "https://example.com" }, "link"])).toEqual({
        href: "https://example.com",
      });
    });

    it("returns empty object when node has no attributes or invalid", () => {
      expect(getAttributes("plain text")).toEqual({});
      expect(getAttributes(["div"] as unknown as Node)).toEqual({});
      expect(getAttributes(["div", null as unknown as Record<string, unknown>])).toEqual({});
      expect(getAttributes(null as unknown as Node)).toEqual({});
      expect(getAttributes(undefined as unknown as Node)).toEqual({});
      expect(getAttributes(["div", undefined as unknown as Record<string, unknown>])).toEqual({});
    });
  });

  describe("getChildren", () => {
    it("returns children slice when node has children", () => {
      expect(getChildren(["div", {}, "child1", "child2"])).toEqual(["child1", "child2"]);
      expect(getChildren(["ul", {}, ["li", {}, "item1"]])).toEqual([["li", {}, "item1"]]);
      expect(getChildren(["p", {}, "text", ["strong", {}, "bold"]])).toEqual([
        "text",
        ["strong", {}, "bold"],
      ]);
    });

    it("returns empty array when node has no children", () => {
      expect(getChildren(["div", {}])).toEqual([]);
      expect(getChildren(["div"] as unknown as Node)).toEqual([]);
      expect(getChildren("plain text")).toEqual([]);
      expect(getChildren(null as unknown as Node)).toEqual([]);
      expect(getChildren(undefined as unknown as Node)).toEqual([]);
    });
  });
});
