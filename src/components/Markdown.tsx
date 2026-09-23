import { parseMarkdown } from "comark";
import type { MarkdownDocument as MarkdownDocumentType, ParserOptions } from "comark";
import { isMarkdownDocument } from "comark/utils";
import {
  createMemo,
  createResource,
  mergeProps,
  Show,
  type Component,
  type ValidComponent,
} from "solid-js";

import { MarkdownDocument, type MarkdownDocumentProps } from "./MarkdownDocument";

export interface MarkdownProps extends Omit<MarkdownDocumentProps, "value"> {
  /**
   * Markdown source or an already-parsed Comark document.
   */
  value: string | MarkdownDocumentType;

  /**
   * Options passed to the Comark Markdown parser.
   *
   * Ignored when `value` is an already-parsed document.
   *
   * @default undefined
   */
  options?: ParserOptions;

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

/**
 * Markdown component
 *
 * Renders a Markdown string or an already-parsed Comark document using Solid components.
 * Markdown strings are parsed on the client before rendering.
 *
 * Supports custom component mapping for element tags.
 *
 * @example
 * ```tsx
 * import { Markdown } from "comark-solid";
 * import { Suspense } from "solid-js";
 * import { CustomHeading } from "./CustomHeading";
 *
 * const components = {
 *   h1: CustomHeading,
 * };
 *
 * export default function App() {
 *   return (
 *     <Suspense fallback={<div>Loading...</div>}>
 *       <Markdown
 *         value={source}
 *         components={components}
 *       />
 *     </Suspense>
 *   );
 * }
 * ```
 */
export const Markdown: Component<MarkdownProps> = (_props) => {
  const props = mergeProps({ components: {}, data: {} }, _props);

  const [parsed] = createResource(
    () => (typeof props.value === "string" ? ([props.value, props.options] as const) : null),
    ([value, options]) => parseMarkdown(value, options),
  );

  const document = createMemo(() => {
    const value = props.value;
    return isMarkdownDocument(value) ? value : parsed();
  });

  return (
    <Show when={document()}>
      {(value: () => MarkdownDocumentType) => (
        <MarkdownDocument
          value={value()}
          components={props.components}
          data={props.data}
          class={props.class}
        />
      )}
    </Show>
  );
};
