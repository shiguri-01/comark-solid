import { dynamic, type ComponentProps, type JSX } from "@solidjs/web";
import type {
  ElementNode,
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
import {
  createMemo,
  merge,
  Loading,
  type Component,
  type ValidComponent,
  omit,
  For,
} from "solid-js";

import { getAttributes, getChildren, getTag, isElementNode } from "../utils/ast";

export interface MarkdownDocumentProps extends Omit<ComponentProps<"div">, "children"> {
  /**
   * The parsed Comark document to render.
   */
  value: MarkdownDocumentType;

  /**
   * Reuse rendered blocks when successive documents retain their AST nodes.
   *
   * @default false
   */
  streaming?: boolean;

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

type RenderContext = {
  readonly parent: ElementNode | undefined;
  readonly renderData: NodeRenderData;
  readonly inPre: boolean;
};

type TransformedNode = ReturnType<typeof applyNodeTransforms>;

type BaseElement = {
  readonly node: ElementNode;
  readonly ownProps: Record<string, unknown>;
  readonly transformed: TransformedNode | undefined;
};

type NativeElement = BaseElement & {
  readonly kind: "native";
};

type ComponentElement = BaseElement & {
  readonly kind: "component";
  readonly component: ValidComponent;
};

type ResolvedElement = NativeElement | ComponentElement;

function getElementProps(element: BaseElement): Record<string, unknown> {
  return element.transformed?.props ?? element.ownProps;
}

function getElementTag(element: BaseElement): string {
  return element.transformed?.tag ?? getTag(element.node);
}

function resolveProps(node: ElementNode, renderData: NodeRenderData) {
  return resolveAttributes(getAttributes(node), renderData, { parseJson: true });
}

const METADATA_ATTRIBUTES_KEY = "$";

function getSlotName(node: ElementNode): string | null {
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
  element: BaseElement,
  components: Record<string, ValidComponent>,
): ValidComponent | null {
  function lookup(tag: string) {
    const name = pascalCase(tag);
    const proseName = `Prose${name}`;

    return components[proseName] || components[name] || components[tag];
  }

  const as = getElementProps(element).as;
  const component = (typeof as === "string" && lookup(as)) || lookup(getElementTag(element));
  if (!component) return null;

  return component;
}

function createNodeRenderer(
  components: Record<string, ValidComponent>,
  transformNode?: NodeTransform | readonly NodeTransform[],
) {
  function renderNode(node: Node, context: RenderContext): JSX.Element {
    if (typeof node === "string") {
      return node;
    }

    if (!isElementNode(node)) {
      return null;
    }

    const element = resolveElement(node, context);
    const childContext = createChildContext(element, context);

    return element.kind === "native"
      ? renderNativeElement(element, childContext)
      : renderComponentElement(element, childContext);
  }

  function resolveElement(node: ElementNode, context: RenderContext): ResolvedElement {
    const ownProps = resolveProps(node, context.renderData);
    const transformed = applyNodeTransforms(
      transformNode,
      node,
      ownProps,
      context.renderData,
      context.parent,
    );

    const element: BaseElement = {
      node,
      ownProps,
      transformed,
    };

    // preタグ内の要素はそのまま表示する。
    const inPre =
      context.inPre || (context.parent !== undefined && getTag(context.parent) === "pre");
    if (inPre) {
      return {
        kind: "native",
        ...element,
      };
    }

    const component = resolveComponent(element, components);
    if (component) {
      return {
        kind: "component",
        component,
        ...element,
      };
    }

    return {
      kind: "native",
      ...element,
    };
  }

  function createChildContext(element: ResolvedElement, context: RenderContext) {
    const childInPre = context.inPre || getElementTag(element) === "pre";

    const { transformed, ownProps } = element;
    const hasTransformedProps = transformed !== undefined && transformed.props !== ownProps;

    const shouldInheritRenderData =
      !hasTransformedProps &&
      Object.keys(ownProps).length === 1 &&
      Object.hasOwn(ownProps, METADATA_ATTRIBUTES_KEY);

    const { renderData } = context;
    const childRenderData = shouldInheritRenderData
      ? renderData
      : {
          get frontmatter() {
            return renderData.frontmatter;
          },
          get meta() {
            return renderData.meta;
          },
          get data() {
            return renderData.data;
          },
          props: getElementProps(element),
        };

    return {
      parent: element.node,
      renderData: childRenderData,
      inPre: childInPre,
    };
  }

  function renderNativeElement(element: NativeElement, childContext: RenderContext) {
    const tag = getElementTag(element);
    const props = getElementProps(element);
    const { node } = element;

    const nativeAttributes = toNativeAttributes(tag, node, props);

    const NativeTag = dynamic(() => tag);

    if (isHtmlVoidElement(tag)) {
      const voidAttributes = omit(nativeAttributes, "children");
      return <NativeTag {...voidAttributes} />;
    }

    const children = getChildren(node)
      .filter((child) => !isElementNode(child) || !getSlotName(child))
      .map((child) => renderNode(child, childContext))
      .filter(Boolean);

    return <NativeTag {...nativeAttributes}>{children}</NativeTag>;
  }

  function renderComponentElement(element: ComponentElement, childContext: RenderContext) {
    const slots = renderSlots(element.node, childContext);
    const CustomComponent = dynamic(() => element.component);

    return (
      // Loadingで囲うことで、CustomComponent内の非同期値の表示が外部に影響しないようにする
      // CustomComponent内で既にLoadingでラップされている場合、
      // 読込中は内側のLoading.fallbackが表示されるので、このケースでもいい感じに動作する
      <Loading fallback={null}>
        <CustomComponent {...getElementProps(element)} {...slots} />
      </Loading>
    );
  }

  function renderSlots(node: ElementNode, context: RenderContext): Record<string, JSX.Element[]> {
    const defaultSlot: JSX.Element[] = [];
    const namedSlots: Record<string, JSX.Element[]> = {};

    for (const child of getChildren(node)) {
      if (child === undefined || child === null) {
        continue;
      }

      if (isElementNode(child)) {
        const slotName = getSlotName(child);
        if (slotName) {
          const propName = getSlotPropName(slotName);
          namedSlots[propName] = getChildren(child)
            .map((slotChild) => renderNode(slotChild, context))
            .filter(Boolean);

          continue;
        }
      }

      // default slot
      const rendered = renderNode(child, context);
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
  const props = merge({ components: {}, data: {}, class: undefined, streaming: false }, _props);
  const rest = omit(props, "value", "components", "data", "transformNode", "class", "streaming");

  const renderNode = createMemo(() => createNodeRenderer(props.components, props.transformNode));

  const frontmatter = createMemo(() => props.value.frontmatter);
  const meta = createMemo(() => props.value.meta);

  const renderData: NodeRenderData = {
    get frontmatter() {
      return frontmatter();
    },
    get meta() {
      return meta();
    },
    get data() {
      return props.data;
    },
    props: {},
  };

  const context = {
    parent: undefined,
    renderData,
    inPre: false,
  };

  const renderedNodes = createMemo(() => {
    if (props.streaming) {
      return <For each={props.value.nodes}>{(node) => <>{renderNode()(node, context)}</>}</For>;
    }

    const render = renderNode();
    return props.value.nodes.map((node) => render(node, context)).filter(Boolean);
  });

  return (
    <div class={["comark-content", props.class]} {...rest}>
      {renderedNodes()}
    </div>
  );
};
