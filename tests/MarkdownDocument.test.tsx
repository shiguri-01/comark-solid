import { render, screen } from "@solidjs/testing-library";
import type { JSX } from "@solidjs/web";
import { parseMarkdown, type MarkdownDocument as Document } from "comark";
import { MarkdownDocument } from "comark-solid";
import { createSignal, flush, lazy, Loading } from "solid-js";
import { expect, it } from "vite-plus/test";

function documentWith(...nodes: Document["nodes"]): Document {
  return { nodes, frontmatter: {}, meta: {} };
}

it("renders an empty document and updates wrapper props", () => {
  const [className, setClassName] = createSignal("  prose  ");
  const [title, setTitle] = createSignal("Before");
  const document = documentWith();
  const { container } = render(() => (
    <MarkdownDocument value={document} class={className()} title={title()} />
  ));

  expect(container.firstElementChild?.outerHTML).toMatchInlineSnapshot(
    `"<div class="comark-content prose" title="Before"></div>"`,
  );

  setClassName("compact");
  setTitle("After");
  flush();
  expect(container.firstElementChild?.outerHTML).toMatchInlineSnapshot(
    `"<div class="comark-content compact" title="After"></div>"`,
  );
});

it("renders ordinary AST nodes and omits comments", () => {
  const document = documentWith(
    [null, {}, "Hidden comment"],
    [
      "p",
      {},
      "Read ",
      ["a", { href: "/guide", target: "_blank", rel: "noreferrer" }, "the guide"],
      ".",
    ],
    [
      "table",
      {},
      ["thead", {}, ["tr", {}, ["th", {}, "Name"]]],
      ["tbody", {}, ["tr", {}, ["td", {}, "Ada"]]],
    ],
    ["p", {}, "Above", ["br", {}], "Below", ["img", { src: "/ada.png", alt: "Ada" }]],
    ["hr", {}],
  );
  const { container } = render(() => <MarkdownDocument value={document} />);

  expect(container.firstElementChild?.outerHTML).toMatchInlineSnapshot(
    `"<div class="comark-content"><p>Read <a href="/guide" target="_blank" rel="noreferrer">the guide</a>.</p><table><thead><tr><th>Name</th></tr></thead><tbody><tr><td>Ada</td></tr></tbody></table><p>Above<br>Below<img src="/ada.png" alt="Ada"></p><hr></div>"`,
  );
});

it("renders fenced metadata and authored pre attributes without exposing AST metadata", async () => {
  const document = await parseMarkdown(
    '```js [demo.js] {1,3}\n  const x = 1;\n```\n\n<pre language="authored">raw</pre>',
  );
  const { container } = render(() => <MarkdownDocument value={document} />);

  expect(container.firstElementChild?.outerHTML).toMatchInlineSnapshot(
    `"<div class="comark-content"><pre data-language="js" data-filename="demo.js" data-highlights="[1,3]"><code class="language-js">  const x = 1;</code></pre><pre language="authored">raw</pre></div>"`,
  );
});

it("selects ProsePre before Pre or pre and keeps nested code native", async () => {
  const document = await parseMarkdown("Inline `sample`.\n\n```js [demo.js] {1,3}\ncode\n```");
  const { container } = render(() => (
    <MarkdownDocument
      value={document}
      components={{
        ProsePre: (props) => (
          <pre data-language={props.language} data-highlights={props.highlights.join(",")}>
            {props.children}
          </pre>
        ),
        Pre: () => "Pre",
        pre: () => "pre",
        Code: (props) => <kbd>{props.children}</kbd>,
      }}
    />
  ));

  expect(container.firstElementChild?.outerHTML).toMatchInlineSnapshot(
    `"<div class="comark-content"><p>Inline <kbd>sample</kbd>.</p><pre data-language="js" data-highlights="1,3"><code class="language-js">code</code></pre></div>"`,
  );
});

it("keeps code in a custom pre default slot native", () => {
  const document = documentWith([
    "pre",
    {},
    ["template", { name: "default" }, ["code", {}, "Slot code"]],
  ]);
  const { container } = render(() => (
    <MarkdownDocument
      value={document}
      components={{
        Pre: (props: { children?: JSX.Element }) => <pre>{props.children}</pre>,
        Code: () => <kbd>Replacement</kbd>,
      }}
    />
  ));

  expect(container.firstElementChild?.outerHTML).toMatchInlineSnapshot(
    `"<div class="comark-content"><pre><code>Slot code</code></pre></div>"`,
  );
});

it("keeps elements nested deeper than a direct child of pre native", () => {
  const document = documentWith(["pre", {}, ["code", {}, ["span", {}, "hi"]]]);
  const { container } = render(() => (
    <MarkdownDocument
      value={document}
      components={{
        Span: (props: { children?: JSX.Element }) => <mark>{props.children}</mark>,
      }}
    />
  ));

  expect(container.firstElementChild?.outerHTML).toMatchInlineSnapshot(
    `"<div class="comark-content"><pre><code><span>hi</span></code></pre></div>"`,
  );
});

it("keeps markdown nested inside an inline pre native", async () => {
  const document = await parseMarkdown("Use <pre>**a `x` b**</pre> inline\n");
  const { container } = render(() => (
    <MarkdownDocument
      value={document}
      components={{
        Code: (props: { children?: JSX.Element }) => <kbd>{props.children}</kbd>,
      }}
    />
  ));

  expect(container.firstElementChild?.outerHTML).toMatchInlineSnapshot(
    `"<div class="comark-content"><p>Use <pre><strong>a <code>x</code> b</strong></pre> inline</p></div>"`,
  );
});

it("uses an as attribute to select a PascalCase component", async () => {
  const document = await parseMarkdown("> [!NOTE]\n> Hello");
  const { container } = render(() => (
    <MarkdownDocument
      value={document}
      components={{ Note: (props) => <aside>{props.children}</aside> }}
    />
  ));

  expect(container.firstElementChild?.outerHTML).toMatchInlineSnapshot(
    `"<div class="comark-content"><aside>Hello</aside></div>"`,
  );
});

it("renders named and default slots and prefers ordinary children over an explicit default", () => {
  const Card = (props: { slotHeader?: JSX.Element; children?: JSX.Element }) => (
    <article>
      <header>{props.slotHeader}</header>
      <main>{props.children}</main>
    </article>
  );
  const document = documentWith(
    [
      "card",
      {},
      ["template", { "#header": "" }, "First"],
      ["template", { name: "default" }, "Explicit"],
    ],
    [
      "card",
      {},
      ["template", { name: "header" }, "Second"],
      ["template", { "#default": "" }, "Overridden"],
      ["p", {}, "Ordinary"],
    ],
    ["section", {}, ["template", { name: "header" }, "Omitted"], "Native"],
  );
  const { container } = render(() => <MarkdownDocument value={document} components={{ Card }} />);

  expect(container.firstElementChild?.outerHTML).toMatchInlineSnapshot(
    `"<div class="comark-content"><article><header>First</header><main>Explicit</main></article><article><header>Second</header><main><p>Ordinary</p></main></article><section>Native</section></div>"`,
  );
});

it("renders unnamed templates as ordinary children", () => {
  const document = documentWith([
    "card",
    {},
    ["template", {}, "Unnamed"],
    ["template", { name: " " }, "Blank"],
  ]);
  const { container } = render(() => (
    <MarkdownDocument
      value={document}
      components={{ Card: (props) => <article>{props.children}</article> }}
    />
  ));

  expect(container.querySelector("article")?.innerHTML).toMatchInlineSnapshot(
    `"<template></template><template name=" "></template>"`,
  );
});

it("passes literal strings and typed bindings to components", async () => {
  const document = await parseMarkdown(
    ':probe{count="42" :number="42" :active="false" :items=\'[1,2]\' :name="data.name"}',
  );
  const { container } = render(() => (
    <MarkdownDocument
      value={document}
      data={{ name: "Ada" }}
      components={{
        Probe: (props) => (
          <output>
            {JSON.stringify({
              count: props.count,
              number: props.number,
              active: props.active,
              items: props.items,
              name: props.name,
            })}
          </output>
        ),
      }}
    />
  ));

  expect(container.querySelector("output")?.textContent).toMatchInlineSnapshot(
    `"{"count":"42","number":42,"active":false,"items":[1,2],"name":"Ada"}"`,
  );
});

it("applies transforms in order before component selection and scopes props to descendants", () => {
  const document = documentWith(
    ["badge", {}, ["span", { ":title": "props.tone" }, "Child"]],
    [
      "div",
      { title: "outer" },
      ["section", { innerHTML: "ignored" }, ["span", { ":title": "props.title" }, "Nested"]],
    ],
    ["pre", { language: "js" }, ["code", { ":title": "props.language" }, "Code"]],
  );
  const { container } = render(() => (
    <MarkdownDocument
      value={document}
      components={{ Pill: (props) => <aside data-tone={props.tone}>{props.children}</aside> }}
      transformNode={[
        ({ tag }) => (tag === "badge" ? { tag: "pill" } : undefined),
        ({ tag, props }) => (tag === "pill" ? { props: { ...props, tone: "info" } } : undefined),
      ]}
    />
  ));

  expect(container.firstElementChild?.outerHTML).toMatchInlineSnapshot(
    `"<div class="comark-content"><aside data-tone="info"><span title="info">Child</span></aside><div title="outer"><section><span>Nested</span></section></div><pre data-language="js"><code title="js">Code</code></pre></div>"`,
  );
});

it("omits children when a transform produces a native void element", () => {
  const { container } = render(() => (
    <MarkdownDocument
      value={documentWith(["p", {}, "AST child"])}
      transformNode={() => ({
        tag: "input",
        props: { placeholder: "Value", children: "Prop child" },
      })}
    />
  ));

  expect(container.firstElementChild?.outerHTML).toMatchInlineSnapshot(
    `"<div class="comark-content"><input placeholder="Value"></div>"`,
  );
  expect(container.textContent).toBe("");
});

it.each([false, true])("updates nested runtime bindings with streaming=%s", (streaming) => {
  const document = documentWith(["p", {}, ["span", { ":title": "data.title" }, "Paragraph"]]);
  const [data, setData] = createSignal({ title: "Before" });
  const { container } = render(() => (
    <MarkdownDocument value={document} data={data()} streaming={streaming} />
  ));

  expect(container.querySelector("span")?.getAttribute("title")).toBe("Before");
  setData({ title: "After" });
  flush();
  expect(container.querySelector("span")?.getAttribute("title")).toBe("After");
});

it("renders updates across streaming mode changes", () => {
  const shared = documentWith(["p", {}, "Retained"]);
  const [document, setDocument] = createSignal(shared);
  const [streaming, setStreaming] = createSignal(false);
  const { container } = render(() => (
    <MarkdownDocument value={document()} streaming={streaming()} />
  ));

  setStreaming(true);
  flush();
  setDocument(documentWith(...shared.nodes, ["p", {}, "Streaming"]));
  flush();
  expect(container.firstElementChild?.outerHTML).toMatchInlineSnapshot(
    `"<div class="comark-content"><p>Retained</p><p>Streaming</p></div>"`,
  );

  setStreaming(false);
  flush();
  setDocument(documentWith(...shared.nodes, ["p", {}, "Final"]));
  flush();
  expect(container.firstElementChild?.outerHTML).toMatchInlineSnapshot(
    `"<div class="comark-content"><p>Retained</p><p>Final</p></div>"`,
  );
});

it("shows the outer fallback while a lazy component loads", async () => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const Card = lazy(async () => {
    await pending;
    return { default: (props: { children?: JSX.Element }) => <article>{props.children}</article> };
  });
  const document = documentWith(["p", {}, "Ready"], ["card", {}, "Loaded"]);
  const { container } = render(() => (
    <Loading fallback={<p>Outer fallback</p>}>
      <MarkdownDocument value={document} components={{ Card }} />
    </Loading>
  ));

  try {
    expect(container.firstElementChild?.outerHTML).toMatchInlineSnapshot(`"<p>Outer fallback</p>"`);
  } finally {
    release();
  }

  await screen.findByRole("article");
  expect(container.firstElementChild?.outerHTML).toMatchInlineSnapshot(
    `"<div class="comark-content"><p>Ready</p><article>Loaded</article></div>"`,
  );
});
