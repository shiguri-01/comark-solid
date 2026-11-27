import { render, screen } from "@solidjs/testing-library";
import type { JSX } from "@solidjs/web";
import { parseMarkdown, type MarkdownDocument, type NodeTransform } from "comark";
import { Markdown } from "comark-solid";
import { createSignal, flush, Loading } from "solid-js";
import { expect, it, vi } from "vite-plus/test";

it("renders Markdown and passes div props to its wrapper", async () => {
  const source = [
    "# Title",
    "A **bold** [link](https://example.com).",
    "- One\n- Two",
    "> Quote",
    "```js\nconst x = 1;\n```",
  ].join("\n\n");
  const { container } = render(() => (
    <Loading fallback={<p>Parsing</p>}>
      <Markdown value={source} id="article" class="prose" />
    </Loading>
  ));

  await screen.findByRole("heading", { name: "Title" });
  expect(container.firstElementChild?.outerHTML).toMatchInlineSnapshot(
    `"<div class="comark-content prose" id="article"><h1 id="title">Title</h1><p>A <strong>bold</strong> <a href="https://example.com">link</a>.</p><ul><li>One</li><li>Two</li></ul><blockquote>Quote</blockquote><pre data-language="js"><code class="language-js">const x = 1;</code></pre></div>"`,
  );
});

it("passes render transforms and components through the string entry point", async () => {
  const transformNode: NodeTransform = ({ tag }) => (tag === "h1" ? { tag: "h2" } : undefined);
  const { container } = render(() => (
    <Loading fallback={null}>
      <Markdown
        value="# Title"
        transformNode={transformNode}
        components={{
          h2: (props: { children?: JSX.Element }) => <h2 class="custom">{props.children}</h2>,
        }}
      />
    </Loading>
  ));

  await screen.findByRole("heading", { name: "Title", level: 2 });
  expect(container.firstElementChild?.outerHTML).toMatchInlineSnapshot(
    `"<div class="comark-content"><h2 class="custom">Title</h2></div>"`,
  );
});

it("updates the rendered Markdown as source and parser options change", async () => {
  const document = await parseMarkdown("# Parsed");
  const [source, setSource] = createSignal<string | MarkdownDocument>("# Before");
  const [headingIds, setHeadingIds] = createSignal(true);
  const { container } = render(() => (
    <Loading fallback={null}>
      <Markdown value={source()} options={{ headingIds: headingIds() }} />
    </Loading>
  ));

  const heading = await screen.findByRole("heading", { name: "Before" });
  expect(heading.id).toBe("before");

  setHeadingIds(false);
  await vi.waitFor(() => expect(screen.getByRole("heading", { name: "Before" }).id).toBe(""));

  setSource(document);
  await screen.findByRole("heading", { name: "Parsed" });

  setHeadingIds(true);
  flush();
  setSource("# After");
  expect(await screen.findByRole("heading", { name: "After" })).toHaveAttribute("id", "after");
  expect(container.firstElementChild?.outerHTML).toMatchInlineSnapshot(
    `"<div class="comark-content"><h1 id="after">After</h1></div>"`,
  );
});

it("renders a parsed document synchronously with runtime data and without initializing the parser", async () => {
  const document = await parseMarkdown(':badge{:name="data.name"}');
  const initializeTokenizer = vi.fn();
  const { container } = render(() => (
    <Markdown
      value={document}
      options={{ plugins: [{ name: "observe-parser", markdownItPlugins: [initializeTokenizer] }] }}
      data={{ name: "Ada" }}
      components={{ Badge: (props: { name: string }) => <strong>{props.name}</strong> }}
    />
  ));

  expect(container.firstElementChild?.outerHTML).toMatchInlineSnapshot(
    `"<div class="comark-content"><strong>Ada</strong></div>"`,
  );
  expect(initializeTokenizer).not.toHaveBeenCalled();
});

it("keeps a shared AST block mounted for a parsed-document append in streaming mode", async () => {
  const initial = await parseMarkdown("Stable paragraph");
  const appended = await parseMarkdown("Appended paragraph");
  const [document, setDocument] = createSignal(initial);
  const { container } = render(() => <Markdown value={document()} streaming />);

  const stable = screen.getByText("Stable paragraph");
  setDocument({ ...initial, nodes: [...initial.nodes, ...appended.nodes] });
  flush();

  expect(screen.getByText("Stable paragraph")).toBe(stable);
  expect(container.firstElementChild?.outerHTML).toMatchInlineSnapshot(
    `"<div class="comark-content"><p>Stable paragraph</p><p>Appended paragraph</p></div>"`,
  );
});

it("keeps a completed paragraph mounted while appending to this Markdown stream", async () => {
  const [source, setSource] = createSignal("First paragraph\n\nSecond");
  const { container } = render(() => (
    <Loading fallback={null}>
      <Markdown value={source()} streaming />
    </Loading>
  ));

  const first = await screen.findByText("First paragraph");
  setSource("First paragraph\n\nSecond paragraph");
  await screen.findByText("Second paragraph");
  expect(screen.getByText("First paragraph")).toBe(first);

  setSource("First paragraph\n\nSecond paragraph\n\nThird paragraph");
  await screen.findByText("Third paragraph");
  expect(screen.getByText("First paragraph")).toBe(first);
  expect(container.firstElementChild?.outerHTML).toMatchInlineSnapshot(
    `"<div class="comark-content"><p>First paragraph</p><p>Second paragraph</p><p>Third paragraph</p></div>"`,
  );
});

it("renders the full-document result when streaming ends", async () => {
  const source = "# Example\n\n```";
  const [streaming, setStreaming] = createSignal(true);
  const { container } = render(() => (
    <Loading fallback={null}>
      <Markdown value={source} streaming={streaming()} />
    </Loading>
  ));
  await screen.findByRole("heading", { name: "Example" });
  expect(container.querySelector("pre")).toBeNull();

  const document = await parseMarkdown(source);
  const { container: full } = render(() => <Markdown value={document} />);
  expect(full.querySelector("pre code")).toBeInTheDocument();
  setStreaming(false);
  await vi.waitFor(() => expect(container.innerHTML).toBe(full.innerHTML));
});

it("renders only the latest input after an in-flight parse is released", async () => {
  let release!: () => void;
  let started!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const parsing = new Promise<void>((resolve) => {
    started = resolve;
  });
  const [source, setSource] = createSignal("Initial");
  const { container } = render(() => (
    <Loading fallback={<p>Parsing</p>}>
      <Markdown
        value={source()}
        streaming
        options={{
          plugins: [
            {
              name: "delayed-parse",
              pre: async () => {
                started();
                await pending;
              },
            },
          ],
        }}
      />
    </Loading>
  ));

  try {
    await parsing;
    expect(screen.getByText("Parsing")).toBeInTheDocument();
    setSource("Initial and intermediate");
    flush();
    setSource("Initial and latest");
    flush();
  } finally {
    release();
  }

  await screen.findByText("Initial and latest");
  expect(container.innerHTML).toMatchInlineSnapshot(
    `"<div class="comark-content"><p>Initial and latest</p></div>"`,
  );
});
