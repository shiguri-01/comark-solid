import type { MarkdownDocument as MarkdownDocumentType, Node, NodeRenderData } from "comark";
import { isHtmlVoidElement, pascalCase, resolveAttributes, toNativeAttributes } from "comark/utils";
import {
  createMemo,
  mergeProps,
  Suspense,
  type Component,
  type JSX,
  type ValidComponent,
} from "solid-js";
import { Dynamic } from "solid-js/web";

import { getAttributes, getChildren, getTag } from "../utils/ast";

export interface MarkdownDocumentProps {
  /**
   * The parsed Comark document to render.
   */
  value: MarkdownDocumentType;

  /**
   * Maps element tags to Solid components.
   *
   * When an element matches a key in this object, the corresponding
   * component is rendered instead of the native element.
   *
   * @default `{}`
   */
  components?: Record<string, ValidComponent>;

  /**
   * Runtime values referenced from markdown via `:prop="data.path"`.
   *
   * @default `{}`
   */
  data?: Record<string, unknown>;

  /**
   * Additional class for the wrapper div.
   *
   *  The `comark-content` class is always included.
   *
   * @default undefined
   */
  class?: string;
}

type LocalContext = {
  parent: Node | undefined;
  renderData: NodeRenderData;
};

const DEFAULT_LOCAL_CONTEXT: LocalContext = {
  parent: undefined,
  renderData: { frontmatter: {}, meta: {}, data: {}, props: {} },
};

type ElementNode = {
  readonly tag: string;
  readonly node: Node;
};

function toElementNode(node: Node): ElementNode | null {
  if (typeof node === "string") return null;

  const tag = getTag(node);
  if (!tag) return null;

  return { tag, node };
}

type ComponentNode = ElementNode & {
  readonly component: ValidComponent;
};

function resolveProps(node: Node, renderData: NodeRenderData) {
  return resolveAttributes(getAttributes(node), renderData, { parseJson: true });
}

function scopeRenderData(node: Node, props: Record<string, unknown>, renderData: NodeRenderData) {
  return Object.keys(getAttributes(node)).some((key) => key !== "$")
    ? { ...renderData, props }
    : renderData;
}

function getSlotName(node: Node): string | null {
  if (getTag(node) !== "template") {
    return null;
  }

  const props = getAttributes(node);
  const name =
    props.name ||
    Object.keys(props)
      .find((key) => key.startsWith("#"))
      ?.slice(1);
  if (typeof name !== "string" || name.trim() === "") {
    return null;
  }

  return name.trim();
}

function getSlotPropName(slotName: string): string {
  if (slotName === "default") {
    return "children";
  }

  return `slot${slotName.charAt(0).toUpperCase() + slotName.slice(1)}`;
}

function resolveComponent(
  element: ElementNode,
  components: Record<string, ValidComponent>,
): ComponentNode | null {
  function lookup(tag: string) {
    const name = pascalCase(tag);
    return components[`Prose${name}`] || components[name] || components[tag];
  }
  const as = getAttributes(element.node).as;
  const component = (typeof as === "string" && lookup(as)) || lookup(element.tag);
  if (!component) return null;

  return { ...element, component };
}

function createNodeRenderer(components: Record<string, ValidComponent>) {
  function renderNode(node: Node, local: Partial<LocalContext> = {}): JSX.Element {
    if (typeof node === "string") {
      return node;
    }

    const element = toElementNode(node);
    if (!element) {
      return null;
    }

    const context = { ...DEFAULT_LOCAL_CONTEXT, ...local };

    // preタグ内のテキストはそのまま表示する
    const isInPre = context.parent !== undefined && toElementNode(context.parent)?.tag === "pre";
    const component = isInPre ? null : resolveComponent(element, components);

    return component
      ? renderCustomComponent(component, context)
      : renderNativeElement(element, context);
  }

  function renderCustomComponent(element: ComponentNode, context: LocalContext) {
    const { component, node } = element;
    const props = resolveProps(node, context.renderData);
    const childRenderData = scopeRenderData(node, props, context.renderData);

    const slots = partitionIntoSlots(node, childRenderData);
    return (
      <Suspense fallback={null}>
        <Dynamic component={component} {...props} {...slots} />
      </Suspense>
    );
  }

  function renderNativeElement(element: ElementNode, context: LocalContext) {
    const { tag, node } = element;
    const resolved = resolveProps(node, context.renderData);
    const props = toNativeAttributes(tag, node, resolved);
    const renderData = scopeRenderData(node, resolved, context.renderData);

    if (isHtmlVoidElement(tag)) {
      return <Dynamic component={tag} {...props} />;
    }

    const children = getChildren(node)
      .filter((child) => !getSlotName(child))
      .map((child) => renderNode(child, { parent: node, renderData }))
      .filter(Boolean);

    return (
      <Dynamic component={tag} {...props}>
        {children}
      </Dynamic>
    );
  }

  function partitionIntoSlots(
    node: Node,
    childRenderData: NodeRenderData,
  ): Record<string, JSX.Element[]> {
    const defaultSlot: JSX.Element[] = [];
    const namedSlots: Record<string, JSX.Element[]> = {};

    for (const child of getChildren(node)) {
      if (child === undefined || child === null) {
        continue;
      }

      const slotName = getSlotName(child);

      // named slot
      if (slotName) {
        const propName = getSlotPropName(slotName);
        namedSlots[propName] = getChildren(child)
          .map((slotChild) => renderNode(slotChild, { parent: node, renderData: childRenderData }))
          .filter(Boolean);

        continue;
      }

      // default slot
      const rendered = renderNode(child, { parent: node, renderData: childRenderData });
      if (rendered) {
        defaultSlot.push(rendered);
      }
    }

    // 通常のdefault slotがある場合は、明示的な`#default` slotより優先する
    return defaultSlot.length > 0 ? { ...namedSlots, children: defaultSlot } : namedSlots;
  }

  return renderNode;
}
/**
 * Renders a parsed Markdown document using Solid components.

 *
 * Supports custom components mapping for element tags.
 *
 * The wrapper element is assigned the `comark-content` class by default.
 *
 * @example
 * ```tsx
 * import { MarkdownDocument } from "comark-solid";
 * import { lazy } from "solid-js";
 * import { CustomHeading } from "./CustomHeading";
 *
 * const components = {
 *   h1: CustomHeading,
 *   lazyCard: lazy(() => import("./Card")),
 * }
 *
 * export default function App() {
 *  return <MarkdownDocument value={document} components={components} />;
 *  }
 *  ```
 */
export const MarkdownDocument: Component<MarkdownDocumentProps> = (_props) => {
  const props = mergeProps({ components: {}, data: {}, class: undefined }, _props);

  const renderedNodes = createMemo(() => {
    const renderNode = createNodeRenderer(props.components);

    const document = props.value;

    const renderData: NodeRenderData = {
      frontmatter: document.frontmatter,
      meta: document.meta,
      data: props.data,
      props: {},
    };

    return document.nodes
      .map((node) => renderNode(node, { parent: undefined, renderData }))
      .filter(Boolean);
  });

  const wrapperClass = createMemo(() =>
    ["comark-content", props.class]
      .map((cls) => cls?.trim())
      .filter(Boolean)
      .join(" "),
  );

  return <div class={wrapperClass()}>{renderedNodes()}</div>;
};
