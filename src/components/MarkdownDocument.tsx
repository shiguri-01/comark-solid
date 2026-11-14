import { dynamic, type ComponentProps, type JSX } from "@solidjs/web";
import type {
  ElementNode as ComarkElementNode,
  MarkdownDocument as MarkdownDocumentType,
  Node,
  NodeRenderData,
  NodeTransform,
} from "comark";
import {
  applyNodeTransforms,
  isHtmlVoidElement,
  pascalCase,
  resolveAttributes,
  toNativeAttributes,
} from "comark/utils";
import { createMemo, merge, Loading, type Component, type ValidComponent, omit } from "solid-js";

import { getAttributes, getChildren, getTag } from "../utils/ast";

export interface MarkdownDocumentProps extends Omit<ComponentProps<"div">, "children"> {
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

  /** Transforms applied to each element after resolving its attributes. */
  transformNode?: NodeTransform | readonly NodeTransform[];

  /**
   * Additional class for the wrapper div.
   *
   *  The `comark-content` class is always included.
   *
   * @default undefined
   */
  class?: JSX.ClassValue;
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
  readonly props: Record<string, unknown>;
  readonly hasTransformedProps: boolean;
};

type ComponentNode = ElementNode & {
  readonly component: ValidComponent;
};

function resolveProps(node: Node, renderData: NodeRenderData) {
  return resolveAttributes(getAttributes(node), renderData, { parseJson: true });
}

function scopeRenderData(
  node: Node,
  props: Record<string, unknown>,
  renderData: NodeRenderData,
  hasTransformedProps: boolean,
) {
  return hasTransformedProps || Object.keys(getAttributes(node)).some((key) => key !== "$")
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
  const as = element.props.as;
  const component = (typeof as === "string" && lookup(as)) || lookup(element.tag);
  if (!component) return null;

  return { ...element, component };
}

function createNodeRenderer(
  components: Record<string, ValidComponent>,
  transformNode?: NodeTransform | readonly NodeTransform[],
) {
  function renderNode(node: Node, local: Partial<LocalContext> = {}): JSX.Element {
    if (typeof node === "string") {
      return node;
    }

    const nodeTag = getTag(node);
    if (!nodeTag) return null;

    const context = { ...DEFAULT_LOCAL_CONTEXT, ...local };
    const ownProps = resolveProps(node, context.renderData);
    const transformed = applyNodeTransforms(
      transformNode,
      node as ComarkElementNode,
      ownProps,
      context.renderData,
      context.parent as ComarkElementNode | undefined,
    );
    const element: ElementNode = {
      tag: transformed?.tag ?? nodeTag,
      node,
      props: transformed?.props ?? ownProps,
      hasTransformedProps: transformed !== undefined && transformed.props !== ownProps,
    };

    // preタグ内のテキストはそのまま表示する
    const isInPre = context.parent !== undefined && getTag(context.parent) === "pre";
    const component = isInPre ? null : resolveComponent(element, components);

    return component
      ? renderCustomComponent(component, context)
      : renderNativeElement(element, context);
  }

  function renderCustomComponent(element: ComponentNode, context: LocalContext) {
    const { component, node } = element;
    const props = element.props;
    const childRenderData = scopeRenderData(
      node,
      props,
      context.renderData,
      element.hasTransformedProps,
    );

    const slots = partitionIntoSlots(node, childRenderData);
    const CustomComponent = dynamic(() => component);

    return (
      // Loadingで囲うことで、CustomComponent内の非同期値の表示が外部に影響しないようにする
      // CustomComponent内で既にLoadingでラップされている場合、
      // 読込中は内側のLoading.fallbackが表示されるので、このケースでもいい感じに動作する
      <Loading fallback={null}>
        <CustomComponent {...props} {...slots} />
      </Loading>
    );
  }

  function renderNativeElement(element: ElementNode, context: LocalContext) {
    const { tag, node } = element;
    const resolved = element.props;
    const props = toNativeAttributes(tag, node, resolved);
    const renderData = scopeRenderData(
      node,
      resolved,
      context.renderData,
      element.hasTransformedProps,
    );
    const Component = dynamic(() => tag);

    if (isHtmlVoidElement(tag)) {
      const { children: _children, ...voidProps } = props;
      return <Component {...voidProps} />;
    }

    const children = getChildren(node)
      .filter((child) => !getSlotName(child))
      .map((child) => renderNode(child, { parent: node, renderData }))
      .filter(Boolean);

    return <Component {...props}>{children}</Component>;
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
  const props = merge({ components: {}, data: {}, class: undefined }, _props);
  const rest = omit(props, "value", "components", "data", "transformNode", "class");

  const renderedNodes = createMemo(() => {
    const renderNode = createNodeRenderer(props.components, props.transformNode);

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

  return (
    <div class={["comark-content", props.class]} {...rest}>
      {renderedNodes()}
    </div>
  );
};
