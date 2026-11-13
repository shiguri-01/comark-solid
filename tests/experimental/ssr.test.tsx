// @vitest-environment node
import { renderToStream, renderToString } from "@solidjs/web";
import { Loading } from "solid-js";
import { describe, expect, it } from "vite-plus/test";

import { Markdown } from "../../src/components/Markdown";
import { MarkdownAuto } from "../../src/experimental/MarkdownAuto";
import { MarkdownAutoMemo } from "../../src/experimental/MarkdownAutoMemo";

const VALUE = "# Server Title\n\nBody text";

describe("SSR (node environment)", () => {
  it("renderToString: async-memo components emit the Loading fallback shell", () => {
    const current = renderToString(() => (
      <Loading fallback={<p>loading</p>}>
        <Markdown value={VALUE} />
      </Loading>
    ));
    const memo = renderToString(() => (
      <Loading fallback={<p>loading</p>}>
        <MarkdownAutoMemo value={VALUE} />
      </Loading>
    ));
    const effect = renderToString(() => (
      <Loading fallback={<p>loading</p>}>
        <MarkdownAuto value={VALUE} />
      </Loading>
    ));
    console.log("[ssr] renderToString Markdown:", current.slice(0, 80));
    console.log("[ssr] renderToString MarkdownAutoMemo:", memo.slice(0, 80));
    console.log("[ssr] renderToString MarkdownAuto (effect):", JSON.stringify(effect.slice(0, 80)));
    expect(current).toContain("loading");
    expect(memo).toContain("loading");
    expect(effect).not.toContain("Server Title");
  });

  it("renderToStream (awaited): async-memo variants render full HTML; the effect variant renders nothing", async () => {
    const current = await renderToStream(() => (
      <Loading fallback={<p>loading</p>}>
        <Markdown value={VALUE} />
      </Loading>
    ));
    const memo = await renderToStream(() => (
      <Loading fallback={<p>loading</p>}>
        <MarkdownAutoMemo value={VALUE} />
      </Loading>
    ));
    const effect = await renderToStream(() => (
      <Loading fallback={<p>loading</p>}>
        <MarkdownAuto value={VALUE} />
      </Loading>
    ));
    console.log("[ssr] stream Markdown has title:", current.includes("Server Title"));
    console.log("[ssr] stream MarkdownAutoMemo has title:", memo.includes("Server Title"));
    console.log("[ssr] stream MarkdownAuto (effect) html:", JSON.stringify(effect.slice(0, 120)));
    expect(current).toContain("Server Title");
    expect(current).toContain("Body text");
    expect(memo).toContain("Server Title");
    expect(memo).toContain("Body text");
    // Effects do not run during server rendering: the effect+signal variant
    // has no document on the server and emits no content (hydration would
    // have to parse from scratch on the client).
    expect(effect).not.toContain("Server Title");
  });
});
