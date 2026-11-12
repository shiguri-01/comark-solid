import { parseMarkdown } from "comark";
import type { MarkdownDocument as MarkdownDocumentType, ParserOptions } from "comark";
import { isMarkdownDocument } from "comark/utils";
import { createMemo, merge, type Component, type ValidComponent } from "solid-js";

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
 * import { Loading } from "solid-js";
 * import { CustomHeading } from "./CustomHeading";
 *
 * const components = {
 *   h1: CustomHeading,
 * };
 *
 * export default function App() {
 *   return (
 *     <Loading fallback={<div>Loading...</div>}>
 *       <Markdown
 *         value={source}
 *         components={components}
 *       />
 *     </Loading>
 *   );
 * }
 * ```
 */
export const Markdown: Component<MarkdownProps> = (_props) => {
  const props = merge({ components: {}, data: {} }, _props);

  const document = createMemo(() => {
    const value = props.value;
    return isMarkdownDocument(value) ? value : parseMarkdown(value as string, props.options);
  });

  return (
    <MarkdownDocument
      value={document()}
      components={props.components}
      data={props.data}
      transformNode={props.transformNode}
      class={props.class}
    />
  );
};
