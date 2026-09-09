import { describe, expect, it } from "vite-plus/test";

import * as ComarkSolid from "../src/index";

describe("comark-solid exports", () => {
  it("exports Markdown and MarkdownDocument components", () => {
    expect(ComarkSolid.Markdown).toBeDefined();
    expect(typeof ComarkSolid.Markdown).toBe("function");

    expect(ComarkSolid.MarkdownDocument).toBeDefined();
    expect(typeof ComarkSolid.MarkdownDocument).toBe("function");
  });
});
