import { isServer, renderToStream, renderToString } from "@solidjs/web";
import { parseMarkdown } from "comark";
import { Markdown, MarkdownDocument } from "comark-solid";
import { Loading } from "solid-js";
import { expect, it } from "vite-plus/test";

it("renders a parsed document through the package's Solid export", async () => {
  expect(isServer).toBe(true);
  const document = await parseMarkdown("# Parsed title\n\nBody with **bold** text.");

  const html = renderToString(() => <MarkdownDocument value={document} />);

  expect(html).toContain('class="comark-content"');
  expect(html).toMatch(/<h1\b[^>]*>Parsed title<\/h1>/);
  expect(html).toMatch(/<strong\b[^>]*>bold<\/strong>/);
});

it("parses Markdown and renders the resolved HTML on the server", async () => {
  const html = await renderToStream(() => (
    <Loading fallback={null}>
      <Markdown value="# Streamed title" />
    </Loading>
  ));

  expect(html).toMatch(/<h1\b[^>]*>Streamed title<\/h1>/);
});
