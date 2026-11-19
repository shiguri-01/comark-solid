import { isServer, renderToStream, renderToString } from "@solidjs/web";
import { parseMarkdown } from "comark";
import { Markdown, MarkdownDocument } from "comark-solid";
import { Loading } from "solid-js";
import { expect, it } from "vite-plus/test";

function withoutHydrationKeys(html: string) {
  return html.replace(/ _hk=\d+/g, "");
}

it("renders a parsed document through the package's Solid export", async () => {
  expect(isServer).toBe(true);
  const document = await parseMarkdown("# Parsed title\n\nBody with **bold** text.");

  const html = renderToString(() => <MarkdownDocument value={document} />);

  expect(withoutHydrationKeys(html)).toMatchInlineSnapshot(
    `"<div class="comark-content"><h1 id="parsed-title">Parsed title</h1><p>Body with <strong>bold</strong> text.</p></div>"`,
  );
});

it("parses Markdown and renders the resolved HTML on the server", async () => {
  const html = await renderToStream(
    () => (
      <Loading fallback={<p>Parsing</p>}>
        <Markdown value="# Streamed title" />
      </Loading>
    ),
    { noScripts: true },
  );

  expect(withoutHydrationKeys(html)).toMatchInlineSnapshot(
    `"<div class="comark-content"><h1 id="streamed-title">Streamed title</h1></div>"`,
  );
});
