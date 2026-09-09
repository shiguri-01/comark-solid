import { render, screen } from "@solidjs/testing-library";
import type { JSX } from "@solidjs/web";
import type { MarkdownDocument as MarkdownDocumentType } from "comark";
import { lazy, type Component } from "solid-js";
import { describe, expect, it } from "vite-plus/test";

import { MarkdownDocument } from "../src/components/MarkdownDocument";

function createDoc(nodes: MarkdownDocumentType["nodes"]): MarkdownDocumentType {
  return {
    nodes,
    frontmatter: {},
    meta: {},
  };
}

describe("MarkdownDocument component", () => {
  describe("Wrapper div and class handling", () => {
    it("renders container div with comark-content class by default", () => {
      const doc = createDoc([["p", {}, "Hello"]]);
      const { container } = render(() => <MarkdownDocument value={doc} />);

      const wrapper = container.firstElementChild;
      expect(wrapper).toBeInTheDocument();
      expect(wrapper?.tagName.toLowerCase()).toBe("div");
      expect(wrapper).toHaveClass("comark-content");
    });

    it("appends custom class to comark-content", () => {
      const doc = createDoc([["p", {}, "Hello"]]);
      const { container } = render(() => (
        <MarkdownDocument value={doc} class="prose dark:prose-invert" />
      ));

      const wrapper = container.firstElementChild;
      expect(wrapper).toHaveClass("comark-content", "prose", "dark:prose-invert");
    });

    it("trims whitespace from classes", () => {
      const doc = createDoc([]);
      const { container } = render(() => <MarkdownDocument value={doc} class="  custom-class  " />);

      const wrapper = container.firstElementChild;
      expect(wrapper).toHaveClass("comark-content", "custom-class");
    });
  });

  describe("Native HTML elements rendering", () => {
    it("renders headings, paragraphs, and inline formatting", () => {
      const doc = createDoc([
        ["h1", { id: "title" }, "Heading 1"],
        ["h2", {}, "Heading 2"],
        ["p", {}, "Plain text, ", ["strong", {}, "bold text"], ", and ", ["em", {}, "italic text"]],
      ]);

      render(() => <MarkdownDocument value={doc} />);

      const h1 = screen.getByRole("heading", { level: 1 });
      expect(h1).toHaveTextContent("Heading 1");
      expect(h1).toHaveAttribute("id", "title");

      const h2 = screen.getByRole("heading", { level: 2 });
      expect(h2).toHaveTextContent("Heading 2");

      expect(screen.getByText("bold text")).toBeInTheDocument();
      expect(screen.getByText("bold text").tagName.toLowerCase()).toBe("strong");
      expect(screen.getByText("italic text")).toBeInTheDocument();
      expect(screen.getByText("italic text").tagName.toLowerCase()).toBe("em");
    });

    it("renders links with attributes", () => {
      const doc = createDoc([
        [
          "p",
          {},
          ["a", { href: "https://example.com", target: "_blank", rel: "noreferrer" }, "Link"],
        ],
      ]);

      render(() => <MarkdownDocument value={doc} />);

      const link = screen.getByRole("link", { name: "Link" });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute("href", "https://example.com");
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noreferrer");
    });

    it("renders lists and tables", () => {
      const doc = createDoc([
        ["ul", {}, ["li", {}, "Item 1"], ["li", {}, "Item 2"]],
        [
          "table",
          {},
          ["thead", {}, ["tr", {}, ["th", {}, "Header"]]],
          ["tbody", {}, ["tr", {}, ["td", {}, "Cell"]]],
        ],
      ]);

      render(() => <MarkdownDocument value={doc} />);

      const listItems = screen.getAllByRole("listitem");
      expect(listItems).toHaveLength(2);
      expect(listItems[0]).toHaveTextContent("Item 1");
      expect(listItems[1]).toHaveTextContent("Item 2");

      expect(screen.getByRole("table")).toBeInTheDocument();
      expect(screen.getByRole("columnheader")).toHaveTextContent("Header");
      expect(screen.getByRole("cell")).toHaveTextContent("Cell");
    });
  });

  describe("Void elements handling", () => {
    it("renders hr, br, and img without children", () => {
      const doc = createDoc([
        ["hr", { class: "divider" }],
        ["p", {}, "Line 1", ["br", {}], "Line 2"],
        ["img", { src: "test.png", alt: "Test Image" }],
      ]);

      const { container } = render(() => <MarkdownDocument value={doc} />);

      const hr = container.querySelector("hr");
      expect(hr).toBeInTheDocument();
      expect(hr).toHaveClass("divider");

      const br = container.querySelector("p br");
      expect(br).toBeInTheDocument();

      const img = screen.getByRole("img", { name: "Test Image" });
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute("src", "test.png");
    });
  });

  describe("Custom components", () => {
    it("renders mapped custom components instead of native elements", () => {
      const CustomCard: Component<{ title: string; children?: JSX.Element }> = (props) => (
        <article class="custom-card" aria-label={props.title}>
          <h3>{props.title}</h3>
          <div class="card-body">{props.children}</div>
        </article>
      );

      const doc = createDoc([["custom-card", { title: "Card Title" }, ["p", {}, "Card Content"]]]);

      render(() => <MarkdownDocument value={doc} components={{ "custom-card": CustomCard }} />);

      const card = screen.getByRole("article", { name: "Card Title" });
      expect(card).toBeInTheDocument();
      expect(screen.getByRole("heading", { level: 3 })).toHaveTextContent("Card Title");
      expect(screen.getByText("Card Content")).toBeInTheDocument();
    });

    it("overrides standard tags with custom components", () => {
      const CustomHeading: Component<{ children?: JSX.Element }> = (props) => (
        <h1 class="custom-h1">-- {props.children} --</h1>
      );

      const doc = createDoc([["h1", {}, "Overridden Title"]]);

      render(() => <MarkdownDocument value={doc} components={{ h1: CustomHeading }} />);

      const heading = screen.getByRole("heading", { level: 1 });
      expect(heading).toHaveClass("custom-h1");
      expect(heading).toHaveTextContent("-- Overridden Title --");
    });

    it("does not replace tags inside pre elements with custom components", () => {
      const CustomCode: Component<{ children?: JSX.Element }> = (props) => (
        <span class="custom-code" data-testid="custom-code">
          {props.children}
        </span>
      );

      const doc = createDoc([
        ["p", {}, ["code", {}, "inline code"]],
        ["pre", {}, ["code", { class: "language-js" }, "block code"]],
      ]);

      const { container } = render(() => (
        <MarkdownDocument value={doc} components={{ code: CustomCode }} />
      ));

      // Outside pre: replaced by CustomCode
      const customCode = screen.getByTestId("custom-code");
      expect(customCode).toHaveTextContent("inline code");

      // Inside pre: remains native <code>
      const preCode = container.querySelector("pre code");
      expect(preCode).toBeInTheDocument();
      expect(preCode).toHaveClass("language-js");
      expect(preCode).toHaveTextContent("block code");
      expect(container.querySelector("pre .custom-code")).toBeNull();
    });

    it("renders custom components loaded via lazy()", async () => {
      const LazyCard = lazy(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        const Component: Component<{ title: string; children?: JSX.Element }> = (props) => (
          <div class="lazy-card" role="region" aria-label={props.title}>
            <h4>{props.title}</h4>
            <div class="lazy-content">{props.children}</div>
          </div>
        );
        return { default: Component };
      });

      const doc = createDoc([
        ["lazy-card", { title: "Lazy Title" }, ["p", {}, "Lazy Child Content"]],
      ]);

      render(() => <MarkdownDocument value={doc} components={{ "lazy-card": LazyCard }} />);

      const card = await screen.findByRole("region", { name: "Lazy Title" });
      expect(card).toBeInTheDocument();
      expect(screen.getByRole("heading", { level: 4 })).toHaveTextContent("Lazy Title");
      expect(screen.getByText("Lazy Child Content")).toBeInTheDocument();
    });
  });

  describe("Slots partitioning", () => {
    it("passes default children and named slots to custom component", () => {
      const LayoutComponent: Component<{
        children?: JSX.Element;
        slotHeader?: JSX.Element;
        slotFooter?: JSX.Element;
      }> = (props) => (
        <div class="layout">
          <header class="header">{props.slotHeader}</header>
          <main class="main">{props.children}</main>
          <footer class="footer">{props.slotFooter}</footer>
        </div>
      );

      const doc = createDoc([
        [
          "layout",
          {},
          ["template", { name: "header" }, ["h1", {}, "Header Content"]],
          ["p", {}, "Body Paragraph"],
          ["template", { name: "footer" }, ["p", {}, "Footer Content"]],
        ],
      ]);

      render(() => <MarkdownDocument value={doc} components={{ layout: LayoutComponent }} />);

      expect(screen.getByRole("banner")).toHaveTextContent("Header Content");
      expect(screen.getByRole("main")).toHaveTextContent("Body Paragraph");
      expect(screen.getByRole("contentinfo")).toHaveTextContent("Footer Content");
    });

    it("supports explicit default slot template when no other children exist", () => {
      const LayoutComponent: Component<{ children?: JSX.Element }> = (props) => (
        <div class="default-slot-wrapper">{props.children}</div>
      );

      const doc = createDoc([
        ["layout", {}, ["template", { name: "default" }, ["p", {}, "Explicit Default Content"]]],
      ]);

      render(() => <MarkdownDocument value={doc} components={{ layout: LayoutComponent }} />);

      expect(screen.getByText("Explicit Default Content")).toBeInTheDocument();
    });

    it("prefers normal children over explicit template default slot", () => {
      const LayoutComponent: Component<{ children?: JSX.Element }> = (props) => (
        <div class="preferred-wrapper">{props.children}</div>
      );

      const doc = createDoc([
        [
          "layout",
          {},
          ["template", { name: "default" }, ["p", {}, "Ignored Default"]],
          ["p", {}, "Preferred Child"],
        ],
      ]);

      render(() => <MarkdownDocument value={doc} components={{ layout: LayoutComponent }} />);

      expect(screen.getByText("Preferred Child")).toBeInTheDocument();
      expect(screen.queryByText("Ignored Default")).toBeNull();
    });

    it("treats template without valid name attribute as regular child rather than named slot", () => {
      const LayoutComponent: Component<{ children?: JSX.Element; slotHeader?: JSX.Element }> = (
        props,
      ) => (
        <div class="wrapper">
          <div class="named-slot">{props.slotHeader}</div>
          <div class="default-slot">{props.children}</div>
        </div>
      );

      const doc = createDoc([
        [
          "layout",
          {},
          ["template", {}, ["p", {}, "No Name"]],
          ["template", { name: "   " }, ["p", {}, "Whitespace Name"]],
        ],
      ]);

      const { container } = render(() => (
        <MarkdownDocument value={doc} components={{ layout: LayoutComponent }} />
      ));

      // Neither template has a valid name, so neither becomes a named slot
      expect(container.querySelector(".named-slot")?.children.length).toBe(0);
      // Both are placed in the default slot (as children)
      expect(container.querySelector(".default-slot")?.children.length).toBe(2);
    });
  });

  describe("Data binding and prop resolution", () => {
    it("resolves dynamic data attributes prefixed with colon", () => {
      const UserCard: Component<{ name?: string; age?: number }> = (props) => (
        <div class="user-card" aria-label="user-info">
          <span>{props.name}</span>:<span>{props.age}</span>
        </div>
      );

      const doc: MarkdownDocumentType = {
        nodes: [["user-card", { ":name": "data.user.name", ":age": "data.user.age" }]],
        frontmatter: {},
        meta: {},
      };

      const runtimeData = {
        user: { name: "Alice", age: 30 },
      };

      render(() => (
        <MarkdownDocument value={doc} data={runtimeData} components={{ "user-card": UserCard }} />
      ));

      const card = screen.getByRole("generic", { name: "user-info" });
      expect(card).toHaveTextContent("Alice:30");
    });

    it("parses JSON attribute values when resolveAttributes is used", () => {
      const CustomList: Component<{ count?: number; active?: boolean }> = (props) => (
        <div
          class="custom-list"
          data-active={String(props.active)}
          data-count={String(props.count)}
          data-testid="custom-list"
        />
      );

      const doc = createDoc([["custom-list", { count: "42", active: "true" }]]);

      render(() => <MarkdownDocument value={doc} components={{ "custom-list": CustomList }} />);

      const el = screen.getByTestId("custom-list");
      expect(el).toHaveAttribute("data-count", "42");
      expect(el).toHaveAttribute("data-active", "true");
    });
  });

  describe("Edge cases and resilience", () => {
    it("renders safely when nodes array is empty", () => {
      const doc = createDoc([]);
      const { container } = render(() => <MarkdownDocument value={doc} />);

      expect(container.firstElementChild).toHaveClass("comark-content");
      expect(container.firstElementChild?.children.length).toBe(0);
    });

    it("handles null, undefined, or empty child nodes gracefully", () => {
      const doc = createDoc([
        ["p", {}, "Hello", null as unknown as string, undefined as unknown as string, ""],
      ]);
      render(() => <MarkdownDocument value={doc} />);

      expect(screen.getByText("Hello")).toBeInTheDocument();
    });

    it("renders without error when components and data are omitted", () => {
      const doc = createDoc([["p", {}, "Standard markdown"]]);
      render(() => <MarkdownDocument value={doc} />);

      expect(screen.getByText("Standard markdown")).toBeInTheDocument();
    });
  });
});
