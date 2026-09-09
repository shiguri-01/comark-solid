import { render, screen } from "@solidjs/testing-library";
import type { JSX } from "@solidjs/web";
import { parseMarkdown } from "comark";
import { createSignal, flush, lazy, Loading, type Component } from "solid-js";
import { describe, expect, it } from "vite-plus/test";

import { Markdown } from "../src/components/Markdown";

describe("Markdown component", () => {
  describe("String input and parsing", () => {
    it("parses and renders markdown string with Loading boundary", async () => {
      render(() => (
        <Loading fallback={<div class="loading">Loading...</div>}>
          <Markdown value={"# Title\n\nThis is a paragraph with **bold** text."} />
        </Loading>
      ));

      const heading = await screen.findByRole("heading", { level: 1 });
      expect(heading).toHaveTextContent("Title");

      expect(screen.getByText("bold")).toBeInTheDocument();
      expect(screen.getByText("bold").tagName.toLowerCase()).toBe("strong");
    });

    it("renders lists, blockquotes, and code blocks", async () => {
      const markdown = `
- Item 1
- Item 2

> Quote block

\`\`\`js
const x = 1;
\`\`\`
`;
      const { container } = render(() => (
        <Loading fallback={<div>Loading...</div>}>
          <Markdown value={markdown} />
        </Loading>
      ));

      const items = await screen.findAllByRole("listitem");
      expect(items).toHaveLength(2);
      expect(items[0]).toHaveTextContent("Item 1");
      expect(items[1]).toHaveTextContent("Item 2");

      expect(container.querySelector("blockquote")).toHaveTextContent("Quote block");
      expect(container.querySelector("pre code")).toHaveTextContent("const x = 1;");
    });
  });

  describe("Pre-parsed MarkdownDocument input", () => {
    it("renders pre-parsed MarkdownDocument synchronously without re-parsing", async () => {
      const parsedDoc = await parseMarkdown("# Pre-parsed Heading\n\nParagraph text.");

      render(() => <Markdown value={parsedDoc} />);

      const h1 = screen.getByRole("heading", { level: 1 });
      expect(h1).toHaveTextContent("Pre-parsed Heading");
      expect(screen.getByText("Paragraph text.")).toBeInTheDocument();
    });
  });

  describe("ParserOptions passing", () => {
    it("applies parser options when parsing string markdown", async () => {
      let pluginCalled = false;
      const testPlugin = () => ({
        name: "test-plugin",
        markdownItPlugins: [
          () => {
            pluginCalled = true;
          },
        ],
      });

      render(() => (
        <Loading fallback={<div>Loading...</div>}>
          <Markdown value="Hello" options={{ plugins: [testPlugin()] }} />
        </Loading>
      ));

      await screen.findByText("Hello");
      expect(pluginCalled).toBe(true);
    });
  });

  describe("Props forwarding to MarkdownDocument", () => {
    it("forwards components prop to MarkdownDocument", async () => {
      const CustomHeading: Component<{ children?: JSX.Element }> = (props) => (
        <h1 class="custom-title">{props.children}</h1>
      );

      render(() => (
        <Loading fallback={<div>Loading...</div>}>
          <Markdown value="# Custom H1" components={{ h1: CustomHeading }} />
        </Loading>
      ));

      const heading = await screen.findByRole("heading", { level: 1 });
      expect(heading).toHaveClass("custom-title");
      expect(heading).toHaveTextContent("Custom H1");
    });

    it("forwards class prop to wrapper element", async () => {
      const { container } = render(() => (
        <Loading fallback={<div>Loading...</div>}>
          <Markdown value="Simple text" class="theme-dark padded" />
        </Loading>
      ));

      await screen.findByText("Simple text");
      expect(container.firstElementChild).toHaveClass("comark-content", "theme-dark", "padded");
    });

    it("forwards data prop for attribute binding", async () => {
      const doc = await parseMarkdown(":user-badge");
      doc.nodes = [["user-badge", { ":name": "data.user.name" }]];

      const UserBadge: Component<{ name?: string }> = (props) => (
        <span class="user-badge" data-testid="badge">
          {props.name}
        </span>
      );

      render(() => (
        <Markdown
          value={doc}
          data={{ user: { name: "Bob" } }}
          components={{ "user-badge": UserBadge }}
        />
      ));

      const badge = screen.getByTestId("badge");
      expect(badge).toHaveTextContent("Bob");
    });

    it("forwards lazy() components prop and renders asynchronously", async () => {
      const LazyAlert = lazy(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        const Component: Component<{ children?: JSX.Element }> = (props) => (
          <div role="alert" class="lazy-alert">
            {props.children}
          </div>
        );
        return { default: Component };
      });

      const parsedDoc = await parseMarkdown("Alert text");
      parsedDoc.nodes = [["lazy-alert", {}, "Dynamic lazy alert content"]];

      render(() => (
        <Loading fallback={<div>Loading alert...</div>}>
          <Markdown value={parsedDoc} components={{ "lazy-alert": LazyAlert }} />
        </Loading>
      ));

      const alert = await screen.findByRole("alert");
      expect(alert).toHaveClass("lazy-alert");
      expect(alert).toHaveTextContent("Dynamic lazy alert content");
    });
  });

  describe("Reactivity", () => {
    it("updates rendered content when value signal changes", async () => {
      const [source, setSource] = createSignal("# Initial");

      render(() => (
        <Loading fallback={<div>Loading...</div>}>
          <Markdown value={source()} />
        </Loading>
      ));

      const initialHeading = await screen.findByRole("heading", { name: "Initial" });
      expect(initialHeading).toBeInTheDocument();

      setSource("# Updated");

      const updatedHeading = await screen.findByRole("heading", { name: "Updated" });
      expect(updatedHeading).toBeInTheDocument();
    });

    it("updates wrapper class when class signal changes", async () => {
      const [cls, setCls] = createSignal("theme-light");

      const { container } = render(() => (
        <Loading fallback={<div>Loading...</div>}>
          <Markdown value="Text" class={cls()} />
        </Loading>
      ));

      await screen.findByText("Text");
      expect(container.firstElementChild).toHaveClass("comark-content", "theme-light");

      setCls("theme-dark");
      flush();

      expect(container.firstElementChild).toHaveClass("comark-content", "theme-dark");
    });
  });
});
